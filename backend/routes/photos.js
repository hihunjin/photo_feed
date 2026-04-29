const express = require('express');
const multer = require('multer');
const router = express.Router();
const { authMiddleware } = require('../middleware/auth');
const { saveUploadedFiles } = require('../services/uploadService');

const upload = multer({ storage: multer.memoryStorage() });

/**
 * POST /api/photos/upload
 * Standalone upload to unique_photos. 
 * Used for "immediate upload" UX in new feeds/albums.
 */
router.post('/upload', authMiddleware, upload.single('photo'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    // Save to unique_photos (dedup handled internally)
    const savedFiles = await saveUploadedFiles({ 
      files: [req.file], 
      prefix: 'temp', 
      targetId: 'standalone' 
    });
    
    res.status(201).json(savedFiles[0]);
  } catch (err) {
    console.error('Standalone upload error:', err);
    res.status(500).json({ error: 'Failed to upload photo' });
  }
});

module.exports = router;
