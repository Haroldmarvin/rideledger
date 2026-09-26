const { env, assertEnv } = require('./config/env');
const { connectDB } = require('./config/db');
const { createApp } = require('./app');

async function start() {
  assertEnv();
  await connectDB(env.mongoUri);
  console.log('[db] connected');
  const app = createApp();
  const server = app.listen(env.port, () => console.log(`[api] RideLedger API listening on port ${env.port} (${env.nodeEnv})`));

  const shutdown = (signal) => {
    console.log(`[api] ${signal} received, shutting down`);
    server.close(() => process.exit(0));
    setTimeout(() => process.exit(1), 10000).unref();
  };
  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

start().catch((err) => {
  console.error('[api] failed to start:', err.message);
  process.exit(1);
});
