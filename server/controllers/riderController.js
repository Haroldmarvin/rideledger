const bcrypt = require('bcryptjs');
const { Rider, User, Bike, Delivery, Expense, DailyCloseout, AuditLog } = require('../models');
const { nextRiderId } = require('../services/identifiers');
const { assignBike, unassignRider } = require('../services/bikeService');
const { getSummary, getRiderSummaries } = require('../services/summaryService');
const { audit, diff } = require('../services/audit');
const { validatePassword } = require('./authController');
const { isValidPhone, normalizePhone } = require('../services/deliveryValidation');
const { parseFilters } = require('../utils/filters');
const { asyncHandler, isObjectId, qs, trimOrEmpty, escapeRegex } = require('../utils/helpers');
const { businessDate } = require('../utils/dates');
const ApiError = require('../utils/ApiError');

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

async function findRider(id) {
  const key = isObjectId(id) ? { _id: id } : { riderId: String(id).toUpperCase() };
  const rider = await Rider.findOne(key);
  if (!rider) throw ApiError.notFound('Rider not found.');
  return rider;
}

function validateRiderInput(body, { partial = false } = {}) {
  const errors = {};
  const v = {};
  if (!partial || body.name !== undefined) {
    v.name = trimOrEmpty(body.name, 120);
    if (v.name.length < 2) errors.name = 'Please enter the rider\'s full name.';
  }
  if (!partial || body.email !== undefined) {
    v.email = trimOrEmpty(body.email, 160).toLowerCase();
    if (!EMAIL_RE.test(v.email)) errors.email = 'Please enter a valid email address.';
  }
  if (!partial || body.phone !== undefined) {
    const raw = trimOrEmpty(body.phone, 30);
    if (!raw) errors.phone = 'Please enter the rider\'s phone number.';
    else if (!isValidPhone(raw)) errors.phone = 'Phone number looks wrong. Use digits only, e.g. 0777123456.';
    v.phone = normalizePhone(raw);
  }
  if (body.username !== undefined && body.username !== '') {
    v.username = trimOrEmpty(body.username, 60).toLowerCase();
    if (!/^[a-z0-9._-]{3,60}$/.test(v.username)) errors.username = 'Username can use letters, numbers, dots, dashes (3+ characters).';
  }
  if (body.notes !== undefined) v.notes = trimOrEmpty(body.notes, 500);
  if (Object.keys(errors).length) throw ApiError.badRequest(Object.values(errors)[0], { fieldErrors: errors });
  return v;
}

const listRiders = asyncHandler(async (req, res) => {
  const filter = {};
  const status = qs(req.query.status);
  if (status === 'active' || status === 'inactive') filter.status = status;
  const search = qs(req.query.search).slice(0, 60);
  if (search) {
    const re = new RegExp(escapeRegex(search), 'i');
    filter.$or = [{ name: re }, { riderId: re }, { phone: re }, { email: re }];
  }
  const riders = await Rider.find(filter).sort({ status: 1, name: 1 }).populate('bike', 'bikeId registrationNumber status').lean();
  const today = businessDate();
  const todayStats = await getRiderSummaries({ from: today, to: today });
  const users = await User.find({ rider: { $in: riders.map((r) => r._id) } }).select('rider username lastLoginAt status').lean();
  const userMap = new Map(users.map((u) => [String(u.rider), u]));
  res.json({
    items: riders.map((r) => ({
      ...r,
      login: userMap.get(String(r._id)) || null,
      today: todayStats[String(r._id)] || null,
    })),
  });
});

const getRider = asyncHandler(async (req, res) => {
  const rider = await findRider(req.params.id);
  await rider.populate('bike', 'bikeId registrationNumber status');
  const user = await User.findOne({ rider: rider._id }).select('email username lastLoginAt status createdAt').lean();
  res.json({ rider, login: user });
});

