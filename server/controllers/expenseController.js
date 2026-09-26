const mongoose = require('mongoose');
const { Expense, Rider, Setting, AuditLog, CorrectionRequest } = require('../models');
const { validateExpense } = require('../services/expenseService');
const { nextExpenseId, nextCorrectionId } = require('../services/identifiers');
const { findCloseout, recalculateCloseout } = require('../services/closeoutService');
const { getStorage } = require('../services/storage');
const { audit, diff } = require('../services/audit');
const policy = require('../services/policy');
const { EXPENSE_STATUSES, EXPENSE_CATEGORIES, EXPENSE_EDITABLE_FIELDS } = require('../config/constants');
const { asyncHandler, isObjectId, paginate, qs, trimOrEmpty } = require('../utils/helpers');
const { isValidDateString, businessDate } = require('../utils/dates');
const ApiError = require('../utils/ApiError');

const POPULATE = [
  { path: 'rider', select: 'riderId name phone' },
  { path: 'reviewedBy', select: 'name' },
];
const AUDIT_FIELDS = ['date', 'category', 'amount', 'description', 'status', 'rejectionReason', 'receipt'];

function snap(e) {
  return {
    date: e.date, category: e.category, amount: e.amount, description: e.description, status: e.status,
    rejectionReason: e.rejectionReason, receipt: e.receipt ? e.receipt.originalName || e.receipt.key : null,
  };
}

async function findScoped(req, id) {
  const key = isObjectId(id) ? { _id: id } : { expenseId: String(id).toUpperCase() };
  const expense = await Expense.findOne(policy.scopeFilter(req.user, key));
  if (!expense) throw ApiError.notFound('Expense not found.');
  return expense;
}

function throwValidation(result) {
  throw ApiError.badRequest(Object.values(result.errors)[0] || 'Please check the expense details.', { fieldErrors: result.errors });
}

async function storeReceipt(file) {
  if (!file) return null;
  try {
    return await getStorage().save({ buffer: file.buffer, originalName: file.originalname, mimeType: file.mimetype });
  } catch (err) {
    console.error('[upload] receipt save failed:', err.message);
    throw new ApiError(500, 'The receipt could not be saved. Please try again.');
  }
}

const listExpenses = asyncHandler(async (req, res) => {
  const filter = {};
  const from = qs(req.query.from) || qs(req.query.date);
  const to = qs(req.query.to) || qs(req.query.date);
  if (from || to) {
    if ((from && !isValidDateString(from)) || (to && !isValidDateString(to))) throw ApiError.badRequest('Please choose valid dates.');
    filter.date = {};
    if (from) filter.date.$gte = from;
    if (to) filter.date.$lte = to;
  }
  const status = qs(req.query.status);
  if (status) {
    if (!EXPENSE_STATUSES.includes(status)) throw ApiError.badRequest('Invalid status filter.');
    filter.status = status;
  }
  const category = qs(req.query.category);
  if (category) {
    if (!EXPENSE_CATEGORIES.includes(category)) throw ApiError.badRequest('Invalid category filter.');
    filter.category = category;
  }
  if (policy.isAdmin(req.user)) {
    const rider = qs(req.query.rider);
    if (rider) {
      if (!isObjectId(rider)) throw ApiError.badRequest('Invalid rider filter.');
      filter.rider = rider;
    }
  }
  const scoped = policy.scopeFilter(req.user, filter);
  const { page, limit, skip } = paginate(req.query);
  const [items, total, totalsRaw] = await Promise.all([
    Expense.find(scoped).sort({ date: -1, createdAt: -1 }).skip(skip).limit(limit).populate(POPULATE).lean(),
    Expense.countDocuments(scoped),
    Expense.aggregate([{ $match: { ...scoped, ...(scoped.rider ? { rider: new mongoose.Types.ObjectId(String(scoped.rider)) } : {}) } }, { $group: { _id: '$status', count: { $sum: 1 }, amount: { $sum: '$amount' } } }]),
  ]);
  const totals = { Pending: { count: 0, amount: 0 }, Approved: { count: 0, amount: 0 }, Rejected: { count: 0, amount: 0 } };
  for (const t of totalsRaw) totals[t._id] = { count: t.count, amount: t.amount };
  res.json({ items, total, page, pages: Math.max(1, Math.ceil(total / limit)), totals });
});

const getExpense = asyncHandler(async (req, res) => {
  const expense = await findScoped(req, req.params.id);
  const closeout = await findCloseout(expense.rider, expense.date);
  const perm = policy.canRiderEditExpense(req.user, expense, closeout);
  await expense.populate(POPULATE);
  const [history, corrections] = await Promise.all([
    AuditLog.find({ entityType: 'Expense', entityId: expense._id }).sort({ timestamp: -1 }).limit(50).lean(),
    CorrectionRequest.find({ entityType: 'Expense', entityId: expense._id }).sort({ createdAt: -1 }).lean(),
  ]);
  res.json({
    expense,
    lock: { locked: policy.isDayLocked(closeout), closeoutStatus: closeout ? closeout.status : null },
    permissions: { canEdit: perm.allowed, requiresReason: Boolean(perm.requiresReason), requiresCorrection: Boolean(perm.requiresCorrection), reason: perm.reason || null },
    history, corrections,
  });
});

