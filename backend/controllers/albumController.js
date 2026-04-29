const db = require('../db');
const { getUploadPolicy, validateFiles, saveUploadedFiles } = require('../services/uploadService');

async function getAllAlbums(req, res) {
  try {
    const { bandId } = req.params;
    const { limit = 20, cursor = null } = req.query;
    const parsedLimit = Math.min(parseInt(limit, 10) || 20, 100);

    const bandCheck = await db.query(`SELECT id FROM bands WHERE id = ?`, [bandId]);
    if (bandCheck.length === 0) {
      return res.status(404).json({ error: 'Band not found' });
    }

    let where = `band_id = ?`;
    let params = [bandId];

    if (cursor) {
      where += ` AND created_at < ?`;
      params.push(cursor);
    }

    const albums = await db.query(
      `SELECT id, band_id, author_id, title, description, photo_count, cover_thumb_path, created_at, updated_at
       FROM albums WHERE ${where} ORDER BY created_at DESC LIMIT ?`,
      [...params, parsedLimit + 1]
    );

    const hasMore = albums.length > parsedLimit;
    const result = hasMore ? albums.slice(0, parsedLimit) : albums;
    const nextCursor = hasMore && result.length > 0 ? result[result.length - 1].created_at : null;

    res.json({
      albums: result,
      cursor: nextCursor,
      hasMore: hasMore
    });
  } catch (err) {
    console.error('Error fetching albums:', err);
    res.status(500).json({ error: 'Failed to fetch albums' });
  }
}

async function getAlbumById(req, res) {
  try {
    const { albumId } = req.params;

    const album = await db.query(
      `SELECT * FROM albums WHERE id = ?`,
      [albumId]
    );

    if (album.length === 0) {
      return res.status(404).json({ error: 'Album not found' });
    }

    const photos = await db.query(
      `SELECT id, original_path, thumb_path, width, height, sort_order FROM album_photos WHERE album_id = ? ORDER BY sort_order`,
      [albumId]
    );

    res.json({
      ...album[0],
      photos: photos
    });
  } catch (err) {
    console.error('Error fetching album:', err);
    res.status(500).json({ error: 'Failed to fetch album' });
  }
}

async function createAlbum(req, res) {
  try {
    const { bandId } = req.params;
    const { title, description, photoIds } = req.body;
    const userId = req.user.id;
    const files = req.files || [];

    if (!title) {
      return res.status(400).json({ error: 'Title is required' });
    }

    const bandCheck = await db.query(`SELECT id FROM bands WHERE id = ?`, [bandId]);
    if (bandCheck.length === 0) {
      return res.status(404).json({ error: 'Band not found' });
    }

    // 1. Create album
    const albumRes = await db.query(
      `INSERT INTO albums (band_id, author_id, title, description, photo_count) 
       VALUES (?, ?, ?, ?, 0) RETURNING id`,
      [bandId, userId, title, description || null]
    );
    const createdAlbum = albumRes[0];

    let totalPhotoCount = 0;
    let coverThumb = null;

    // 2. Handle newly uploaded files (Legacy)
    if (files.length > 0) {
      const savedFiles = await saveUploadedFiles({ files, prefix: 'album', targetId: createdAlbum.id });
      for (let index = 0; index < savedFiles.length; index += 1) {
        const savedFile = savedFiles[index];
        if (!coverThumb) coverThumb = savedFile.thumbnailUrl;
        await db.query(
          `INSERT INTO album_photos (album_id, original_path, thumb_path, width, height, sort_order, unique_photo_id) 
           VALUES (?, ?, ?, ?, ?, ?, ?)`,
          [createdAlbum.id, savedFile.originalUrl, savedFile.thumbnailUrl, null, null, totalPhotoCount++, savedFile.uniquePhotoId]
        );
      }
    }

    // 3. Handle pre-uploaded unique_photo_ids (New)
    if (photoIds) {
      const ids = Array.isArray(photoIds) ? photoIds : (typeof photoIds === 'string' ? JSON.parse(photoIds) : []);
      if (ids.length > 0) {
        const uniquePhotos = await db.query(
          `SELECT * FROM unique_photos WHERE id IN (${ids.map(() => '?').join(',')})`,
          ids
        );
        for (const up of uniquePhotos) {
          if (!coverThumb) coverThumb = up.thumb_path;
          await db.query(
            `INSERT INTO album_photos (album_id, original_path, thumb_path, width, height, sort_order, unique_photo_id) 
             VALUES (?, ?, ?, ?, ?, ?, ?)`,
            [createdAlbum.id, up.original_path, up.thumb_path || up.original_path, up.width, up.height, totalPhotoCount++, up.id]
          );
        }
      }
    }

    // 4. Update photo_count and cover
    await db.query(
      `UPDATE albums SET photo_count = ?, cover_thumb_path = ? WHERE id = ?`,
      [totalPhotoCount, coverThumb, createdAlbum.id]
    );

    const refreshedAlbum = await db.query(`SELECT * FROM albums WHERE id = ?`, [createdAlbum.id]);
    const photos = await db.query(
      `SELECT id, original_path, thumb_path, width, height, sort_order FROM album_photos WHERE album_id = ? ORDER BY sort_order`,
      [createdAlbum.id]
    );

    res.status(201).json({ ...refreshedAlbum[0], photos });
  } catch (err) {
    console.error('Error creating album:', err);
    res.status(500).json({ error: 'Failed to create album' });
  }
}

