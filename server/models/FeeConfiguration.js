const mongoose = require('mongoose');

const feeSchema = new mongoose.Schema({
  fee: { type: Number, required: true, validate: { validator: Number.isInteger, message: 'Money must be integer cents' } },
  effectiveFrom: { type: Date, required: true, default: Date.now },
  effectiveTo: { type: Date, default: null },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  active: { type: Boolean, default: true },
  note: { type: String, trim: true, maxlength: 300, default: '' },
}, { timestamps: true });

feeSchema.index({ active: 1, effectiveFrom: -1 });

module.exports = mongoose.model('FeeConfiguration', feeSchema);
