const db = require('../db');
const { getUploadPolicy, validateFiles, saveUploadedFiles } = require('../services/uploadService');

// Truncate text to preview (first 200 chars)
function truncatePreview(text, length = 200) {
  return text.length > length ? text.substring(0, length) : text;
}

// GET /api/bands/:bandId/feeds - List feeds with cursor pagination
async function getAllFeeds(req, res) {
  try {
    const { bandId } = req.params;
    const { sort = 'newest', limit = 20, cursor = null, search = '' } = req.query;
    const parsedLimit = Math.min(parseInt(limit, 10) || 20, 100);

    // Verify band exists
    const bandCheck = await db.query(`SELECT id FROM bands WHERE id = ?`, [bandId]);
    if (bandCheck.length === 0) {
      return res.status(404).json({ error: 'Band not found' });
    }

    // Build query based on sort
    let orderBy = 'created_at DESC'; // newest default
    if (sort === 'oldest') orderBy = 'created_at ASC';
    if (sort === 'new-comments') orderBy = 'last_commented_at DESC, created_at DESC';

    // Cursor-based pagination
    let where = `band_id = ?`;
    let params = [bandId];
    
    if (search) {
      where += ` AND text LIKE ?`;
      params.push(`%${search}%`);
    }

    if (cursor) {
      if (sort === 'newest' || sort === 'new-comments') {
        where += ` AND created_at < ?`;
      } else if (sort === 'oldest') {
        where += ` AND created_at > ?`;
      }
      params.push(cursor);
    }

    // Fetch feeds (preview only, no full text)
    const feeds = await db.query(
      `SELECT id, band_id, author_id, preview_text, photo_count, comment_count, created_at, updated_at
       FROM feeds WHERE ${where} ORDER BY ${orderBy} LIMIT ?`,
      [...params, parsedLimit + 1]
    );

    const hasMore = feeds.length > parsedLimit;
    const result = hasMore ? feeds.slice(0, parsedLimit) : feeds;
    const nextCursor = hasMore && result.length > 0 ? result[result.length - 1].created_at : null;

    // Attach up to 3 preview photos per feed
    for (const feed of result) {
      if (feed.photo_count > 0) {
        const photos = await db.query(
          `SELECT id, thumb_path, original_path FROM feed_photos WHERE feed_id = ? ORDER BY sort_order LIMIT 3`,
          [feed.id]
        );
        feed.preview_photos = photos;
      } else {
        feed.preview_photos = [];
      }
    }

    let totalCount = 0;
    if (search) {
      const countRes = await db.query(
        `SELECT COUNT(*) as count FROM feeds WHERE band_id = ? AND text LIKE ?`,
        [bandId, `%${search}%`]
      );
      totalCount = countRes[0].count;
    }

    res.json({
      feeds: result,
      cursor: nextCursor,
      hasMore: hasMore,
      ...(search ? { totalCount } : {})
    });
  } catch (err) {
    console.error('Error fetching feeds:', err);
    res.status(500).json({ error: 'Failed to fetch feeds' });
  }
}

// GET /api/feeds/:feedId - Get feed details (full text + original paths)
async function getFeedById(req, res) {
  try {
    const { feedId } = req.params;

    const feed = await db.query(
      `SELECT * FROM feeds WHERE id = ?`,
      [feedId]
    );

    if (feed.length === 0) {
      return res.status(404).json({ error: 'Feed not found' });
    }

    // Include full text and photo details
    const photos = await db.query(
      `SELECT id, original_path, thumb_path, width, height, sort_order FROM feed_photos WHERE feed_id = ? ORDER BY sort_order`,
      [feedId]
    );

    res.json({
      ...feed[0],
      photos: photos
    });
  } catch (err) {
    console.error('Error fetching feed:', err);
    res.status(500).json({ error: 'Failed to fetch feed' });
  }
}

