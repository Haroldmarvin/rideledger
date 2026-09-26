const multer = require('multer');
const { env } = require('../config/env');
const ApiError = require('../utils/ApiError');

const ALLOWED = new Set(['image/jpeg', 'image/png', 'image/webp', 'application/pdf']);

const receiptUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: env.maxUploadMb * 1024 * 1024, files: 1 },
  fileFilter(req, file, cb) {
    if (!ALLOWED.has(file.mimetype)) return cb(ApiError.badRequest('Receipt must be a photo (JPG, PNG, WEBP) or a PDF.'));
    return cb(null, true);
  },
}).single('receipt');

module.exports = { receiptUpload };
