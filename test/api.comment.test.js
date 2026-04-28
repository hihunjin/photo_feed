const request = require('supertest');
const app = require('../backend/index');
const db = require('../backend/db');
const auth = require('../backend/auth');
const fs = require('fs');
const path = require('path');

let testuser, admin, band, feed;

beforeAll(async () => {
  // Clean up DB file (but don't try to close db, let initialize handle it)
  try {
    fs.unlinkSync(path.join(__dirname, '../data/photo_feed.sqlite3'));
  } catch (e) {}
  
  // Small delay to ensure file is released
  await new Promise(resolve => setTimeout(resolve, 50));

  await db.initialize();

  const hashUser = await auth.hashPassword('password123');
  const hashAdmin = await auth.hashPassword('adminpass');

  const userRes = await db.query(
    `INSERT INTO users (username, password_hash, role) VALUES (?, ?, ?) RETURNING *`,
    ['commentuser', hashUser, 'user']
  );
  testuser = userRes[0];

  const adminRes = await db.query(
    `INSERT INTO users (username, password_hash, role) VALUES (?, ?, ?) RETURNING *`,
    ['commentadmin', hashAdmin, 'admin']
  );
  admin = adminRes[0];

  const bandRes = await db.query(
    `INSERT INTO bands (name, description, created_by) VALUES (?, ?, ?) RETURNING *`,
    ['Comment Test Band', 'For comments', testuser.id]
  );
  band = bandRes[0];

  const feedRes = await db.query(
    `INSERT INTO feeds (band_id, author_id, text, preview_text, photo_count, comment_count) 
     VALUES (?, ?, ?, ?, 0, 0) RETURNING *`,
    [band.id, testuser.id, 'Feed for comments', 'Feed for comments', 0, 0]
  );
  feed = feedRes[0];
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

describe('POST /api/comments - Create Comment', () => {
  test('should create comment on feed', async () => {
    const token = auth.generateToken({ id: testuser.id, role: testuser.role });
    const res = await request(app)
      .post(`/api/comments`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        targetType: 'feed',
        targetId: feed.id,
        content: 'Great feed!'
      });
    expect(res.status).toBe(201);
    expect(res.body.content).toBe('Great feed!');
    expect(res.body.target_type).toBe('feed');
  });

  test('should reject unauthenticated comment', async () => {
    const res = await request(app)
      .post(`/api/comments`)
      .send({
        targetType: 'feed',
        targetId: feed.id,
        content: 'Unauthorized'
      });
    expect(res.status).toBe(401);
  });

  test('should reject invalid targetType', async () => {
    const token = auth.generateToken({ id: testuser.id, role: testuser.role });
    const res = await request(app)
      .post(`/api/comments`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        targetType: 'invalid',
        targetId: feed.id,
        content: 'Bad type'
      });
    expect(res.status).toBe(400);
  });

  test('should reject nonexistent target', async () => {
    const token = auth.generateToken({ id: testuser.id, role: testuser.role });
    const res = await request(app)
      .post(`/api/comments`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        targetType: 'feed',
        targetId: 99999,
        content: 'Bad target'
      });
    expect(res.status).toBe(404);
  });
});

describe('GET /api/comments - List Comments', () => {
  test('should list comments with cursor pagination', async () => {
    const res = await request(app)
      .get(`/api/comments?targetType=feed&targetId=${feed.id}&limit=10`);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.comments)).toBe(true);
    expect(res.body.cursor).toBeDefined();
  });

  test('should require targetType and targetId', async () => {
    const res = await request(app)
      .get(`/api/comments?limit=10`);
    expect(res.status).toBe(400);
  });
});

describe('PATCH /api/comments/:commentId - Update Comment', () => {
  let commentId;

  beforeAll(async () => {
    const token = auth.generateToken({ id: testuser.id, role: testuser.role });
    const res = await request(app)
      .post(`/api/comments`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        targetType: 'feed',
        targetId: feed.id,
        content: 'Original comment'
      });
    commentId = res.body.id;
  });

  test('should allow author to update comment', async () => {
    const token = auth.generateToken({ id: testuser.id, role: testuser.role });
    const res = await request(app)
      .patch(`/api/comments/${commentId}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ content: 'Updated comment' });
    expect(res.status).toBe(200);
    expect(res.body.content).toBe('Updated comment');
  });

  test('should allow admin to update any comment', async () => {
    const token = auth.generateToken({ id: admin.id, role: admin.role });
    const res = await request(app)
      .patch(`/api/comments/${commentId}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ content: 'Admin updated' });
    expect(res.status).toBe(200);
    expect(res.body.content).toBe('Admin updated');
  });

  test('should reject update from non-author non-admin', async () => {
    const hashOther = await auth.hashPassword('otherpass');
    const otherRes = await db.query(
      `INSERT INTO users (username, password_hash, role) VALUES (?, ?, ?) RETURNING *`,
      ['othercomment', hashOther, 'user']
    );
    const token = auth.generateToken({ id: otherRes[0].id, role: 'user' });
    const res = await request(app)
      .patch(`/api/comments/${commentId}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ content: 'Hack' });
    expect(res.status).toBe(403);
  });
});

describe('DELETE /api/comments/:commentId - Delete Comment', () => {
  let commentId;

  beforeAll(async () => {
    const token = auth.generateToken({ id: testuser.id, role: testuser.role });
    const res = await request(app)
      .post(`/api/comments`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        targetType: 'feed',
        targetId: feed.id,
        content: 'Delete me'
      });
    commentId = res.body.id;
  });

  test('should allow author to delete comment', async () => {
    const token = auth.generateToken({ id: testuser.id, role: testuser.role });
    const res = await request(app)
      .delete(`/api/comments/${commentId}`)
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
  });

  test('should allow admin to delete any comment', async () => {
    const token = auth.generateToken({ id: testuser.id, role: testuser.role });
    const createRes = await request(app)
      .post(`/api/comments`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        targetType: 'feed',
        targetId: feed.id,
        content: 'Admin delete'
      });
    const id = createRes.body.id;

    const adminToken = auth.generateToken({ id: admin.id, role: admin.role });
    const deleteRes = await request(app)
      .delete(`/api/comments/${id}`)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(deleteRes.status).toBe(200);
  });

  test('should reject delete from non-author non-admin', async () => {
    const token = auth.generateToken({ id: testuser.id, role: testuser.role });
    const createRes = await request(app)
      .post(`/api/comments`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        targetType: 'feed',
        targetId: feed.id,
        content: 'Protect me'
      });
    const id = createRes.body.id;

    const hashOther = await auth.hashPassword('otherdelete');
    const otherRes = await db.query(
      `INSERT INTO users (username, password_hash, role) VALUES (?, ?, ?) RETURNING *`,
      ['otherdelete', hashOther, 'user']
    );
    const otherToken = auth.generateToken({ id: otherRes[0].id, role: 'user' });
    const deleteRes = await request(app)
      .delete(`/api/comments/${id}`)
      .set('Authorization', `Bearer ${otherToken}`);
    expect(deleteRes.status).toBe(403);
  });
});
