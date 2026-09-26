/**
 * Builds report data structures used by the on-screen view, Excel and PDF exporters.
 * Every figure comes from server-side aggregation / pure calculation functions.
 */
const { Delivery, Expense, DailyCloseout, Rider, Bike, Setting } = require('../models');
const { getSummary, getDailySummaries, getRiderSummaries, deliveryMatch } = require('./summaryService');
const { parseFilters, describeFilters } = require('../utils/filters');
const { EXPENSE_STATUSES } = require('../config/constants');
const { businessDate, startOfWeek, addDays, startOfMonth, endOfMonth, eachDate } = require('../utils/dates');
const { qs } = require('../utils/helpers');
const ApiError = require('../utils/ApiError');

const REPORT_TYPES = Object.freeze({
  daily: 'Daily Delivery Report',
  rider: 'Individual Rider Report',
  weekly: 'Weekly Delivery Report',
  monthly: 'Monthly Delivery Report',
  revenue: 'Revenue / Fees Report',
  collections: 'Payment Collection Report',
  outstanding: 'Outstanding / Unpaid Delivery Report',
  expenses: 'Expense Report',
  performance: 'Rider Performance Report',
  reconciliation: 'Cash Reconciliation Report',
});

const MAX_DETAIL_ROWS = 5000;

const DELIVERY_COLUMNS = [
  { key: 'deliveryId', label: 'Delivery ID', width: 18 },
  { key: 'date', label: 'Date', width: 11 },
  { key: 'time', label: 'Time', width: 7 },
  { key: 'rider', label: 'Rider', width: 18 },
  { key: 'bike', label: 'Bike', width: 9 },
  { key: 'customer', label: 'Customer', width: 18 },
  { key: 'phone', label: 'Phone', width: 14, pdf: false },
  { key: 'pickup', label: 'Pickup', width: 16, pdf: false },
  { key: 'destination', label: 'Destination', width: 18 },
  { key: 'fee', label: 'Fee', format: 'money', total: true, width: 11 },
  { key: 'collected', label: 'Collected', format: 'money', total: true, width: 11 },
  { key: 'extra', label: 'Extra (order $)', format: 'money', total: true, width: 12 },
  { key: 'outstanding', label: 'Outstanding', format: 'money', total: true, width: 12 },
  { key: 'paymentMethod', label: 'Payment', width: 13 },
  { key: 'status', label: 'Status', width: 10 },
];

const DAILY_COLUMNS = [
  { key: 'date', label: 'Date', width: 12 },
  { key: 'deliveries', label: 'Deliveries', format: 'int', total: true },
  { key: 'delivered', label: 'Delivered', format: 'int', total: true },
  { key: 'failed', label: 'Failed', format: 'int', total: true },
  { key: 'returned', label: 'Returned', format: 'int', total: true },
  { key: 'cancelled', label: 'Cancelled', format: 'int', total: true },
  { key: 'totalFees', label: 'Fees', format: 'money', total: true },
  { key: 'totalCollected', label: 'Collected', format: 'money', total: true },
  { key: 'extraCollected', label: 'Extra (order $)', format: 'money', total: true, width: 14 },
  { key: 'cashCollected', label: 'Cash', format: 'money', total: true },
  { key: 'electronicCollected', label: 'Electronic', format: 'money', total: true },
  { key: 'outstanding', label: 'Outstanding', format: 'money', total: true },
  { key: 'approvedExpenses', label: 'Expenses', format: 'money', total: true },
  { key: 'expectedHandover', label: 'Expected Handover', format: 'money', total: true, width: 16 },
];

function deliveryRow(d) {
  return {
    deliveryId: d.deliveryId, date: d.date, time: d.time,
    rider: d.rider ? d.rider.name : '', bike: d.bike ? d.bike.bikeId : '',
    customer: d.customerName, phone: d.customerPhone, pickup: d.pickupLocation, destination: d.destination,
    orderReference: d.orderReference || '',
    fee: d.deliveryFee, collected: d.amountCollected, extra: d.extraCollected || 0, outstanding: d.outstandingAmount,
    paymentMethod: d.paymentMethod, status: d.status,
  };
}

