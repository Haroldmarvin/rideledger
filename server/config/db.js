const dns = require('dns');
const mongoose = require('mongoose');

mongoose.set('strictQuery', true);

/**
 * Some ISP / router DNS servers time out on the SRV + TXT lookups that
 * "mongodb+srv://" connection strings need (error: queryTxt ETIMEOUT / querySrv ECONNREFUSED).
 * DNS_SERVERS lets you point Node at reliable public resolvers instead.
 * Example: DNS_SERVERS=8.8.8.8,1.1.1.1   (leave empty to use the system default)
 */
function configureDns() {
  const servers = (process.env.DNS_SERVERS || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  if (!servers.length) return;
  try {
    dns.setServers(servers);
    console.log(`[db] using DNS servers: ${servers.join(', ')}`);
  } catch (err) {
    console.warn(`[db] could not apply DNS_SERVERS (${err.message}); using system DNS`);
  }
}

async function connectDB(uri) {
  configureDns();
  await mongoose.connect(uri, { autoIndex: true, serverSelectionTimeoutMS: 15000 });
  return mongoose.connection;
}

async function disconnectDB() {
  await mongoose.disconnect();
}

module.exports = { connectDB, disconnectDB };