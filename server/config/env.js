const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env'), quiet: true });

const isTest = process.env.NODE_ENV === 'test';

function required(name, fallbackForTest) {
  const value = process.env[name];
  if (value && value.trim()) return value.trim();
  if (isTest && fallbackForTest !== undefined) return fallbackForTest;
  return undefined;
}

const env = {
  nodeEnv: process.env.NODE_ENV || 'development',
  isProduction: process.env.NODE_ENV === 'production',
  isTest,
  port: parseInt(process.env.PORT, 10) || 5000,
  mongoUri: required('MONGO_URI', ''),
  jwtSecret: required('JWT_SECRET', 'test-secret-do-not-use-in-production'),
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || '12h',
  clientUrls: (process.env.CLIENT_URL || 'http://localhost:5173')
    .split(',')
    .map((s) => s.trim().replace(/\/$/, ''))
    .filter(Boolean),
  uploadStorage: process.env.UPLOAD_STORAGE || 'local',
  uploadDir: path.resolve(__dirname, '..', process.env.UPLOAD_DIR || 'uploads'),
  maxUploadMb: parseFloat(process.env.MAX_UPLOAD_MB) || 5,
  businessTz: process.env.BUSINESS_TZ || 'Africa/Monrovia',
  loginRateLimit: parseInt(process.env.LOGIN_RATE_LIMIT, 10) || 20,
  seedDemoPassword: process.env.SEED_DEMO_PASSWORD || 'RideLedger@2026',
};

function assertEnv() {
  const missing = [];
  if (!env.mongoUri) missing.push('MONGO_URI');
  if (!env.jwtSecret) missing.push('JWT_SECRET');
  if (missing.length) {
    throw new Error(`Missing required environment variables: ${missing.join(', ')}. Copy .env.example to .env and fill them in.`);
  }
  if (env.isProduction && (env.jwtSecret.length < 32 || /change-me/i.test(env.jwtSecret))) {
    throw new Error('JWT_SECRET must be a unique random string of at least 32 characters in production (not the .env.example placeholder).');
  }
}

module.exports = { env, assertEnv };
