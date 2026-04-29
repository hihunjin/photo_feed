const express = require('express');
const multer = require('multer');
const router = express.Router({ mergeParams: true });
const feedController = require('../controllers/feedController');
const { authMiddleware } = require('../middleware/auth');
const upload = multer({ storage: multer.memoryStorage() });
const { requireAdmin } = require('../middleware/adminCheck');

// GET /:bandId/feeds/dates - Get dates with feeds (public)
router.get('/:bandId/feeds/dates', feedController.getFeedDates);

// GET /:bandId/feeds - List feeds (public)
router.get('/:bandId/feeds', feedController.getAllFeeds);

// POST /:bandId/feeds - Create feed (protected)
router.post('/:bandId/feeds', authMiddleware, upload.array('photos', 50), feedController.createFeed);

// Separate router for feed-specific routes (not nested under bands)
const feedRouter = express.Router();

// GET /feeds/:feedId - Get feed details (public)
feedRouter.get('/:feedId', feedController.getFeedById);

// PATCH /feeds/:feedId - Update feed (protected)
feedRouter.patch('/:feedId', authMiddleware, feedController.updateFeed);

// DELETE /feeds/:feedId - Delete feed (protected)
feedRouter.delete('/:feedId', authMiddleware, feedController.deleteFeed);
// DELETE /feeds/:feedId/admin-delete - Admin moderation delete
feedRouter.delete('/:feedId/admin-delete', authMiddleware, requireAdmin, feedController.adminDeleteFeed);

// POST /feeds/:feedId/photos - Add a single photo (protected)
feedRouter.post('/:feedId/photos', authMiddleware, upload.single('photo'), feedController.addFeedPhoto);

// DELETE /feeds/:feedId/photos/:photoId - Delete a single photo (protected)
feedRouter.delete('/:feedId/photos/:photoId', authMiddleware, feedController.deleteFeedPhoto);

// POST /feeds/:feedId/photos/to-album - Copy photos to an album (protected)
feedRouter.post('/:feedId/photos/to-album', authMiddleware, feedController.copyPhotosToAlbum);

module.exports = {
  default: router,
  feedRouter
};
