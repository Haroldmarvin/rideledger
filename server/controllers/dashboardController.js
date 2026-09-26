const { Delivery, Expense, DailyCloseout, CorrectionRequest, Rider } = require('../models');
const { getSummary, getDailySummaries, getRiderSummaries, deliveryMatch } = require('../services/summaryService');
const { findCloseout } = require('../services/closeoutService');
const { parseFilters } = require('../utils/filters');
const { businessDate, addDays, eachDate, isValidDateString } = require('../utils/dates');
const { asyncHandler, qs } = require('../utils/helpers');
const ApiError = require('../utils/ApiError');

/** Management dashboard — every figure recalculates from the selected filters. */
const adminDashboard = asyncHandler(async (req, res) => {
  const filters = parseFilters(req.query, req.user, { defaultToday: true });

  // Trend: at least the last 14 days ending at "to" so the chart is always meaningful
  const trendTo = filters.to;
  const trendFrom = filters.from < addDays(trendTo, -13) ? filters.from : addDays(trendTo, -13);
  const trendFilters = { ...filters, from: trendFrom, to: trendTo };

  const [summary, daily, perRider, riders, recent, pendingExpenses, submittedCloseouts, pendingCorrections] = await Promise.all([
    getSummary(filters),
    getDailySummaries(trendFilters),
    getRiderSummaries(filters),
    Rider.find().select('riderId name status').sort({ name: 1 }).lean(),
    Delivery.find(deliveryMatch(filters)).sort({ date: -1, recordedAt: -1 }).limit(8).populate('rider', 'name riderId').populate('bike', 'bikeId').lean(),
    Expense.countDocuments({ status: 'Pending' }),
    DailyCloseout.countDocuments({ status: 'Submitted' }),
    CorrectionRequest.countDocuments({ status: 'Pending' }),
  ]);

  const dailyMap = new Map(daily.map((d) => [d.date, d]));
  const trend = eachDate(trendFrom, trendTo, 120).map((date) => {
    const d = dailyMap.get(date);
    return { date, deliveries: d ? d.deliveries : 0, delivered: d ? d.delivered : 0, fees: d ? d.totalFees : 0, collected: d ? d.totalCollected : 0 };
  });

  const paymentBreakdown = [
    { method: 'Cash', amount: summary.cashCollected },
    { method: 'Mobile Money', amount: summary.mobileMoneyCollected },
    { method: 'Bank Transfer', amount: summary.bankCollected },
    { method: 'Other', amount: summary.otherCollected },
    { method: 'Credit/Outstanding', amount: summary.outstanding },
  ];

  const riderPerformance = riders
    .filter((r) => perRider[String(r._id)] || r.status === 'active')
    .filter((r) => !filters.rider || String(r._id) === String(filters.rider))
    .map((r) => {
      const s = perRider[String(r._id)];
      return {
        rider: { _id: r._id, riderId: r.riderId, name: r.name, status: r.status },
        deliveries: s ? s.deliveries : 0,
        delivered: s ? s.delivered : 0,
        fees: s ? s.totalFees : 0,
        collected: s ? s.totalCollected : 0,
        outstanding: s ? s.outstanding : 0,
        expenses: s ? s.approvedExpenses : 0,
        expectedHandover: s ? s.expectedHandover : 0,
      };
    })
    .sort((a, b) => b.deliveries - a.deliveries);

  res.json({
    filters: { from: filters.from, to: filters.to },
    kpis: { ...summary, netAmountDue: summary.expectedHandover },
    trend, paymentBreakdown, riderPerformance, recent,
    pending: { expenses: pendingExpenses, closeouts: submittedCloseouts, corrections: pendingCorrections },
  });
});

/** Rider home screen: today's (or a chosen day's) own summary. */
const riderDashboard = asyncHandler(async (req, res) => {
  const date = qs(req.query.date) || businessDate();
  if (!isValidDateString(date)) throw ApiError.badRequest('Please choose a valid date.');
  const riderId = req.user.rider;
  const [summary, closeout, recent, pendingExpenses, rider] = await Promise.all([
    getSummary({ rider: riderId, from: date, to: date }),
    findCloseout(riderId, date),
    Delivery.find({ rider: riderId, date }).sort({ recordedAt: -1 }).limit(5).lean(),
    Expense.countDocuments({ rider: riderId, date, status: 'Pending' }),
    Rider.findById(riderId).populate('bike', 'bikeId registrationNumber').lean(),
  ]);
  res.json({ date, summary, closeout, recent, pendingExpenses, rider });
});

module.exports = { adminDashboard, riderDashboard };
