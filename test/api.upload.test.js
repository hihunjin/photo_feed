const request = require('supertest');
const sharp = require('sharp');
const fs = require('fs');
const path = require('path');
const app = require('../backend/index');
const db = require('../backend/db');
const auth = require('../backend/auth');

let testDbPath;
let user;
let band;

async function createTestImageBuffer() {
  return sharp({
    create: {
      width: 2,
      height: 2,
      channels: 4,
      background: { r: 255, g: 0, b: 0, alpha: 1 }
    }
  })
    .png()
    .toBuffer();
}

describe('Upload Pipeline', () => {
  beforeAll(async () => {
    testDbPath = path.join(__dirname, '../data/test-upload.sqlite3');

    try {
      fs.unlinkSync(testDbPath);
    } catch (error) {}

    process.env.DATABASE = testDbPath;
    process.env.NODE_ENV = 'test';

    await db.initialize();

    const passwordHash = await auth.hashPassword('uploadpass123');
    await db.query(
      `INSERT INTO users (username, password_hash, role) VALUES (?, ?, ?) RETURNING *`,
      ['uploaduser', passwordHash, 'user']
    ).then((rows) => {
      user = rows[0];
    });

    const bandRows = await db.query(
      `INSERT INTO bands (name, description, created_by) VALUES (?, ?, ?) RETURNING *`,
      ['Upload Test Band', 'For upload tests', user.id]
    );
    band = bandRows[0];
  });

  afterAll(() => {
    db.close();
    try {
      fs.unlinkSync(testDbPath);
    } catch (error) {}
  });

  test('creates a feed with one uploaded photo', async () => {
    const token = auth.generateToken({ id: user.id, role: user.role });
    const imageBuffer = await createTestImageBuffer();

    const response = await request(app)
      .post(`/api/bands/${band.id}/feeds`)
      .set('Authorization', `Bearer ${token}`)
      .field('text', 'Feed with upload')
      .attach('photos', imageBuffer, {
        filename: 'upload.png',
        contentType: 'image/png'
      });

    expect(response.status).toBe(201);
    expect(response.body.photo_count).toBe(1);
    expect(Array.isArray(response.body.photos)).toBe(true);
    expect(response.body.photos).toHaveLength(1);
    expect(response.body.photos[0].original_path).toContain('/media/originals/');
  });

  test('creates an album with one uploaded photo', async () => {
    const token = auth.generateToken({ id: user.id, role: user.role });
    const imageBuffer = await createTestImageBuffer();

    const response = await request(app)
      .post(`/api/bands/${band.id}/albums`)
      .set('Authorization', `Bearer ${token}`)
      .field('title', 'Album with upload')
      .field('description', 'Album upload test')
      .attach('photos', imageBuffer, {
        filename: 'album-upload.png',
        contentType: 'image/png'
      });

    expect(response.status).toBe(201);
    expect(response.body.photo_count).toBe(1);
    expect(Array.isArray(response.body.photos)).toBe(true);
    expect(response.body.photos).toHaveLength(1);
    expect(response.body.cover_thumb_path).toContain('/media/thumbnails/');
  });
});
