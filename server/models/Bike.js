const mongoose = require('mongoose');
const { BIKE_STATUSES } = require('../config/constants');

const bikeSchema = new mongoose.Schema({
  bikeId: { type: String, required: true, trim: true, uppercase: true, maxlength: 30 }, // e.g. BK-001
  registrationNumber: { type: String, trim: true, uppercase: true, maxlength: 40 },
  assignedRider: { type: mongoose.Schema.Types.ObjectId, ref: 'Rider', default: null },
  status: { type: String, enum: BIKE_STATUSES, default: 'Active' },
  notes: { type: String, trim: true, maxlength: 500 },
}, { timestamps: true });

bikeSchema.index({ bikeId: 1 }, { unique: true });
bikeSchema.index({ assignedRider: 1 });

module.exports = mongoose.model('Bike', bikeSchema);
