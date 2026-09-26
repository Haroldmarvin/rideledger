/**
 * Pure authorization / business-rule policy functions.
 * Controllers call these so the rules live in one testable place.
 */
const { ROLES, LOCKING_CLOSEOUT_STATUSES } = require('../config/constants');

const isAdmin = (user) => Boolean(user && user.role === ROLES.ADMIN);
const isRider = (user) => Boolean(user && user.role === ROLES.RIDER);

function idOf(v) {
  if (!v) return null;
  if (typeof v === 'string') return v;
  if (v._id) return String(v._id);
  return String(v);
}

/** Can this user view a record belonging to riderId? */
function canView(user, recordRiderId) {
  if (isAdmin(user)) return true;
  return isRider(user) && idOf(user.rider) !== null && idOf(user.rider) === idOf(recordRiderId);
}

/** Is a rider's day locked given its closeout (or null)? */
function isDayLocked(closeout) {
  return Boolean(closeout && LOCKING_CLOSEOUT_STATUSES.includes(closeout.status));
}

/**
 * Can this user directly modify a record?
 * Returns { allowed, reason, requiresCorrection }.
 */
function canModify(user, record, closeout) {
  if (!user || !record) return { allowed: false, reason: 'Record not found.' };
  const locked = isDayLocked(closeout);
  if (isAdmin(user)) {
    // Management can correct locked records, but must give a reason (enforced by controller)
    return { allowed: true, requiresReason: locked, locked };
  }
  if (!canView(user, record.rider)) return { allowed: false, reason: 'Record not found.' };
  if (locked) {
    return {
      allowed: false,
      locked: true,
      requiresCorrection: true,
      reason: closeout.status === 'Confirmed'
        ? 'This day has been closed. Submit a correction request for management to approve.'
        : 'You have already submitted your handover for this day. Submit a correction request or ask management to return the closeout.',
    };
  }
  return { allowed: true, locked: false };
}

/** Riders may only change these statuses of their own expenses (only while pending). */
function canRiderEditExpense(user, expense, closeout) {
  const base = canModify(user, expense, closeout);
  if (!base.allowed || isAdmin(user)) return base;
  if (expense.status !== 'Pending') {
    return { allowed: false, reason: `This expense has already been ${expense.status.toLowerCase()} and can no longer be edited.` };
  }
  return base;
}

/** Scope a Mongo filter so riders only ever see their own records. */
function scopeFilter(user, filter = {}) {
  if (isAdmin(user)) return filter;
  return { ...filter, rider: user.rider };
}

module.exports = { isAdmin, isRider, canView, isDayLocked, canModify, canRiderEditExpense, scopeFilter, idOf };
