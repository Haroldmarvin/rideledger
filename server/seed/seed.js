/* eslint-disable no-console */
/**
 * Seeds realistic demo data: 1 admin, 5 riders, 5 bikes, ~14 days of deliveries,
 * expenses, outstanding payments, closeouts and audit entries.
 *
 *   npm run seed          -> seeds only if the database is empty
 *   npm run seed:fresh    -> WIPES all RideLedger collections, then seeds
 */
const bcrypt = require('bcryptjs');
const mongoose = require('mongoose');
const { env, assertEnv } = require('../config/env');
const { connectDB, disconnectDB } = require('../config/db');
const M = require('../models');
const { summarize, buildCloseoutFigures } = require('../services/calculations');
const { validateDelivery } = require('../services/deliveryValidation');
const { nextDeliveryId, nextExpenseId, nextCloseoutId, nextRiderId } = require('../services/identifiers');
const { businessDate, businessTime, addDays } = require('../utils/dates');

// Deterministic pseudo-random generator so every seed looks the same
let s = 20260924;
const rand = () => { s = (s * 1664525 + 1013904223) % 4294967296; return s / 4294967296; };
const pick = (arr) => arr[Math.floor(rand() * arr.length)];
const weighted = (pairs) => { const r = rand(); let acc = 0; for (const [v, w] of pairs) { acc += w; if (r <= acc) return v; } return pairs[pairs.length - 1][0]; };

const PLACES = ['Sinkor 14th Street', 'Congo Town', 'Paynesville Red Light', 'Old Road', 'Broad Street', 'Mamba Point', 'ELWA Junction', 'Airfield Shortcut', 'Duport Road', 'Tubman Boulevard', 'Capitol Bypass', 'Gardnersville', 'Bushrod Island', 'Logan Town', 'Jallah Town', 'Randall Street', 'Vai Town', 'Fiamah'];
const PICKUPS = ['Central Dispatch - Randall St', 'Sinkor Depot', 'Paynesville Hub', 'Mamba Point Bakery', 'Congo Town Pharmacy', 'Bushrod Market Stall 12'];
const CUSTOMERS = ['Musu Kollie', 'Garmai Johnson', 'Emmanuel Toe', 'Patience Flomo', 'Kebeh Pewee', 'Moses Gbah', 'Fatu Kamara', 'Sam Tarpeh', 'Yah Kiazolu', 'Prince Barclay', 'Esther Mulbah', 'Abraham Zinnah', 'Hawa Sheriff', 'Blessing Karpeh', 'Arthur Dennis', 'Oretha Kollie', 'Mercy Tamba', 'Victor Nyenpan'];
const PHONE_PREFIX = ['077', '088', '055'];

async function wipe() {
  const names = Object.values(M).map((m) => m.collection.collectionName);
  for (const n of names) {
    try { await mongoose.connection.db.dropCollection(n); } catch { /* not there */ }
  }
  await Promise.all(Object.values(M).map((m) => m.syncIndexes()));
}

