const express = require('express');
const router = express.Router();
const { authMiddleware, adminOnly } = require('../middleware/auth');
const bandController = require('../controllers/bandController');

/**
 * GET /api/bands
 * Get all bands (public, no auth required)
 */
router.get('/', bandController.getAllBands);

/**
 * POST /api/bands
 * Create new band (requires authentication)
 */
router.post('/', authMiddleware, bandController.createBand);

/**
 * GET /api/bands/:bandId
 * Get specific band (public, no auth required)
 */
router.get('/:bandId', bandController.getBandById);

/**
 * PATCH /api/bands/:bandId
 * Update band (creator or admin only)
 */
router.patch('/:bandId', authMiddleware, bandController.updateBand);

/**
 * DELETE /api/bands/:bandId
 * Delete band (admin only)
 */
router.delete('/:bandId', authMiddleware, adminOnly, bandController.deleteBand);

module.exports = router;