// POST /api/bands/:bandId/feeds - Create feed
async function createFeed(req, res) {
  try {
    const { bandId } = req.params;
    const { text } = req.body;
    const userId = req.user.id;
    const files = req.files || [];

    if (!text) {
      return res.status(400).json({ error: 'Text is required' });
    }

    const policy = await getUploadPolicy();
    try {
      await validateFiles(files, policy, policy.feed_max_photos || 50);
    } catch (validationError) {
      return res.status(validationError.statusCode || 400).json({ error: validationError.message });
    }

    // Verify band exists
    const bandCheck = await db.query(`SELECT id FROM bands WHERE id = ?`, [bandId]);
    if (bandCheck.length === 0) {
      return res.status(404).json({ error: 'Band not found' });
    }

    const previewText = truncatePreview(text);

    await db.query(
      `INSERT INTO feeds (band_id, author_id, text, preview_text, photo_count, comment_count) 
       VALUES (?, ?, ?, ?, 0, 0)`,
      [bandId, userId, text, previewText]
    );

    // Fetch the created feed
    const feeds = await db.query(
      `SELECT * FROM feeds WHERE band_id = ? AND author_id = ? ORDER BY id DESC LIMIT 1`,
      [bandId, userId]
    );

    const createdFeed = feeds[0];

    if (files.length > 0) {
      const savedFiles = await saveUploadedFiles({ files, prefix: 'feed', targetId: createdFeed.id });

      for (let index = 0; index < savedFiles.length; index += 1) {
        const savedFile = savedFiles[index];
        await db.query(
          `INSERT INTO feed_photos (feed_id, original_path, thumb_path, width, height, sort_order, unique_photo_id) 
           VALUES (?, ?, ?, ?, ?, ?, ?)`,
          [createdFeed.id, savedFile.originalUrl, savedFile.thumbnailUrl, null, null, index, savedFile.uniquePhotoId]
        );
      }

      await db.query(
        `UPDATE feeds SET photo_count = ? WHERE id = ?`,
        [files.length, createdFeed.id]
      );
    }

    const refreshedFeed = await db.query(`SELECT * FROM feeds WHERE id = ?`, [createdFeed.id]);
    const photos = await db.query(
      `SELECT id, original_path, thumb_path, width, height, sort_order FROM feed_photos WHERE feed_id = ? ORDER BY sort_order`,
      [createdFeed.id]
    );

    res.status(201).json({ ...refreshedFeed[0], photos });
  } catch (err) {
    console.error('Error creating feed:', err);
    res.status(500).json({ error: 'Failed to create feed' });
  }
}

// PATCH /api/feeds/:feedId - Update feed
async function updateFeed(req, res) {
  try {
    const { feedId } = req.params;
    const { text } = req.body;
    const userId = req.user.id;

    const feed = await db.query(`SELECT * FROM feeds WHERE id = ?`, [feedId]);
    if (feed.length === 0) {
      return res.status(404).json({ error: 'Feed not found' });
    }

    // Permission check: author or admin
    if (feed[0].author_id !== userId && req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Forbidden' });
    }

    const previewText = text ? truncatePreview(text) : feed[0].preview_text;

    const updated = await db.query(
      `UPDATE feeds SET text = ?, preview_text = ?, updated_at = CURRENT_TIMESTAMP 
       WHERE id = ?`,
      [text || feed[0].text, previewText, feedId]
    );

    const refreshed = await db.query(`SELECT * FROM feeds WHERE id = ?`, [feedId]);
    res.json(refreshed[0]);
  } catch (err) {
    console.error('Error updating feed:', err);
    res.status(500).json({ error: 'Failed to update feed' });
  }
}

// DELETE /api/feeds/:feedId - Delete feed
async function deleteFeed(req, res) {
  try {
    const { feedId } = req.params;
    const userId = req.user.id;

    const feed = await db.query(`SELECT * FROM feeds WHERE id = ?`, [feedId]);
    if (feed.length === 0) {
      return res.status(404).json({ error: 'Feed not found' });
    }

    // Permission check: author or admin
    if (feed[0].author_id !== userId && req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Forbidden' });
    }

    // Delete associated photos and comments
    await db.query(`DELETE FROM feed_photos WHERE feed_id = ?`, [feedId]);
    await db.query(`DELETE FROM comments WHERE target_type = 'feed' AND target_id = ?`, [feedId]);

    // Delete feed
    await db.query(`DELETE FROM feeds WHERE id = ?`, [feedId]);

    res.json({ success: true });
  } catch (err) {
    console.error('Error deleting feed:', err);
    res.status(500).json({ error: 'Failed to delete feed' });
  }
}