const createRider = asyncHandler(async (req, res) => {
  const v = validateRiderInput(req.body);
  const pwProblem = validatePassword(req.body.password);
  if (pwProblem) throw ApiError.badRequest(pwProblem, { fieldErrors: { password: pwProblem } });
  if (await User.exists({ email: v.email })) throw ApiError.conflict('A user with this email already exists.', { fieldErrors: { email: 'Email already in use.' } });
  if (v.username && await User.exists({ username: v.username })) throw ApiError.conflict('That username is taken.', { fieldErrors: { username: 'Username taken.' } });

  const rider = await Rider.create({ riderId: await nextRiderId(), name: v.name, phone: v.phone, email: v.email, notes: v.notes || '', status: 'active' });
  let user;
  try {
    user = await User.create({
      name: v.name, email: v.email, username: v.username || undefined, phone: v.phone,
      passwordHash: await bcrypt.hash(req.body.password, 10), role: 'rider', rider: rider._id, status: 'active',
    });
  } catch (err) {
    await Rider.deleteOne({ _id: rider._id });
    throw err;
  }
  rider.user = user._id;
  await rider.save();

  if (req.body.bike && isObjectId(String(req.body.bike))) await assignBike(req.body.bike, rider._id);

  await audit(req, {
    action: 'Admin created rider', entityType: 'Rider', entityId: rider._id, entityRef: rider.riderId, rider: rider._id,
    newData: { riderId: rider.riderId, name: rider.name, email: rider.email, phone: rider.phone, bike: req.body.bike || null },
  });
  await rider.populate('bike', 'bikeId registrationNumber status');
  res.status(201).json({ rider });
});

const updateRider = asyncHandler(async (req, res) => {
  const rider = await findRider(req.params.id);
  const v = validateRiderInput(req.body, { partial: true });
  const user = await User.findOne({ rider: rider._id });
  if (v.email && v.email !== rider.email && await User.exists({ email: v.email, _id: { $ne: user && user._id } })) {
    throw ApiError.conflict('A user with this email already exists.', { fieldErrors: { email: 'Email already in use.' } });
  }
  if (v.username && await User.exists({ username: v.username, _id: { $ne: user && user._id } })) {
    throw ApiError.conflict('That username is taken.', { fieldErrors: { username: 'Username taken.' } });
  }

  const before = { name: rider.name, email: rider.email, phone: rider.phone, status: rider.status, notes: rider.notes };
  let statusAction = null;
  if (req.body.status !== undefined) {
    if (!['active', 'inactive'].includes(req.body.status)) throw ApiError.badRequest('Invalid status.');
    if (req.body.status !== rider.status) statusAction = req.body.status === 'active' ? 'Admin activated rider' : 'Admin deactivated rider';
    rider.status = req.body.status;
  }
  for (const k of ['name', 'email', 'phone', 'notes']) if (v[k] !== undefined) rider[k] = v[k];
  await rider.save();

  if (user) {
    if (v.name) user.name = v.name;
    if (v.email) user.email = v.email;
    if (v.phone) user.phone = v.phone;
    if (v.username !== undefined) user.username = v.username || undefined;
    user.status = rider.status;
    await user.save();
  }
  if (rider.status === 'inactive') await unassignRider(rider._id);

  const after = { name: rider.name, email: rider.email, phone: rider.phone, status: rider.status, notes: rider.notes };
  const d = diff(before, after, Object.keys(after));
  if (d.changed) {
    await audit(req, {
      action: statusAction || 'Admin edited rider', entityType: 'Rider', entityId: rider._id, entityRef: rider.riderId,
      rider: rider._id, previousData: d.prev, newData: d.next,
    });
  }
  await rider.populate('bike', 'bikeId registrationNumber status');
  res.json({ rider });
});

const resetPassword = asyncHandler(async (req, res) => {
  const rider = await findRider(req.params.id);
  const problem = validatePassword(req.body.password);
  if (problem) throw ApiError.badRequest(problem, { fieldErrors: { password: problem } });
  const user = await User.findOne({ rider: rider._id }).select('+tokenVersion');
  if (!user) throw ApiError.notFound('This rider has no login account.');
  user.passwordHash = await bcrypt.hash(req.body.password, 10);
  user.tokenVersion = (user.tokenVersion || 0) + 1; // signs the rider out everywhere
  await user.save();
  await audit(req, { action: 'Admin reset rider password', entityType: 'Rider', entityId: rider._id, entityRef: rider.riderId, rider: rider._id });
  res.json({ message: `Password reset for ${rider.name}. They have been signed out of all devices.` });
});