function computeTotals(columns, rows) {
  const totals = {};
  for (const c of columns) {
    if (!c.total) continue;
    totals[c.key] = rows.reduce((s, r) => s + (Number.isInteger(r[c.key]) ? r[c.key] : 0), 0);
  }
  return totals;
}

function summaryBlock(s, extra = []) {
  return [
    { label: 'Deliveries', value: s.deliveries, format: 'int' },
    { label: 'Delivered', value: s.delivered, format: 'int' },
    { label: 'Failed', value: s.failed, format: 'int' },
    { label: 'Returned', value: s.returned, format: 'int' },
    { label: 'Cancelled', value: s.cancelled, format: 'int' },
    { label: 'Total Fees', value: s.totalFees, format: 'money' },
    { label: 'Total Collected', value: s.totalCollected, format: 'money' },
    { label: 'Extra Collected (order money)', value: s.extraCollected, format: 'money' },
    { label: 'Cash', value: s.cashCollected, format: 'money' },
    { label: 'Mobile Money', value: s.mobileMoneyCollected, format: 'money' },
    { label: 'Bank Transfer', value: s.bankCollected, format: 'money' },
    { label: 'Outstanding', value: s.outstanding, format: 'money' },
    { label: 'Approved Expenses', value: s.approvedExpenses, format: 'money' },
    { label: 'Expected Cash Handover', value: s.expectedHandover, format: 'money' },
    ...extra,
  ];
}

function defaultRange(type, query) {
  const today = businessDate();
  const hasRange = qs(query.from) || qs(query.to) || qs(query.date);
  if (hasRange) return {};
  if (type === 'daily') return { from: today, to: today };
  if (type === 'weekly') { const f = startOfWeek(today); return { from: f, to: addDays(f, 6) }; }
  return { from: startOfMonth(today), to: endOfMonth(today) };
}

async function fetchDeliveries(filters) {
  return Delivery.find(deliveryMatch(filters)).sort({ date: 1, recordedAt: 1 }).limit(MAX_DETAIL_ROWS)
    .populate('rider', 'name riderId').populate('bike', 'bikeId').lean();
}

