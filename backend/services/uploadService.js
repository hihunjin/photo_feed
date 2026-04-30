const fs = require('fs').promises;
const fsSync = require('fs');
const path = require('path');
const crypto = require('crypto');
const db = require('../db');

const ORIGINALS_DIR = path.join(__dirname, '../data/originals');
const PUBLIC_ORIGINALS_BASE = '/media/originals';

const MIME_EXTENSION_MAP = {
  'image/jpeg': '.jpg',
  'image/png': '.png',
  'image/webp': '.webp',
  'image/heic': '.heic',
  'image/heif': '.heif',
  // Videos
  'video/mp4': '.mp4',
  'video/quicktime': '.mov',
  'video/x-msvideo': '.avi',
  'video/webm': '.webm',
  'video/x-matroska': '.mkv',
  'video/mpeg': '.mpeg',
  'video/3gpp': '.3gp'
};

const VIDEO_MIME_TYPES = new Set([
  'video/mp4', 'video/quicktime', 'video/x-msvideo',
  'video/webm', 'video/x-matroska', 'video/mpeg', 'video/3gpp'
]);

function isVideoMimeType(mimetype) {
  return VIDEO_MIME_TYPES.has(mimetype);
}

async function ensureUploadDirectories() {
  await fs.mkdir(ORIGINALS_DIR, { recursive: true });
}

async function calculateHashFromPath(filePath) {
  return new Promise((resolve, reject) => {
    const hash = crypto.createHash('sha256');
    const stream = fsSync.createReadStream(filePath);
    stream.on('data', chunk => hash.update(chunk));
    stream.on('end', () => resolve(hash.digest('hex')));
    stream.on('error', reject);
  });
}

async function getUploadPolicy() {
  const rows = await db.query('SELECT * FROM upload_policies WHERE id = 1');
  if (rows.length > 0) {
    return rows[0];
  }

  return {
    feed_max_photos: 50,
    album_max_photos: 1000,
    max_file_size_mb: 20,
    allowed_mime_types: JSON.stringify(['image/jpeg', 'image/png', 'image/webp', 'image/heic'])
  };
}

function parseAllowedMimeTypes(policy) {
  try {
    const parsed = JSON.parse(policy.allowed_mime_types || '[]');
    return Array.isArray(parsed) ? parsed : [];
  } catch (error) {
    return [];
  }
}

function getExtensionForFile(file) {
  const fromOriginalName = path.extname(file.originalname || '').toLowerCase();
  if (fromOriginalName) {
    return fromOriginalName;
  }

  return MIME_EXTENSION_MAP[file.mimetype] || '.bin';
}

function sanitizeBaseName(input) {
  return input
    .replace(/[^a-zA-Z0-9._-]/g, '_')
    .replace(/_+/g, '_')
    .slice(0, 80);
}

function buildFileName(prefix, targetId, index, file) {
  const baseName = sanitizeBaseName(path.basename(file.originalname || `${prefix}_${index}`,
    path.extname(file.originalname || '')));
  const extension = getExtensionForFile(file);
  return `${prefix}_${targetId}_${index}_${baseName}${extension}`;
}

function getPublicOriginalUrl(fileName) {
  return `${PUBLIC_ORIGINALS_BASE}/${fileName}`;
}

function getFilesystemPathFromPublicUrl(publicUrl) {
  if (!publicUrl) {
    return null;
  }

  if (publicUrl.startsWith(PUBLIC_ORIGINALS_BASE)) {
    return path.join(ORIGINALS_DIR, path.basename(publicUrl));
  }

  return publicUrl;
}

async function validateFiles(files, policy, maxPhotos) {
  if (!files || files.length === 0) {
    return;
  }

  if (files.length > maxPhotos) {
    const error = new Error(`Maximum ${maxPhotos} photos allowed`);
    error.statusCode = 400;
    throw error;
  }

  const allowedMimeTypes = parseAllowedMimeTypes(policy);
  const maxFileSizeBytes = (policy.max_file_size_mb || 20) * 1024 * 1024;

  for (const file of files) {
    if (allowedMimeTypes.length > 0 && !allowedMimeTypes.includes(file.mimetype)) {
      const error = new Error(`Unsupported file type: ${file.mimetype}`);
      error.statusCode = 400;
      throw error;
    }

    if (file.size > maxFileSizeBytes) {
      const error = new Error(`File too large: ${file.originalname}`);
      error.statusCode = 400;
      throw error;
    }
  }
}

async function saveUploadedFiles({ files, prefix, targetId }) {
  await ensureUploadDirectories();

  const savedFiles = [];

  for (let index = 0; index < files.length; index += 1) {
    const file = files[index];
    // diskStorage: file.path is the temp file on disk
    // memoryStorage (legacy): file.buffer exists
    const tempPath = file.path; // always set by diskStorage

    try {
      const hash = await calculateHashFromPath(tempPath);
      const fileName = buildFileName(prefix, targetId, index, file);
      const originalFsPath = path.join(ORIGINALS_DIR, fileName);
      const originalUrl = getPublicOriginalUrl(fileName);

      // Check if duplicate exists
      const existing = await db.query('SELECT * FROM unique_photos WHERE hash = ?', [hash]);
      if (existing.length > 0) {
        const record = existing[0];
        // Clean up temp file — we don't need it
        await fs.unlink(tempPath).catch(() => {});
        savedFiles.push({
          fileName: path.basename(record.original_path),
          originalFsPath: path.join(ORIGINALS_DIR, path.basename(record.original_path)),
          originalUrl: record.original_path,
          thumbnailUrl: record.thumb_path || record.original_path,
          mimetype: record.mimetype,
          size: record.size,
          uniquePhotoId: record.id,
          isDuplicate: true
        });
        continue;
      }

      // Move temp file to originals dir (same filesystem = rename, otherwise copy+delete)
      try {
        await fs.rename(tempPath, originalFsPath);
      } catch (renameErr) {
        // Cross-device rename (e.g. tmpdir on different mount) — fall back to copy+delete
        await fs.copyFile(tempPath, originalFsPath);
        await fs.unlink(tempPath).catch(() => {});
      }

      const mediaType = isVideoMimeType(file.mimetype) ? 'video' : 'image';

      // Record in unique_photos
      const insertRes = await db.query(
        'INSERT INTO unique_photos (hash, original_path, thumb_path, size, mimetype, media_type) VALUES (?, ?, ?, ?, ?, ?) RETURNING id',
        [hash, originalUrl, null, file.size, file.mimetype, mediaType]
      );
      const uniqueId = insertRes[0].id;

      // Enqueue thumbnail job
      await db.query(
        `INSERT INTO thumbnail_jobs (target_type, target_id, status) VALUES (?, ?, ?)`,
        ['unique_photo', uniqueId, 'queued']
      );

      savedFiles.push({
        fileName,
        originalFsPath,
        originalUrl,
        thumbnailUrl: originalUrl, // Will be updated by background worker
        mimetype: file.mimetype,
        mediaType,
        size: file.size,
        uniquePhotoId: uniqueId,
        isDuplicate: false
      });
    } catch (err) {
      // Clean up temp file on any error
      if (tempPath) await fs.unlink(tempPath).catch(() => {});
      throw err;
    }
  }

  return savedFiles;
}

module.exports = {
  ensureUploadDirectories,
  getUploadPolicy,
  validateFiles,
  saveUploadedFiles,
  getPublicOriginalUrl,
  getFilesystemPathFromPublicUrl,
  isVideoMimeType,
  ORIGINALS_DIR,
  PUBLIC_ORIGINALS_BASE
};
