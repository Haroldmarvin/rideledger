/**
 * Pure financial calculation functions (no database access) — the single source of truth
 * for how RideLedger figures are derived. All money values are INTEGER CENTS.
 */

const EMPTY_SUMMARY = Object.freeze({
  deliveries: 0,
  delivered: 0,
  failed: 0,
  returned: 0,
  cancelled: 0,
  totalFees: 0,
  totalCollected: 0,
  cashCollected: 0,
  mobileMoneyCollected: 0,
  bankCollected: 0,
  otherCollected: 0,
  electronicCollected: 0,
  creditCount: 0,
  creditFees: 0,
  outstanding: 0,
  extraCollected: 0,
  approvedExpenses: 0,
  expectedHandover: 0,
});

/**
 * Outstanding Amount = Delivery Fee - Amount Collected (never below zero).
 * When the customer pays MORE than the delivery fee (e.g. they also pay for the order/goods),
 * nothing is outstanding and the difference is recorded as extra collected.
 */
function calculateOutstanding(deliveryFee, amountCollected) {
  return Math.max(deliveryFee - amountCollected, 0);
}

/** Extra Collected = Amount Collected - Delivery Fee (never below zero). Money the rider holds on top of the fee. */
function calculateExtraCollected(deliveryFee, amountCollected) {
  return Math.max(amountCollected - deliveryFee, 0);
}

/** Expected Cash Handover = Cash Collected - Approved Expenses */
function calculateExpectedHandover(cashCollected, approvedExpenses) {
  return cashCollected - approvedExpenses;
}

/** Difference = Actual Handover - Expected Handover */
function calculateDifference(actualHandover, expectedHandover) {
  return actualHandover - expectedHandover;
}

function classifyDifference(difference) {
  if (difference === 0) return 'Exact';
  return difference < 0 ? 'Short' : 'Over';
}

/** Only APPROVED expenses affect accountability. */
function sumApprovedExpenses(expenses = []) {
  let total = 0;
  for (const e of expenses) if (e && e.status === 'Approved') total += e.amount;
  return total;
}

/**
 * Build a summary from grouped rows. Each group is
 * { status, paymentMethod, count, fees, collected, outstanding, extra }.
 * Grouped input lets us feed MongoDB aggregation results directly.
 */
function summarizeGroups(groups = [], approvedExpenses = 0) {
  const s = { ...EMPTY_SUMMARY };
  for (const g of groups) {
    const count = g.count || 0;
    s.deliveries += count;
    if (g.status === 'Delivered') s.delivered += count;
    else if (g.status === 'Failed') s.failed += count;
    else if (g.status === 'Returned') s.returned += count;
    else if (g.status === 'Cancelled') s.cancelled += count;

    s.totalFees += g.fees || 0;
    s.totalCollected += g.collected || 0;
    s.outstanding += g.outstanding || 0;
    s.extraCollected += g.extra || 0;

    switch (g.paymentMethod) {
      case 'Cash': s.cashCollected += g.collected || 0; break;
      case 'Mobile Money': s.mobileMoneyCollected += g.collected || 0; break;
      case 'Bank Transfer': s.bankCollected += g.collected || 0; break;
      case 'Credit/Unpaid': s.creditCount += count; s.creditFees += g.fees || 0; break;
      default: s.otherCollected += g.collected || 0;
    }
  }
  s.electronicCollected = s.mobileMoneyCollected + s.bankCollected;
  s.approvedExpenses = approvedExpenses;
  s.expectedHandover = calculateExpectedHandover(s.cashCollected, approvedExpenses);
  return s;
}

/** Group a list of delivery records into summary groups (used for in-memory data and tests). */
function groupDeliveries(deliveries = []) {
  const map = new Map();
  for (const d of deliveries) {
    const key = `${d.status}|${d.paymentMethod}`;
    if (!map.has(key)) {
      map.set(key, { status: d.status, paymentMethod: d.paymentMethod, count: 0, fees: 0, collected: 0, outstanding: 0, extra: 0 });
    }
    const g = map.get(key);
    g.count += 1;
    g.fees += d.deliveryFee;
    g.collected += d.amountCollected;
    g.outstanding += Number.isInteger(d.outstandingAmount) ? d.outstandingAmount : calculateOutstanding(d.deliveryFee, d.amountCollected);
    g.extra += Number.isInteger(d.extraCollected) ? d.extraCollected : calculateExtraCollected(d.deliveryFee, d.amountCollected);
  }
  return [...map.values()];
}

/** Summarize raw delivery + expense records. */
function summarize(deliveries = [], expenses = []) {
  return summarizeGroups(groupDeliveries(deliveries), sumApprovedExpenses(expenses));
}

/** Build closeout figures from a summary and the actual handover. */
function buildCloseoutFigures(summary, actualHandover) {
  const expectedHandover = calculateExpectedHandover(summary.cashCollected, summary.approvedExpenses);
  const difference = calculateDifference(actualHandover, expectedHandover);
  return {
    deliveriesCount: summary.deliveries,
    totalFees: summary.totalFees,
    totalCollected: summary.totalCollected,
    cashCollected: summary.cashCollected,
    electronicCollected: summary.electronicCollected,
    outstanding: summary.outstanding,
    approvedExpenses: summary.approvedExpenses,
    expectedHandover,
    actualHandover,
    difference,
    differenceStatus: classifyDifference(difference),
  };
}

module.exports = {
  EMPTY_SUMMARY,
  calculateOutstanding,
  calculateExtraCollected,
  calculateExpectedHandover,
  calculateDifference,
  classifyDifference,
  sumApprovedExpenses,
  summarizeGroups,
  groupDeliveries,
  summarize,
  buildCloseoutFigures,
};