const createExpense = asyncHandler(async (req, res) => {
  const isAdmin = policy.isAdmin(req.user);
  let riderId = req.user.rider;
  if (isAdmin) {
    if (!isObjectId(String(req.body.rider || ''))) throw ApiError.badRequest('Please choose the rider for this expense.', { fieldErrors: { rider: 'Required.' } });
    riderId = req.body.rider;
  }
  const rider = await Rider.findById(riderId).lean();
  if (!rider || rider.status !== 'active') throw ApiError.badRequest('Rider not found or inactive.');

  const result = validateExpense(req.body, { isAdmin });
  if (!result.ok) throwValidation(result);
  const v = result.value;

  const settings = await Setting.get();
  if (settings.requireReceiptForExpenses && !req.file) throw ApiError.badRequest('Please attach a photo of the receipt.', { fieldErrors: { receipt: 'Receipt required.' } });

  const closeout = await findCloseout(riderId, v.date);
  if (policy.isDayLocked(closeout)) throw ApiError.locked(`The account for ${v.date} is already closed or submitted. Expenses cannot be added to it.`);

  const receipt = await storeReceipt(req.file);
  const expense = await Expense.create({
    expenseId: await nextExpenseId(v.date),
    date: v.date, rider: rider._id, category: v.category, amount: v.amount, description: v.description,
    receipt, status: 'Pending', createdBy: req.user._id, updatedBy: req.user._id,
  });
  await audit(req, {
    action: isAdmin ? 'Admin recorded expense' : 'Rider submitted expense',
    entityType: 'Expense', entityId: expense._id, entityRef: expense.expenseId, rider: rider._id, newData: snap(expense),
  });
  await expense.populate(POPULATE);
  res.status(201).json({ expense });
});

const updateExpense = asyncHandler(async (req, res) => {
  const expense = await findScoped(req, req.params.id);
  const closeout = await findCloseout(expense.rider, expense.date);
  const isAdmin = policy.isAdmin(req.user);
  const perm = policy.canRiderEditExpense(req.user, expense, closeout);
  if (!perm.allowed) throw perm.locked ? ApiError.locked(perm.reason) : ApiError.forbidden(perm.reason);
  const reason = trimOrEmpty(req.body.reason, 500);
  if (perm.requiresReason && !reason) throw ApiError.badRequest('This day is closed. Please give a reason for this correction.', { fieldErrors: { reason: 'Reason required.' } });

  const merged = { date: expense.date, category: expense.category, amount: expense.amount, description: expense.description };
  for (const k of EXPENSE_EDITABLE_FIELDS) if (req.body[k] !== undefined) merged[k] = req.body[k];
  const result = validateExpense(merged, { isAdmin });
  if (!result.ok) throwValidation(result);
  if (result.value.date !== expense.date) {
    const target = await findCloseout(expense.rider, result.value.date);
    if (policy.isDayLocked(target)) throw ApiError.locked(`The account for ${result.value.date} is closed. Choose another date.`);
  }

  const before = snap(expense);
  const oldReceipt = expense.receipt;
  const newReceipt = await storeReceipt(req.file);
  Object.assign(expense, result.value);
  if (newReceipt) expense.receipt = newReceipt;
  expense.updatedBy = req.user._id;
  const after = snap(expense);
  const d = diff(before, after, AUDIT_FIELDS);
  if (!d.changed) {
    await expense.populate(POPULATE);
    return res.json({ expense, unchanged: true });
  }
  const oldDate = before.date;
  await expense.save();
  if (newReceipt && oldReceipt && oldReceipt.key) await getStorage(oldReceipt.provider).remove(oldReceipt.key).catch(() => {});

  await audit(req, {
    action: perm.requiresReason ? 'Admin corrected closed expense' : (isAdmin ? 'Admin edited expense' : 'Rider updated expense'),
    entityType: 'Expense', entityId: expense._id, entityRef: expense.expenseId, rider: expense.rider,
    previousData: d.prev, newData: { ...d.next, ...(reason ? { reason } : {}) },
  });
  if (expense.status === 'Approved') {
    await recalculateCloseout(req, expense.rider, oldDate);
    if (oldDate !== expense.date) await recalculateCloseout(req, expense.rider, expense.date);
  }
  await expense.populate(POPULATE);
  res.json({ expense });
});

