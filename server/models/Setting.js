const mongoose = require('mongoose');

/** Single-document application settings. */
const settingSchema = new mongoose.Schema({
  _id: { type: String, default: 'app' },
  companyName: { type: String, trim: true, maxlength: 120, default: 'Afri Kapital Kitchen' },
  currencySymbol: { type: String, trim: true, maxlength: 5, default: '$' },
  allowRiderFeeOverride: { type: Boolean, default: true },
  requireReceiptForExpenses: { type: Boolean, default: false },
  updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
}, { timestamps: true });

settingSchema.statics.get = async function get() {
  const doc = await this.findById('app').lean();
  if (doc) return doc;
  return (await this.findOneAndUpdate({ _id: 'app' }, { $setOnInsert: { _id: 'app' } }, { upsert: true, new: true, setDefaultsOnInsert: true })).toObject();
};

module.exports = mongoose.model('Setting', settingSchema);
