const fs = require('fs').promises;
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
  'image/heif': '.heif'
};

async function ensureUploadDirectories() {
  await fs.mkdir(ORIGINALS_DIR, { recursive: true });
}

function calculateHash(buffer) {
  return crypto.createHash('sha256').update(buffer).digest('hex');
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
    const hash = calculateHash(file.buffer);
    const fileName = buildFileName(prefix, targetId, index, file);
    const originalFsPath = path.join(ORIGINALS_DIR, fileName);
    const originalUrl = getPublicOriginalUrl(fileName);

    // Check if duplicate exists
    const existing = await db.query('SELECT * FROM unique_photos WHERE hash = ?', [hash]);
    if (existing.length > 0) {
      const record = existing[0];
      
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

    await fs.writeFile(originalFsPath, file.buffer);

    // Record in unique_photos
    const insertRes = await db.query(
      'INSERT INTO unique_photos (hash, original_path, thumb_path, size, mimetype) VALUES (?, ?, ?, ?, ?) RETURNING id',
      [hash, originalUrl, null, file.size, file.mimetype]
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
      size: file.size,
      uniquePhotoId: uniqueId,
      isDuplicate: false
    });
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
  ORIGINALS_DIR,
  PUBLIC_ORIGINALS_BASE
};
