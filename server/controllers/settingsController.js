const { Setting } = require('../models');
const { audit, diff } = require('../services/audit');
const { asyncHandler, trimOrEmpty } = require('../utils/helpers');
const ApiError = require('../utils/ApiError');
const { getCurrentFee } = require('../services/feeService');
const constants = require('../config/constants');
const { env } = require('../config/env');
const { businessDate } = require('../utils/dates');

/** Stored destination list, or the defaults for installs created before the list existed. */
function destinationsOf(settings) {
  return Array.isArray(settings.destinations) && settings.destinations.length ? settings.destinations : [...constants.DEFAULT_DESTINATIONS];
}

/** Clean an admin-submitted destination list: trim, drop blanks, remove duplicates (case-insensitive), keep order. */
function cleanDestinations(list) {
  if (!Array.isArray(list)) throw ApiError.badRequest('Destinations must be a list.');
  const seen = new Set();
  const out = [];
  for (const raw of list) {
    const v = trimOrEmpty(raw, 80);
    if (!v || seen.has(v.toLowerCase())) continue;
    seen.add(v.toLowerCase());
    out.push(v);
  }
  if (out.length > constants.MAX_DESTINATIONS) throw ApiError.badRequest(`You can save up to ${constants.MAX_DESTINATIONS} destinations.`);
  return out;
}

/** Public-to-authenticated app configuration (both roles). */
const getAppConfig = asyncHandler(async (req, res) => {
  const settings = await Setting.get();
  const fee = await getCurrentFee();
  res.json({
    settings: { companyName: settings.companyName, currencySymbol: settings.currencySymbol, allowRiderFeeOverride: settings.allowRiderFeeOverride, requireReceiptForExpenses: settings.requireReceiptForExpenses, destinations: destinationsOf(settings) },
    currentFee: fee ? fee.fee : null,
    today: businessDate(),
    businessTz: env.businessTz,
    enums: {
      paymentMethods: constants.PAYMENT_METHODS,
      deliveryStatuses: constants.DELIVERY_STATUSES,
      expenseCategories: constants.EXPENSE_CATEGORIES,
      expenseStatuses: constants.EXPENSE_STATUSES,
      bikeStatuses: constants.BIKE_STATUSES,
      closeoutStatuses: constants.CLOSEOUT_STATUSES,
    },
  });
});

const updateSettings = asyncHandler(async (req, res) => {
  const before = await Setting.get();
  const update = {};
  if (req.body.companyName !== undefined) {
    const v = trimOrEmpty(req.body.companyName, 120);
    if (!v) throw ApiError.badRequest('Company name cannot be empty.');
    update.companyName = v;
  }
  if (req.body.currencySymbol !== undefined) {
    const v = trimOrEmpty(req.body.currencySymbol, 5);
    if (!v) throw ApiError.badRequest('Currency symbol cannot be empty.');
    update.currencySymbol = v;
  }
  if (req.body.allowRiderFeeOverride !== undefined) update.allowRiderFeeOverride = req.body.allowRiderFeeOverride === true;
  if (req.body.requireReceiptForExpenses !== undefined) update.requireReceiptForExpenses = req.body.requireReceiptForExpenses === true;
  if (req.body.destinations !== undefined) update.destinations = cleanDestinations(req.body.destinations);
  update.updatedBy = req.user._id;

  const after = await Setting.findOneAndUpdate({ _id: 'app' }, { $set: update }, { new: true, upsert: true }).lean();
  const d = diff({ ...before, destinations: destinationsOf(before).join(', ') }, { ...after, destinations: destinationsOf(after).join(', ') }, ['companyName', 'currencySymbol', 'allowRiderFeeOverride', 'requireReceiptForExpenses', 'destinations']);
  if (d.changed) await audit(req, { action: 'Admin updated settings', entityType: 'Setting', entityRef: 'app', previousData: d.prev, newData: d.next });
  res.json({ settings: { ...after, destinations: destinationsOf(after) } });
});

module.exports = { getAppConfig, updateSettings };
