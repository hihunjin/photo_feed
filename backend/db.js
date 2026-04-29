const sqlite3 = require('sqlite3').verbose();
const fs = require('fs');
const path = require('path');
const bcrypt = require('bcrypt');

const SALT_ROUNDS = 10;

let db = null;
let isInitialized = false;

/**
 * Initialize database connection and create tables
 */
function initialize() {
  return new Promise((resolve, reject) => {
    // If already initialized in same process, close and reinitialize for tests
    if (db && isInitialized) {
      db.close((err) => {
        db = null;
        isInitialized = false;
        performInitialize(resolve, reject);
      });
    } else {
      performInitialize(resolve, reject);
    }
  });
}

function performInitialize(resolve, reject) {
  const dbPath = process.env.DATABASE || path.join(__dirname, '../data/photo_feed.sqlite3');
  
  // Ensure data directory and sub-folders exist and are writable
  const dataDir = path.dirname(dbPath);
  const originalsDir = path.join(dataDir, 'originals');
  const thumbnailsDir = path.join(dataDir, 'thumbnails');
  
  [dataDir, originalsDir, thumbnailsDir].forEach(dir => {
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
  });
  
  // Delete old db if it exists in test mode
  if (process.env.NODE_ENV === 'test' && fs.existsSync(dbPath)) {
    try {
      fs.unlinkSync(dbPath);
    } catch (e) {
      // File might be in use
    }
  }

  // Create or open database with proper flags
  const flags = sqlite3.OPEN_READWRITE | sqlite3.OPEN_CREATE;
  db = new sqlite3.Database(dbPath, flags, (err) => {
    if (err) {
      console.error('Database error:', err);
      reject(err);
      return;
    }

    // Enable journal mode and foreign keys
    db.serialize(() => {
      // Use DEFER journal mode for tests to avoid locking issues
      if (process.env.NODE_ENV === 'test') {
        db.run('PRAGMA journal_mode = DELETE');
      } else {
        db.run('PRAGMA journal_mode = WAL');
      }
      db.run('PRAGMA foreign_keys = ON', (err) => {
        if (err) {
          console.error('PRAGMA error:', err);
          reject(err);
          return;
        }

        // Read and execute schema
        const schemaPath = path.join(__dirname, 'schema.sql');
        const schema = fs.readFileSync(schemaPath, 'utf8');
        
        // Execute all schema statements together
        db.exec(schema, (err) => {
          if (err && !err.message.includes('already exists')) {
            console.error('SQL Error:', err);
          }
          
          // Initialize default upload policy
          db.get('SELECT id FROM upload_policies WHERE id = 1', (err, row) => {
            if (!row) {
              db.run(
                `INSERT INTO upload_policies (
                  id, 
                  feed_max_photos, 
                  album_max_photos, 
                  max_file_size_mb, 
                  allowed_mime_types
                ) VALUES (?, ?, ?, ?, ?)`,
                [1, 50, 1000, 500, JSON.stringify(['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'video/mp4', 'video/quicktime', 'video/x-msvideo', 'video/webm', 'video/x-matroska'])],
                (err) => {
                  if (err && err.code !== 'SQLITE_CONSTRAINT') {
                    console.error('Policy initialization error:', err);
                  }
                  
                  // Run migrations for existing databases
                  runMigrations().then(() => {
                    isInitialized = true;
                    console.log('✓ Database initialized successfully');
                    seedDevUsers().then(() => resolve(db)).catch(() => resolve(db));
                  }).catch(reject);
                }
              );
            } else {
              // Run migrations even if policy exists
              runMigrations().then(() => {
                isInitialized = true;
                console.log('✓ Database initialized successfully');
                seedDevUsers().then(() => resolve(db)).catch(() => resolve(db));
              }).catch(reject);
            }
          });
        });
      });
    });
  });
}

/**
 * Seed default admin and user accounts in development mode.
 * Password for both: 1234
 * Skipped in production (NAS uses DSM auth) and test (tests create their own users).
 */
async function seedDevUsers() {
  const env = process.env.NODE_ENV || 'development';
  if (env === 'production' || env === 'test') {
    return;
  }

  const DEV_PASSWORD = '1234';

  const devUsers = [
    { username: 'admin', role: 'admin' },
    { username: 'user', role: 'user' }
  ];

  for (const { username, role } of devUsers) {
    try {
      const existing = await query(
        'SELECT id FROM users WHERE username = ?',
        [username]
      );

      if (existing.length === 0) {
        const hash = await bcrypt.hash(DEV_PASSWORD, SALT_ROUNDS);
        await query(
          'INSERT INTO users (username, password_hash, role) VALUES (?, ?, ?)',
          [username, hash, role]
        );
        console.log(`✓ Dev user seeded: ${username} (${role}) — password: ${DEV_PASSWORD}`);
      }
    } catch (seedError) {
      // Ignore duplicates, log others
      if (seedError.code !== 'SQLITE_CONSTRAINT') {
        console.error(`Dev seed error for ${username}:`, seedError.message);
      }
    }
  }
}

/**
 * Execute a SQL query and return results
 */
function query(sql, params = []) {
  return new Promise((resolve, reject) => {
    if (!db) {
      reject(new Error('Database not initialized. Call initialize() first'));
      return;
    }
    
    try {
      const trimmedSql = sql.trim().toUpperCase();
      
      // Check if it's a SELECT or PRAGMA statement
      if (trimmedSql.startsWith('SELECT') || trimmedSql.startsWith('PRAGMA')) {
        db.all(sql, params, (err, rows) => {
          if (err) {
            console.error('DB Error:', err.message);
            reject(err);
          } else {
            resolve(rows || []);
          }
        });
      } else if (trimmedSql.startsWith('INSERT') && sql.includes('RETURNING')) {
        // For RETURNING clauses, we need to do it manually
        const tableMatch = sql.match(/INSERT\s+INTO\s+([a-zA-Z0-9_]+)/i);
        const tableName = tableMatch ? tableMatch[1] : null;
        const insertSql = sql.split('RETURNING')[0];
        const placeholderCount = (insertSql.match(/\?/g) || []).length;
        const boundParams = params.slice(0, placeholderCount);

        db.run(insertSql, boundParams, function(err) {
          if (err) {
            console.error('DB Error:', err.message);
            reject(err);
          } else {
            const lastId = this.lastID;
            // Parse the RETURNING clause to determine what to return
            const returningMatch = sql.match(/RETURNING\s+(.*)/i);
            if (returningMatch) {
              const columns = returningMatch[1].trim();
              const selectSql = tableName
                ? columns === 'id'
                  ? `SELECT id FROM ${tableName} WHERE id = ? LIMIT 1`
                  : `SELECT ${columns} FROM ${tableName} WHERE id = ? LIMIT 1`
                : null;

              if (!selectSql) {
                resolve([{ id: lastId }]);
                return;
              }

              db.get(selectSql, [lastId], (selectErr, row) => {
                if (selectErr || !row) {
                  resolve([{ id: lastId }]);
                } else {
                  resolve([row]);
                }
              });
            } else {
              resolve([{ id: lastId }]);
            }
          }
        });
      } else {
        db.run(sql, params, function(err) {
          if (err) {
            console.error('DB Error:', err.message);
            reject(err);
          } else {
            resolve({ id: this.lastID, changes: this.changes });
          }
        });
      }
    } catch (error) {
      console.error('DB Error:', error.message);
      reject(error);
    }
  });
}

/**
 * Execute transaction
 */
async function transaction(fn) {
  if (!db) {
    throw new Error('Database not initialized');
  }
  
  await query('BEGIN TRANSACTION');
  try {
    const result = await fn();
    await query('COMMIT');
    return result;
  } catch (error) {
    await query('ROLLBACK');
    throw error;
  }
}

/**
 * Close database connection
 */
function close() {
  if (db) {
    db.close();
    db = null;
    isInitialized = false;
  }
}

/**
 * Get database instance (for raw operations if needed)
 */
function getInstance() {
  if (!db) {
    throw new Error('Database not initialized');
  }
  return db;
}

/**
 * Ensures that necessary columns exist in the database (simple migration system)
 */
async function runMigrations() {
  // Migrate feed_photos and album_photos
  const joinTables = ['feed_photos', 'album_photos'];
  for (const table of joinTables) {
    try {
      const columns = await new Promise((res, rej) => {
        db.all(`PRAGMA table_info(${table})`, (err, rows) => {
          if (err) rej(err); else res(rows);
        });
      });

      const hasUniquePhotoId = columns.some(c => c.name === 'unique_photo_id');
      if (!hasUniquePhotoId) {
        console.log(`Adding missing column unique_photo_id to ${table}`);
        await new Promise((res, rej) => {
          db.run(`ALTER TABLE ${table} ADD COLUMN unique_photo_id INTEGER REFERENCES unique_photos(id) ON DELETE SET NULL`, (err) => {
            if (err) rej(err); else res();
          });
        });
      }

      const hasMediaType = columns.some(c => c.name === 'media_type');
      if (!hasMediaType) {
        console.log(`Adding missing column media_type to ${table}`);
        await new Promise((res, rej) => {
          db.run(`ALTER TABLE ${table} ADD COLUMN media_type TEXT NOT NULL DEFAULT 'image'`, (err) => {
            if (err) rej(err); else res();
          });
        });
      }
    } catch (err) {
      console.error(`Migration error for table ${table}:`, err);
    }
  }

  // Migrate unique_photos
  try {
    const upColumns = await new Promise((res, rej) => {
      db.all(`PRAGMA table_info(unique_photos)`, (err, rows) => {
        if (err) rej(err); else res(rows);
      });
    });
    const hasMediaType = upColumns.some(c => c.name === 'media_type');
    if (!hasMediaType) {
      console.log('Adding missing column media_type to unique_photos');
      await new Promise((res, rej) => {
        db.run(`ALTER TABLE unique_photos ADD COLUMN media_type TEXT NOT NULL DEFAULT 'image'`, (err) => {
          if (err) rej(err); else res();
        });
      });
    }

    const hasDuration = upColumns.some(c => c.name === 'duration');
    if (!hasDuration) {
      console.log('Adding missing column duration to unique_photos');
      await new Promise((res, rej) => {
        db.run(`ALTER TABLE unique_photos ADD COLUMN duration REAL`, (err) => {
          if (err) rej(err); else res();
        });
      });
    }
  } catch (err) {
    console.error('Migration error for unique_photos:', err);
  }

  // Migrate upload_policies to include video MIME types
  try {
    const policy = await new Promise((res, rej) => {
      db.get('SELECT * FROM upload_policies WHERE id = 1', (err, row) => {
        if (err) rej(err); else res(row);
      });
    });
    if (policy) {
      let mimeTypes = [];
      try { mimeTypes = JSON.parse(policy.allowed_mime_types || '[]'); } catch (_) {}
      const videoTypes = ['video/mp4', 'video/quicktime', 'video/x-msvideo', 'video/webm', 'video/x-matroska'];
      const needsUpdate = videoTypes.some(vt => !mimeTypes.includes(vt));
      if (needsUpdate) {
        const newTypes = [...new Set([...mimeTypes, ...videoTypes])];
        await new Promise((res, rej) => {
          db.run(
            `UPDATE upload_policies SET allowed_mime_types = ?, max_file_size_mb = 500 WHERE id = 1`,
            [JSON.stringify(newTypes)],
            (err) => { if (err) rej(err); else res(); }
          );
        });
        console.log('✓ Upload policy updated to include video MIME types');
      }
    }
  } catch (err) {
    console.error('Migration error for upload_policies:', err);
  }
}

module.exports = {
  initialize,
  query,
  transaction,
  close,
  getInstance
};