async function adminDeleteFeed(req, res) {
  try {
    const { feedId } = req.params;

    const feed = await db.query(`SELECT * FROM feeds WHERE id = ?`, [feedId]);
    if (feed.length === 0) {
      return res.status(404).json({ error: 'Feed not found' });
    }

    await db.query(`DELETE FROM feed_photos WHERE feed_id = ?`, [feedId]);
    await db.query(`DELETE FROM comments WHERE target_type = 'feed' AND target_id = ?`, [feedId]);
    await db.query(`DELETE FROM feeds WHERE id = ?`, [feedId]);

    res.json({ success: true, moderated: true });
  } catch (err) {
    console.error('Error admin deleting feed:', err);
    res.status(500).json({ error: 'Failed to delete feed' });
  }
}

// POST /api/feeds/:feedId/photos - Add a single photo to a feed
async function addFeedPhoto(req, res) {
  try {
    const { feedId } = req.params;
    const userId = req.user.id;
    const file = req.file;

    if (!file) {
      return res.status(400).json({ error: 'No photo provided' });
    }

    const feed = await db.query(`SELECT * FROM feeds WHERE id = ?`, [feedId]);
    if (feed.length === 0) {
      return res.status(404).json({ error: 'Feed not found' });
    }

    if (feed[0].author_id !== userId && req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Forbidden' });
    }

    const policy = await getUploadPolicy();
    try {
      await validateFiles([file], policy, policy.feed_max_photos || 50);
    } catch (validationError) {
      return res.status(validationError.statusCode || 400).json({ error: validationError.message });
    }

    // Get next sort_order
    const maxOrder = await db.query(
      `SELECT COALESCE(MAX(sort_order), -1) AS max_order FROM feed_photos WHERE feed_id = ?`,
      [feedId]
    );
    const nextOrder = (maxOrder[0]?.max_order ?? -1) + 1;

    const savedFiles = await saveUploadedFiles({ files: [file], prefix: 'feed', targetId: feedId });
    const savedFile = savedFiles[0];
    await db.query(
      `INSERT INTO feed_photos (feed_id, original_path, thumb_path, width, height, sort_order, unique_photo_id) 
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [feedId, savedFile.originalUrl, savedFile.thumbnailUrl, null, null, nextOrder, savedFile.uniquePhotoId]
    );

    // Recalculate photo_count
    const countResult = await db.query(
      `SELECT COUNT(*) AS cnt FROM feed_photos WHERE feed_id = ?`,
      [feedId]
    );
    await db.query(
      `UPDATE feeds SET photo_count = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
      [countResult[0].cnt, feedId]
    );

    const photo = await db.query(
      `SELECT id, original_path, thumb_path, width, height, sort_order FROM feed_photos WHERE feed_id = ? ORDER BY id DESC LIMIT 1`,
      [feedId]
    );

    res.status(201).json(photo[0]);
  } catch (err) {
    console.error('Error adding feed photo:', err);
    res.status(500).json({ error: 'Failed to add photo' });
  }
}

