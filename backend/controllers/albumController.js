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
    const { title, description } = req.body;
    const userId = req.user.id;
    const files = req.files || [];

    if (!title) {
      return res.status(400).json({ error: 'Title is required' });
    }

    const policy = await getUploadPolicy();
    try {
      await validateFiles(files, policy, policy.album_max_photos || 1000);
    } catch (validationError) {
      return res.status(validationError.statusCode || 400).json({ error: validationError.message });
    }

    const bandCheck = await db.query(`SELECT id FROM bands WHERE id = ?`, [bandId]);
    if (bandCheck.length === 0) {
      return res.status(404).json({ error: 'Band not found' });
    }

    await db.query(
      `INSERT INTO albums (band_id, author_id, title, description, photo_count) 
       VALUES (?, ?, ?, ?, 0)`,
      [bandId, userId, title, description || null]
    );

    const albums = await db.query(
      `SELECT * FROM albums WHERE band_id = ? AND author_id = ? ORDER BY id DESC LIMIT 1`,
      [bandId, userId]
    );

    const createdAlbum = albums[0];

    if (files.length > 0) {
      const savedFiles = await saveUploadedFiles({ files, prefix: 'album', targetId: createdAlbum.id });

      for (let index = 0; index < savedFiles.length; index += 1) {
        const savedFile = savedFiles[index];
        await db.query(
          `INSERT INTO album_photos (album_id, original_path, thumb_path, width, height, sort_order) 
           VALUES (?, ?, ?, ?, ?, ?) RETURNING *`,
          [createdAlbum.id, savedFile.originalUrl, savedFile.thumbnailUrl, null, null, index]
        );
      }

      await db.query(
        `UPDATE albums SET photo_count = ?, cover_thumb_path = ? WHERE id = ?`,
        [files.length, savedFiles[0].thumbnailUrl, createdAlbum.id]
      );
    }

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

module.exports = {
  getAllAlbums,
  getAlbumById,
  createAlbum,
  updateAlbum,
  deleteAlbum
};