async function updateAlbum(req, res) {
  try {
    const { albumId } = req.params;
    const { title, description } = req.body;
    const userId = req.user.id;

    const album = await db.query(`SELECT * FROM albums WHERE id = ?`, [albumId]);
    if (album.length === 0) {
      return res.status(404).json({ error: 'Album not found' });
    }

    if (album[0].author_id !== userId && req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Forbidden' });
    }

    const updated = await db.query(
      `UPDATE albums SET title = ?, description = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
      [title || album[0].title, description !== undefined ? description : album[0].description, albumId]
    );

    const refreshed = await db.query(`SELECT * FROM albums WHERE id = ?`, [albumId]);
    res.json(refreshed[0]);
  } catch (err) {
    console.error('Error updating album:', err);
    res.status(500).json({ error: 'Failed to update album' });
  }
}

async function deleteAlbum(req, res) {
  try {
    const { albumId } = req.params;
    const userId = req.user.id;

    const album = await db.query(`SELECT * FROM albums WHERE id = ?`, [albumId]);
    if (album.length === 0) {
      return res.status(404).json({ error: 'Album not found' });
    }

    if (album[0].author_id !== userId && req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Forbidden' });
    }

    await db.query(`DELETE FROM album_photos WHERE album_id = ?`, [albumId]);
    await db.query(`DELETE FROM comments WHERE target_type = 'album' AND target_id = ?`, [albumId]);
    await db.query(`DELETE FROM albums WHERE id = ?`, [albumId]);

    res.json({ success: true });
  } catch (err) {
    console.error('Error deleting album:', err);
    res.status(500).json({ error: 'Failed to delete album' });
  }
}

async function copyPhotosToFeed(req, res) {
  try {
    const { albumId } = req.params;
    const { photoIds, feedId, newFeedText } = req.body;
    const userId = req.user.id;

    if (!photoIds || !Array.isArray(photoIds) || photoIds.length === 0) {
      return res.status(400).json({ error: 'No photos selected' });
    }

    // Verify album exists
    const album = await db.query(`SELECT band_id FROM albums WHERE id = ?`, [albumId]);
    if (album.length === 0) return res.status(404).json({ error: 'Album not found' });
    const bandId = album[0].band_id;

    let targetFeedId = feedId;

    // Create new feed if requested
    if (!targetFeedId && newFeedText) {
      const previewText = newFeedText.length > 200 ? newFeedText.substring(0, 200) : newFeedText;
      const feedRes = await db.query(
        `INSERT INTO feeds (band_id, author_id, text, preview_text, photo_count) VALUES (?, ?, ?, ?, 0) RETURNING id`,
        [bandId, userId, newFeedText, previewText]
      );
      targetFeedId = feedRes[0].id;
    }

    if (!targetFeedId) {
      return res.status(400).json({ error: 'Feed ID or new text required' });
    }

    // Get unique_photo_ids for the selected photos
    const photos = await db.query(
      `SELECT * FROM album_photos WHERE album_id = ? AND id IN (${photoIds.map(() => '?').join(',')})`,
      [albumId, ...photoIds]
    );

    if (photos.length === 0) {
      return res.status(404).json({ error: 'Photos not found' });
    }

    // Get next sort_order for the target feed
    const maxOrderRes = await db.query(
      `SELECT COALESCE(MAX(sort_order), -1) as max_order FROM feed_photos WHERE feed_id = ?`,
      [targetFeedId]
    );
    let nextOrder = maxOrderRes[0].max_order + 1;

    // Copy to feed_photos
    for (const photo of photos) {
      // Check if already in feed
      const exists = await db.query(
        `SELECT id FROM feed_photos WHERE feed_id = ? AND unique_photo_id = ?`,
        [targetFeedId, photo.unique_photo_id]
      );

      if (exists.length === 0) {
        await db.query(
          `INSERT INTO feed_photos (feed_id, original_path, thumb_path, width, height, sort_order, unique_photo_id) 
           VALUES (?, ?, ?, ?, ?, ?, ?)`,
          [targetFeedId, photo.original_path, photo.thumb_path, photo.width, photo.height, nextOrder++, photo.unique_photo_id]
        );
      }
    }

    // Update photo_count
    const countRes = await db.query(`SELECT COUNT(*) as count FROM feed_photos WHERE feed_id = ?`, [targetFeedId]);
    await db.query(
      `UPDATE feeds SET photo_count = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
      [countRes[0].count, targetFeedId]
    );

    res.status(201).json({ success: true, feedId: targetFeedId });
  } catch (err) {
    console.error('Error copying photos to feed:', err);
    res.status(500).json({ error: 'Failed to copy photos' });
  }
}