// DELETE /api/feeds/:feedId/photos/:photoId - Remove a single photo
async function deleteFeedPhoto(req, res) {
  try {
    const { feedId, photoId } = req.params;
    const userId = req.user.id;

    const feed = await db.query(`SELECT * FROM feeds WHERE id = ?`, [feedId]);
    if (feed.length === 0) {
      return res.status(404).json({ error: 'Feed not found' });
    }

    if (feed[0].author_id !== userId && req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Forbidden' });
    }

    const photo = await db.query(
      `SELECT * FROM feed_photos WHERE id = ? AND feed_id = ?`,
      [photoId, feedId]
    );
    if (photo.length === 0) {
      return res.status(404).json({ error: 'Photo not found' });
    }

    await db.query(`DELETE FROM feed_photos WHERE id = ? AND feed_id = ?`, [photoId, feedId]);

    // Recalculate photo_count
    const countResult = await db.query(
      `SELECT COUNT(*) AS cnt FROM feed_photos WHERE feed_id = ?`,
      [feedId]
    );
    await db.query(
      `UPDATE feeds SET photo_count = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
      [countResult[0].cnt, feedId]
    );

    res.json({ success: true });
  } catch (err) {
    console.error('Error deleting feed photo:', err);
    res.status(500).json({ error: 'Failed to delete photo' });
  }
}

async function copyPhotosToAlbum(req, res) {
  try {
    const { feedId } = req.params;
    const { photoIds, albumId, newAlbumTitle } = req.body;
    const userId = req.user.id;

    if (!photoIds || !Array.isArray(photoIds) || photoIds.length === 0) {
      return res.status(400).json({ error: 'No photos selected' });
    }

    // Verify feed exists
    const feed = await db.query(`SELECT band_id FROM feeds WHERE id = ?`, [feedId]);
    if (feed.length === 0) return res.status(404).json({ error: 'Feed not found' });
    const bandId = feed[0].band_id;

    let targetAlbumId = albumId;

    // Create new album if requested
    if (!targetAlbumId && newAlbumTitle) {
      const albumRes = await db.query(
        `INSERT INTO albums (band_id, author_id, title, photo_count) VALUES (?, ?, ?, 0) RETURNING id`,
        [bandId, userId, newAlbumTitle]
      );
      targetAlbumId = albumRes[0].id;
    }

    if (!targetAlbumId) {
      return res.status(400).json({ error: 'Album ID or new title required' });
    }

    // Get unique_photo_ids for the selected photos
    const photos = await db.query(
      `SELECT * FROM feed_photos WHERE feed_id = ? AND id IN (${photoIds.map(() => '?').join(',')})`,
      [feedId, ...photoIds]
    );

    if (photos.length === 0) {
      return res.status(404).json({ error: 'Photos not found' });
    }

    // Get next sort_order for the target album
    const maxOrderRes = await db.query(
      `SELECT COALESCE(MAX(sort_order), -1) as max_order FROM album_photos WHERE album_id = ?`,
      [targetAlbumId]
    );
    let nextOrder = maxOrderRes[0].max_order + 1;

    // Copy to album_photos
    for (const photo of photos) {
      // Check if already in album
      const exists = await db.query(
        `SELECT id FROM album_photos WHERE album_id = ? AND unique_photo_id = ?`,
        [targetAlbumId, photo.unique_photo_id]
      );

      if (exists.length === 0) {
        await db.query(
          `INSERT INTO album_photos (album_id, original_path, thumb_path, width, height, sort_order, unique_photo_id) 
           VALUES (?, ?, ?, ?, ?, ?, ?)`,
          [targetAlbumId, photo.original_path, photo.thumb_path, photo.width, photo.height, nextOrder++, photo.unique_photo_id]
        );
      }
    }

    // Update photo_count and cover
    const countRes = await db.query(`SELECT COUNT(*) as count FROM album_photos WHERE album_id = ?`, [targetAlbumId]);
    const firstPhoto = await db.query(`SELECT thumb_path FROM album_photos WHERE album_id = ? ORDER BY sort_order LIMIT 1`, [targetAlbumId]);
    
    await db.query(
      `UPDATE albums SET photo_count = ?, cover_thumb_path = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
      [countRes[0].count, firstPhoto[0]?.thumb_path || null, targetAlbumId]
    );

    res.status(201).json({ success: true, albumId: targetAlbumId });
  } catch (err) {
    console.error('Error copying photos to album:', err);
    res.status(500).json({ error: 'Failed to copy photos' });
  }
}

module.exports = {
  getAllFeeds,
  getFeedById,
  createFeed,
  updateFeed,
  deleteFeed,
  adminDeleteFeed,
  addFeedPhoto,
  deleteFeedPhoto,
  copyPhotosToAlbum
};
