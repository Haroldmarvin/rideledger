const { CorrectionRequest, Delivery, Expense } = require('../models');
const { applyDeliveryPatch, snapshot, AUDIT_FIELDS } = require('../services/deliveryService');
const { validateExpense } = require('../services/expenseService');
const { recalculateCloseout } = require('../services/closeoutService');
const { audit, diff } = require('../services/audit');
const policy = require('../services/policy');
const { CORRECTION_STATUSES } = require('../config/constants');
const { asyncHandler, isObjectId, paginate, qs, trimOrEmpty } = require('../utils/helpers');
const ApiError = require('../utils/ApiError');

const POPULATE = [
  { path: 'rider', select: 'riderId name' },
  { path: 'requestedBy', select: 'name role' },
  { path: 'reviewedBy', select: 'name' },
];

async function findScoped(req, id) {
  const key = isObjectId(id) ? { _id: id } : { requestId: String(id).toUpperCase() };
  const c = await CorrectionRequest.findOne(policy.scopeFilter(req.user, key));
  if (!c) throw ApiError.notFound('Correction request not found.');
  return c;
}

const listCorrections = asyncHandler(async (req, res) => {
  const filter = {};
  const status = qs(req.query.status);
  if (status) {
    if (!CORRECTION_STATUSES.includes(status)) throw ApiError.badRequest('Invalid status filter.');
    filter.status = status;
  }
  if (policy.isAdmin(req.user) && qs(req.query.rider)) {
    if (!isObjectId(qs(req.query.rider))) throw ApiError.badRequest('Invalid rider filter.');
    filter.rider = qs(req.query.rider);
  }
  const scoped = policy.scopeFilter(req.user, filter);
  const { page, limit, skip } = paginate(req.query);
  const [items, total] = await Promise.all([
    CorrectionRequest.find(scoped).sort({ createdAt: -1 }).skip(skip).limit(limit).populate(POPULATE).lean(),
    CorrectionRequest.countDocuments(scoped),
  ]);
  res.json({ items, total, page, pages: Math.max(1, Math.ceil(total / limit)) });
});

const approveCorrection = asyncHandler(async (req, res) => {
  const cr = await findScoped(req, req.params.id);
  if (cr.status !== 'Pending') throw ApiError.badRequest(`This request has already been ${cr.status.toLowerCase()}.`);
  const notes = trimOrEmpty(req.body.notes, 500);

  let previous;
  let next;
  let entityRef;
  if (cr.entityType === 'Delivery') {
    const delivery = await Delivery.findById(cr.entityId);
    if (!delivery) throw ApiError.notFound('The delivery for this request no longer exists.');
    const before = snapshot(delivery);
    await applyDeliveryPatch(delivery, cr.requestedChanges, { isAdmin: true });
    delivery.updatedBy = req.user._id;
    await delivery.save();
    const d = diff(before, snapshot(delivery), AUDIT_FIELDS);
    previous = d.prev; next = d.next; entityRef = delivery.deliveryId;
    await audit(req, {
      action: 'Admin applied approved correction to delivery', entityType: 'Delivery', entityId: delivery._id,
      entityRef, rider: delivery.rider, previousData: previous, newData: { ...next, correction: cr.requestId },
    });
  } else {
    const expense = await Expense.findById(cr.entityId);
    if (!expense) throw ApiError.notFound('The expense for this request no longer exists.');
    const merged = { date: expense.date, category: expense.category, amount: expense.amount, description: expense.description, ...cr.requestedChanges };
    const result = validateExpense(merged, { isAdmin: true });
    if (!result.ok) throw ApiError.badRequest(Object.values(result.errors)[0], { fieldErrors: result.errors });
    previous = { category: expense.category, amount: expense.amount, description: expense.description };
    Object.assign(expense, { category: result.value.category, amount: result.value.amount, description: result.value.description, updatedBy: req.user._id });
    await expense.save();
    next = { category: expense.category, amount: expense.amount, description: expense.description };
    entityRef = expense.expenseId;
    await audit(req, {
      action: 'Admin applied approved correction to expense', entityType: 'Expense', entityId: expense._id,
      entityRef, rider: expense.rider, previousData: previous, newData: { ...next, correction: cr.requestId },
    });
  }

  cr.status = 'Approved';
  cr.reviewedBy = req.user._id;
  cr.reviewedAt = new Date();
  cr.reviewNotes = notes;
  await cr.save();
  await audit(req, {
    action: 'Admin approved transaction correction', entityType: 'CorrectionRequest', entityId: cr._id,
    entityRef: cr.requestId, rider: cr.rider, previousData: { status: 'Pending' }, newData: { status: 'Approved', record: entityRef, notes },
  });
  const closeout = await recalculateCloseout(req, cr.rider, cr.date);
  await cr.populate(POPULATE);
  res.json({ correction: cr, closeout });
});

const rejectCorrection = asyncHandler(async (req, res) => {
  const cr = await findScoped(req, req.params.id);
  if (cr.status !== 'Pending') throw ApiError.badRequest(`This request has already been ${cr.status.toLowerCase()}.`);
  const notes = trimOrEmpty(req.body.notes || req.body.reason, 500);
  if (notes.length < 3) throw ApiError.badRequest('Please give a reason for rejecting this correction.', { fieldErrors: { notes: 'Reason required.' } });
  cr.status = 'Rejected';
  cr.reviewedBy = req.user._id;
  cr.reviewedAt = new Date();
  cr.reviewNotes = notes;
  await cr.save();
  await audit(req, {
    action: 'Admin rejected transaction correction', entityType: 'CorrectionRequest', entityId: cr._id,
    entityRef: cr.requestId, rider: cr.rider, previousData: { status: 'Pending' }, newData: { status: 'Rejected', notes },
  });
  await cr.populate(POPULATE);
  res.json({ correction: cr });
});

module.exports = { listCorrections, approveCorrection, rejectCorrection };
