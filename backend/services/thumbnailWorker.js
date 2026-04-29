const fs = require('fs').promises;
const path = require('path');
const sharp = require('sharp');
const db = require('../db');

const THUMBNAILS_DIR = path.join(__dirname, '../data/thumbnails');
const PUBLIC_THUMBNAILS_BASE = '/media/thumbnails';

// Lazy-load ffmpeg so startup doesn't fail if binaries are missing
let ffmpeg = null;
function getFFmpeg() {
  if (ffmpeg) return ffmpeg;
  try {
    const ffmpegStatic = require('ffmpeg-static');
    const fluentFFmpeg = require('fluent-ffmpeg');
    fluentFFmpeg.setFfmpegPath(ffmpegStatic);
    ffmpeg = fluentFFmpeg;
  } catch (e) {
    console.warn('fluent-ffmpeg / ffmpeg-static not available:', e.message);
  }
  return ffmpeg;
}

function extractVideoFrame(inputPath, outputPath, timeOffset = 1) {
  return new Promise((resolve, reject) => {
    const ff = getFFmpeg();
    if (!ff) return reject(new Error('ffmpeg not available'));

    ff(inputPath)
      .on('error', reject)
      .on('end', resolve)
      .screenshots({
        count: 1,
        timemarks: [timeOffset],
        filename: path.basename(outputPath),
        folder: path.dirname(outputPath),
        size: '400x400'
      });
  });
}

function getVideoDuration(inputPath) {
  return new Promise((resolve) => {
    const ff = getFFmpeg();
    if (!ff) return resolve(null);

    ff.ffprobe(inputPath, (err, metadata) => {
      if (err || !metadata) return resolve(null);
      resolve(metadata.format?.duration || null);
    });
  });
}

async function processThumbnail(job) {
  const { id, target_id } = job;

  try {
    // 1. Get original media info
    const photos = await db.query('SELECT * FROM unique_photos WHERE id = ?', [target_id]);
    if (photos.length === 0) {
      throw new Error('Photo not found');
    }
    const photo = photos[0];

    const filename = path.basename(photo.original_path);
    const originalPath = path.join(__dirname, '../data/originals', filename);
    const isVideo = photo.media_type === 'video';

    const thumbFilename = isVideo
      ? `thumb_${path.basename(filename, path.extname(filename))}.jpg`
      : `thumb_${filename}`;
    const thumbPath = path.join(THUMBNAILS_DIR, thumbFilename);
    const thumbUrl = `${PUBLIC_THUMBNAILS_BASE}/${thumbFilename}`;

    await fs.mkdir(THUMBNAILS_DIR, { recursive: true });

    let width = null;
    let height = null;
    let duration = null;

    if (isVideo) {
      // 2a. Extract a frame from video at 1s (or 0s if shorter)
      try {
        await extractVideoFrame(originalPath, thumbPath, 1);
      } catch (e) {
        // If video is shorter than 1s, try at 0s
        await extractVideoFrame(originalPath, thumbPath, 0);
      }

      // Get video duration
      duration = await getVideoDuration(originalPath);

      // Read dimensions from the extracted thumbnail
      try {
        const meta = await sharp(thumbPath).metadata();
        width = meta.width;
        height = meta.height;
      } catch (_) {}

      // 3. Update unique_photos with duration
      await db.query(
        'UPDATE unique_photos SET thumb_path = ?, width = ?, height = ?, duration = ? WHERE id = ?',
        [thumbUrl, width, height, duration, target_id]
      );
    } else {
      // 2b. Generate image thumbnail (400px square crop)
      const image = sharp(originalPath);
      const metadata = await image.metadata();
      width = metadata.width;
      height = metadata.height;

      await image
        .resize(400, 400, { fit: 'cover' })
        .toFile(thumbPath);

      // 3. Update unique_photos
      await db.query(
        'UPDATE unique_photos SET thumb_path = ?, width = ?, height = ? WHERE id = ?',
        [thumbUrl, width, height, target_id]
      );
    }

    // 4. Update all feed_photos and album_photos that use this unique photo
    await db.query(
      'UPDATE feed_photos SET thumb_path = ?, width = ?, height = ? WHERE unique_photo_id = ?',
      [thumbUrl, width, height, target_id]
    );
    await db.query(
      'UPDATE album_photos SET thumb_path = ?, width = ?, height = ? WHERE unique_photo_id = ?',
      [thumbUrl, width, height, target_id]
    );

    // 5. Update job status
    await db.query(
      `UPDATE thumbnail_jobs SET status = "done", finished_at = datetime('now','localtime') WHERE id = ?`,
      [id]
    );

    console.log(`✓ Processed thumbnail for ${isVideo ? 'video' : 'photo'} ${target_id}`);
  } catch (err) {
    console.error(`Failed to process thumbnail for job ${id}:`, err);
    await db.query(
      'UPDATE thumbnail_jobs SET status = "failed", error_message = ?, attempts = attempts + 1 WHERE id = ?',
      [err.message, id]
    );
  }
}

async function startWorker() {
  console.log('Thumbnail worker started');

  // Run every 5 seconds
  setInterval(async () => {
    try {
      const jobs = await db.query(
        'SELECT * FROM thumbnail_jobs WHERE status = "queued" OR (status = "failed" AND attempts < 3) ORDER BY queued_at ASC LIMIT 1'
      );

      if (jobs.length > 0) {
        const job = jobs[0];
        // Mark as processing
        await db.query(
          `UPDATE thumbnail_jobs SET status = "processing", started_at = datetime('now','localtime') WHERE id = ?`,
          [job.id]
        );
        await processThumbnail(job);
      }
    } catch (err) {
      console.error('Worker loop error:', err);
    }
  }, 5000);
}

module.exports = { startWorker, processThumbnail };
