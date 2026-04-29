const fs = require('fs').promises;
const path = require('path');
const sharp = require('sharp');
const db = require('../db');

const THUMBNAILS_DIR = path.join(__dirname, '../data/thumbnails');
const PUBLIC_THUMBNAILS_BASE = '/media/thumbnails';

async function processThumbnail(job) {
  const { id, target_id } = job;
  
  try {
    // 1. Get original photo info
    const photos = await db.query('SELECT * FROM unique_photos WHERE id = ?', [target_id]);
    if (photos.length === 0) {
      throw new Error('Photo not found');
    }
    const photo = photos[0];
    
    // original_path is like /media/originals/filename.jpg
    const filename = path.basename(photo.original_path);
    const originalPath = path.join(__dirname, '../data/originals', filename);
    const thumbFilename = `thumb_${filename}`;
    const thumbPath = path.join(THUMBNAILS_DIR, thumbFilename);
    const thumbUrl = `${PUBLIC_THUMBNAILS_BASE}/${thumbFilename}`;

    await fs.mkdir(THUMBNAILS_DIR, { recursive: true });

    // 2. Generate thumbnail (400px square, Choice F1)
    const image = sharp(originalPath);
    const metadata = await image.metadata();
    
    await image
      .resize(400, 400, { fit: 'cover' })
      .toFile(thumbPath);

    // 3. Update unique_photos
    await db.query(
      'UPDATE unique_photos SET thumb_path = ?, width = ?, height = ? WHERE id = ?',
      [thumbUrl, metadata.width, metadata.height, target_id]
    );

    // 4. Update all feed_photos and album_photos that use this unique photo
    await db.query('UPDATE feed_photos SET thumb_path = ?, width = ?, height = ? WHERE unique_photo_id = ?', [thumbUrl, metadata.width, metadata.height, target_id]);
    await db.query('UPDATE album_photos SET thumb_path = ?, width = ?, height = ? WHERE unique_photo_id = ?', [thumbUrl, metadata.width, metadata.height, target_id]);

    // 5. Update job status
    await db.query(
      'UPDATE thumbnail_jobs SET status = "done", finished_at = CURRENT_TIMESTAMP WHERE id = ?',
      [id]
    );

    console.log(`✓ Processed thumbnail for photo ${target_id}`);
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
        await db.query('UPDATE thumbnail_jobs SET status = "processing", started_at = CURRENT_TIMESTAMP WHERE id = ?', [job.id]);
        await processThumbnail(job);
      }
    } catch (err) {
      console.error('Worker loop error:', err);
    }
  }, 5000);
}

module.exports = { startWorker, processThumbnail };
