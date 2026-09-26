/**
 * Receipt storage abstraction. Every provider implements:
 *   save({ buffer, originalName, mimeType }) -> { provider, key, originalName, mimeType, size }
 *   read(key) -> Readable stream
 *   remove(key) -> Promise<void>
 * Switch providers with UPLOAD_STORAGE. To add S3/Cloudinary/etc., create a new file
 * exporting the same interface and register it below.
 */
const { env } = require('../../config/env');

const providers = {
  local: () => require('./localStorage'),
};

function getStorage(name = env.uploadStorage) {
  const factory = providers[name];
  if (!factory) throw new Error(`Unknown UPLOAD_STORAGE provider "${name}". Available: ${Object.keys(providers).join(', ')}`);
  return factory();
}

module.exports = { getStorage };
