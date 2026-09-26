/**
 * End-to-end API acceptance test (spec section 44) + role permissions, rider data isolation
 * and closed-day restrictions. Uses an in-memory MongoDB (mongodb-memory-server downloads a
 * MongoDB binary on first run).
 */
const os = require('os');
const path = require('path');

process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'integration-test-secret-integration-test-secret';
process.env.UPLOAD_DIR = path.join(os.tmpdir(), `rideledger-test-uploads-${Date.now()}`);

const request = require('supertest');
const bcrypt = require('bcryptjs');
const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');

if (process.env.MONGO_TEST_COMPAT === '1') require('../support/aggregateCompat').install();
const { createApp } = require('../../app');
const M = require('../../models');
const { businessDate } = require('../../utils/dates');

const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');

let mongod;
let app;
const today = businessDate();
const ctx = {};

const api = () => request(app);
const auth = (token) => ({ Authorization: `Bearer ${token}` });

async function login(identifier, password) {
  const res = await api().post('/api/auth/login').send({ identifier, password });
  return res;
}

/**
 * Build every schema index. Real MongoDB supports all of them; MongoDB-compatible servers used
 * via MONGO_TEST_URI (e.g. FerretDB) may lack some options, so those are skipped and reported.
 */
async function buildIndexes() {
  for (const model of Object.values(M)) {
    await model.createCollection().catch(() => {});
    for (const [fields, options] of model.schema.indexes()) {
      try {
        await model.collection.createIndex(fields, { background: false, ...options });
      } catch (err) {
        if (!process.env.MONGO_TEST_URI) throw err;
        console.warn(`[test] skipped unsupported index on ${model.modelName}: ${err.message}`);
      }
    }
  }
}

beforeAll(async () => {
  if (process.env.MONGO_TEST_URI) {
    const uri = new URL(process.env.MONGO_TEST_URI);
    uri.pathname = `/rideledger_test_${Date.now()}`;
    await mongoose.connect(uri.toString());
  } else {
    mongod = await MongoMemoryServer.create();
    await mongoose.connect(mongod.getUri());
  }
  await buildIndexes();
  app = createApp();
  await M.Setting.create({ _id: 'app' });
  await M.FeeConfiguration.create({ fee: 5000, active: true, effectiveFrom: new Date(Date.now() - 86400000) });
  await M.User.create({ name: 'Test Admin', email: 'admin@test.com', passwordHash: await bcrypt.hash('Admin12345', 4), role: 'admin' });
});

afterAll(async () => {
  if (process.env.MONGO_TEST_URI && mongoose.connection.readyState === 1) await mongoose.connection.dropDatabase();
  await mongoose.disconnect();
  if (mongod) await mongod.stop();
});

