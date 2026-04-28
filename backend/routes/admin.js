const express = require('express');
const router = express.Router();
const adminController = require('../controllers/adminController');
const { authMiddleware, adminOnly } = require('../middleware/auth');

router.get('/upload-policy', authMiddleware, adminOnly, adminController.getUploadPolicy);
router.patch('/upload-policy', authMiddleware, adminOnly, adminController.updateUploadPolicy);

module.exports = router;
