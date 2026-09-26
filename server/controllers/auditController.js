const { AuditLog } = require('../models');
const { asyncHandler, isObjectId, paginate, qs, escapeRegex } = require('../utils/helpers');
const { isValidDateString, addDays } = require('../utils/dates');
const ApiError = require('../utils/ApiError');

/** Read-only. There are deliberately no update/delete endpoints for audit records. */
const listAuditLogs = asyncHandler(async (req, res) => {
  const filter = {};
  const entityType = qs(req.query.entityType);
  if (entityType) filter.entityType = entityType.slice(0, 40);
  const user = qs(req.query.user);
  if (user) {
    if (!isObjectId(user)) throw ApiError.badRequest('Invalid user filter.');
    filter.user = user;
  }
  const rider = qs(req.query.rider);
  if (rider) {
    if (!isObjectId(rider)) throw ApiError.badRequest('Invalid rider filter.');
    filter.rider = rider;
  }
  const search = qs(req.query.search).slice(0, 60);
  if (search) {
    const re = new RegExp(escapeRegex(search), 'i');
    filter.$or = [{ action: re }, { entityRef: re }, { userName: re }];
  }
  const from = qs(req.query.from);
  const to = qs(req.query.to);
  if ((from && !isValidDateString(from)) || (to && !isValidDateString(to))) throw ApiError.badRequest('Please choose valid dates.');
  if (from || to) {
    filter.timestamp = {};
    if (from) filter.timestamp.$gte = new Date(`${from}T00:00:00Z`);
    if (to) filter.timestamp.$lt = new Date(`${addDays(to, 1)}T00:00:00Z`);
  }
  const { page, limit, skip } = paginate(req.query);
  const [items, total, entityTypes] = await Promise.all([
    AuditLog.find(filter).sort({ timestamp: -1 }).skip(skip).limit(limit).lean(),
    AuditLog.countDocuments(filter),
    AuditLog.distinct('entityType'),
  ]);
  res.json({ items, total, page, pages: Math.max(1, Math.ceil(total / limit)), entityTypes });
});

module.exports = { listAuditLogs };
