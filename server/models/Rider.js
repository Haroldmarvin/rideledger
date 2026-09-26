const mongoose = require('mongoose');
const { ACCOUNT_STATUSES } = require('../config/constants');

const riderSchema = new mongoose.Schema({
  riderId: { type: String, required: true, trim: true }, // e.g. RDR-0001
  name: { type: String, required: true, trim: true, maxlength: 120 },
  phone: { type: String, trim: true, maxlength: 30 },
  email: { type: String, trim: true, lowercase: true, maxlength: 160 },
  bike: { type: mongoose.Schema.Types.ObjectId, ref: 'Bike', default: null }, // bikeId link
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  status: { type: String, enum: ACCOUNT_STATUSES, default: 'active' },
  notes: { type: String, trim: true, maxlength: 500 },
}, { timestamps: true });

riderSchema.index({ riderId: 1 }, { unique: true });
riderSchema.index({ status: 1, name: 1 });

module.exports = mongoose.model('Rider', riderSchema);
