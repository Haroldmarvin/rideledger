const mongoose = require('mongoose');
const { CORRECTION_STATUSES } = require('../config/constants');

const correctionSchema = new mongoose.Schema({
  requestId: { type: String, required: true }, // COR-YYYYMMDD-0001
  entityType: { type: String, enum: ['Delivery', 'Expense'], required: true },
  entityId: { type: mongoose.Schema.Types.ObjectId, required: true },
  entityRef: { type: String }, // human-readable id (deliveryId / expenseId)
  rider: { type: mongoose.Schema.Types.ObjectId, ref: 'Rider', required: true },
  date: { type: String, required: true }, // business date of the affected record
  requestedChanges: { type: mongoose.Schema.Types.Mixed, required: true },
  currentValues: { type: mongoose.Schema.Types.Mixed },
  reason: { type: String, required: true, trim: true, maxlength: 500 },
  status: { type: String, enum: CORRECTION_STATUSES, default: 'Pending' },
  requestedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  reviewedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  reviewedAt: { type: Date, default: null },
  reviewNotes: { type: String, trim: true, maxlength: 500, default: '' },
}, { timestamps: true });

correctionSchema.index({ requestId: 1 }, { unique: true });
correctionSchema.index({ status: 1, createdAt: -1 });
correctionSchema.index({ rider: 1, createdAt: -1 });

module.exports = mongoose.model('CorrectionRequest', correctionSchema);