describe('Final acceptance scenario', () => {
  test('1. Admin logs in', async () => {
    const res = await login('admin@test.com', 'Admin12345');
    expect(res.status).toBe(200);
    expect(res.body.token).toBeTruthy();
    expect(res.body.user.role).toBe('admin');
    ctx.admin = res.body.token;
  });

  test('2. Admin creates a rider', async () => {
    const res = await api().post('/api/riders').set(auth(ctx.admin)).send({ name: 'Test Rider', email: 'rider1@test.com', phone: '0777000111', password: 'Rider12345' });
    expect(res.status).toBe(201);
    expect(res.body.rider.riderId).toMatch(/^RDR-\d{4}$/);
    ctx.rider1Id = res.body.rider._id;
  });

  test('3. Admin creates and assigns a bike', async () => {
    const res = await api().post('/api/bikes').set(auth(ctx.admin)).send({ bikeId: 'bk-100', registrationNumber: 'mc-1', assignedRider: ctx.rider1Id });
    expect(res.status).toBe(201);
    expect(res.body.bike.bikeId).toBe('BK-100');
    expect(String(res.body.bike.assignedRider._id)).toBe(ctx.rider1Id);
    ctx.bikeId = res.body.bike._id;
    const r = await api().get(`/api/riders/${ctx.rider1Id}`).set(auth(ctx.admin));
    expect(r.body.rider.bike.bikeId).toBe('BK-100');
  });

  test('4. Rider logs in', async () => {
    const res = await login('rider1@test.com', 'Rider12345');
    expect(res.status).toBe(200);
    expect(res.body.user.riderProfile.name).toBe('Test Rider');
    ctx.rider = res.body.token;
  });

  test('5-7. Rider creates a delivery; ID auto-generated; outstanding calculated by server', async () => {
    const res = await api().post('/api/deliveries').set(auth(ctx.rider)).send({
      clientRef: 'test-client-ref-0001',
      customerName: 'Musu Kollie', customerPhone: '0777 123 456', pickupLocation: 'Sinkor', destination: 'Congo Town',
      deliveryFee: 5000, amountCollected: 3000, outstandingAmount: 999999, paymentMethod: 'Cash', status: 'Delivered',
      rider: '000000000000000000000000', // must be ignored for riders
    });
    expect(res.status).toBe(201);
    const d = res.body.delivery;
    expect(d.deliveryId).toMatch(new RegExp(`^RL-${today.replace(/-/g, '')}-\\d{4}$`));
    expect(d.outstandingAmount).toBe(2000);
    expect(d.date).toBe(today);
    expect(String(d.rider._id)).toBe(ctx.rider1Id);
    expect(d.bike.bikeId).toBe('BK-100');
    ctx.delivery = d;

    // More deliveries for richer totals
    const more = [
      { deliveryFee: 5000, amountCollected: 5000, paymentMethod: 'Mobile Money' },
      { deliveryFee: 5000, amountCollected: 0, paymentMethod: 'Credit/Unpaid' },
      { deliveryFee: 5000, amountCollected: 5000, paymentMethod: 'Cash' },
    ];
    for (const m of more) {
      const r = await api().post('/api/deliveries').set(auth(ctx.rider)).send({ customerName: 'Sam Tarpeh', customerPhone: '0886123456', pickupLocation: 'Depot', destination: 'ELWA', status: 'Delivered', ...m });
      expect(r.status).toBe(201);
    }
  });

  test('duplicate delivery IDs are impossible & offline re-sync is idempotent', async () => {
    const again = await api().post('/api/deliveries').set(auth(ctx.rider)).send({
      clientRef: 'test-client-ref-0001', customerName: 'Musu Kollie', customerPhone: '0777123456', pickupLocation: 'Sinkor', destination: 'Congo Town',
      deliveryFee: 5000, amountCollected: 3000, paymentMethod: 'Cash', status: 'Delivered',
    });
    expect(again.status).toBe(200);
    expect(again.body.duplicate).toBe(true);
    expect(again.body.delivery.deliveryId).toBe(ctx.delivery.deliveryId);
    const ids = (await M.Delivery.find().lean()).map((d) => d.deliveryId);
    expect(new Set(ids).size).toBe(ids.length);
  });

  test('friendly validation: money collected on Credit/Unpaid is rejected', async () => {
    const res = await api().post('/api/deliveries').set(auth(ctx.rider)).send({
      customerName: 'X Y', customerPhone: '0777123456', pickupLocation: 'A', destination: 'B', deliveryFee: 5000, amountCollected: 6000, paymentMethod: 'Credit/Unpaid', status: 'Delivered',
    });
    expect(res.status).toBe(400);
    expect(res.body.details.fieldErrors.amountCollected).toMatch(/Credit\/Unpaid/);
    expect(JSON.stringify(res.body)).not.toMatch(/stack|at .*\.js/);
  });

  test('8. Delivery appears in rider history', async () => {
    const res = await api().get('/api/deliveries').set(auth(ctx.rider));
    expect(res.status).toBe(200);
    expect(res.body.total).toBe(4);
    expect(res.body.items.map((d) => d.deliveryId)).toContain(ctx.delivery.deliveryId);
    expect(res.body.summary.outstanding).toBe(7000);
  });

  test('9. Delivery appears in admin dashboard', async () => {
    const res = await api().get('/api/dashboard').set(auth(ctx.admin));
    expect(res.status).toBe(200);
    expect(res.body.kpis.deliveries).toBe(4);
    expect(res.body.kpis.cashCollected).toBe(8000);
    expect(res.body.kpis.electronicCollected).toBe(5000);
    expect(res.body.kpis.outstanding).toBe(7000);
    expect(res.body.recent.map((d) => d.deliveryId)).toContain(ctx.delivery.deliveryId);
  });

  test('10. Rider creates an expense (with receipt upload)', async () => {
    const res = await api().post('/api/expenses').set(auth(ctx.rider))
      .field('category', 'Fuel').field('amount', '1000').field('description', 'Fuel top-up')
      .attach('receipt', PNG, { filename: 'receipt.png', contentType: 'image/png' });
    expect(res.status).toBe(201);
    expect(res.body.expense.status).toBe('Pending');
    expect(res.body.expense.expenseId).toMatch(/^EXP-\d{8}-\d{4}$/);
    ctx.expense = res.body.expense;
    const receipt = await api().get(`/api/expenses/${ctx.expense._id}/receipt`).set(auth(ctx.admin));
    expect(receipt.status).toBe(200);
    expect(receipt.headers['content-type']).toMatch(/image\/png/);
  });

  test('pending and rejected expenses do not affect accountability', async () => {
    const res = await api().get('/api/closeouts/preview').set(auth(ctx.rider));
    expect(res.body.summary.approvedExpenses).toBe(0);
    expect(res.body.pendingExpenses).toBe(1);
    const rej = await api().post('/api/expenses').set(auth(ctx.rider)).field('category', 'Parking').field('amount', '300');
    const r = await api().patch(`/api/expenses/${rej.body.expense._id}/reject`).set(auth(ctx.admin)).send({ reason: 'Not authorized' });
    expect(r.body.expense.status).toBe('Rejected');
  });

  test('11-12. Admin approves the expense; it affects accountability', async () => {
    const res = await api().patch(`/api/expenses/${ctx.expense._id}/approve`).set(auth(ctx.admin));
    expect(res.status).toBe(200);
    expect(res.body.expense.status).toBe('Approved');
    const p = await api().get('/api/closeouts/preview').set(auth(ctx.rider));
    expect(p.body.summary.approvedExpenses).toBe(1000);
  });

  test('13. Dashboard updates', async () => {
    const res = await api().get('/api/dashboard').set(auth(ctx.admin));
    expect(res.body.kpis.approvedExpenses).toBe(1000);
    expect(res.body.kpis.netAmountDue).toBe(7000);
  });

  test('14-17. System calculates cash, approved expenses and expected handover', async () => {
    const res = await api().get('/api/closeouts/preview').set(auth(ctx.rider));
    expect(res.status).toBe(200);
    expect(res.body.summary.cashCollected).toBe(8000);
    expect(res.body.summary.approvedExpenses).toBe(1000);
    expect(res.body.expectedHandover).toBe(7000);
    expect(res.body.pendingExpenses).toBe(0);
  });

  test('18-19. Rider enters actual handover; system calculates difference', async () => {
    const res = await api().post('/api/closeouts').set(auth(ctx.rider)).send({ actualHandover: 6500, notes: 'Short by 5' });
    expect(res.status).toBe(201);
    const c = res.body.closeout;
    expect(c.expectedHandover).toBe(7000);
    expect(c.declaredHandover).toBe(6500);
    expect(c.difference).toBe(-500);
    expect(c.differenceStatus).toBe('Short');
    expect(c.status).toBe('Submitted');
    ctx.closeout = c;
  });

  test('20-21. Management confirms receipt; day becomes closed', async () => {
    const res = await api().post(`/api/closeouts/${ctx.closeout._id}/confirm`).set(auth(ctx.admin)).send({ amountReceived: 6500, notes: 'Counted' });
    expect(res.status).toBe(200);
    expect(res.body.closeout.status).toBe('Confirmed');
    expect(res.body.closeout.receivedBy.name).toBe('Test Admin');
    expect(res.body.closeout.difference).toBe(-500);
    const d = await M.Delivery.findById(ctx.delivery._id).lean();
    expect(String(d.closedPeriod)).toBe(String(ctx.closeout._id));
  });

  test('22. Rider cannot modify closed transactions', async () => {
    const edit = await api().patch(`/api/deliveries/${ctx.delivery._id}`).set(auth(ctx.rider)).send({ amountCollected: 5000 });
    expect(edit.status).toBe(423);
    const add = await api().post('/api/deliveries').set(auth(ctx.rider)).send({ customerName: 'Late Entry', customerPhone: '0777123456', pickupLocation: 'A', destination: 'B', deliveryFee: 5000, amountCollected: 5000, paymentMethod: 'Cash', status: 'Delivered' });
    expect(add.status).toBe(423);
    const exp = await api().post('/api/expenses').set(auth(ctx.rider)).field('category', 'Fuel').field('amount', '500');
    expect(exp.status).toBe(423);
    const expEdit = await api().patch(`/api/expenses/${ctx.expense._id}`).set(auth(ctx.rider)).send({ amount: 9000 });
    expect([403, 423]).toContain(expEdit.status);
    const resubmit = await api().post('/api/closeouts').set(auth(ctx.rider)).send({ actualHandover: 7000 });
    expect(resubmit.status).toBe(409);
  });

  test('corrections after closing require management authorization', async () => {
    const cr = await api().post(`/api/deliveries/${ctx.delivery._id}/correction-request`).set(auth(ctx.rider))
      .send({ changes: { amountCollected: 3500 }, reason: 'Customer paid 35, I typed 30' });
    expect(cr.status).toBe(201);
    const unchanged = await M.Delivery.findById(ctx.delivery._id).lean();
    expect(unchanged.amountCollected).toBe(3000);
    const ap = await api().post(`/api/corrections/${cr.body.correction._id}/approve`).set(auth(ctx.admin)).send({ notes: 'Verified with customer' });
    expect(ap.status).toBe(200);
    const after = await M.Delivery.findById(ctx.delivery._id).lean();
    expect(after.amountCollected).toBe(3500);
    expect(after.outstandingAmount).toBe(1500);
    // Closeout recalculated: expected 7500, actual 6500 -> difference -1000
    expect(ap.body.closeout.expectedHandover).toBe(7500);
    expect(ap.body.closeout.difference).toBe(-1000);
  });

  test('23. Admin can still view the records', async () => {
    const res = await api().get(`/api/deliveries/${ctx.delivery.deliveryId}`).set(auth(ctx.admin));
    expect(res.status).toBe(200);
    expect(res.body.lock.locked).toBe(true);
    expect(res.body.history.length).toBeGreaterThan(0);
  });

  test('24. Audit trail shows relevant actions', async () => {
    const res = await api().get('/api/audit-logs?limit=200').set(auth(ctx.admin));
    const actions = res.body.items.map((a) => a.action);
    for (const a of ['Admin created rider', 'Admin created bike', 'Rider created delivery', 'Rider submitted expense', 'Admin approved expense', 'Admin rejected expense', 'Rider submitted end-of-day handover', 'Management closed rider account', 'Admin approved transaction correction']) {
      expect(actions).toContain(a);
    }
    await expect(M.AuditLog.deleteMany({})).rejects.toThrow(/immutable/);
    await expect(M.AuditLog.updateOne({}, { action: 'x' })).rejects.toThrow(/immutable/);
  });

  test('25-27. Admin generates a report and exports Excel + PDF', async () => {
    for (const type of ['daily', 'rider', 'weekly', 'monthly', 'revenue', 'collections', 'outstanding', 'expenses', 'performance', 'reconciliation']) {
      const res = await api().get(`/api/reports?type=${type}&from=${today}&to=${today}&rider=${ctx.rider1Id}`).set(auth(ctx.admin));
      expect(res.status).toBe(200);
      expect(res.body.report.title).toBeTruthy();
    }
    const view = await api().get(`/api/reports?type=daily&date=${today}`).set(auth(ctx.admin));
    expect(view.body.report.rows.length).toBe(4);
    expect(view.body.report.totals.fee).toBe(20000);

    const xlsx = await api().get(`/api/reports/export/excel?type=daily&date=${today}`).set(auth(ctx.admin)).buffer(true).parse((res, cb) => { const b = []; res.on('data', (c) => b.push(c)); res.on('end', () => cb(null, Buffer.concat(b))); });
    expect(xlsx.status).toBe(200);
    expect(xlsx.headers['content-type']).toMatch(/spreadsheetml/);
    expect(xlsx.body.slice(0, 2).toString()).toBe('PK');

    const pdf = await api().get(`/api/reports/export/pdf?type=reconciliation&date=${today}`).set(auth(ctx.admin)).buffer(true).parse((res, cb) => { const b = []; res.on('data', (c) => b.push(c)); res.on('end', () => cb(null, Buffer.concat(b))); });
    expect(pdf.status).toBe(200);
    expect(pdf.body.slice(0, 4).toString()).toBe('%PDF');
  });
});

