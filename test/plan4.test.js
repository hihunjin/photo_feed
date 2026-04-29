const request = require('supertest');
const app = require('../backend/index');
const db = require('../backend/db');
const auth = require('../backend/auth');
const fs = require('fs');
const path = require('path');

let testuser, admin, band, token, adminToken;

beforeAll(async () => {
  // Clean up DB file
  const dbFile = path.join(__dirname, '../data/photo_feed.sqlite3');
  try { fs.unlinkSync(dbFile); } catch (e) {}
  try { fs.unlinkSync(dbFile + '-wal'); } catch (e) {}
  try { fs.unlinkSync(dbFile + '-shm'); } catch (e) {}
  await new Promise(resolve => setTimeout(resolve, 50));

  await db.initialize();

  // Create test users
  const hashUser = await auth.hashPassword('password123');
  const hashAdmin = await auth.hashPassword('adminpass');

  const userRes = await db.query(
    `INSERT INTO users (username, password_hash, role) VALUES (?, ?, ?)`,
    ['plan4user', hashUser, 'user']
  );
  testuser = { id: userRes.id, role: 'user' };

  const adminRes = await db.query(
    `INSERT INTO users (username, password_hash, role) VALUES (?, ?, ?)`,
    ['plan4admin', hashAdmin, 'admin']
  );
  admin = { id: adminRes.id, role: 'admin' };

  // Create test band
  const bandRes = await db.query(
    `INSERT INTO bands (name, description, created_by) VALUES (?, ?, ?)`,
    ['Plan4 Band', 'Band for plan4 tests', testuser.id]
  );
  band = { id: bandRes.id };

  token = auth.generateToken({ id: testuser.id, role: testuser.role });
  adminToken = auth.generateToken({ id: admin.id, role: admin.role });
});

afterAll(async () => {
  const dbFile = path.join(__dirname, '../data/photo_feed.sqlite3');
  try { fs.unlinkSync(dbFile); } catch (e) {}
  try { fs.unlinkSync(dbFile + '-wal'); } catch (e) {}
  try { fs.unlinkSync(dbFile + '-shm'); } catch (e) {}
});

// ─────────────────────────────────────────────
// Feature 1: Empty Feed Cards
// ─────────────────────────────────────────────
describe('Feature 1: Empty Feed Cards', () => {
  test('should create a feed with empty text', async () => {
    const res = await request(app)
      .post(`/api/bands/${band.id}/feeds`)
      .set('Authorization', `Bearer ${token}`)
      .send({ text: '' });
    expect(res.status).toBe(201);
    expect(res.body.id).toBeDefined();
    expect(res.body.text).toBe('');
  });

  test('should create a feed with no text field at all', async () => {
    const res = await request(app)
      .post(`/api/bands/${band.id}/feeds`)
      .set('Authorization', `Bearer ${token}`)
      .send({});
    expect(res.status).toBe(201);
    expect(res.body.id).toBeDefined();
    expect(res.body.text).toBe('');
  });

  test('should create a feed with only photos (no text)', async () => {
    // We send empty text — this just tests the text-is-optional path
    const res = await request(app)
      .post(`/api/bands/${band.id}/feeds`)
      .set('Authorization', `Bearer ${token}`)
      .send({ text: '', photoIds: [] });
    expect(res.status).toBe(201);
    expect(res.body.text).toBe('');
    expect(res.body.photo_count).toBe(0);
  });

  test('empty feed should appear in feed list', async () => {
    const res = await request(app)
      .get(`/api/bands/${band.id}/feeds?limit=50`);
    expect(res.status).toBe(200);
    const emptyFeeds = res.body.feeds.filter(f => f.preview_text === '');
    expect(emptyFeeds.length).toBeGreaterThan(0);
  });
});

