const { DailyCloseout, Rider } = require('../models');
const { computeDay, findCloseout, stampClosedPeriod } = require('../services/closeoutService');
const { nextCloseoutId } = require('../services/identifiers');
const { audit } = require('../services/audit');
const policy = require('../services/policy');
const { CLOSEOUT_STATUSES } = require('../config/constants');
const { parseCentsInput, isValidCents, formatCents } = require('../utils/money');
const { businessDate, isValidDateString } = require('../utils/dates');
const { asyncHandler, isObjectId, paginate, qs, trimOrEmpty } = require('../utils/helpers');
const ApiError = require('../utils/ApiError');

const POPULATE = [
  { path: 'rider', select: 'riderId name phone' },
  { path: 'receivedBy', select: 'name' },
  { path: 'submittedBy', select: 'name' },
];

function resolveRider(req, source) {
  if (policy.isRider(req.user)) return String(req.user.rider);
  const r = qs(source.rider);
  if (!isObjectId(r)) throw ApiError.badRequest('Please choose a rider.', { fieldErrors: { rider: 'Required.' } });
  return r;
}

function resolveDate(value) {
  const today = businessDate();
  const date = qs(value) || today;
  if (!isValidDateString(date)) throw ApiError.badRequest('Please choose a valid date.');
  if (date > today) throw ApiError.badRequest('You cannot close out a future date.');
  return date;
}

async function findScoped(req, id) {
  const key = isObjectId(id) ? { _id: id } : { closeoutId: String(id).toUpperCase() };
  const c = await DailyCloseout.findOne(policy.scopeFilter(req.user, key));
  if (!c) throw ApiError.notFound('Closeout record not found.');
  return c;
}

/** Live, server-calculated figures for a rider-day (used by the rider's handover screen). */
const previewCloseout = asyncHandler(async (req, res) => {
  const riderId = resolveRider(req, req.query);
  const date = resolveDate(req.query.date);
  const [{ summary, pendingExpenses, figures }, closeout] = await Promise.all([
    computeDay(riderId, date, 0),
    DailyCloseout.findOne({ rider: riderId, date }).populate(POPULATE).lean(),
  ]);
  res.json({ date, rider: riderId, summary, expectedHandover: figures.expectedHandover, pendingExpenses, closeout, locked: policy.isDayLocked(closeout) });
});

const listCloseouts = asyncHandler(async (req, res) => {
  const filter = {};
  const from = qs(req.query.from);
  const to = qs(req.query.to);
  if ((from && !isValidDateString(from)) || (to && !isValidDateString(to))) throw ApiError.badRequest('Please choose valid dates.');
  if (from || to) {
    filter.date = {};
    if (from) filter.date.$gte = from;
    if (to) filter.date.$lte = to;
  }
  const status = qs(req.query.status);
  if (status) {
    if (!CLOSEOUT_STATUSES.includes(status)) throw ApiError.badRequest('Invalid status filter.');
    filter.status = status;
  }
  if (policy.isAdmin(req.user) && qs(req.query.rider)) {
    if (!isObjectId(qs(req.query.rider))) throw ApiError.badRequest('Invalid rider filter.');
    filter.rider = qs(req.query.rider);
  }
  const scoped = policy.scopeFilter(req.user, filter);
  const { page, limit, skip } = paginate(req.query);
  const [items, total] = await Promise.all([
    DailyCloseout.find(scoped).sort({ date: -1, createdAt: -1 }).skip(skip).limit(limit).populate(POPULATE).lean(),
    DailyCloseout.countDocuments(scoped),
  ]);
  res.json({ items, total, page, pages: Math.max(1, Math.ceil(total / limit)) });
});

const getCloseout = asyncHandler(async (req, res) => {
  const c = await findScoped(req, req.params.id);
  await c.populate(POPULATE);
  res.json({ closeout: c });
});

