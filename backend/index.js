// Set timezone BEFORE anything else — affects both Node.js Date and SQLite datetime('now','localtime')
process.env.TZ = 'Asia/Seoul';
require('dotenv').config();
const express = require('express');
const compression = require('compression');
const cors = require('cors');
const path = require('path');
const db = require('./db');
const { startWorker } = require('./services/thumbnailWorker');
const { TEMP_DIR } = require('./middleware/diskUpload');

const app = express();
// Middleware
app.use(compression());
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static('public'));
app.use('/media/originals', express.static(path.join(__dirname, 'data/originals')));
app.use('/media/thumbnails', express.static(path.join(__dirname, 'data/thumbnails')));

// Routes
app.use('/api/auth', require('./routes/auth'));
app.use('/api/bands', require('./routes/bands'));
app.use('/api/bands', require('./routes/feeds').default);
app.use('/api/feeds', require('./routes/feeds').feedRouter);
app.use('/api/bands', require('./routes/albums').default);
app.use('/api/albums', require('./routes/albums').albumRouter);
app.use('/api/comments', require('./routes/comments'));
app.use('/api/admin', require('./routes/admin'));
app.use('/api/photos', require('./routes/photos'));

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

// Catch-all route to serve the frontend
app.get('*', (req, res, next) => {
  // If the request is for an API or media, don't serve index.html
  if (req.url.startsWith('/api') || req.url.startsWith('/media')) {
    return next();
  }
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({ error: 'Not found' });
});

// Multer error handler (must come before generic error handler)
app.use((err, req, res, next) => {
  if (err && err.code === 'LIMIT_FILE_SIZE') {
    // req.file is null when multer aborts mid-stream — use req._tempFilePaths tracked in filename cb
    const toDelete = [
      ...(req._tempFilePaths || []),       // tracked before writing started (covers LIMIT_FILE_SIZE)
      ...(req.files || []).map(f => f.path), // completed files in array uploads
      req.file?.path                         // completed file in single uploads
    ].filter(Boolean);
    toDelete.forEach(p => require('fs').unlink(p, () => {}));

    return res.status(413).json({ error: 'File too large. Maximum 10GB per file.' });
  }
  next(err);
});

// Error handler
app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: 'Internal server error' });
});

// Start server only when run directly
if (require.main === module) {
  const PORT = process.env.PORT || 3000;
  
  // Startup cleanup: blind delete — no active uploads exist yet
  async function cleanTempDir() {
    try {
      const fsp = require('fs').promises;
      const files = await fsp.readdir(TEMP_DIR).catch(() => []);
      await Promise.all(files.map(f => fsp.unlink(`${TEMP_DIR}/${f}`).catch(() => {})));
      if (files.length > 0) console.log(`\u2713 Cleaned ${files.length} orphaned temp file(s) from previous session`);
    } catch (err) {
      console.warn('Warning: could not clean temp dir:', err.message);
    }
  }

  // Periodic cleanup: age-checked — only delete files older than 1h (active uploads are in-progress)
  async function cleanStaleTempFiles() {
    try {
      const fsp = require('fs').promises;
      const files = await fsp.readdir(TEMP_DIR).catch(() => []);
      const now = Date.now();
      let count = 0;
      await Promise.all(files.map(async f => {
        const p = `${TEMP_DIR}/${f}`;
        try {
          const stat = await fsp.stat(p);
          if (now - stat.mtimeMs > 60 * 60 * 1000) { // older than 1 hour
            await fsp.unlink(p);
            count++;
          }
        } catch {}
      }));
      if (count > 0) console.log(`\u2713 Periodic cleanup: removed ${count} stale temp file(s)`);
    } catch (err) {
      console.warn('Warning: periodic temp cleanup failed:', err.message);
    }
  }

  async function start() {
    try {
      await cleanTempDir();  // remove crash leftovers before accepting traffic
      await db.initialize();
      startWorker();

      // Run periodic cleanup every 24h
      setInterval(cleanStaleTempFiles, 24 * 60 * 60 * 1000);

      // Graceful shutdown: clean temp dir before exit (SIGTERM = Docker stop, SIGINT = Ctrl+C)
      const gracefulShutdown = async (signal) => {
        console.log(`\n${signal} received — cleaning temp files and shutting down...`);
        await cleanTempDir();
        process.exit(0);
      };
      process.once('SIGTERM', () => gracefulShutdown('SIGTERM'));
      process.once('SIGINT',  () => gracefulShutdown('SIGINT'));

      app.listen(PORT, '0.0.0.0', () => {
        console.log(`\u2713 Server running on port ${PORT}`);
      });
    } catch (err) {
      console.error('Failed to start server:', err);
      process.exit(1);
    }
  }
  
  start();
}

module.exports = app;
