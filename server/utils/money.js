/**
 * Money is stored and calculated as INTEGER CENTS everywhere on the server.
 * This avoids floating-point errors (e.g. 0.1 + 0.2 !== 0.3).
 *
 * API contract: every monetary field sent to / received from the API is an integer number of cents.
 * toCents() also accepts decimal strings ("12.50") for tolerant parsing (seed data, admin tools).
 */
const { MAX_MONEY_CENTS } = require('../config/constants');

const DECIMAL_RE = /^\s*(-)?(\d{1,12})(?:\.(\d{0,2}))?\s*$/;

/** Parse a decimal amount ("12.5", 12.5, "12") into integer cents, exactly. Returns NaN if invalid. */
function toCents(value) {
  if (value === null || value === undefined || value === '') return NaN;
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) return NaN;
    // Shift the decimal point in the string form to avoid binary float drift (1.005 -> 101, not 100)
    const shifted = Math.round(Number(`${value}e2`));
    return Number.isSafeInteger(shifted) ? shifted : NaN;
  }
  const m = DECIMAL_RE.exec(String(value));
  if (!m) return NaN;
  const [, neg, whole, frac = ''] = m;
  const cents = parseInt(whole, 10) * 100 + parseInt((frac + '00').slice(0, 2), 10);
  return neg ? -cents : cents;
}

/** Validate an integer-cents value from the API. */
function isValidCents(value, { allowNegative = false, max = MAX_MONEY_CENTS } = {}) {
  return Number.isSafeInteger(value) && (allowNegative || value >= 0) && Math.abs(value) <= max;
}

/** Coerce an API value (number or numeric string) to integer cents, or NaN. */
function parseCentsInput(value) {
  if (typeof value === 'number') return Number.isInteger(value) ? value : NaN;
  if (typeof value === 'string' && /^-?\d+$/.test(value.trim())) return parseInt(value.trim(), 10);
  return NaN;
}

function sumCents(values) {
  let total = 0;
  for (const v of values) total += Number.isInteger(v) ? v : 0;
  return total;
}

/** Format integer cents for display, e.g. 12345 -> "$123.45", -500 -> "-$5.00" */
function formatCents(cents, symbol = '$') {
  const n = Number.isInteger(cents) ? cents : 0;
  const sign = n < 0 ? '-' : '';
  const abs = Math.abs(n);
  const whole = Math.floor(abs / 100).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  const frac = String(abs % 100).padStart(2, '0');
  return `${sign}${symbol}${whole}.${frac}`;
}

/** Cents -> decimal Number for spreadsheets (safe: 2dp representation only for display cells). */
function centsToDecimal(cents) {
  return Math.round(Number(cents || 0)) / 100;
}

module.exports = { toCents, isValidCents, parseCentsInput, sumCents, formatCents, centsToDecimal };
