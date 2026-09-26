const mongoose = require('mongoose');
const { ROLES, ACCOUNT_STATUSES } = require('../config/constants');

const userSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true, maxlength: 120 },
  email: { type: String, required: true, trim: true, lowercase: true, maxlength: 160 },
  username: { type: String, trim: true, lowercase: true, maxlength: 60 },
  phone: { type: String, trim: true, maxlength: 30 },
  passwordHash: { type: String, required: true, select: false },
  role: { type: String, enum: Object.values(ROLES), required: true, default: ROLES.RIDER },
  rider: { type: mongoose.Schema.Types.ObjectId, ref: 'Rider', default: null }, // riderId link
  status: { type: String, enum: ACCOUNT_STATUSES, default: 'active' },
  tokenVersion: { type: Number, default: 0 }, // bump to invalidate existing sessions
  lastLoginAt: { type: Date },
}, { timestamps: true });

userSchema.index({ email: 1 }, { unique: true });
userSchema.index({ username: 1 }, { unique: true, sparse: true });
userSchema.index({ rider: 1 });

userSchema.methods.toSafeJSON = function toSafeJSON() {
  const o = this.toObject();
  delete o.passwordHash;
  delete o.tokenVersion;
  delete o.__v;
  return o;
};

module.exports = mongoose.model('User', userSchema);
