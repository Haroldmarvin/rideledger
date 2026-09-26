const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const morgan = require('morgan');
const mongoSanitize = require('express-mongo-sanitize');
const { env } = require('./config/env');
const routes = require('./routes');
const { apiLimiter } = require('./middleware/rateLimit');
const { notFound, errorHandler } = require('./middleware/errorHandler');

function createApp() {
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', 1); // behind Render/Railway/Vercel proxies

  app.use(helmet({ crossOriginResourcePolicy: { policy: 'same-site' } }));
  app.use(cors({
    origin(origin, cb) {
      // Allow same-origin / server-to-server (no Origin) and configured client URLs
      if (!origin || env.clientUrls.includes(origin.replace(/\/$/, ''))) return cb(null, true);
      return cb(null, false);
    },
    credentials: false,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    exposedHeaders: ['Content-Disposition'],
    maxAge: 600,
  }));
  app.use(express.json({ limit: '200kb' }));
  app.use(express.urlencoded({ extended: false, limit: '200kb' }));
  // Strip keys beginning with "$" or containing "." (MongoDB operator injection)
  app.use(mongoSanitize({ replaceWith: '_' }));
  if (!env.isTest) app.use(morgan(env.isProduction ? 'combined' : 'dev'));

  app.use('/api', apiLimiter, routes);
  app.get('/', (req, res) => res.json({ name: 'RideLedger API', status: 'ok' }));

  app.use(notFound);
  app.use(errorHandler);
  return app;
}

module.exports = { createApp };
