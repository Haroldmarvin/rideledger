/* eslint-disable no-console */
/**
 * Production setup — creates a clean RideLedger with ONLY your admin account (no demo data).
 *
 * Reads these values from server/.env (or the host's environment variables):
 *   ADMIN_NAME       e.g. "Harold Aidoo"            (default: "Administrator")
 *   ADMIN_EMAIL      e.g. "admin@yourcompany.com"   (required)
 *   ADMIN_PASSWORD   at least 8 characters           (required)
 *   ADMIN_USERNAME   optional short login name, e.g. "harold"
 *   COMPANY_NAME     shown on reports                (default: "RideLedger")
 *   DEFAULT_FEE      default delivery fee, e.g. "5.00" (default: 5.00)
 *
 *   npm run setup            -> creates the admin (or resets its password if it already exists).
 *                               Existing data is left untouched.
 *   npm run setup -- --wipe  -> DELETES ALL RideLedger data (demo riders, deliveries, expenses,
 *                               closeouts, audit logs…), then creates the admin, settings and fee.
 *                               Asks you to type WIPE to confirm (add --yes to skip the question).
 */
const readline = require('readline');
const bcrypt = require('bcryptjs');
const mongoose = require('mongoose');
const { env, assertEnv } = require('../config/env');
const { connectDB, disconnectDB } = require('../config/db');
const M = require('../models');
const { toCents } = require('../utils/money');

const args = process.argv.slice(2);
const WIPE = args.includes('--wipe');
const YES = args.includes('--yes');

function ask(question) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => rl.question(question, (answer) => { rl.close(); resolve(answer.trim()); }));
}

function readConfig() {
  const cfg = {
    name: (process.env.ADMIN_NAME || 'Administrator').trim(),
    email: (process.env.ADMIN_EMAIL || '').trim().toLowerCase(),
    password: process.env.ADMIN_PASSWORD || '',
    username: (process.env.ADMIN_USERNAME || '').trim().toLowerCase() || undefined,
    companyName: (process.env.COMPANY_NAME || 'RideLedger').trim(),
    defaultFee: toCents(process.env.DEFAULT_FEE || '5.00'),
  };
  const problems = [];
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cfg.email)) problems.push('ADMIN_EMAIL is missing or not a valid email address.');
  if (cfg.password.length < 8) problems.push('ADMIN_PASSWORD is missing or shorter than 8 characters.');
  if (cfg.username && !/^[a-z0-9._-]{3,60}$/.test(cfg.username)) problems.push('ADMIN_USERNAME may only use letters, numbers, dot, dash and underscore (3+ characters).');
  if (!Number.isInteger(cfg.defaultFee) || cfg.defaultFee < 0) problems.push('DEFAULT_FEE must be an amount like 5.00');
  if (problems.length) {
    console.error('[setup] Please fix these values in server/.env and run again:');
    for (const p of problems) console.error(`  - ${p}`);
    process.exit(1);
  }
  return cfg;
}

async function wipeAll() {
  for (const model of Object.values(M)) {
    try { await mongoose.connection.db.dropCollection(model.collection.collectionName); } catch { /* collection not there */ }
  }
  // Rebuild indexes now (the API also builds them on startup, so a failure here is not fatal)
  for (const model of Object.values(M)) {
    try { await model.syncIndexes(); } catch (err) { console.warn(`[setup] index rebuild for ${model.modelName} deferred to server start (${err.message})`); }
  }
}

async function main() {
  assertEnv();
  const cfg = readConfig();
  await connectDB(env.mongoUri);

  if (WIPE) {
    const counts = {
      users: await M.User.countDocuments(),
      deliveries: await M.Delivery.countDocuments(),
      expenses: await M.Expense.countDocuments(),
    };
    console.log(`[setup] This will permanently delete ALL RideLedger data: ${counts.users} users, ${counts.deliveries} deliveries, ${counts.expenses} expenses, and every closeout, bike, fee and audit record.`);
    if (!YES) {
      const answer = await ask('Type WIPE to continue (anything else cancels): ');
      if (answer !== 'WIPE') {
        console.log('[setup] Cancelled. Nothing was changed.');
        await disconnectDB();
        return;
      }
    }
    await wipeAll();
    console.log('[setup] All data deleted.');
  }

  // App settings (kept if they already exist)
  const settings = await M.Setting.findById('app');
  if (!settings) await M.Setting.create({ _id: 'app', companyName: cfg.companyName, currencySymbol: '$' });
  else if (WIPE) { settings.companyName = cfg.companyName; await settings.save(); }

  // Admin account: create, or reset the password of the existing one
  let admin = await M.User.findOne({ email: cfg.email }).select('+passwordHash');
  const passwordHash = await bcrypt.hash(cfg.password, 10);
  let action;
  if (admin) {
    if (admin.role !== 'admin') {
      console.error(`[setup] ${cfg.email} already belongs to a RIDER account. Use a different ADMIN_EMAIL.`);
      await disconnectDB();
      process.exit(1);
    }
    admin.passwordHash = passwordHash;
    admin.name = cfg.name;
    admin.status = 'active';
    admin.tokenVersion = (admin.tokenVersion || 0) + 1; // signs out old sessions
    if (cfg.username && !(await M.User.exists({ username: cfg.username, _id: { $ne: admin._id } }))) admin.username = cfg.username;
    await admin.save();
    action = 'Admin password reset by setup script';
    console.log(`[setup] Admin ${cfg.email} already existed — password reset and account re-activated.`);
  } else {
    if (cfg.username && await M.User.exists({ username: cfg.username })) {
      console.error(`[setup] The username "${cfg.username}" is already taken. Change ADMIN_USERNAME.`);
      await disconnectDB();
      process.exit(1);
    }
    admin = await M.User.create({ name: cfg.name, email: cfg.email, username: cfg.username, passwordHash, role: 'admin', status: 'active' });
    action = 'Admin account created by setup script';
    console.log(`[setup] Admin account created: ${cfg.email}`);
  }

  // Default delivery fee (only if none is configured yet)
  if (!(await M.FeeConfiguration.exists({ active: true }))) {
    await M.FeeConfiguration.create({ fee: cfg.defaultFee, effectiveFrom: new Date(), createdBy: admin._id, active: true, note: 'Initial default fee' });
    console.log(`[setup] Default delivery fee set to ${(cfg.defaultFee / 100).toFixed(2)}.`);
  }

  await M.AuditLog.create({
    user: admin._id, userName: admin.name, role: 'admin', action,
    entityType: 'User', entityId: admin._id, entityRef: admin.email,
    newData: { email: admin.email, wipe: WIPE || undefined }, ip: 'setup-script', userAgent: 'setup-script', timestamp: new Date(),
  });

  console.log('[setup] Done. Log in with:');
  console.log(`   ${cfg.email}${admin.username ? `  (or username: ${admin.username})` : ''}`);
  console.log('   and the ADMIN_PASSWORD from your environment.');
  if (WIPE) console.log('[setup] Next: add bikes under Bikes, then riders under Riders, and set your fee under Fees.');
  await disconnectDB();
}

main().catch(async (err) => {
  console.error('[setup] failed:', err.message);
  try { await disconnectDB(); } catch { /* ignore */ }
  process.exit(1);
});
