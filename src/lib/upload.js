'use strict';
// Bild-Uploads (Vereinslogos, Produktfotos, Headerbilder). Gespeichert in data/uploads, ausgeliefert unter /uploads.
const path = require('node:path');
const crypto = require('node:crypto');
const multer = require('multer');
const { UPLOAD_DIR } = require('../db');

const ALLOWED = { 'image/png': '.png', 'image/jpeg': '.jpg', 'image/webp': '.webp', 'image/svg+xml': '.svg', 'image/gif': '.gif' };

const upload = multer({
  storage: multer.diskStorage({
    destination: UPLOAD_DIR,
    filename: (req, file, cb) => cb(null, `${Date.now()}-${crypto.randomBytes(6).toString('hex')}${ALLOWED[file.mimetype] || path.extname(file.originalname)}`),
  }),
  limits: { fileSize: 8 * 1024 * 1024 },
  fileFilter: (req, file, cb) => cb(null, Boolean(ALLOWED[file.mimetype])),
});

/** Öffentliche URL einer hochgeladenen Datei (req.file) oder null */
function uploadedUrl(file) {
  return file ? `/uploads/${file.filename}` : null;
}

module.exports = { upload, uploadedUrl };
