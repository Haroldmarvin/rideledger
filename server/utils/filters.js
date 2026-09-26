/**
 * Parse and validate list/report/dashboard filters from a query string.
 * Riders are ALWAYS forced to their own rider id, whatever they send.
 */
const { PAYMENT_METHODS, DELIVERY_STATUSES } = require('../config/constants');
const { isValidDateString, businessDate } = require('./dates');
const { qs, isObjectId, escapeRegex } = require('./helpers');
const ApiError = require('./ApiError');

function parseFilters(query = {}, user, { defaultToday = false } = {}) {
  const f = {};
  const from = qs(query.from) || qs(query.date);
  const to = qs(query.to) || qs(query.date);
  if (from && !isValidDateString(from)) throw ApiError.badRequest('Please choose a valid "from" date.');
  if (to && !isValidDateString(to)) throw ApiError.badRequest('Please choose a valid "to" date.');
  if (from) f.from = from;
  if (to) f.to = to;
  if (defaultToday && !from && !to) f.from = f.to = businessDate();
  if (f.from && f.to && f.from > f.to) [f.from, f.to] = [f.to, f.from];

  if (user && user.role === 'rider') {
    f.rider = String(user.rider);
  } else {
    const rider = qs(query.rider);
    if (rider) {
      if (!isObjectId(rider)) throw ApiError.badRequest('Invalid rider filter.');
      f.rider = rider;
    }
  }

  const bike = qs(query.bike);
  if (bike) {
    if (!isObjectId(bike)) throw ApiError.badRequest('Invalid bike filter.');
    f.bike = bike;
  }

  const status = qs(query.status);
  if (status) {
    if (!DELIVERY_STATUSES.includes(status)) throw ApiError.badRequest('Invalid status filter.');
    f.status = status;
  }

  const pm = qs(query.paymentMethod);
  if (pm) {
    if (!PAYMENT_METHODS.includes(pm)) throw ApiError.badRequest('Invalid payment method filter.');
    f.paymentMethod = pm;
  }

  const search = qs(query.search).slice(0, 80);
  if (search) f.searchRegex = new RegExp(escapeRegex(search), 'i');
  const customer = qs(query.customer).slice(0, 80);
  if (customer) f.customerRegex = new RegExp(escapeRegex(customer), 'i');
  if (qs(query.outstanding) === '1' || qs(query.outstanding) === 'true') f.outstandingOnly = true;

  return f;
}

/** Human-readable description of the filters applied (for reports). */
function describeFilters(f, names = {}) {
  const out = [];
  if (f.rider) out.push(['Rider', names.rider || f.rider]);
  if (f.bike) out.push(['Bike', names.bike || f.bike]);
  if (f.status) out.push(['Status', f.status]);
  if (f.paymentMethod) out.push(['Payment method', f.paymentMethod]);
  if (f.expenseStatus) out.push(['Expense status', f.expenseStatus]);
  if (f.searchRegex) out.push(['Search', f.searchRegex.source.replace(/\\/g, '')]);
  return out;
}

module.exports = { parseFilters, describeFilters };
