const { Counter } = require('../models');
const { compactDate } = require('../utils/dates');

/** Generates unique, human-readable, date-based IDs using atomic counters. */
async function dated(prefix, key, dateStr) {
  const day = compactDate(dateStr);
  const seq = await Counter.next(`${key}:${day}`);
  return `${prefix}-${day}-${String(seq).padStart(4, '0')}`;
}

const nextDeliveryId = (dateStr) => dated('RL', 'delivery', dateStr);
const nextExpenseId = (dateStr) => dated('EXP', 'expense', dateStr);
const nextCloseoutId = (dateStr) => dated('CO', 'closeout', dateStr);
const nextCorrectionId = (dateStr) => dated('COR', 'correction', dateStr);

async function nextRiderId() {
  const seq = await Counter.next('rider');
  return `RDR-${String(seq).padStart(4, '0')}`;
}

module.exports = { nextDeliveryId, nextExpenseId, nextCloseoutId, nextCorrectionId, nextRiderId };
