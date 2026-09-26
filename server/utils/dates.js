/**
 * Business dates are stored as "YYYY-MM-DD" strings computed in the business timezone
 * (BUSINESS_TZ, default Africa/Monrovia). This makes daily grouping, closeouts and
 * locking unambiguous regardless of server timezone.
 */
const { env } = require('../config/env');

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function partsInTz(date, tz) {
  const fmt = new Intl.DateTimeFormat('en-CA', {
    timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  });
  const out = {};
  for (const p of fmt.formatToParts(date)) out[p.type] = p.value;
  return out;
}

function businessDate(date = new Date(), tz = env.businessTz) {
  const p = partsInTz(date, tz);
  return `${p.year}-${p.month}-${p.day}`;
}

function businessTime(date = new Date(), tz = env.businessTz) {
  const p = partsInTz(date, tz);
  return `${p.hour}:${p.minute}`;
}

function isValidDateString(s) {
  if (typeof s !== 'string' || !DATE_RE.test(s)) return false;
  const d = new Date(`${s}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
}

function addDays(dateStr, days) {
  const d = new Date(`${dateStr}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function compactDate(dateStr) {
  return dateStr.replace(/-/g, '');
}

function startOfMonth(dateStr) {
  return `${dateStr.slice(0, 7)}-01`;
}

function endOfMonth(dateStr) {
  const d = new Date(`${startOfMonth(dateStr)}T00:00:00Z`);
  d.setUTCMonth(d.getUTCMonth() + 1);
  d.setUTCDate(0);
  return d.toISOString().slice(0, 10);
}

/** Monday of the ISO week containing dateStr */
function startOfWeek(dateStr) {
  const d = new Date(`${dateStr}T00:00:00Z`);
  const dow = (d.getUTCDay() + 6) % 7; // Monday = 0
  return addDays(dateStr, -dow);
}

/** Inclusive list of dates between from and to (capped for safety). */
function eachDate(from, to, cap = 400) {
  const out = [];
  let cur = from;
  while (cur <= to && out.length < cap) {
    out.push(cur);
    cur = addDays(cur, 1);
  }
  return out;
}

/**
 * Resolve a {from, to} range from query params. Defaults to today.
 * Throws a friendly error string if invalid.
 */
function resolveRange(query = {}, { defaultFrom, defaultTo } = {}) {
  const today = businessDate();
  let from = query.from || query.date || defaultFrom || today;
  let to = query.to || query.date || defaultTo || from;
  from = String(from);
  to = String(to);
  if (!isValidDateString(from) || !isValidDateString(to)) {
    const err = new Error('Please choose valid dates (YYYY-MM-DD).');
    err.statusCode = 400;
    throw err;
  }
  if (from > to) [from, to] = [to, from];
  return { from, to };
}

module.exports = {
  businessDate, businessTime, isValidDateString, addDays, compactDate,
  startOfMonth, endOfMonth, startOfWeek, eachDate, resolveRange,
};