const reviewExpense = (decision) => asyncHandler(async (req, res) => {
  const expense = await findScoped(req, req.params.id);
  if (expense.status !== 'Pending' && !(decision === 'Approved' && expense.status === 'Rejected') && !(decision === 'Rejected' && expense.status === 'Approved')) {
    throw ApiError.badRequest(`This expense is already ${expense.status.toLowerCase()}.`);
  }
  const closeout = await findCloseout(expense.rider, expense.date);
  const reason = trimOrEmpty(req.body.reason || req.body.rejectionReason, 500);
  if (decision === 'Rejected' && reason.length < 3) throw ApiError.badRequest('Please give a reason for rejecting this expense.', { fieldErrors: { reason: 'Reason required.' } });
  if (expense.status !== 'Pending' && closeout && closeout.status === 'Confirmed' && !reason) {
    throw ApiError.badRequest('This day is closed. Please give a reason for changing the decision.', { fieldErrors: { reason: 'Reason required.' } });
  }

  const before = snap(expense);
  expense.status = decision;
  expense.reviewedBy = req.user._id;
  expense.reviewedAt = new Date();
  expense.rejectionReason = decision === 'Rejected' ? reason : '';
  await expense.save();

  await audit(req, {
    action: decision === 'Approved' ? 'Admin approved expense' : 'Admin rejected expense',
    entityType: 'Expense', entityId: expense._id, entityRef: expense.expenseId, rider: expense.rider,
    previousData: { status: before.status }, newData: { status: decision, amount: expense.amount, ...(reason ? { reason } : {}) },
  });
  if (policy.isDayLocked(closeout)) await recalculateCloseout(req, expense.rider, expense.date);
  await expense.populate(POPULATE);
  res.json({ expense });
});

const getReceipt = asyncHandler(async (req, res) => {
  const expense = await findScoped(req, req.params.id);
  if (!expense.receipt || !expense.receipt.key) throw ApiError.notFound('No receipt was attached to this expense.');
  let stream;
  try {
    stream = getStorage(expense.receipt.provider).read(expense.receipt.key);
  } catch {
    stream = null;
  }
  if (!stream) throw ApiError.notFound('Receipt file could not be found.');
  res.setHeader('Content-Type', expense.receipt.mimeType || 'application/octet-stream');
  res.setHeader('Content-Disposition', `inline; filename="${expense.expenseId}${(expense.receipt.key.match(/\.[a-z]+$/i) || [''])[0]}"`);
  res.setHeader('Cache-Control', 'private, max-age=300');
  stream.on('error', () => { if (!res.headersSent) res.status(404).end(); else res.end(); });
  stream.pipe(res);
});

const requestCorrection = asyncHandler(async (req, res) => {
  const expense = await findScoped(req, req.params.id);
  const closeout = await findCloseout(expense.rider, expense.date);
  if (!policy.isDayLocked(closeout)) throw ApiError.badRequest('This day is still open — you can edit the expense directly while it is pending.');
  const reason = trimOrEmpty(req.body.reason, 500);
  if (reason.length < 5) throw ApiError.badRequest('Please explain why this correction is needed.', { fieldErrors: { reason: 'Please give a reason.' } });
  const raw = req.body.changes && typeof req.body.changes === 'object' ? req.body.changes : {};
  const changes = {};
  for (const k of ['category', 'amount', 'description']) if (raw[k] !== undefined && raw[k] !== expense[k]) changes[k] = raw[k];
  if (!Object.keys(changes).length) throw ApiError.badRequest('Please change at least one value for the correction.');
  const check = validateExpense({ date: expense.date, category: expense.category, amount: expense.amount, description: expense.description, ...changes }, { isAdmin: true });
  if (!check.ok) throwValidation(check);
  if (await CorrectionRequest.findOne({ entityType: 'Expense', entityId: expense._id, status: 'Pending' })) {
    throw ApiError.conflict('There is already a pending correction request for this expense.');
  }
  const current = {};
  for (const k of Object.keys(changes)) current[k] = expense[k];
  const cr = await CorrectionRequest.create({
    requestId: await nextCorrectionId(businessDate()),
    entityType: 'Expense', entityId: expense._id, entityRef: expense.expenseId,
    rider: expense.rider, date: expense.date, requestedChanges: changes, currentValues: current, reason,
    requestedBy: req.user._id,
  });
  await audit(req, {
    action: 'Rider requested expense correction', entityType: 'CorrectionRequest', entityId: cr._id, entityRef: cr.requestId,
    rider: expense.rider, previousData: current, newData: { ...changes, reason, expense: expense.expenseId },
  });
  res.status(201).json({ correction: cr });
});

module.exports = {
  listExpenses, getExpense, createExpense, updateExpense,
  approveExpense: reviewExpense('Approved'), rejectExpense: reviewExpense('Rejected'),
  getReceipt, requestCorrection,
};
