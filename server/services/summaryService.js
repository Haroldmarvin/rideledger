/**
 * Database-backed summaries. Aggregation sums integer cents (exact), then the pure
 * calculations module derives every figure. This is the authoritative calculation path.
 *
 * The pipelines deliberately use only basic operators ($match, $group, $sum) so they run
 * on MongoDB and on MongoDB-compatible services.
 */
const mongoose = require('mongoose');
const { Delivery, Expense } = require('../models');
const { summarizeGroups } = require('./calculations');

const toId = (v) => (v instanceof mongoose.Types.ObjectId ? v : new mongoose.Types.ObjectId(String(v)));

/**
 * Build a Mongo match for deliveries from normalized filters.
 * filters: { from, to, rider, bike, status, paymentMethod, outstandingOnly, searchRegex, customerRegex }
 */
function deliveryMatch(filters = {}) {
  const m = {};
  if (filters.from || filters.to) {
    m.date = {};
    if (filters.from) m.date.$gte = filters.from;
    if (filters.to) m.date.$lte = filters.to;
  }
  if (filters.rider) m.rider = toId(filters.rider);
  if (filters.bike) m.bike = toId(filters.bike);
  if (filters.status) m.status = filters.status;
  if (filters.paymentMethod) m.paymentMethod = filters.paymentMethod;
  if (filters.outstandingOnly) m.outstandingAmount = { $gt: 0 };
  if (filters.searchRegex) {
    m.$or = [
      { deliveryId: filters.searchRegex },
      { customerName: filters.searchRegex },
      { customerPhone: filters.searchRegex },
      { orderReference: filters.searchRegex },
    ];
  }
  if (filters.customerRegex) m.customerName = filters.customerRegex;
  return m;
}

function expenseMatch(filters = {}, status) {
  const m = {};
  if (filters.from || filters.to) {
    m.date = {};
    if (filters.from) m.date.$gte = filters.from;
    if (filters.to) m.date.$lte = filters.to;
  }
  if (filters.rider) m.rider = toId(filters.rider);
  if (status) m.status = status;
  return m;
}

/**
 * Group deliveries by `extraKeys` + status + paymentMethod.
 * Returns rows: { key: {...extraKeys values}, status, paymentMethod, count, fees, collected, outstanding, extra }.
 */
async function groupDeliveries(match, extraKeys = {}) {
  const rows = await Delivery.aggregate([
    { $match: match },
    {
      $group: {
        _id: { ...extraKeys, status: '$status', paymentMethod: '$paymentMethod' },
        count: { $sum: 1 },
        fees: { $sum: '$deliveryFee' },
        collected: { $sum: '$amountCollected' },
        outstanding: { $sum: '$outstandingAmount' },
        extra: { $sum: '$extraCollected' },
      },
    },
  ]);
  return rows.map((g) => ({
    key: g._id,
    status: g._id.status,
    paymentMethod: g._id.paymentMethod,
    count: g.count,
    fees: g.fees,
    collected: g.collected,
    outstanding: g.outstanding,
    extra: g.extra,
  }));
}

async function approvedExpensesTotal(filters) {
  const [row] = await Expense.aggregate([
    { $match: expenseMatch(filters, 'Approved') },
    { $group: { _id: null, total: { $sum: '$amount' } } },
  ]);
  return row ? row.total : 0;
}

/** Full summary for a filter set. Expenses only honour date + rider filters. */
async function getSummary(filters = {}) {
  const [groups, approved] = await Promise.all([
    groupDeliveries(deliveryMatch(filters)),
    approvedExpensesTotal(filters),
  ]);
  return summarizeGroups(groups, approved);
}

/** Per-day summaries (for trend charts and weekly/monthly reports). */
async function getDailySummaries(filters = {}) {
  const [groups, expenses] = await Promise.all([
    groupDeliveries(deliveryMatch(filters), { date: '$date' }),
    Expense.aggregate([
      { $match: expenseMatch(filters, 'Approved') },
      { $group: { _id: '$date', total: { $sum: '$amount' } } },
    ]),
  ]);
  const expMap = new Map(expenses.map((e) => [e._id, e.total]));
  const byDate = new Map();
  for (const g of groups) {
    const d = g.key.date;
    if (!byDate.has(d)) byDate.set(d, []);
    byDate.get(d).push(g);
  }
  for (const d of expMap.keys()) if (!byDate.has(d)) byDate.set(d, []);
  return [...byDate.entries()]
    .sort(([a], [b]) => (a < b ? -1 : 1))
    .map(([date, gs]) => ({ date, ...summarizeGroups(gs, expMap.get(date) || 0) }));
}

/** Per-rider summaries (rider performance). Returns { [riderId]: summary }. */
async function getRiderSummaries(filters = {}) {
  const [groups, expenses] = await Promise.all([
    groupDeliveries(deliveryMatch(filters), { rider: '$rider' }),
    Expense.aggregate([
      { $match: expenseMatch(filters, 'Approved') },
      { $group: { _id: '$rider', total: { $sum: '$amount' } } },
    ]),
  ]);
  const expMap = new Map(expenses.map((e) => [String(e._id), e.total]));
  const byRider = new Map();
  for (const g of groups) {
    const r = String(g.key.rider);
    if (!byRider.has(r)) byRider.set(r, []);
    byRider.get(r).push(g);
  }
  for (const r of expMap.keys()) if (!byRider.has(r)) byRider.set(r, []);
  const out = {};
  for (const [r, gs] of byRider) out[r] = summarizeGroups(gs, expMap.get(r) || 0);
  return out;
}

module.exports = { getSummary, getDailySummaries, getRiderSummaries, deliveryMatch, expenseMatch };
