const { DailyCloseout, Delivery, Expense } = require('../models');
const { LOCKING_CLOSEOUT_STATUSES } = require('../config/constants');
const { getSummary } = require('./summaryService');
const { buildCloseoutFigures } = require('./calculations');
const { isDayLocked } = require('./policy');
const { audit } = require('./audit');

async function findCloseout(riderId, date) {
  if (!riderId || !date) return null;
  return DailyCloseout.findOne({ rider: riderId, date });
}

async function isLocked(riderId, date) {
  return isDayLocked(await findCloseout(riderId, date));
}

/** Server-authoritative figures for one rider-day. */
async function computeDay(riderId, date, actualHandover = 0) {
  const summary = await getSummary({ rider: riderId, from: date, to: date });
  const pendingExpenses = await Expense.countDocuments({ rider: riderId, date, status: 'Pending' });
  return { summary, pendingExpenses, figures: buildCloseoutFigures(summary, actualHandover) };
}

/** Mark the day's records as belonging to a closed period (or clear it). */
async function stampClosedPeriod(closeout, clear = false) {
  const value = clear ? null : closeout._id;
  await Delivery.updateMany({ rider: closeout.rider, date: closeout.date }, { $set: { closedPeriod: value } });
  await Expense.updateMany({ rider: closeout.rider, date: closeout.date }, { $set: { closedPeriod: value } });
}

/**
 * Recalculate a locked closeout after an authorized correction. Keeps the actual handover,
 * recomputes expected + difference, and audits the change.
 */
async function recalculateCloseout(req, riderId, date) {
  const closeout = await DailyCloseout.findOne({ rider: riderId, date, status: { $in: LOCKING_CLOSEOUT_STATUSES } });
  if (!closeout) return null;
  const before = closeout.toObject();
  const { figures } = await computeDay(riderId, date, closeout.actualHandover);
  Object.assign(closeout, figures, { recalculatedAt: new Date() });
  await closeout.save();
  await audit(req, {
    action: 'System recalculated closeout after correction',
    entityType: 'DailyCloseout', entityId: closeout._id, entityRef: closeout.closeoutId, rider: riderId,
    previousData: { expectedHandover: before.expectedHandover, difference: before.difference, cashCollected: before.cashCollected, approvedExpenses: before.approvedExpenses },
    newData: { expectedHandover: closeout.expectedHandover, difference: closeout.difference, cashCollected: closeout.cashCollected, approvedExpenses: closeout.approvedExpenses },
  });
  return closeout;
}

module.exports = { findCloseout, isLocked, computeDay, stampClosedPeriod, recalculateCloseout };