// ─────────────────────────────────────────────
// Feature 2: KST Timezone (Docker TZ approach)
// ─────────────────────────────────────────────
describe('Feature 2: KST Timezone', () => {
  test('docker-compose.yml should have TZ=Asia/Seoul', () => {
    const composePath = path.join(__dirname, '../docker-compose.yml');
    const content = fs.readFileSync(composePath, 'utf8');
    expect(content).toContain('TZ=Asia/Seoul');
  });

  test('Dockerfile should install tzdata', () => {
    const dockerfilePath = path.join(__dirname, '../Dockerfile');
    const content = fs.readFileSync(dockerfilePath, 'utf8');
    expect(content).toContain('tzdata');
  });

  test('created_at should be a valid timestamp string', async () => {
    const res = await request(app)
      .post(`/api/bands/${band.id}/feeds`)
      .set('Authorization', `Bearer ${token}`)
      .send({ text: 'Timezone test' });
    expect(res.status).toBe(201);
    // created_at should be a parseable date string
    const d = new Date(res.body.created_at);
    expect(d.toString()).not.toBe('Invalid Date');
  });
});

// ─────────────────────────────────────────────
// Feature 3: Calendar Search
// ─────────────────────────────────────────────
describe('Feature 3: Calendar Search', () => {
  // Seed feeds on specific dates for testing
  beforeAll(async () => {
    // Insert feeds with known created_at dates directly via DB
    const dates = ['2026-04-25 10:00:00', '2026-04-25 14:00:00', '2026-04-27 09:00:00'];
    for (const d of dates) {
      await db.query(
        `INSERT INTO feeds (band_id, author_id, text, preview_text, photo_count, created_at)
         VALUES (?, ?, ?, ?, 0, ?)`,
        [band.id, testuser.id, `Feed on ${d}`, `Feed on ${d}`, d]
      );
    }
  });

  describe('GET /api/bands/:bandId/feeds/dates', () => {
    test('should return distinct dates with feeds', async () => {
      const res = await request(app)
        .get(`/api/bands/${band.id}/feeds/dates`);
      expect(res.status).toBe(200);
      expect(Array.isArray(res.body.dates)).toBe(true);
      // Should have at least the two seeded dates (2026-04-25, 2026-04-27)
      expect(res.body.dates).toContain('2026-04-25');
      expect(res.body.dates).toContain('2026-04-27');
    });

    test('two feeds on same date should produce only one date entry', async () => {
      const res = await request(app)
        .get(`/api/bands/${band.id}/feeds/dates`);
      expect(res.status).toBe(200);
      const april25Count = res.body.dates.filter(d => d === '2026-04-25').length;
      expect(april25Count).toBe(1);
    });

    test('should return 404 for nonexistent band', async () => {
      const res = await request(app)
        .get(`/api/bands/99999/feeds/dates`);
      expect(res.status).toBe(404);
    });
  });

  describe('GET /api/bands/:bandId/feeds?date=YYYY-MM-DD', () => {
    test('should filter feeds by date', async () => {
      const res = await request(app)
        .get(`/api/bands/${band.id}/feeds?date=2026-04-25&limit=50`);
      expect(res.status).toBe(200);
      expect(res.body.feeds.length).toBeGreaterThanOrEqual(2);
      // All returned feeds should be from 2026-04-25
      for (const feed of res.body.feeds) {
        expect(feed.created_at).toMatch(/^2026-04-25/);
      }
    });

    test('should return empty array for date with no feeds', async () => {
      const res = await request(app)
        .get(`/api/bands/${band.id}/feeds?date=2099-01-01&limit=50`);
      expect(res.status).toBe(200);
      expect(res.body.feeds.length).toBe(0);
    });

    test('date filter should work with sort', async () => {
      const res = await request(app)
        .get(`/api/bands/${band.id}/feeds?date=2026-04-25&sort=oldest&limit=50`);
      expect(res.status).toBe(200);
      if (res.body.feeds.length > 1) {
        expect(new Date(res.body.feeds[0].created_at) <= new Date(res.body.feeds[1].created_at)).toBe(true);
      }
    });
  });
});
