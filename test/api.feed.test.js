const request = require('supertest');
const app = require('../backend/index');
const db = require('../backend/db');
const auth = require('../backend/auth');
const fs = require('fs');
const path = require('path');

let testuser, admin, band;

beforeAll(async () => {
  // Clean up DB file (but don't try to close db, let initialize handle it)
  try {
    fs.unlinkSync(path.join(__dirname, '../data/photo_feed.sqlite3'));
  } catch (e) {}
  
  // Small delay to ensure file is released
  await new Promise(resolve => setTimeout(resolve, 50));

  // Initialize DB
  await db.initialize();

  // Create test users
  const hashUser = await auth.hashPassword('password123');
  const hashAdmin = await auth.hashPassword('adminpass');

  const userRes = await db.query(
    `INSERT INTO users (username, password_hash, role) VALUES (?, ?, ?) RETURNING *`,
    ['feeduser', hashUser, 'user']
  );
  testuser = userRes[0];

  const adminRes = await db.query(
    `INSERT INTO users (username, password_hash, role) VALUES (?, ?, ?) RETURNING *`,
    ['feedadmin', hashAdmin, 'admin']
  );
  admin = adminRes[0];

  // Create test band
  const bandRes = await db.query(
    `INSERT INTO bands (name, description, created_by) VALUES (?, ?, ?) RETURNING *`,
    ['Test Band', 'Band for feeds', testuser.id]
  );
  band = bandRes[0];
});

afterAll(async () => {
  try {
    const dbFile = path.join(__dirname, '../data/photo_feed.sqlite3');
    fs.unlinkSync(dbFile);
    // Also remove WAL files
    try { fs.unlinkSync(dbFile + '-wal'); } catch (e) {}
    try { fs.unlinkSync(dbFile + '-shm'); } catch (e) {}
  } catch (e) {}
});

describe('POST /api/bands/:bandId/feeds - Create Feed', () => {
  test('should create feed without photos', async () => {
    const token = auth.generateToken({ id: testuser.id, role: testuser.role });
    const res = await request(app)
      .post(`/api/bands/${band.id}/feeds`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        text: 'This is my first feed!'
      });
    expect(res.status).toBe(201);
    expect(res.body.id).toBeDefined();
    expect(res.body.text).toBe('This is my first feed!');
    expect(res.body.photo_count).toBe(0);
  });

  test('should reject unauthenticated feed creation', async () => {
    const res = await request(app)
      .post(`/api/bands/${band.id}/feeds`)
      .send({ text: 'Unauthorized' });
    expect(res.status).toBe(401);
  });

  test('should reject feed creation for nonexistent band', async () => {
    const token = auth.generateToken({ id: testuser.id, role: testuser.role });
    const res = await request(app)
      .post(`/api/bands/99999/feeds`)
      .set('Authorization', `Bearer ${token}`)
      .send({ text: 'Test' });
    expect(res.status).toBe(404);
  });

  test('should truncate preview_text to first 200 chars', async () => {
    const token = auth.generateToken({ id: testuser.id, role: testuser.role });
    const longText = 'a'.repeat(500);
    const res = await request(app)
      .post(`/api/bands/${band.id}/feeds`)
      .set('Authorization', `Bearer ${token}`)
      .send({ text: longText });
    expect(res.status).toBe(201);
    expect(res.body.preview_text.length).toBe(200);
  });
});

describe('GET /api/bands/:bandId/feeds - List Feeds', () => {
  test('should list feeds with cursor pagination', async () => {
    const res = await request(app)
      .get(`/api/bands/${band.id}/feeds?limit=10`)
      .query({ sort: 'newest' });
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.feeds)).toBe(true);
    expect(res.body.cursor).toBeDefined();
  });

  test('should sort feeds by newest', async () => {
    const res = await request(app)
      .get(`/api/bands/${band.id}/feeds?sort=newest&limit=10`);
    expect(res.status).toBe(200);
    if (res.body.feeds.length > 1) {
      expect(new Date(res.body.feeds[0].created_at) >= new Date(res.body.feeds[1].created_at)).toBe(true);
    }
  });

  test('should sort feeds by oldest', async () => {
    const res = await request(app)
      .get(`/api/bands/${band.id}/feeds?sort=oldest&limit=10`);
    expect(res.status).toBe(200);
    if (res.body.feeds.length > 1) {
      expect(new Date(res.body.feeds[0].created_at) <= new Date(res.body.feeds[1].created_at)).toBe(true);
    }
  });

  test('should not include full text in list responses', async () => {
    const res = await request(app)
      .get(`/api/bands/${band.id}/feeds?limit=10`);
    expect(res.status).toBe(200);
    if (res.body.feeds.length > 0) {
      expect(res.body.feeds[0].preview_text).toBeDefined();
      expect(res.body.feeds[0].text).toBeUndefined();
    }
  });
});