async function main() {
  assertEnv();
  await connectDB(env.mongoUri);
  const fresh = process.argv.includes('--fresh');
  if (fresh) {
    console.log('[seed] wiping existing RideLedger data...');
    await wipe();
  } else if (await M.User.exists({})) {
    console.log('[seed] database already has data. Run "npm run seed:fresh" to wipe and re-seed.');
    await disconnectDB();
    return;
  }

  const password = env.seedDemoPassword;
  const hash = await bcrypt.hash(password, 10);
  const now = new Date();
  const today = businessDate(now);
  const audits = [];
  const log = (user, action, entityType, entityId, entityRef, rider, newData, timestamp, previousData = null) => audits.push({
    user: user._id, userName: user.name, role: user.role, action, entityType, entityId, entityRef, rider: rider || null,
    previousData, newData, ip: '127.0.0.1', userAgent: 'seed-script', timestamp,
  });

  // Settings + fees (history: $4.00 -> $5.00 ten days ago)
  await M.Setting.create({ _id: 'app', companyName: 'RideLedger', currencySymbol: '$', allowRiderFeeOverride: true, requireReceiptForExpenses: false });
  const admin = await M.User.create({ name: 'Operations Manager', email: 'admin@rideledger.com', username: 'admin', phone: '0770000001', passwordHash: hash, role: 'admin' });
  const feeChangeDay = addDays(today, -9);
  const oldFee = await M.FeeConfiguration.create({ fee: 400, effectiveFrom: new Date(`${addDays(today, -60)}T07:00:00Z`), effectiveTo: new Date(`${feeChangeDay}T07:00:00Z`), createdBy: admin._id, active: false, note: 'Launch fee' });
  const curFee = await M.FeeConfiguration.create({ fee: 500, effectiveFrom: new Date(`${feeChangeDay}T07:00:00Z`), createdBy: admin._id, active: true, note: 'Fuel price adjustment' });
  log(admin, 'Admin set default delivery fee', 'FeeConfiguration', oldFee._id, 'fee:400', null, { fee: 400 }, oldFee.effectiveFrom);
  log(admin, 'Admin changed default delivery fee', 'FeeConfiguration', curFee._id, 'fee:500', null, { fee: 500 }, curFee.effectiveFrom, { fee: 400 });

  // Bikes
  const bikeDefs = [
    ['BK-001', 'MC-4471-LR', 'Active'], ['BK-002', 'MC-5820-LR', 'Active'], ['BK-003', 'MC-6093-LR', 'Active'],
    ['BK-004', 'MC-7314-LR', 'Active'], ['BK-005', 'MC-8156-LR', 'Maintenance'],
  ];
  const bikes = [];
  for (const [bikeId, reg, status] of bikeDefs) {
    const b = await M.Bike.create({ bikeId, registrationNumber: reg, status, notes: status === 'Maintenance' ? 'Rear brake pads being replaced' : '' });
    bikes.push(b);
    log(admin, 'Admin created bike', 'Bike', b._id, b.bikeId, null, { bikeId, registrationNumber: reg, status }, new Date(`${addDays(today, -30)}T08:00:00Z`));
  }

  // Riders (+ login accounts)
  const riderDefs = [
    ['Samuel Kollie', 'rider@rideledger.com', 'rider', '0776543210'],
    ['James Flomo', 'james.flomo@rideledger.com', 'jflomo', '0886123456'],
    ['Patrick Doe', 'patrick.doe@rideledger.com', 'pdoe', '0775987654'],
    ['Emmanuel Gonkarnue', 'emmanuel.g@rideledger.com', 'egonkarnue', '0555443322'],
    ['Mohammed Sheriff', 'mohammed.sheriff@rideledger.com', 'msheriff', '0777112233'],
  ];
  const riders = [];
  const riderUsers = [];
  for (let i = 0; i < riderDefs.length; i += 1) {
    const [name, email, username, phone] = riderDefs[i];
    const r = await M.Rider.create({ riderId: await nextRiderId(), name, email, phone, status: 'active' });
    const u = await M.User.create({ name, email, username, phone, passwordHash: hash, role: 'rider', rider: r._id });
    r.user = u._id;
    if (i < 4) { r.bike = bikes[i]._id; bikes[i].assignedRider = r._id; await bikes[i].save(); }
    await r.save();
    riders.push(r);
    riderUsers.push(u);
    const t = new Date(`${addDays(today, -30)}T08:30:00Z`);
    log(admin, 'Admin created rider', 'Rider', r._id, r.riderId, r._id, { riderId: r.riderId, name, email, phone }, t);
    if (i < 4) log(admin, 'Admin assigned bike to rider', 'Bike', bikes[i]._id, bikes[i].bikeId, r._id, { assignedRider: r.riderId }, t);
  }

  // Deliveries over the last 14 days (today included)
  const allDeliveries = [];
  const allExpenses = [];
  for (let back = 13; back >= 0; back -= 1) {
    const date = addDays(today, -back);
    const defaultFee = date >= feeChangeDay ? 500 : 400;
    for (let ri = 0; ri < riders.length; ri += 1) {
      const rider = riders[ri];
      const user = riderUsers[ri];
      const isToday = back === 0;
      let count = isToday ? (ri === 0 ? 5 : 2 + Math.floor(rand() * 3)) : 2 + Math.floor(rand() * 4);
      if (ri === 4 && back % 3 === 0) count = 0; // day off
      for (let k = 0; k < count; k += 1) {
        const hour = 8 + Math.floor((k / Math.max(1, count)) * 10) + Math.floor(rand() * 2);
        let recordedAt = new Date(`${date}T${String(Math.min(hour, 19)).padStart(2, '0')}:${String(Math.floor(rand() * 60)).padStart(2, '0')}:00Z`);
        if (recordedAt > now) recordedAt = new Date(now.getTime() - (count - k) * 11 * 60000);
        if (businessDate(recordedAt) !== date) recordedAt = new Date(`${date}T00:${String(5 + k).padStart(2, '0')}:00Z`);
        const status = weighted([['Delivered', 0.85], ['Failed', 0.06], ['Returned', 0.05], ['Cancelled', 0.04]]);
        let paymentMethod = weighted([['Cash', 0.55], ['Mobile Money', 0.25], ['Bank Transfer', 0.05], ['Credit/Unpaid', 0.1], ['Other', 0.05]]);
        let fee = rand() < 0.15 ? pick([750, 1000]) : defaultFee;
        let collected = fee;
        if (status === 'Failed' || status === 'Cancelled') { fee = 0; collected = 0; paymentMethod = 'Cash'; }
        if (paymentMethod === 'Credit/Unpaid') collected = 0;
        else if (status === 'Delivered' && rand() < 0.08) collected = Math.round(fee / 2 / 50) * 50; // part-payment
        if (status === 'Returned' && rand() < 0.5) { collected = 0; paymentMethod = 'Credit/Unpaid'; }
        if (isToday && ri === 0 && k === 1) { paymentMethod = 'Credit/Unpaid'; collected = 0; }

        const input = {
          customerName: pick(CUSTOMERS), customerPhone: `${pick(PHONE_PREFIX)}${String(1000000 + Math.floor(rand() * 8999999)).slice(0, 7)}`,
          pickupLocation: pick(PICKUPS), destination: pick(PLACES), orderReference: rand() < 0.6 ? `ORD-${1000 + Math.floor(rand() * 9000)}` : '',
          deliveryFee: fee, amountCollected: collected, paymentMethod, status,
          remarks: status === 'Failed' ? 'Customer not reachable' : status === 'Returned' ? 'Customer refused item' : status === 'Cancelled' ? 'Order cancelled by sender' : '',
        };
        const v = validateDelivery(input, { isAdmin: false, defaultFee, allowFeeOverride: true });
        if (!v.ok) throw new Error(`Seed delivery invalid: ${JSON.stringify(v.errors)}`);
        const d = {
          deliveryId: await nextDeliveryId(date), date, time: businessTime(recordedAt), recordedAt,
          rider: rider._id, bike: rider.bike || null, ...v.value, defaultFeeAtCreation: defaultFee, flags: v.flags,
          createdBy: user._id, updatedBy: user._id, createdAt: recordedAt, updatedAt: recordedAt,
        };
        allDeliveries.push(d);
      }

      // Expenses — kept within the day's cash takings so seeded handovers stay realistic
      const dayCash = allDeliveries
        .filter((d) => d.date === date && String(d.rider) === String(rider._id) && d.paymentMethod === 'Cash')
        .reduce((t, d) => t + d.amountCollected, 0);
      const category = weighted([['Fuel', 0.65], ['Parking', 0.15], ['Bike Repair/Maintenance', 0.12], ['Other Authorized Expense', 0.08]]);
      const amount = category === 'Fuel' ? pick([300, 500, 750]) : category === 'Parking' ? pick([100, 150]) : pick([500, 800, 1200]);
      if (count > 0 && (isToday ? ri < 3 : rand() < 0.55 && amount <= dayCash)) {
        const status = isToday ? 'Pending' : weighted([['Approved', 0.85], ['Rejected', 0.15]]);
        const createdAt = new Date(`${date}T12:${String(10 + ri).padStart(2, '0')}:00Z`);
        allExpenses.push({
          expenseId: await nextExpenseId(date), date, rider: rider._id, category, amount,
          description: category === 'Fuel' ? 'Fuel top-up' : category === 'Parking' ? 'Parking at Broad Street' : category === 'Bike Repair/Maintenance' ? 'Chain adjustment' : 'Phone credit for customer calls',
          status, reviewedBy: status === 'Pending' ? null : admin._id, reviewedAt: status === 'Pending' ? null : new Date(`${date}T17:30:00Z`),
          rejectionReason: status === 'Rejected' ? 'No receipt provided and amount above usual' : '',
          createdBy: user._id, updatedBy: user._id, createdAt: createdAt > now ? now : createdAt,
        });
      }
    }
  }
  const deliveries = await M.Delivery.insertMany(allDeliveries);
  const expenses = await M.Expense.insertMany(allExpenses);
  for (const d of deliveries) {
    const u = riderUsers[riders.findIndex((r) => String(r._id) === String(d.rider))];
    audits.push({ user: u._id, userName: u.name, role: 'rider', action: 'Rider created delivery', entityType: 'Delivery', entityId: d._id, entityRef: d.deliveryId, rider: d.rider, newData: { deliveryFee: d.deliveryFee, amountCollected: d.amountCollected, outstandingAmount: d.outstandingAmount, paymentMethod: d.paymentMethod, status: d.status }, ip: '127.0.0.1', userAgent: 'seed-script', timestamp: d.recordedAt });
  }
  for (const e of expenses) {
    const u = riderUsers[riders.findIndex((r) => String(r._id) === String(e.rider))];
    audits.push({ user: u._id, userName: u.name, role: 'rider', action: 'Rider submitted expense', entityType: 'Expense', entityId: e._id, entityRef: e.expenseId, rider: e.rider, newData: { category: e.category, amount: e.amount }, ip: '127.0.0.1', userAgent: 'seed-script', timestamp: e.createdAt });
    if (e.status !== 'Pending') log(admin, e.status === 'Approved' ? 'Admin approved expense' : 'Admin rejected expense', 'Expense', e._id, e.expenseId, e.rider, { status: e.status, ...(e.rejectionReason ? { reason: e.rejectionReason } : {}) }, e.reviewedAt, { status: 'Pending' });
  }

  // Closeouts: days 13..2 confirmed, yesterday submitted (awaiting confirmation), today open
  let closeoutCount = 0;
  for (let back = 13; back >= 1; back -= 1) {
    const date = addDays(today, -back);
    for (let ri = 0; ri < riders.length; ri += 1) {
      const rider = riders[ri];
      const ds = allDeliveries.filter((d) => d.date === date && String(d.rider) === String(rider._id));
      if (!ds.length) continue;
      const es = allExpenses.filter((e) => e.date === date && String(e.rider) === String(rider._id));
      const summary = summarize(ds, es);
      let actual = summary.expectedHandover;
      if (ri === 2 && back === 4) actual -= 200; // short by $2.00
      if (ri === 1 && back === 6) actual += 50; // over by $0.50
      if (ri === 3 && back === 1) actual -= 100; // yesterday: declared short
      actual = Math.max(0, actual); // a handover can never be negative
      const confirmed = back >= 2;
      const figures = buildCloseoutFigures(summary, actual);
      const submittedAt = new Date(`${date}T19:15:00Z`);
      const receivedAt = new Date(`${date}T19:40:00Z`);
      const co = await M.DailyCloseout.create({
        closeoutId: await nextCloseoutId(date), date, rider: rider._id, ...figures, declaredHandover: actual,
        status: confirmed ? 'Confirmed' : 'Submitted', submittedBy: riderUsers[ri]._id, submittedAt,
        receivedBy: confirmed ? admin._id : null, receivedAt: confirmed ? receivedAt : null,
        notes: confirmed && figures.difference < 0 ? 'Rider to repay shortage next shift' : confirmed ? 'Cash counted and received' : '',
      });
      closeoutCount += 1;
      audits.push({ user: riderUsers[ri]._id, userName: riderUsers[ri].name, role: 'rider', action: 'Rider submitted end-of-day handover', entityType: 'DailyCloseout', entityId: co._id, entityRef: co.closeoutId, rider: rider._id, newData: { expectedHandover: co.expectedHandover, declaredHandover: actual }, ip: '127.0.0.1', userAgent: 'seed-script', timestamp: submittedAt });
      if (confirmed) {
        await M.Delivery.updateMany({ rider: rider._id, date }, { $set: { closedPeriod: co._id } });
        await M.Expense.updateMany({ rider: rider._id, date }, { $set: { closedPeriod: co._id } });
        log(admin, 'Management closed rider account', 'DailyCloseout', co._id, co.closeoutId, rider._id, { status: 'Confirmed', amountReceived: actual, difference: co.difference, differenceStatus: co.differenceStatus }, receivedAt, { status: 'Submitted' });
      }
    }
  }

  await M.AuditLog.insertMany(audits.map((a) => ({ ...a, timestamp: a.timestamp > now ? now : a.timestamp })));

  const outstanding = deliveries.filter((d) => d.outstandingAmount > 0).length;
  console.log('[seed] done');
  console.log(`  riders: ${riders.length}, bikes: ${bikes.length}, deliveries: ${deliveries.length} (${outstanding} with outstanding balance)`);
  console.log(`  expenses: ${expenses.length}, closeouts: ${closeoutCount}, audit entries: ${audits.length}`);
  console.log('  Demo logins (password for all):', password);
  console.log('    ADMIN  admin@rideledger.com');
  console.log('    RIDER  rider@rideledger.com   (Samuel Kollie, bike BK-001)');
  await disconnectDB();
}

main().catch(async (err) => {
  console.error('[seed] failed:', err);
  try { await disconnectDB(); } catch { /* ignore */ }
  process.exit(1);
});
