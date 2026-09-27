const { Delivery, Rider, AuditLog, CorrectionRequest } = require('../models');
const { validateDelivery, FLAG_MESSAGES } = require('../services/deliveryValidation');
const { feeContext, resolveBike, throwValidation, applyDeliveryPatch, snapshot, AUDIT_FIELDS } = require('../services/deliveryService');
const { nextDeliveryId, nextCorrectionId } = require('../services/identifiers');
const { findCloseout, recalculateCloseout } = require('../services/closeoutService');
const { getSummary, deliveryMatch } = require('../services/summaryService');
const { audit, diff } = require('../services/audit');
const policy = require('../services/policy');
const { parseFilters } = require('../utils/filters');
const { businessDate, businessTime } = require('../utils/dates');
const { DELIVERY_EDITABLE_FIELDS } = require('../config/constants');
const { asyncHandler, isObjectId, paginate, qs, trimOrEmpty } = require('../utils/helpers');
const ApiError = require('../utils/ApiError');
const deletion = require('../services/deletionService');

const POPULATE = [
  { path: 'rider', select: 'riderId name phone status' },
  { path: 'bike', select: 'bikeId registrationNumber' },
];

const SORTS = {
  newest: { date: -1, recordedAt: -1 },
  oldest: { date: 1, recordedAt: 1 },
  fee: { deliveryFee: -1, recordedAt: -1 },
  outstanding: { outstandingAmount: -1, recordedAt: -1 },
};

/** Find a delivery by Mongo id or human deliveryId, scoped to the user. 404 if not theirs. */
async function findScoped(req, id) {
  const key = isObjectId(id) ? { _id: id } : { deliveryId: String(id).toUpperCase() };
  const delivery = await Delivery.findOne(policy.scopeFilter(req.user, key));
  if (!delivery) throw ApiError.notFound('Delivery not found.');
  return delivery;
}

function flagDetails(flags = []) {
  return flags.map((code) => ({ code, message: FLAG_MESSAGES[code] || code }));
}

const listDeliveries = asyncHandler(async (req, res) => {
  const filters = parseFilters(req.query, req.user);
  const { page, limit, skip } = paginate(req.query);
  const match = deliveryMatch(filters);
  const sort = SORTS[qs(req.query.sort)] || SORTS.newest;
  const [items, total, summary] = await Promise.all([
    Delivery.find(match).sort(sort).skip(skip).limit(limit).populate(POPULATE).lean(),
    Delivery.countDocuments(match),
    getSummary(filters),
  ]);
  res.json({ items, total, page, pages: Math.max(1, Math.ceil(total / limit)), summary });
});

const getDelivery = asyncHandler(async (req, res) => {
  const delivery = await findScoped(req, req.params.id);
  const closeout = await findCloseout(delivery.rider, delivery.date);
  await delivery.populate(POPULATE);
  const [history, corrections] = await Promise.all([
    AuditLog.find({ entityType: 'Delivery', entityId: delivery._id }).sort({ timestamp: -1 }).limit(50).lean(),
    CorrectionRequest.find({ entityType: 'Delivery', entityId: delivery._id }).sort({ createdAt: -1 }).populate('reviewedBy', 'name').lean(),
  ]);
  const perm = policy.canModify(req.user, { rider: delivery.rider._id }, closeout);
  res.json({
    delivery,
    flags: flagDetails(delivery.flags),
    lock: { locked: policy.isDayLocked(closeout), closeoutStatus: closeout ? closeout.status : null, closeoutId: closeout ? closeout.closeoutId : null },
    permissions: { canEdit: perm.allowed, requiresReason: Boolean(perm.requiresReason), requiresCorrection: Boolean(perm.requiresCorrection), reason: perm.reason || null },
    history,
    corrections,
  });
});

