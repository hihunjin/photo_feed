const express = require('express');
const router = express.Router();
const commentController = require('../controllers/commentController');
const { authMiddleware } = require('../middleware/auth');
const { requireAdmin } = require('../middleware/adminCheck');

// GET /api/comments - List comments (public)
router.get('/', commentController.getComments);

// POST /api/comments - Create comment (protected)
router.post('/', authMiddleware, commentController.createComment);

// PATCH /api/comments/:commentId - Update comment (protected)
router.patch('/:commentId', authMiddleware, commentController.updateComment);

// DELETE /api/comments/:commentId - Delete comment (protected)
router.delete('/:commentId', authMiddleware, commentController.deleteComment);

// DELETE /api/comments/:commentId/admin-delete - Admin moderation delete
router.delete('/:commentId/admin-delete', authMiddleware, requireAdmin, commentController.adminDeleteComment);

module.exports = router;
