const request = require('supertest');
const fs = require('fs');
const path = require('path');
const app = require('../backend/index');
const db = require('../backend/db');
const auth = require('../backend/auth');

let testDbPath;
let admin;
let user;
let band;
let feed;
let comment;

beforeAll(async () => {
  testDbPath = path.join(__dirname, '../data/test-admin-moderation.sqlite3');

  try {
    fs.unlinkSync(testDbPath);
  } catch (error) {}

  process.env.DATABASE = testDbPath;
  process.env.NODE_ENV = 'test';

  await db.initialize();

  const adminPassword = await auth.hashPassword('adminpass');
  const userPassword = await auth.hashPassword('userpass');

  const adminRes = await db.query(
    `INSERT INTO users (username, password_hash, role) VALUES (?, ?, ?) RETURNING *`,
    ['adminmoderator', adminPassword, 'admin']
  );
  admin = adminRes[0];

  const userRes = await db.query(
    `INSERT INTO users (username, password_hash, role) VALUES (?, ?, ?) RETURNING *`,
    ['contentuser', userPassword, 'user']
  );
  user = userRes[0];

  const bandRes = await db.query(
    `INSERT INTO bands (name, description, created_by) VALUES (?, ?, ?) RETURNING *`,
    ['Moderation Band', 'For moderation tests', user.id]
  );
  band = bandRes[0];

  const feedRes = await db.query(
    `INSERT INTO feeds (band_id, author_id, text, preview_text, photo_count, comment_count) VALUES (?, ?, ?, ?, 0, 0) RETURNING *`,
    [band.id, user.id, 'Inappropriate feed', 'Inappropriate feed']
  );
  feed = feedRes[0];

  const commentRes = await db.query(
    `INSERT INTO comments (author_id, target_type, target_id, content) VALUES (?, ?, ?, ?) RETURNING *`,
    [user.id, 'feed', feed.id, 'Inappropriate comment']
  );
  comment = commentRes[0];

  await db.query(`UPDATE feeds SET comment_count = 1 WHERE id = ?`, [feed.id]);
});

afterAll(() => {
  db.close();
  try {
    fs.unlinkSync(testDbPath);
  } catch (error) {}
});

describe('Admin moderation', () => {
  test('admin can delete a feed through moderation endpoint', async () => {
    const token = auth.generateToken({ id: admin.id, role: admin.role });
    const response = await request(app)
      .delete(`/api/feeds/${feed.id}/admin-delete`)
      .set('Authorization', `Bearer ${token}`);

    expect(response.status).toBe(200);
    expect(response.body.moderated).toBe(true);

    const deletedFeed = await db.query(`SELECT * FROM feeds WHERE id = ?`, [feed.id]);
    expect(deletedFeed.length).toBe(0);
  });

  test('non-admin cannot use feed moderation endpoint', async () => {
    const createFeedRes = await db.query(
      `INSERT INTO feeds (band_id, author_id, text, preview_text, photo_count, comment_count) VALUES (?, ?, ?, ?, 0, 0) RETURNING *`,
      [band.id, user.id, 'Another feed', 'Another feed']
    );
    const feedRow = createFeedRes[0];

    const token = auth.generateToken({ id: user.id, role: user.role });
    const response = await request(app)
      .delete(`/api/feeds/${feedRow.id}/admin-delete`)
      .set('Authorization', `Bearer ${token}`);

    expect(response.status).toBe(403);
  });

  test('admin can soft-delete comments through moderation endpoint', async () => {
    const moderationFeedRows = await db.query(
      `INSERT INTO feeds (band_id, author_id, text, preview_text, photo_count, comment_count) VALUES (?, ?, ?, ?, 0, 0) RETURNING *`,
      [band.id, user.id, 'Moderation target feed', 'Moderation target feed']
    );
    const moderationFeed = moderationFeedRows[0];

    const freshCommentRows = await db.query(
      `INSERT INTO comments (author_id, target_type, target_id, content) VALUES (?, ?, ?, ?) RETURNING *`,
      [user.id, 'feed', moderationFeed.id, 'Fresh moderation target']
    );
    const freshComment = freshCommentRows[0];
    await db.query(`UPDATE feeds SET comment_count = 1 WHERE id = ?`, [moderationFeed.id]);

    const token = auth.generateToken({ id: admin.id, role: admin.role });
    const response = await request(app)
      .delete(`/api/comments/${freshComment.id}/admin-delete`)
      .set('Authorization', `Bearer ${token}`);

    expect(response.status).toBe(200);
    expect(response.body.moderated).toBe(true);

    const deletedComment = await db.query(`SELECT * FROM comments WHERE id = ?`, [freshComment.id]);
    expect(deletedComment[0].deleted_at).toBeDefined();

    const updatedFeed = await db.query(`SELECT comment_count FROM feeds WHERE id = ?`, [moderationFeed.id]);
    expect(updatedFeed[0].comment_count).toBe(0);
  });

  test('non-admin cannot use comment moderation endpoint', async () => {
    const freshComment = await db.query(
      `INSERT INTO comments (author_id, target_type, target_id, content) VALUES (?, ?, ?, ?) RETURNING *`,
      [user.id, 'feed', feed.id, 'Another comment']
    );

    const token = auth.generateToken({ id: user.id, role: user.role });
    const response = await request(app)
      .delete(`/api/comments/${freshComment[0].id}/admin-delete`)
      .set('Authorization', `Bearer ${token}`);

    expect(response.status).toBe(403);
  });
});