const createDelivery = asyncHandler(async (req, res) => {
  const isAdmin = policy.isAdmin(req.user);
  const body = req.body || {};

  // 1. Rider identity comes from the login (riders can never record for someone else)
  let riderId = req.user.rider;
  if (isAdmin) {
    if (!isObjectId(String(body.rider || ''))) throw ApiError.badRequest('Please choose the rider for this delivery.', { fieldErrors: { rider: 'Required.' } });
    riderId = body.rider;
  }
  const rider = await Rider.findById(riderId).lean();
  if (!rider) throw ApiError.badRequest('Rider not found.');
  if (rider.status !== 'active') throw ApiError.badRequest('This rider account is inactive.');

  // 2. Offline sync idempotency: the same clientRef never creates two deliveries
  const clientRef = typeof body.clientRef === 'string' && /^[A-Za-z0-9_-]{8,64}$/.test(body.clientRef) ? body.clientRef : undefined;
  if (clientRef) {
    const existing = await Delivery.findOne({ clientRef }).populate(POPULATE);
    if (existing) {
      if (String(existing.rider._id) !== String(riderId)) throw ApiError.conflict('This delivery reference has already been used.');
      return res.status(200).json({ delivery: existing, flags: flagDetails(existing.flags), duplicate: true });
    }
  }

  // 3. Date/time are automatic. Offline-recorded deliveries keep their original time (within 72h).
  const now = new Date();
  let recordedAt = now;
  if (body.recordedAt) {
    const t = new Date(body.recordedAt);
    const minAllowed = isAdmin ? new Date('2000-01-01') : new Date(now.getTime() - 72 * 3600 * 1000);
    if (!Number.isNaN(t.getTime()) && t <= new Date(now.getTime() + 5 * 60 * 1000) && t >= minAllowed) recordedAt = t > now ? now : t;
  }
  const date = businessDate(recordedAt);
  const time = businessTime(recordedAt);

  // 4. Closed-day protection
  const closeout = await findCloseout(riderId, date);
  const locked = policy.isDayLocked(closeout);
  const reason = trimOrEmpty(body.reason, 500);
  if (locked && !isAdmin) {
    throw ApiError.locked(closeout.status === 'Confirmed'
      ? `The account for ${date} is closed. New deliveries cannot be added to a closed day. Contact management.`
      : `You have already submitted your handover for ${date}. Ask management to return it before adding deliveries.`);
  }
  if (locked && isAdmin && !reason) throw ApiError.badRequest('This day is closed. Please give a reason for adding a delivery to it.', { fieldErrors: { reason: 'Reason required.' } });

  // 5. Validate + calculate (server-authoritative)
  const ctx = await feeContext(isAdmin);
  const result = validateDelivery(body, ctx);
  if (!result.ok) throwValidation(result);
  let bike = await resolveBike(body.bike);
  if (bike === undefined || bike === null) bike = rider.bike || null;

  const v = result.value;
  const doc = {
    deliveryId: await nextDeliveryId(date),
    date, time, recordedAt,
    rider: rider._id,
    bike,
    customerName: v.customerName,
    customerPhone: v.customerPhone,
    pickupLocation: v.pickupLocation,
    destination: v.destination,
    orderReference: v.orderReference,
    deliveryFee: v.deliveryFee,
    amountCollected: v.amountCollected,
    outstandingAmount: v.outstandingAmount,
    extraCollected: v.extraCollected,
    defaultFeeAtCreation: ctx.defaultFee,
    paymentMethod: v.paymentMethod,
    status: v.status,
    remarks: v.remarks,
    flags: result.flags,
    clientRef,
    createdBy: req.user._id,
    updatedBy: req.user._id,
    closedPeriod: locked ? closeout._id : null,
  };

  let delivery;
  try {
    delivery = await Delivery.create(doc);
  } catch (err) {
    if (err.code === 11000 && clientRef) {
      const existing = await Delivery.findOne({ clientRef }).populate(POPULATE);
      if (existing) return res.status(200).json({ delivery: existing, flags: flagDetails(existing.flags), duplicate: true });
    }
    throw err;
  }

  await audit(req, {
    action: isAdmin ? 'Admin created delivery' : 'Rider created delivery',
    entityType: 'Delivery', entityId: delivery._id, entityRef: delivery.deliveryId, rider: rider._id,
    newData: { ...snapshot(delivery), date, time, reason: reason || undefined },
  });
  if (locked) await recalculateCloseout(req, rider._id, date);

  await delivery.populate(POPULATE);
  res.status(201).json({ delivery, flags: flagDetails(delivery.flags) });
});

