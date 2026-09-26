const mongoose = require('mongoose');
const { CLOSEOUT_STATUSES } = require('../config/constants');

const int = { type: Number, default: 0, validate: { validator: Number.isInteger, message: 'Money must be integer cents' } };

const closeoutSchema = new mongoose.Schema({
  closeoutId: { type: String, required: true }, // CO-YYYYMMDD-0001
  date: { type: String, required: true }, // business date YYYY-MM-DD
  rider: { type: mongoose.Schema.Types.ObjectId, ref: 'Rider', required: true },
  // Server-calculated snapshot (integer cents)
  deliveriesCount: { type: Number, default: 0 },
  totalFees: int,
  totalCollected: int,
  cashCollected: int,
  electronicCollected: int,
  outstanding: int,
  approvedExpenses: int,
  expectedHandover: int, // cashCollected - approvedExpenses
  declaredHandover: int, // what the rider says they handed over
  actualHandover: int, // amount confirmed received by management (declared until confirmed)
  difference: int, // actualHandover - expectedHandover
  differenceStatus: { type: String, enum: ['Exact', 'Short', 'Over'], default: 'Exact' },
  status: { type: String, enum: CLOSEOUT_STATUSES, default: 'Submitted' },
  submittedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  submittedAt: { type: Date },
  riderNotes: { type: String, trim: true, maxlength: 500, default: '' },
  receivedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null }, // receiving officer
  receivedAt: { type: Date, default: null },
  notes: { type: String, trim: true, maxlength: 500, default: '' }, // management notes
  recalculatedAt: { type: Date, default: null },
}, { timestamps: true });

closeoutSchema.index({ closeoutId: 1 }, { unique: true });
closeoutSchema.index({ rider: 1, date: 1 }, { unique: true });
closeoutSchema.index({ status: 1, date: -1 });

module.exports = mongoose.model('DailyCloseout', closeoutSchema);
