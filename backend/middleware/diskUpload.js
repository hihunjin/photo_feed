const path = require('path');
const fs = require('fs');
const multer = require('multer');

// Always disk-backed: same directory on local dev and NAS (mounted at /app/data in Docker)
const TEMP_DIR = path.join(__dirname, '../data/tmp');

// Ensure the temp dir exists at startup
fs.mkdirSync(TEMP_DIR, { recursive: true });

const diskUpload = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => {
      fs.mkdirSync(TEMP_DIR, { recursive: true }); // guard against manual deletion
      cb(null, TEMP_DIR);
    },
    filename: (req, file, cb) => {
      const ext = path.extname(file.originalname) || '';
      const name = `upload_${Date.now()}_${Math.random().toString(36).slice(2)}${ext}`;
      // Track BEFORE writing starts — req.file won't be set if upload fails (e.g. LIMIT_FILE_SIZE)
      if (!req._tempFilePaths) req._tempFilePaths = [];
      req._tempFilePaths.push(path.join(TEMP_DIR, name));
      cb(null, name);
    }
  }),
  limits: { fileSize: 10 * 1024 * 1024 * 1024 } // 10GB hard cap
});

module.exports = { diskUpload, TEMP_DIR };