const updateDelivery = asyncHandler(async (req, res) => {
  const delivery = await findScoped(req, req.params.id);
  const closeout = await findCloseout(delivery.rider, delivery.date);
  const perm = policy.canModify(req.user, delivery, closeout);
  if (!perm.allowed) throw perm.locked ? ApiError.locked(perm.reason) : ApiError.forbidden(perm.reason);
  const reason = trimOrEmpty(req.body.reason, 500);
  if (perm.requiresReason && !reason) throw ApiError.badRequest('This day is closed. Please give a reason for this correction.', { fieldErrors: { reason: 'Reason required.' } });

  const before = snapshot(delivery);
  await applyDeliveryPatch(delivery, req.body || {}, { isAdmin: policy.isAdmin(req.user) });
  const after = snapshot(delivery);
  const d = diff(before, after, AUDIT_FIELDS);
  if (!d.changed) {
    await delivery.populate(POPULATE);
    return res.json({ delivery, flags: flagDetails(delivery.flags), unchanged: true });
  }
  delivery.updatedBy = req.user._id;
  await delivery.save();

  let action = policy.isAdmin(req.user) ? 'Admin edited delivery' : 'Rider updated delivery';
  if (policy.isAdmin(req.user) && d.next.deliveryFee !== undefined) action = 'Admin edited delivery fee';
  if (perm.requiresReason) action = 'Admin corrected closed delivery';
  await audit(req, {
    action, entityType: 'Delivery', entityId: delivery._id, entityRef: delivery.deliveryId, rider: delivery.rider,
    previousData: d.prev, newData: { ...d.next, ...(reason ? { reason } : {}) },
  });
  if (perm.locked) await recalculateCloseout(req, delivery.rider, delivery.date);

  await delivery.populate(POPULATE);
  res.json({ delivery, flags: flagDetails(delivery.flags) });
});

/** Riders cannot delete deliveries. There is intentionally no DELETE route; cancel via status instead. */

const requestCorrection = asyncHandler(async (req, res) => {
  const delivery = await findScoped(req, req.params.id);
  const closeout = await findCloseout(delivery.rider, delivery.date);
  if (!policy.isDayLocked(closeout)) throw ApiError.badRequest('This day is still open — you can edit the delivery directly.');
  const reason = trimOrEmpty(req.body.reason, 500);
  if (reason.length < 5) throw ApiError.badRequest('Please explain why this correction is needed.', { fieldErrors: { reason: 'Please give a reason.' } });

  const changes = {};
  const raw = req.body.changes && typeof req.body.changes === 'object' ? req.body.changes : {};
  for (const k of DELIVERY_EDITABLE_FIELDS) {
    if (raw[k] !== undefined && JSON.stringify(raw[k]) !== JSON.stringify(k === 'bike' ? String(delivery.bike || '') : delivery[k])) changes[k] = raw[k];
  }
  if (!Object.keys(changes).length) throw ApiError.badRequest('Please change at least one value for the correction.');

  const pending = await CorrectionRequest.findOne({ entityType: 'Delivery', entityId: delivery._id, status: 'Pending' });
  if (pending) throw ApiError.conflict('There is already a pending correction request for this delivery.');

  // Dry-run validation so management only ever approves valid data
  const probe = new Delivery(delivery.toObject());
  await applyDeliveryPatch(probe, changes, { isAdmin: false });

  const current = {};
  for (const k of Object.keys(changes)) current[k] = k === 'bike' ? (delivery.bike ? String(delivery.bike) : null) : delivery[k];
  const cr = await CorrectionRequest.create({
    requestId: await nextCorrectionId(businessDate()),
    entityType: 'Delivery', entityId: delivery._id, entityRef: delivery.deliveryId,
    rider: delivery.rider, date: delivery.date,
    requestedChanges: changes, currentValues: current, reason,
    requestedBy: req.user._id,
  });
  await audit(req, {
    action: policy.isAdmin(req.user) ? 'Admin requested delivery correction' : 'Rider requested delivery correction',
    entityType: 'CorrectionRequest', entityId: cr._id, entityRef: cr.requestId, rider: delivery.rider,
    previousData: current, newData: { ...changes, reason, delivery: delivery.deliveryId },
  });
  res.status(201).json({ correction: cr });
});

/** Management only: permanently remove a delivery (audited; the day's handover is recalculated). */
const deleteDelivery = asyncHandler(async (req, res) => {
  const delivery = await findScoped(req, req.params.id);
  await deletion.deleteDelivery(req, delivery, trimOrEmpty((req.body && req.body.reason) || req.query.reason, 500));
  res.json({ message: `Delivery ${delivery.deliveryId} deleted.` });
});

module.exports = { listDeliveries, getDelivery, createDelivery, updateDelivery, requestCorrection, deleteDelivery };
