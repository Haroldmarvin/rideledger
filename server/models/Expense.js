const mongoose = require('mongoose');
const { EXPENSE_CATEGORIES, EXPENSE_STATUSES } = require('../config/constants');

const receiptSchema = new mongoose.Schema({
  provider: { type: String, required: true }, // storage provider name, e.g. "local"
  key: { type: String, required: true }, // provider-specific object key
  originalName: String,
  mimeType: String,
  size: Number,
}, { _id: false });

const expenseSchema = new mongoose.Schema({
  expenseId: { type: String, required: true }, // EXP-YYYYMMDD-0001
  date: { type: String, required: true }, // business date YYYY-MM-DD
  rider: { type: mongoose.Schema.Types.ObjectId, ref: 'Rider', required: true },
  category: { type: String, enum: EXPENSE_CATEGORIES, required: true },
  amount: { type: Number, required: true, validate: { validator: Number.isInteger, message: 'Money must be integer cents' } },
  description: { type: String, trim: true, maxlength: 500, default: '' },
  receipt: { type: receiptSchema, default: null },
  status: { type: String, enum: EXPENSE_STATUSES, default: 'Pending' },
  reviewedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  reviewedAt: { type: Date, default: null },
  rejectionReason: { type: String, trim: true, maxlength: 500, default: '' },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  closedPeriod: { type: mongoose.Schema.Types.ObjectId, ref: 'DailyCloseout', default: null },
}, { timestamps: true });

expenseSchema.index({ expenseId: 1 }, { unique: true });
expenseSchema.index({ rider: 1, date: -1 });
expenseSchema.index({ status: 1, date: -1 });

module.exports = mongoose.model('Expense', expenseSchema);