/** Rider (or admin on the rider's behalf) submits the end-of-day handover. Locks the day. */
const submitCloseout = asyncHandler(async (req, res) => {
  const riderId = resolveRider(req, req.body);
  const date = resolveDate(req.body.date);
  const rider = await Rider.findById(riderId).lean();
  if (!rider) throw ApiError.notFound('Rider not found.');

  const declared = parseCentsInput(req.body.actualHandover);
  if (!isValidCents(declared)) throw ApiError.badRequest('Please enter the actual amount you are handing over (0 or more).', { fieldErrors: { actualHandover: 'Enter a valid amount.' } });

  const existing = await findCloseout(riderId, date);
  if (existing && existing.status !== 'Returned') {
    throw ApiError.conflict(existing.status === 'Confirmed'
      ? `The account for ${date} is already closed.`
      : `The handover for ${date} has already been submitted and is waiting for management confirmation.`);
  }

  const { figures, pendingExpenses } = await computeDay(riderId, date, declared);
  const data = {
    ...figures,
    declaredHandover: declared,
    status: 'Submitted',
    submittedBy: req.user._id,
    submittedAt: new Date(),
    riderNotes: trimOrEmpty(req.body.notes, 500),
    receivedBy: null, receivedAt: null,
  };

  let closeout;
  const before = existing ? existing.toObject() : null;
  if (existing) {
    Object.assign(existing, data);
    closeout = await existing.save();
  } else {
    closeout = await DailyCloseout.create({ closeoutId: await nextCloseoutId(date), date, rider: riderId, ...data });
  }

  await audit(req, {
    action: policy.isAdmin(req.user) ? 'Admin submitted closeout for rider' : 'Rider submitted end-of-day handover',
    entityType: 'DailyCloseout', entityId: closeout._id, entityRef: closeout.closeoutId, rider: riderId,
    previousData: before ? { status: before.status, declaredHandover: before.declaredHandover } : null,
    newData: { date, cashCollected: figures.cashCollected, approvedExpenses: figures.approvedExpenses, expectedHandover: figures.expectedHandover, declaredHandover: declared, difference: figures.difference, differenceStatus: figures.differenceStatus },
  });
  await closeout.populate(POPULATE);
  res.status(existing ? 200 : 201).json({ closeout, pendingExpenses });
});

/** Management confirms receipt of cash. Figures are recalculated server-side at this moment. */
const confirmCloseout = asyncHandler(async (req, res) => {
  const closeout = await findScoped(req, req.params.id);
  if (closeout.status !== 'Submitted') throw ApiError.badRequest(`Only submitted closeouts can be confirmed (this one is ${closeout.status}).`);

  const received = req.body.amountReceived === undefined || req.body.amountReceived === '' || req.body.amountReceived === null
    ? closeout.declaredHandover : parseCentsInput(req.body.amountReceived);
  if (!isValidCents(received)) throw ApiError.badRequest('Please enter the amount received (0 or more).', { fieldErrors: { amountReceived: 'Enter a valid amount.' } });

  const { figures: final, pendingExpenses } = await computeDay(closeout.rider, closeout.date, received);
  if (pendingExpenses > 0) {
    throw ApiError.conflict(`There ${pendingExpenses === 1 ? 'is 1 pending expense' : `are ${pendingExpenses} pending expenses`} for this rider on ${closeout.date}. Approve or reject them before confirming.`);
  }

  const before = closeout.toObject();
  Object.assign(closeout, final, {
    status: 'Confirmed',
    receivedBy: req.user._id,
    receivedAt: new Date(),
    notes: trimOrEmpty(req.body.notes, 500),
  });
  await closeout.save();
  await stampClosedPeriod(closeout);

  await audit(req, {
    action: 'Management closed rider account',
    entityType: 'DailyCloseout', entityId: closeout._id, entityRef: closeout.closeoutId, rider: closeout.rider,
    previousData: { status: before.status, expectedHandover: before.expectedHandover, declaredHandover: before.declaredHandover },
    newData: {
      status: 'Confirmed', expectedHandover: final.expectedHandover, amountReceived: received,
      difference: final.difference, differenceStatus: final.differenceStatus,
      note: received !== closeout.declaredHandover ? `Received ${formatCents(received)} vs declared ${formatCents(closeout.declaredHandover)}` : undefined,
    },
  });
  await closeout.populate(POPULATE);
  res.json({ closeout });
});

/** Management sends a submitted closeout back to the rider (unlocks the day). */
const returnCloseout = asyncHandler(async (req, res) => {
  const closeout = await findScoped(req, req.params.id);
  if (closeout.status !== 'Submitted') throw ApiError.badRequest('Only submitted (unconfirmed) closeouts can be returned. Confirmed days need correction requests.');
  const notes = trimOrEmpty(req.body.notes, 500);
  if (notes.length < 3) throw ApiError.badRequest('Please tell the rider why the closeout is being returned.', { fieldErrors: { notes: 'Required.' } });
  closeout.status = 'Returned';
  closeout.notes = notes;
  await closeout.save();
  await stampClosedPeriod(closeout, true);
  await audit(req, {
    action: 'Admin returned closeout to rider', entityType: 'DailyCloseout', entityId: closeout._id,
    entityRef: closeout.closeoutId, rider: closeout.rider, previousData: { status: 'Submitted' }, newData: { status: 'Returned', notes },
  });
  await closeout.populate(POPULATE);
  res.json({ closeout });
});

module.exports = { previewCloseout, listCloseouts, getCloseout, submitCloseout, confirmCloseout, returnCloseout };
