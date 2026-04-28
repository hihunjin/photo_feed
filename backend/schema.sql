-- Users Table
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL CHECK(role IN ('admin', 'user')),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Bands Table
CREATE TABLE IF NOT EXISTS bands (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  description TEXT,
  created_by INTEGER NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (created_by) REFERENCES users(id)
);

-- Feeds Table
CREATE TABLE IF NOT EXISTS feeds (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  band_id INTEGER NOT NULL,
  author_id INTEGER NOT NULL,
  text TEXT NOT NULL,
  preview_text TEXT NOT NULL,
  photo_count INTEGER NOT NULL DEFAULT 0,
  comment_count INTEGER NOT NULL DEFAULT 0,
  last_commented_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (band_id) REFERENCES bands(id),
  FOREIGN KEY (author_id) REFERENCES users(id)
);

-- Albums Table
CREATE TABLE IF NOT EXISTS albums (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  band_id INTEGER NOT NULL,
  author_id INTEGER NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  photo_count INTEGER NOT NULL DEFAULT 0,
  cover_thumb_path TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (band_id) REFERENCES bands(id),
  FOREIGN KEY (author_id) REFERENCES users(id)
);

-- Comments Table
CREATE TABLE IF NOT EXISTS comments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  author_id INTEGER NOT NULL,
  target_type TEXT NOT NULL CHECK(target_type IN ('feed', 'album')),
  target_id INTEGER NOT NULL,
  content TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  deleted_at TEXT,
  FOREIGN KEY (author_id) REFERENCES users(id)
);

-- Feed Photos Table
CREATE TABLE IF NOT EXISTS feed_photos (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  feed_id INTEGER NOT NULL,
  original_path TEXT NOT NULL,
  thumb_path TEXT NOT NULL,
  width INTEGER,
  height INTEGER,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (feed_id) REFERENCES feeds(id) ON DELETE CASCADE
);

-- Album Photos Table
CREATE TABLE IF NOT EXISTS album_photos (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  album_id INTEGER NOT NULL,
  original_path TEXT NOT NULL,
  thumb_path TEXT NOT NULL,
  width INTEGER,
  height INTEGER,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (album_id) REFERENCES albums(id) ON DELETE CASCADE
);

-- Upload Policies Table
CREATE TABLE IF NOT EXISTS upload_policies (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  feed_max_photos INTEGER NOT NULL DEFAULT 50,
  album_max_photos INTEGER NOT NULL DEFAULT 1000,
  max_file_size_mb INTEGER NOT NULL DEFAULT 20,
  allowed_mime_types TEXT NOT NULL DEFAULT '["image/jpeg", "image/png", "image/webp", "image/heic"]',
  updated_by INTEGER,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (updated_by) REFERENCES users(id)
);

-- Unique Photos Table (Hash table for avoiding duplicates)
CREATE TABLE IF NOT EXISTS unique_photos (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  hash TEXT UNIQUE NOT NULL,
  original_path TEXT NOT NULL,
  width INTEGER,
  height INTEGER,
  size INTEGER,
  mimetype TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Create Indexes
CREATE INDEX IF NOT EXISTS idx_feeds_band_created ON feeds(band_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_feeds_band_created_id ON feeds(band_id, created_at DESC, id DESC);
CREATE INDEX IF NOT EXISTS idx_feeds_band_last_comment ON feeds(band_id, last_commented_at DESC);
CREATE INDEX IF NOT EXISTS idx_feeds_band_last_comment_id ON feeds(band_id, last_commented_at DESC, id DESC);
CREATE INDEX IF NOT EXISTS idx_albums_band_created ON albums(band_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_comments_target ON comments(target_type, target_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_feed_photos_feed ON feed_photos(feed_id, sort_order);
CREATE INDEX IF NOT EXISTS idx_album_photos_album ON album_photos(album_id, sort_order);
