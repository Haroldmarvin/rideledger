const { rateLimit } = require('express-rate-limit');
const { env } = require('../config/env');

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: env.isTest ? 1000 : env.loginRateLimit,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { message: 'Too many login attempts. Please wait 15 minutes and try again.' },
});

const apiLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: env.isTest ? 100000 : 600,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { message: 'Too many requests. Please slow down.' },
});

module.exports = { loginLimiter, apiLimiter };