describe('Role permissions & rider data isolation', () => {
  beforeAll(async () => {
    await api().post('/api/riders').set(auth(ctx.admin)).send({ name: 'Other Rider', email: 'rider2@test.com', phone: '0777000222', password: 'Rider12345' });
    ctx.rider2 = (await login('rider2@test.com', 'Rider12345')).body.token;
  });

  test('unauthenticated requests are rejected', async () => {
    expect((await api().get('/api/deliveries')).status).toBe(401);
    expect((await api().get('/api/deliveries').set(auth('garbage'))).status).toBe(401);
  });

  test('riders cannot reach management endpoints', async () => {
    for (const [method, url] of [['get', '/api/riders'], ['get', '/api/dashboard'], ['get', '/api/audit-logs'], ['get', '/api/reports?type=daily'], ['post', '/api/fees'], ['patch', `/api/expenses/${ctx.expense._id}/approve`]]) {
      const res = await api()[method](url).set(auth(ctx.rider2)).send({});
      expect(res.status).toBe(403);
    }
  });

  test("a rider cannot read another rider's records by changing the ID or filter", async () => {
    expect((await api().get(`/api/deliveries/${ctx.delivery._id}`).set(auth(ctx.rider2))).status).toBe(404);
    expect((await api().get(`/api/deliveries/${ctx.delivery.deliveryId}`).set(auth(ctx.rider2))).status).toBe(404);
    expect((await api().patch(`/api/deliveries/${ctx.delivery._id}`).set(auth(ctx.rider2)).send({ remarks: 'x' })).status).toBe(404);
    expect((await api().get(`/api/expenses/${ctx.expense._id}/receipt`).set(auth(ctx.rider2))).status).toBe(404);
    const list = await api().get(`/api/deliveries?rider=${ctx.rider1Id}`).set(auth(ctx.rider2));
    expect(list.body.total).toBe(0);
    const closeouts = await api().get('/api/closeouts').set(auth(ctx.rider2));
    expect(closeouts.body.total).toBe(0);
    const preview = await api().get(`/api/closeouts/preview?rider=${ctx.rider1Id}`).set(auth(ctx.rider2));
    expect(preview.body.summary.deliveries).toBe(0);
  });

  test('NoSQL operator injection is neutralised', async () => {
    const res = await api().post('/api/auth/login').send({ identifier: { $ne: null }, password: { $ne: null } });
    expect(res.status).toBe(400);
    const list = await api().get('/api/deliveries?status[$ne]=Delivered').set(auth(ctx.admin));
    expect([200, 400]).toContain(list.status);
  });
});