const setRiderBike = asyncHandler(async (req, res) => {
  const rider = await findRider(req.params.id);
  const before = rider.bike ? String(rider.bike) : null;
  const bikeId = req.body.bike || null;
  if (bikeId) {
    if (!isObjectId(String(bikeId))) throw ApiError.badRequest('Please choose a valid bike.');
    await assignBike(bikeId, rider._id);
  } else {
    await unassignRider(rider._id);
  }
  const updated = await Rider.findById(rider._id).populate('bike', 'bikeId registrationNumber status');
  await audit(req, {
    action: bikeId ? 'Admin assigned bike to rider' : 'Admin unassigned bike from rider', entityType: 'Rider',
    entityId: rider._id, entityRef: rider.riderId, rider: rider._id,
    previousData: { bike: before }, newData: { bike: updated.bike ? updated.bike.bikeId : null },
  });
  res.json({ rider: updated });
});

const riderPerformance = asyncHandler(async (req, res) => {
  const rider = await findRider(req.params.id);
  const filters = parseFilters({ ...req.query, rider: String(rider._id) }, req.user);
  const summary = await getSummary(filters);
  const coMatch = { rider: rider._id };
  if (filters.from || filters.to) {
    coMatch.date = {};
    if (filters.from) coMatch.date.$gte = filters.from;
    if (filters.to) coMatch.date.$lte = filters.to;
  }
  const closeouts = await DailyCloseout.find(coMatch).sort({ date: -1 }).limit(60).populate('receivedBy', 'name').lean();
  const confirmed = closeouts.filter((c) => c.status === 'Confirmed');
  const handover = {
    closeouts: closeouts.length,
    confirmed: confirmed.length,
    amountDue: confirmed.reduce((s, c) => s + c.expectedHandover, 0),
    amountHandedOver: confirmed.reduce((s, c) => s + c.actualHandover, 0),
    differences: confirmed.reduce((s, c) => s + c.difference, 0),
    shortDays: confirmed.filter((c) => c.difference < 0).length,
    overDays: confirmed.filter((c) => c.difference > 0).length,
  };
  const pendingExpenses = await Expense.countDocuments({ rider: rider._id, status: 'Pending' });
  res.json({ rider: { _id: rider._id, riderId: rider.riderId, name: rider.name }, filters: { from: filters.from || null, to: filters.to || null }, summary, handover, closeouts, pendingExpenses });
});

const riderActivity = asyncHandler(async (req, res) => {
  const rider = await findRider(req.params.id);
  const user = await User.findOne({ rider: rider._id }).select('_id').lean();
  const or = [{ rider: rider._id }];
  if (user) or.push({ user: user._id });
  const items = await AuditLog.find({ $or: or }).sort({ timestamp: -1 }).limit(Math.min(200, parseInt(qs(req.query.limit), 10) || 50)).lean();
  res.json({ items });
});

/** Permanent delete is only allowed for riders with no history. Otherwise deactivate. */
const deleteRider = asyncHandler(async (req, res) => {
  const rider = await findRider(req.params.id);
  const [d, e, c] = await Promise.all([
    Delivery.exists({ rider: rider._id }), Expense.exists({ rider: rider._id }), DailyCloseout.exists({ rider: rider._id }),
  ]);
  if (d || e || c) throw ApiError.conflict('This rider has historical records and cannot be deleted. Deactivate the rider instead.');
  await unassignRider(rider._id);
  await User.deleteOne({ rider: rider._id });
  await Rider.deleteOne({ _id: rider._id });
  await Bike.updateMany({ assignedRider: rider._id }, { $set: { assignedRider: null } });
  await audit(req, { action: 'Admin deleted rider (no history)', entityType: 'Rider', entityId: rider._id, entityRef: rider.riderId, previousData: { name: rider.name, email: rider.email } });
  res.json({ message: 'Rider deleted.' });
});

module.exports = { listRiders, getRider, createRider, updateRider, resetPassword, setRiderBike, riderPerformance, riderActivity, deleteRider };