async function addAlbumPhoto(req, res) {
  try {
    const { albumId } = req.params;
    const file = req.file;
    const userId = req.user.id;

    const album = await db.query(`SELECT author_id FROM albums WHERE id = ?`, [albumId]);
    if (album.length === 0) return res.status(404).json({ error: 'Album not found' });
    if (album[0].author_id !== userId && req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Forbidden' });
    }

    const maxOrder = await db.query(
      `SELECT COALESCE(MAX(sort_order), -1) AS max_order FROM album_photos WHERE album_id = ?`,
      [albumId]
    );
    const nextOrder = (maxOrder[0]?.max_order ?? -1) + 1;

    const { saveUploadedFiles } = require('../services/uploadService');
    const savedFiles = await saveUploadedFiles({ files: [file], prefix: 'album', targetId: albumId });
    const savedFile = savedFiles[0];

    await db.query(
      `INSERT INTO album_photos (album_id, original_path, thumb_path, width, height, sort_order, unique_photo_id) 
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [albumId, savedFile.originalUrl, savedFile.thumbnailUrl || savedFile.originalUrl, null, null, nextOrder, savedFile.uniquePhotoId]
    );

    const countResult = await db.query(`SELECT COUNT(*) AS cnt FROM album_photos WHERE album_id = ?`, [albumId]);
    await db.query(
      `UPDATE albums SET photo_count = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
      [countResult[0].cnt, albumId]
    );

    const photo = await db.query(
      `SELECT id, original_path, thumb_path, width, height, sort_order FROM album_photos WHERE album_id = ? ORDER BY id DESC LIMIT 1`,
      [albumId]
    );

    res.status(201).json(photo[0]);
  } catch (err) {
    console.error('Error adding album photo:', err);
    res.status(500).json({ error: 'Failed to add photo' });
  }
}

async function deleteAlbumPhoto(req, res) {
  try {
    const { albumId, photoId } = req.params;
    const userId = req.user.id;

    const album = await db.query(`SELECT author_id FROM albums WHERE id = ?`, [albumId]);
    if (album.length === 0) return res.status(404).json({ error: 'Album not found' });
    if (album[0].author_id !== userId && req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Forbidden' });
    }

    await db.query(`DELETE FROM album_photos WHERE id = ? AND album_id = ?`, [photoId, albumId]);

    const countResult = await db.query(`SELECT COUNT(*) AS cnt FROM album_photos WHERE album_id = ?`, [albumId]);
    await db.query(
      `UPDATE albums SET photo_count = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
      [countResult[0].cnt, albumId]
    );

    res.json({ success: true });
  } catch (err) {
    console.error('Error deleting album photo:', err);
    res.status(500).json({ error: 'Failed to delete photo' });
  }
}

module.exports = {
  getAllAlbums,
  getAlbumById,
  createAlbum,
  updateAlbum,
  deleteAlbum,
  copyPhotosToFeed,
  addAlbumPhoto,
  deleteAlbumPhoto
};