describe('Fees, deactivation and history', () => {
  test('changing the default fee does not change historical deliveries', async () => {
    const res = await api().post('/api/fees').set(auth(ctx.admin)).send({ fee: 7000, note: 'Test increase' });
    expect(res.status).toBe(201);
    const d = await M.Delivery.findById(ctx.delivery._id).lean();
    expect(d.deliveryFee).toBe(5000);
    const fees = await api().get('/api/fees').set(auth(ctx.admin));
    expect(fees.body.current.fee).toBe(7000);
    expect(fees.body.history.length).toBe(2);
  });

  test('riders with history cannot be deleted; deactivation blocks login and existing sessions', async () => {
    const del = await api().delete(`/api/riders/${ctx.rider1Id}`).set(auth(ctx.admin));
    expect(del.status).toBe(409);
    const off = await api().patch(`/api/riders/${ctx.rider1Id}`).set(auth(ctx.admin)).send({ status: 'inactive' });
    expect(off.status).toBe(200);
    expect((await api().get('/api/deliveries').set(auth(ctx.rider))).status).toBe(401);
    expect((await login('rider1@test.com', 'Rider12345')).status).toBe(403);
    // History remains
    const list = await api().get(`/api/deliveries?rider=${ctx.rider1Id}`).set(auth(ctx.admin));
    expect(list.body.total).toBe(4);
  });
});

describe('Customer pays more than the delivery fee (order money)', () => {
  test('is accepted, recorded as extra collected, and counted in the cash handover', async () => {
    const res = await api().post('/api/deliveries').set(auth(ctx.rider2)).send({
      customerName: 'Order Customer', customerPhone: '0777999888', pickupLocation: 'Kitchen', destination: 'Sinkor', deliveryFee: 500, amountCollected: 2500, paymentMethod: 'Cash', status: 'Delivered',
    });
    expect(res.status).toBe(201);
    expect(res.body.delivery.outstandingAmount).toBe(0);
    expect(res.body.delivery.extraCollected).toBe(2000);
    expect(res.body.flags.map((f) => f.code)).toContain('EXTRA_COLLECTED');
    const preview = await api().get('/api/closeouts/preview').set(auth(ctx.rider2));
    expect(preview.body.summary.cashCollected).toBe(2500);
    expect(preview.body.summary.extraCollected).toBe(2000);
    expect(preview.body.expectedHandover).toBe(2500);
    const report = await api().get(`/api/reports?type=daily&date=${today}&rider=${res.body.delivery.rider._id}`).set(auth(ctx.admin));
    expect(report.body.report.totals.extra).toBe(2000);
  });
});