async function buildReport(type, query = {}, user) {
  if (!REPORT_TYPES[type]) throw ApiError.badRequest('Please choose a valid report type.');
  const q = { ...query };
  let expenseStatus = qs(q.expenseStatus);
  if (EXPENSE_STATUSES.includes(qs(q.status))) { expenseStatus = qs(q.status); delete q.status; }
  const filters = parseFilters({ ...q, ...defaultRange(type, q) }, user);
  if (!filters.from || !filters.to) {
    const range = defaultRange(type, {});
    filters.from = filters.from || range.from;
    filters.to = filters.to || filters.from;
  }
  if (eachDate(filters.from, filters.to, 1000).length > 732) throw ApiError.badRequest('Please choose a date range of two years or less.');

  const [settings, riderDoc, bikeDoc] = await Promise.all([
    Setting.get(),
    filters.rider ? Rider.findById(filters.rider).lean() : null,
    filters.bike ? Bike.findById(filters.bike).lean() : null,
  ]);
  if (expenseStatus && EXPENSE_STATUSES.includes(expenseStatus)) filters.expenseStatus = expenseStatus;

  const report = {
    type,
    title: REPORT_TYPES[type],
    company: settings.companyName || 'RideLedger',
    currencySymbol: settings.currencySymbol || '$',
    period: { from: filters.from, to: filters.to },
    generatedAt: new Date().toISOString(),
    generatedBy: user ? user.name : 'System',
    filters: describeFilters(filters, { rider: riderDoc ? `${riderDoc.name} (${riderDoc.riderId})` : undefined, bike: bikeDoc ? bikeDoc.bikeId : undefined }),
    summary: [], columns: [], rows: [], totals: {}, notes: [],
  };

  switch (type) {
    case 'daily':
    case 'rider':
    case 'outstanding': {
      if (type === 'rider' && !filters.rider) throw ApiError.badRequest('Please choose a rider for the Individual Rider Report.');
      const f = type === 'outstanding' ? { ...filters, outstandingOnly: true } : filters;
      const [summary, deliveries] = await Promise.all([getSummary(f), fetchDeliveries(f)]);
      report.columns = DELIVERY_COLUMNS;
      report.rows = deliveries.map(deliveryRow);
      if (type === 'outstanding') {
        report.summary = [
          { label: 'Unpaid / part-paid deliveries', value: summary.deliveries, format: 'int' },
          { label: 'Total fees on these deliveries', value: summary.totalFees, format: 'money' },
          { label: 'Collected so far', value: summary.totalCollected, format: 'money' },
          { label: 'Total outstanding', value: summary.outstanding, format: 'money' },
        ];
      } else if (type === 'rider') {
        const closeouts = await DailyCloseout.find({ rider: filters.rider, date: { $gte: filters.from, $lte: filters.to }, status: 'Confirmed' }).lean();
        report.summary = summaryBlock(summary, [
          { label: 'Amount handed over (confirmed)', value: closeouts.reduce((s, c) => s + c.actualHandover, 0), format: 'money' },
          { label: 'Handover differences', value: closeouts.reduce((s, c) => s + c.difference, 0), format: 'money' },
        ]);
      } else {
        report.summary = summaryBlock(summary);
      }
      if (deliveries.length >= MAX_DETAIL_ROWS) report.notes.push(`Detail limited to the first ${MAX_DETAIL_ROWS} records. Narrow the date range for a complete list.`);
      break;
    }
    case 'weekly':
    case 'monthly':
    case 'revenue': {
      const [summary, daily] = await Promise.all([getSummary(filters), getDailySummaries(filters)]);
      const map = new Map(daily.map((d) => [d.date, d]));
      const empty = { deliveries: 0, delivered: 0, failed: 0, returned: 0, cancelled: 0, totalFees: 0, totalCollected: 0, extraCollected: 0, cashCollected: 0, electronicCollected: 0, outstanding: 0, approvedExpenses: 0, expectedHandover: 0 };
      const rows = eachDate(filters.from, filters.to, 800).map((date) => ({ ...empty, ...(map.get(date) || {}), date }));
      if (type === 'revenue') {
        report.columns = [
          { key: 'date', label: 'Date', width: 12 },
          { key: 'deliveries', label: 'Deliveries', format: 'int', total: true },
          { key: 'totalFees', label: 'Fees Charged', format: 'money', total: true, width: 14 },
          { key: 'totalCollected', label: 'Amount Collected', format: 'money', total: true, width: 16 },
          { key: 'extraCollected', label: 'Extra (order $)', format: 'money', total: true, width: 14 },
          { key: 'outstanding', label: 'Outstanding', format: 'money', total: true, width: 14 },
        ];
        report.summary = [
          { label: 'Total Fees Charged', value: summary.totalFees, format: 'money' },
          { label: 'Total Collected', value: summary.totalCollected, format: 'money' },
          { label: 'Extra Collected (order money)', value: summary.extraCollected, format: 'money' },
          { label: 'Outstanding', value: summary.outstanding, format: 'money' },
          { label: 'Deliveries', value: summary.deliveries, format: 'int' },
        ];
      } else {
        report.columns = DAILY_COLUMNS;
        report.summary = summaryBlock(summary);
      }
      report.rows = rows;
      break;
    }
    case 'collections': {
      const [summary, daily] = await Promise.all([getSummary(filters), getDailySummaries(filters)]);
      const map = new Map(daily.map((d) => [d.date, d]));
      report.columns = [
        { key: 'date', label: 'Date', width: 12 },
        { key: 'cashCollected', label: 'Cash', format: 'money', total: true },
        { key: 'mobileMoneyCollected', label: 'Mobile Money', format: 'money', total: true, width: 14 },
        { key: 'bankCollected', label: 'Bank Transfer', format: 'money', total: true, width: 14 },
        { key: 'otherCollected', label: 'Other', format: 'money', total: true },
        { key: 'totalCollected', label: 'Total Collected', format: 'money', total: true, width: 15 },
        { key: 'creditCount', label: 'Credit Deliveries', format: 'int', total: true, width: 15 },
        { key: 'outstanding', label: 'Outstanding', format: 'money', total: true },
      ];
      report.rows = eachDate(filters.from, filters.to, 800).map((date) => {
        const d = map.get(date) || {};
        return { date, cashCollected: d.cashCollected || 0, mobileMoneyCollected: d.mobileMoneyCollected || 0, bankCollected: d.bankCollected || 0, otherCollected: d.otherCollected || 0, totalCollected: d.totalCollected || 0, creditCount: d.creditCount || 0, outstanding: d.outstanding || 0 };
      });
      report.summary = [
        { label: 'Cash', value: summary.cashCollected, format: 'money' },
        { label: 'Mobile Money', value: summary.mobileMoneyCollected, format: 'money' },
        { label: 'Bank Transfer', value: summary.bankCollected, format: 'money' },
        { label: 'Other', value: summary.otherCollected, format: 'money' },
        { label: 'Total Collected', value: summary.totalCollected, format: 'money' },
        { label: 'Credit / Outstanding', value: summary.outstanding, format: 'money' },
      ];
      break;
    }
    case 'expenses': {
      const match = { date: { $gte: filters.from, $lte: filters.to } };
      if (filters.rider) match.rider = filters.rider;
      if (filters.expenseStatus) match.status = filters.expenseStatus;
      const expenses = await Expense.find(match).sort({ date: 1, createdAt: 1 }).limit(MAX_DETAIL_ROWS).populate('rider', 'name riderId').populate('reviewedBy', 'name').lean();
      report.columns = [
        { key: 'expenseId', label: 'Expense ID', width: 18 },
        { key: 'date', label: 'Date', width: 11 },
        { key: 'rider', label: 'Rider', width: 18 },
        { key: 'category', label: 'Category', width: 20 },
        { key: 'description', label: 'Description', width: 28 },
        { key: 'amount', label: 'Amount', format: 'money', total: true },
        { key: 'status', label: 'Status', width: 10 },
        { key: 'reviewedBy', label: 'Reviewed By', width: 16, pdf: false },
        { key: 'rejectionReason', label: 'Rejection Reason', width: 24, pdf: false },
      ];
      report.rows = expenses.map((e) => ({
        expenseId: e.expenseId, date: e.date, rider: e.rider ? e.rider.name : '', category: e.category,
        description: e.description, amount: e.amount, status: e.status, reviewedBy: e.reviewedBy ? e.reviewedBy.name : '', rejectionReason: e.rejectionReason || '',
      }));
      const by = (s) => expenses.filter((e) => e.status === s).reduce((t, e) => t + e.amount, 0);
      report.summary = [
        { label: 'Expenses', value: expenses.length, format: 'int' },
        { label: 'Approved', value: by('Approved'), format: 'money' },
        { label: 'Pending', value: by('Pending'), format: 'money' },
        { label: 'Rejected', value: by('Rejected'), format: 'money' },
      ];
      report.notes.push('Only APPROVED expenses reduce the expected cash handover.');
      break;
    }
    case 'performance': {
      const [perRider, riders, closeouts] = await Promise.all([
        getRiderSummaries(filters),
        Rider.find(filters.rider ? { _id: filters.rider } : {}).sort({ name: 1 }).lean(),
        DailyCloseout.find({ date: { $gte: filters.from, $lte: filters.to }, status: 'Confirmed', ...(filters.rider ? { rider: filters.rider } : {}) }).lean(),
      ]);
      const handed = new Map();
      for (const c of closeouts) {
        const k = String(c.rider);
        const h = handed.get(k) || { actual: 0, difference: 0 };
        h.actual += c.actualHandover; h.difference += c.difference;
        handed.set(k, h);
      }
      report.columns = [
        { key: 'rider', label: 'Rider', width: 20 },
        { key: 'deliveries', label: 'Deliveries', format: 'int', total: true },
        { key: 'delivered', label: 'Delivered', format: 'int', total: true },
        { key: 'failed', label: 'Failed', format: 'int', total: true },
        { key: 'returned', label: 'Returned', format: 'int', total: true },
        { key: 'cancelled', label: 'Cancelled', format: 'int', total: true },
        { key: 'fees', label: 'Fees', format: 'money', total: true },
        { key: 'collected', label: 'Collected', format: 'money', total: true },
        { key: 'extra', label: 'Extra (order $)', format: 'money', total: true },
        { key: 'cash', label: 'Cash', format: 'money', total: true },
        { key: 'outstanding', label: 'Outstanding', format: 'money', total: true },
        { key: 'expenses', label: 'Expenses', format: 'money', total: true },
        { key: 'due', label: 'Amount Due', format: 'money', total: true },
        { key: 'handedOver', label: 'Handed Over', format: 'money', total: true },
        { key: 'difference', label: 'Difference', format: 'money', total: true },
      ];
      report.rows = riders
        .map((r) => {
          const s = perRider[String(r._id)];
          const h = handed.get(String(r._id)) || { actual: 0, difference: 0 };
          if (!s && !h.actual && r.status !== 'active') return null;
          return {
            rider: `${r.name}${r.status !== 'active' ? ' (inactive)' : ''}`,
            deliveries: s ? s.deliveries : 0, delivered: s ? s.delivered : 0, failed: s ? s.failed : 0, returned: s ? s.returned : 0, cancelled: s ? s.cancelled : 0,
            fees: s ? s.totalFees : 0, collected: s ? s.totalCollected : 0, extra: s ? s.extraCollected : 0, cash: s ? s.cashCollected : 0, outstanding: s ? s.outstanding : 0,
            expenses: s ? s.approvedExpenses : 0, due: s ? s.expectedHandover : 0, handedOver: h.actual, difference: h.difference,
          };
        })
        .filter(Boolean);
      report.notes.push('Factual metrics only. "Handed Over" and "Difference" include management-confirmed closeouts only.');
      break;
    }
    case 'reconciliation': {
      const match = { date: { $gte: filters.from, $lte: filters.to } };
      if (filters.rider) match.rider = filters.rider;
      const closeouts = await DailyCloseout.find(match).sort({ date: 1 }).populate('rider', 'name riderId').populate('receivedBy', 'name').lean();
      report.columns = [
        { key: 'closeoutId', label: 'Closeout ID', width: 18 },
        { key: 'date', label: 'Date', width: 11 },
        { key: 'rider', label: 'Rider', width: 18 },
        { key: 'cashCollected', label: 'Cash Collected', format: 'money', total: true, width: 14 },
        { key: 'approvedExpenses', label: 'Approved Expenses', format: 'money', total: true, width: 16 },
        { key: 'expectedHandover', label: 'Expected', format: 'money', total: true },
        { key: 'declaredHandover', label: 'Declared', format: 'money', total: true, pdf: false },
        { key: 'actualHandover', label: 'Actual', format: 'money', total: true },
        { key: 'difference', label: 'Difference', format: 'money', total: true },
        { key: 'differenceStatus', label: 'Result', width: 8 },
        { key: 'status', label: 'Status', width: 10 },
        { key: 'receivedBy', label: 'Received By', width: 16 },
      ];
      report.rows = closeouts.map((c) => ({
        closeoutId: c.closeoutId, date: c.date, rider: c.rider ? c.rider.name : '',
        cashCollected: c.cashCollected, approvedExpenses: c.approvedExpenses, expectedHandover: c.expectedHandover,
        declaredHandover: c.declaredHandover, actualHandover: c.actualHandover, difference: c.difference,
        differenceStatus: c.differenceStatus, status: c.status, receivedBy: c.receivedBy ? c.receivedBy.name : '',
      }));
      const confirmed = closeouts.filter((c) => c.status === 'Confirmed');
      report.summary = [
        { label: 'Closeouts', value: closeouts.length, format: 'int' },
        { label: 'Confirmed', value: confirmed.length, format: 'int' },
        { label: 'Awaiting confirmation', value: closeouts.filter((c) => c.status === 'Submitted').length, format: 'int' },
        { label: 'Expected (confirmed)', value: confirmed.reduce((s, c) => s + c.expectedHandover, 0), format: 'money' },
        { label: 'Received (confirmed)', value: confirmed.reduce((s, c) => s + c.actualHandover, 0), format: 'money' },
        { label: 'Net difference', value: confirmed.reduce((s, c) => s + c.difference, 0), format: 'money' },
        { label: 'Short days', value: confirmed.filter((c) => c.difference < 0).length, format: 'int' },
      ];
      break;
    }
    default:
      throw ApiError.badRequest('Unknown report type.');
  }

  report.totals = computeTotals(report.columns, report.rows);
  return report;
}

module.exports = { buildReport, REPORT_TYPES };
