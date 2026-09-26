/**
 * Client-side money helpers. The API always sends and receives INTEGER CENTS.
 * These are for display and instant UI feedback only — the server recalculates everything.
 */
const DECIMAL_RE = /^\s*(\d{1,9})(?:\.(\d{0,2}))?\s*$/;

/** "12.5" -> 1250. Returns NaN for invalid input (never float math). */
export function toCents(value) {
  if (value === null || value === undefined) return NaN;
  const m = DECIMAL_RE.exec(String(value).replace(/,/g, ''));
  if (!m) return NaN;
  return parseInt(m[1], 10) * 100 + parseInt(((m[2] || '') + '00').slice(0, 2), 10);
}

/** 1250 -> "12.50" (for input fields) */
export function centsToInput(cents) {
  if (!Number.isInteger(cents)) return '';
  const sign = cents < 0 ? '-' : '';
  const a = Math.abs(cents);
  return `${sign}${Math.floor(a / 100)}.${String(a % 100).padStart(2, '0')}`;
}

/** 123456 -> "$1,234.56" */
export function formatMoney(cents, symbol = '$') {
  const n = Number.isInteger(cents) ? cents : 0;
  const sign = n < 0 ? '-' : '';
  const a = Math.abs(n);
  const whole = Math.floor(a / 100).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return `${sign}${symbol}${whole}.${String(a % 100).padStart(2, '0')}`;
}
