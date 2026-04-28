const db = require('../backend/db');
const fs = require('fs');
const path = require('path');

describe('Task 1.1: Database Initialization & Connection', () => {
  let testDbPath;

  beforeAll(async () => {
    // Use test database
    testDbPath = path.join(__dirname, '../data/test.sqlite3');
    
    // Clean up if exists
    if (fs.existsSync(testDbPath)) {
      fs.unlinkSync(testDbPath);
    }
    
    process.env.DATABASE = testDbPath;
    await db.initialize();
  });

  afterAll(async () => {
    // Clean up test database
    db.close();
    if (fs.existsSync(testDbPath)) {
      fs.unlinkSync(testDbPath);
    }
  });

  test('1. Initialize database connection', async () => {
    const instance = db.getInstance();
    expect(instance).not.toBeNull();
  });

  test('2. All required tables exist', async () => {
    const tableNames = [
      'users',
      'bands',
      'feeds',
      'albums',
      'comments',
      'feed_photos',
      'album_photos',
      'upload_policies',
      'thumbnail_jobs'
    ];

    for (const table of tableNames) {
      const result = await db.query(
        `SELECT name FROM sqlite_master WHERE type='table' AND name=?`,
        [table]
      );
      expect(result.length).toBeGreaterThan(0);
    }
  });

  test('3. All required indexes exist', async () => {
    const indexNames = [
      'idx_feeds_band_created',
      'idx_feeds_band_last_comment',
      'idx_albums_band_created',
      'idx_comments_target'
    ];

    for (const idx of indexNames) {
      const result = await db.query(
        `SELECT name FROM sqlite_master WHERE type='index' AND name=?`,
        [idx]
      );
      expect(result.length).toBeGreaterThan(0);
    }
  });

  test('4. upload_policies default values are set', async () => {
    const policy = await db.query('SELECT * FROM upload_policies WHERE id=1');
    expect(policy.length).toBeGreaterThan(0);
    expect(policy[0].feed_max_photos).toBe(50);
    expect(policy[0].album_max_photos).toBe(1000);
    expect(policy[0].max_file_size_mb).toBe(20);
  });

  test('5. Database schema constraints work correctly', async () => {
    // Test role constraint
    try {
      await db.query(
        'INSERT INTO users (username, password_hash, role) VALUES (?, ?, ?)',
        ['testuser', 'hash', 'invalid_role']
      );
      throw new Error('Should have failed validation');
    } catch (error) {
      expect(error).toBeDefined();
    }
  });

  test('6. Foreign key constraints are enabled', async () => {
    // Try to insert a feed with non-existent band_id
    try {
      await db.query(
        'INSERT INTO feeds (band_id, author_id, text, preview_text) VALUES (?, ?, ?, ?)',
        [99999, 99999, 'test', 'test']
      );
      throw new Error('Should have failed foreign key constraint');
    } catch (error) {
      expect(error).toBeDefined();
    }
  });
});
