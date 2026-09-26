const mongoose = require('mongoose');
const { PAYMENT_METHODS, DELIVERY_STATUSES } = require('../config/constants');

const cents = { type: Number, required: true, validate: { validator: Number.isInteger, message: 'Money must be integer cents' } };

const deliverySchema = new mongoose.Schema({
  deliveryId: { type: String, required: true }, // RL-YYYYMMDD-0001
  date: { type: String, required: true }, // business date YYYY-MM-DD
  time: { type: String, required: true }, // HH:mm (business timezone)
  recordedAt: { type: Date, required: true }, // exact moment the rider recorded it
  rider: { type: mongoose.Schema.Types.ObjectId, ref: 'Rider', required: true },
  bike: { type: mongoose.Schema.Types.ObjectId, ref: 'Bike', default: null },
  customerName: { type: String, required: true, trim: true, maxlength: 120 },
  customerPhone: { type: String, required: true, trim: true, maxlength: 30 },
  pickupLocation: { type: String, required: true, trim: true, maxlength: 200 },
  destination: { type: String, required: true, trim: true, maxlength: 200 },
  orderReference: { type: String, trim: true, maxlength: 60, default: '' },
  // Money (integer cents). The fee actually used is stored permanently on the record.
  deliveryFee: cents,
  amountCollected: cents,
  outstandingAmount: cents, // ALWAYS computed by the server: max(fee - collected, 0)
  extraCollected: { ...cents, required: false, default: 0 }, // ALWAYS computed: max(collected - fee, 0), e.g. order money
  defaultFeeAtCreation: { type: Number, default: null },
  overpaymentAuthorized: { type: Boolean, default: false }, // legacy field, no longer used
  paymentMethod: { type: String, enum: PAYMENT_METHODS, required: true },
  status: { type: String, enum: DELIVERY_STATUSES, required: true },
  remarks: { type: String, trim: true, maxlength: 500, default: '' },
  flags: [{ type: String }], // e.g. ZERO_FINANCIALS, FEE_OVERRIDE
  clientRef: { type: String, trim: true, maxlength: 64 }, // idempotency key for offline sync
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  closedPeriod: { type: mongoose.Schema.Types.ObjectId, ref: 'DailyCloseout', default: null },
}, { timestamps: true });

deliverySchema.index({ deliveryId: 1 }, { unique: true });
deliverySchema.index({ clientRef: 1 }, { unique: true, partialFilterExpression: { clientRef: { $type: 'string' } } });
deliverySchema.index({ rider: 1, date: -1 });
deliverySchema.index({ date: -1, status: 1 });
deliverySchema.index({ bike: 1, date: -1 });
deliverySchema.index({ paymentMethod: 1, date: -1 });
deliverySchema.index({ customerName: 1 });
deliverySchema.index({ customerPhone: 1 });
deliverySchema.index({ orderReference: 1 });

module.exports = mongoose.model('Delivery', deliverySchema);
