const express = require('express');
const router = express.Router();
const { authMiddleware } = require('../middleware/auth');
const { saveUploadedFiles } = require('../services/uploadService');
const { diskUpload } = require('../middleware/diskUpload');
const db = require('../db');

/**
 * POST /api/photos/upload
 * Standalone upload to unique_photos (supports both photos and videos). 
 * Used for "immediate upload" UX in new feeds/albums.
 */
router.post('/upload', authMiddleware, diskUpload.single('file'), async (req, res) => {
  try {
    // Support legacy 'photo' field name too
    const file = req.file;
    if (!file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    // Save to unique_photos (dedup handled internally)
    const savedFiles = await saveUploadedFiles({ 
      files: [file], 
      prefix: 'temp', 
      targetId: 'standalone' 
    });
    
    res.status(201).json(savedFiles[0]);
  } catch (err) {
    console.error('Standalone upload error:', err);
    res.status(500).json({ error: 'Failed to upload file' });
  }
});

/**
 * GET /api/photos/:uniquePhotoId/thumb-status
 * Polls the thumbnail job status for a unique_photo.
 * Returns { status, thumbUrl } — thumbUrl is set when status === 'done'.
 */
router.get('/:uniquePhotoId/thumb-status', authMiddleware, async (req, res) => {
  try {
    const { uniquePhotoId } = req.params;

    const rows = await db.query(
      `SELECT tj.status, up.thumb_path
       FROM thumbnail_jobs tj
       JOIN unique_photos up ON up.id = tj.target_id
       WHERE tj.target_id = ?
       ORDER BY tj.id DESC
       LIMIT 1`,
      [uniquePhotoId]
    );

    if (rows.length === 0) {
      // No job found — treat as done (e.g. already deduplicated)
      const photos = await db.query('SELECT thumb_path FROM unique_photos WHERE id = ?', [uniquePhotoId]);
      return res.json({
        status: 'done',
        thumbUrl: photos[0]?.thumb_path || null
      });
    }

    const { status, thumb_path } = rows[0];
    res.json({
      status,
      thumbUrl: status === 'done' ? thumb_path : null
    });
  } catch (err) {
    console.error('Thumb status error:', err);
    res.status(500).json({ error: 'Failed to get thumbnail status' });
  }
});

module.exports = router;

