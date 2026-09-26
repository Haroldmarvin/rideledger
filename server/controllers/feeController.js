const { FeeConfiguration } = require('../models');
const { getCurrentFee, setDefaultFee } = require('../services/feeService');
const { audit } = require('../services/audit');
const { parseCentsInput, isValidCents } = require('../utils/money');
const { asyncHandler, trimOrEmpty } = require('../utils/helpers');
const ApiError = require('../utils/ApiError');

const listFees = asyncHandler(async (req, res) => {
  const current = await getCurrentFee();
  const history = await FeeConfiguration.find().sort({ effectiveFrom: -1 }).limit(100).populate('createdBy', 'name').lean();
  res.json({ current, history });
});

const createFee = asyncHandler(async (req, res) => {
  const fee = parseCentsInput(req.body.fee);
  if (!isValidCents(fee)) throw ApiError.badRequest('Please enter a valid fee of zero or more.', { fieldErrors: { fee: 'Invalid amount.' } });
  const previous = await getCurrentFee();
  if (previous && previous.fee === fee) throw ApiError.badRequest('That is already the current default fee.');
  const created = await setDefaultFee(fee, req.user._id, trimOrEmpty(req.body.note, 300));
  await audit(req, {
    action: previous ? 'Admin changed default delivery fee' : 'Admin set default delivery fee',
    entityType: 'FeeConfiguration', entityId: created._id, entityRef: `fee:${fee}`,
    previousData: previous ? { fee: previous.fee } : null, newData: { fee, note: created.note },
  });
  res.status(201).json({ fee: created });
});

module.exports = { listFees, createFee };
