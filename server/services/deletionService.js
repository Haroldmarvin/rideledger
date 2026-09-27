/**
 * Management deletions. Every delete:
 *  - removes linked records that would otherwise be orphaned (corrections, receipts, logins),
 *  - recalculates the rider's handover for that day if the day was already submitted/closed,
 *  - writes an audit entry holding a full copy of what was removed (the audit log itself is never deletable).
 */
const { Delivery, Expense, DailyCloseout, CorrectionRequest, Rider, User, Bike } = require('../models');
const { recalculateCloseout } = require('./closeoutService');
const { getStorage } = require('./storage');
const { audit } = require('./audit');

const plain = (doc) => (doc && typeof doc.toObject === 'function' ? doc.toObject() : doc);

async function removeReceipt(expense) {
  const r = expense && expense.receipt;
  if (r && r.key) await getStorage(r.provider).remove(r.key).catch(() => {});
}

async function deleteDelivery(req, delivery, reason = '') {
  const copy = plain(delivery);
  await CorrectionRequest.deleteMany({ entityType: 'Delivery', entityId: delivery._id });
  await Delivery.deleteOne({ _id: delivery._id });
  await audit(req, {
    action: 'Admin deleted delivery',
    entityType: 'Delivery', entityId: delivery._id, entityRef: delivery.deliveryId, rider: delivery.rider,
    previousData: copy, newData: reason ? { reason } : null,
  });
  await recalculateCloseout(req, delivery.rider, delivery.date);
}

async function deleteExpense(req, expense, reason = '') {
  const copy = plain(expense);
  await CorrectionRequest.deleteMany({ entityType: 'Expense', entityId: expense._id });
  await Expense.deleteOne({ _id: expense._id });
  await removeReceipt(expense);
  await audit(req, {
    action: 'Admin deleted expense',
    entityType: 'Expense', entityId: expense._id, entityRef: expense.expenseId, rider: expense.rider,
    previousData: copy, newData: reason ? { reason } : null,
  });
  if (expense.status === 'Approved') await recalculateCloseout(req, expense.rider, expense.date);
}

/** Removing a handover unlocks that rider-day again. */
async function deleteCloseout(req, closeout, reason = '') {
  const copy = plain(closeout);
  await Promise.all([
    Delivery.updateMany({ rider: closeout.rider, date: closeout.date }, { $set: { closedPeriod: null } }),
    Expense.updateMany({ rider: closeout.rider, date: closeout.date }, { $set: { closedPeriod: null } }),
  ]);
  await DailyCloseout.deleteOne({ _id: closeout._id });
  await audit(req, {
    action: 'Admin deleted closeout (day unlocked)',
    entityType: 'DailyCloseout', entityId: closeout._id, entityRef: closeout.closeoutId, rider: closeout.rider,
    previousData: copy, newData: reason ? { reason } : null,
  });
}

/** Count what a rider has, so the UI can warn before a cascading delete. */
async function riderFootprint(riderId) {
  const [deliveries, expenses, closeouts] = await Promise.all([
    Delivery.countDocuments({ rider: riderId }),
    Expense.countDocuments({ rider: riderId }),
    DailyCloseout.countDocuments({ rider: riderId }),
  ]);
  return { deliveries, expenses, closeouts, total: deliveries + expenses + closeouts };
}

/** Deletes the rider, their login, and (when cascade) every delivery, expense, handover and correction of theirs. */
async function deleteRider(req, rider, { cascade = false, reason = '' } = {}) {
  const footprint = await riderFootprint(rider._id);
  if (footprint.total > 0 && !cascade) return { blocked: true, footprint };

  if (cascade && footprint.total > 0) {
    const expenses = await Expense.find({ rider: rider._id, 'receipt.key': { $exists: true } }).lean();
    await Promise.all(expenses.map(removeReceipt));
    await Promise.all([
      Delivery.deleteMany({ rider: rider._id }),
      Expense.deleteMany({ rider: rider._id }),
      DailyCloseout.deleteMany({ rider: rider._id }),
      CorrectionRequest.deleteMany({ rider: rider._id }),
    ]);
  }
  await Bike.updateMany({ assignedRider: rider._id }, { $set: { assignedRider: null } });
  await User.deleteMany({ rider: rider._id });
  await Rider.deleteOne({ _id: rider._id });
  await audit(req, {
    action: footprint.total > 0 ? 'Admin deleted rider and all their records' : 'Admin deleted rider',
    entityType: 'Rider', entityId: rider._id, entityRef: rider.riderId, rider: rider._id,
    previousData: { ...plain(rider), recordsDeleted: footprint },
    newData: reason ? { reason } : null,
  });
  return { blocked: false, footprint };
}

async function deleteBike(req, bike, reason = '') {
  const copy = plain(bike);
  await Rider.updateMany({ bike: bike._id }, { $set: { bike: null } });
  await Bike.deleteOne({ _id: bike._id });
  await audit(req, {
    action: 'Admin deleted bike',
    entityType: 'Bike', entityId: bike._id, entityRef: bike.bikeId,
    previousData: copy, newData: reason ? { reason } : null,
  });
}

module.exports = { deleteDelivery, deleteExpense, deleteCloseout, deleteRider, deleteBike, riderFootprint };
