const mongoose = require('mongoose');

/** Wrap async route handlers so errors reach the error middleware. */
const asyncHandler = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

/** Escape user input for safe use inside a RegExp. */
function escapeRegex(s) {
  return String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function isObjectId(v) {
  return typeof v === 'string' && mongoose.Types.ObjectId.isValid(v) && /^[a-f0-9]{24}$/i.test(v);
}

/** Read a query-string value as a plain trimmed string (never an object/array). */
function qs(value) {
  if (value === undefined || value === null) return '';
  if (Array.isArray(value)) value = value[0];
  if (typeof value === 'object') return '';
  return String(value).trim();
}

function pick(obj, keys) {
  const out = {};
  for (const k of keys) if (obj && Object.prototype.hasOwnProperty.call(obj, k)) out[k] = obj[k];
  return out;
}

function toPlain(doc) {
  if (!doc) return doc;
  const o = typeof doc.toObject === 'function' ? doc.toObject({ depopulate: true }) : { ...doc };
  delete o.passwordHash;
  delete o.__v;
  return o;
}

function paginate(query) {
  const page = Math.max(1, parseInt(qs(query.page), 10) || 1);
  const limit = Math.min(200, Math.max(1, parseInt(qs(query.limit), 10) || 25));
  return { page, limit, skip: (page - 1) * limit };
}

function trimOrEmpty(v, max = 500) {
  if (v === undefined || v === null) return '';
  return String(v).trim().slice(0, max);
}

module.exports = { asyncHandler, escapeRegex, isObjectId, qs, pick, toPlain, paginate, trimOrEmpty };
