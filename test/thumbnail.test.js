const fs = require('fs').promises;
const fsSync = require('fs');
const path = require('path');
const sharp = require('sharp');
const db = require('../backend/db');
const auth = require('../backend/auth');
const thumbnailQueue = require('../backend/services/thumbnailQueue');
const uploadService = require('../backend/services/uploadService');

let testDbPath;
let user;
let band;
let feed;
let photo;
const originalsDir = uploadService.ORIGINALS_DIR;
const thumbnailsDir = uploadService.THUMBNAILS_DIR;

async function createImageBuffer() {
  return sharp({
    create: {
      width: 8,
      height: 8,
      channels: 4,
      background: { r: 0, g: 128, b: 255, alpha: 1 }
    }
  })
    .png()
    .toBuffer();
}

describe('Thumbnail Pipeline', () => {
  beforeAll(async () => {
    testDbPath = path.join(__dirname, '../data/test-thumbnail.sqlite3');

    try {
      fsSync.unlinkSync(testDbPath);
    } catch (error) {}

    process.env.DATABASE = testDbPath;
    process.env.NODE_ENV = 'test';

    await db.initialize();
    await uploadService.ensureUploadDirectories();

    const passwordHash = await auth.hashPassword('thumbpass123');
    const userRows = await db.query(
      `INSERT INTO users (username, password_hash, role) VALUES (?, ?, ?) RETURNING *`,
      ['thumbuser', passwordHash, 'user']
    );
    user = userRows[0];

    const bandRows = await db.query(
      `INSERT INTO bands (name, description, created_by) VALUES (?, ?, ?) RETURNING *`,
      ['Thumbnail Band', 'For thumbnail tests', user.id]
    );
    band = bandRows[0];

    const feedRows = await db.query(
      `INSERT INTO feeds (band_id, author_id, text, preview_text, photo_count, comment_count) VALUES (?, ?, ?, ?, 0, 0) RETURNING *`,
      [band.id, user.id, 'Thumbnail feed', 'Thumbnail feed']
    );
    feed = feedRows[0];

    const imageName = 'thumbnail-source.png';
    const imageBuffer = await createImageBuffer();
    await fs.writeFile(path.join(originalsDir, imageName), imageBuffer);

    const photoRows = await db.query(
      `INSERT INTO feed_photos (feed_id, original_path, thumb_path, width, height, sort_order) VALUES (?, ?, ?, ?, ?, ?) RETURNING *`,
      [feed.id, '/media/originals/thumbnail-source.png', '/media/originals/thumbnail-source.png', 8, 8, 0]
    );
    photo = photoRows[0];
  });

  afterAll(async () => {
    db.close();
    try {
      fsSync.unlinkSync(testDbPath);
    } catch (error) {}

    try {
      fsSync.unlinkSync(path.join(originalsDir, 'thumbnail-source.png'));
    } catch (error) {}

    try {
      fsSync.unlinkSync(path.join(thumbnailsDir, 'thumb_thumbnail-source.png'));
    } catch (error) {}
  });

  test('queueJob stores a queued thumbnail job', async () => {
    const job = await thumbnailQueue.queueJob('feed_photo', photo.id);
    expect(job).toBeDefined();
    expect(job.status).toBe('queued');
    expect(job.target_type).toBe('feed_photo');
  });

  test('processNextJob generates a thumbnail and updates photo record', async () => {
    await thumbnailQueue.processNextJob();

    const refreshedPhoto = await db.query('SELECT * FROM feed_photos WHERE id = ?', [photo.id]);
    expect(refreshedPhoto[0].thumb_path).toBe('/media/thumbnails/thumb_thumbnail-source.png');

    const thumbnailExists = fsSync.existsSync(path.join(thumbnailsDir, 'thumb_thumbnail-source.png'));
    expect(thumbnailExists).toBe(true);
  });
});