describe('GET /api/feeds/:feedId - Get Feed Details', () => {
  let feedId;

  beforeAll(async () => {
    const token = auth.generateToken({ id: testuser.id, role: testuser.role });
    const res = await request(app)
      .post(`/api/bands/${band.id}/feeds`)
      .set('Authorization', `Bearer ${token}`)
      .send({ text: 'Detail test feed' });
    feedId = res.body.id;
  });

  test('should return full text on detail view', async () => {
    const res = await request(app)
      .get(`/api/feeds/${feedId}`);
    expect(res.status).toBe(200);
    expect(res.body.text).toBe('Detail test feed');
    expect(res.body.preview_text).toBeDefined();
  });

  test('should return 404 for nonexistent feed', async () => {
    const res = await request(app)
      .get(`/api/feeds/99999`);
    expect(res.status).toBe(404);
  });
});

describe('PATCH /api/feeds/:feedId - Update Feed', () => {
  let feedId;

  beforeAll(async () => {
    const token = auth.generateToken({ id: testuser.id, role: testuser.role });
    const res = await request(app)
      .post(`/api/bands/${band.id}/feeds`)
      .set('Authorization', `Bearer ${token}`)
      .send({ text: 'Original text' });
    feedId = res.body.id;
  });

  test('should allow author to update feed', async () => {
    const token = auth.generateToken({ id: testuser.id, role: testuser.role });
    const res = await request(app)
      .patch(`/api/feeds/${feedId}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ text: 'Updated text' });
    expect(res.status).toBe(200);
    expect(res.body.text).toBe('Updated text');
  });

  test('should allow admin to update any feed', async () => {
    const token = auth.generateToken({ id: admin.id, role: admin.role });
    const res = await request(app)
      .patch(`/api/feeds/${feedId}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ text: 'Admin updated' });
    expect(res.status).toBe(200);
    expect(res.body.text).toBe('Admin updated');
  });

  test('should reject update from non-author non-admin', async () => {
    // Create another user
    const hashOther = await auth.hashPassword('otherpass');
    const otherRes = await db.query(
      `INSERT INTO users (username, password_hash, role) VALUES (?, ?, ?) RETURNING *`,
      ['otheruser', hashOther, 'user']
    );
    const other = otherRes[0];

    const token = auth.generateToken({ id: other.id, role: other.role });
    const res = await request(app)
      .patch(`/api/feeds/${feedId}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ text: 'Hack attempt' });
    expect(res.status).toBe(403);
  });

  test('should return 404 for nonexistent feed', async () => {
    const token = auth.generateToken({ id: testuser.id, role: testuser.role });
    const res = await request(app)
      .patch(`/api/feeds/99999`)
      .set('Authorization', `Bearer ${token}`)
      .send({ text: 'Test' });
    expect(res.status).toBe(404);
  });
});

describe('DELETE /api/feeds/:feedId - Delete Feed', () => {
  let feedId;

  beforeAll(async () => {
    const token = auth.generateToken({ id: testuser.id, role: testuser.role });
    const res = await request(app)
      .post(`/api/bands/${band.id}/feeds`)
      .set('Authorization', `Bearer ${token}`)
      .send({ text: 'Delete me' });
    feedId = res.body.id;
  });

  test('should allow author to delete feed', async () => {
    const token = auth.generateToken({ id: testuser.id, role: testuser.role });
    const res = await request(app)
      .delete(`/api/feeds/${feedId}`)
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
  });

  test('should allow admin to delete any feed', async () => {
    const token = auth.generateToken({ id: testuser.id, role: testuser.role });
    const createRes = await request(app)
      .post(`/api/bands/${band.id}/feeds`)
      .set('Authorization', `Bearer ${token}`)
      .send({ text: 'Admin delete' });
    const id = createRes.body.id;

    const adminToken = auth.generateToken({ id: admin.id, role: admin.role });
    const deleteRes = await request(app)
      .delete(`/api/feeds/${id}`)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(deleteRes.status).toBe(200);
  });

  test('should reject delete from non-author non-admin', async () => {
    const token = auth.generateToken({ id: testuser.id, role: testuser.role });
    const createRes = await request(app)
      .post(`/api/bands/${band.id}/feeds`)
      .set('Authorization', `Bearer ${token}`)
      .send({ text: 'Protect me' });
    const id = createRes.body.id;

    const hashOther = await auth.hashPassword('otherpass2');
    const otherRes = await db.query(
      `INSERT INTO users (username, password_hash, role) VALUES (?, ?, ?) RETURNING *`,
      ['otheruser2', hashOther, 'user']
    );
    const otherToken = auth.generateToken({ id: otherRes[0].id, role: 'user' });
    const deleteRes = await request(app)
      .delete(`/api/feeds/${id}`)
      .set('Authorization', `Bearer ${otherToken}`);
    expect(deleteRes.status).toBe(403);
  });

  test('should return 404 for nonexistent feed', async () => {
    const token = auth.generateToken({ id: testuser.id, role: testuser.role });
    const res = await request(app)
      .delete(`/api/feeds/99999`)
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(404);
  });
});
