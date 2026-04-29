const express = require('express');
const multer = require('multer');
const router = express.Router({ mergeParams: true });
const albumController = require('../controllers/albumController');
const { authMiddleware } = require('../middleware/auth');
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 500 * 1024 * 1024 } // 500MB for videos
});

router.get('/:bandId/albums', albumController.getAllAlbums);
router.post('/:bandId/albums', authMiddleware, upload.array('photos', 1000), albumController.createAlbum);
router.get('/detail/:albumId', albumController.getAlbumById);
router.patch('/:albumId', authMiddleware, albumController.updateAlbum);
router.delete('/:albumId', authMiddleware, albumController.deleteAlbum);

// Separate router for album-specific routes (not nested under bands)
const albumRouter = express.Router();

albumRouter.get('/:albumId', albumController.getAlbumById);
albumRouter.patch('/:albumId', authMiddleware, albumController.updateAlbum);
albumRouter.delete('/:albumId', authMiddleware, albumController.deleteAlbum);

// POST /albums/:albumId/photos/to-feed - Copy photos to a feed (protected)
albumRouter.post('/:albumId/photos/to-feed', authMiddleware, albumController.copyPhotosToFeed);

// Photo management
albumRouter.post('/:albumId/photos', authMiddleware, upload.single('photo'), albumController.addAlbumPhoto);
albumRouter.delete('/:albumId/photos/:photoId', authMiddleware, albumController.deleteAlbumPhoto);

module.exports = {
	default: router,
	albumRouter
};
