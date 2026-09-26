const { FeeConfiguration } = require('../models');

async function getCurrentFee() {
  return FeeConfiguration.findOne({ active: true }).sort({ effectiveFrom: -1 }).lean();
}

async function getCurrentFeeCents() {
  const f = await getCurrentFee();
  return f ? f.fee : null;
}

/** Create a new default fee. Historical deliveries keep the fee stored on them. */
async function setDefaultFee(feeCents, userId, note = '') {
  const now = new Date();
  await FeeConfiguration.updateMany({ active: true }, { $set: { active: false, effectiveTo: now } });
  return FeeConfiguration.create({ fee: feeCents, effectiveFrom: now, createdBy: userId, active: true, note });
}

module.exports = { getCurrentFee, getCurrentFeeCents, setDefaultFee };
