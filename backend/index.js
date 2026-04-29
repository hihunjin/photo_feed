require('dotenv').config();
const express = require('express');
const compression = require('compression');
const cors = require('cors');
const path = require('path');
const db = require('./db');

const { startWorker } = require('./services/thumbnailWorker');

// Initialize database
db.initialize();

// Initialize Express app
const app = express();

// Start background worker
if (require.main === module) {
  startWorker();
}

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

// Error handler
app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: 'Internal server error' });
});

// Start server only when run directly
if (require.main === module) {
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => {
    console.log(`✓ Server running on port ${PORT}`);
  });
}

module.exports = app;
