const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { env } = require('../../config/env');

const EXT = { 'image/jpeg': '.jpg', 'image/png': '.png', 'image/webp': '.webp', 'application/pdf': '.pdf' };
const receiptsDir = () => path.join(env.uploadDir, 'receipts');

function safeKey(key) {
  const base = path.basename(String(key));
  if (!/^[a-f0-9-]+\.(jpg|png|webp|pdf)$/i.test(base)) throw new Error('Invalid storage key');
  return base;
}

module.exports = {
  name: 'local',
  async save({ buffer, originalName, mimeType }) {
    await fs.promises.mkdir(receiptsDir(), { recursive: true });
    const key = `${crypto.randomUUID()}${EXT[mimeType] || ''}`;
    await fs.promises.writeFile(path.join(receiptsDir(), key), buffer);
    return { provider: 'local', key, originalName: String(originalName || '').slice(0, 200), mimeType, size: buffer.length };
  },
  read(key) {
    const file = path.join(receiptsDir(), safeKey(key));
    if (!fs.existsSync(file)) return null;
    return fs.createReadStream(file);
  },
  async remove(key) {
    try { await fs.promises.unlink(path.join(receiptsDir(), safeKey(key))); } catch { /* already gone */ }
  },
};
