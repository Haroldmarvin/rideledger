const mongoose = require('mongoose');

const auditSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  userName: { type: String },
  role: { type: String },
  action: { type: String, required: true }, // e.g. "Rider created delivery"
  entityType: { type: String, required: true }, // Delivery, Expense, DailyCloseout, ...
  entityId: { type: mongoose.Schema.Types.ObjectId, default: null },
  entityRef: { type: String }, // human readable id, e.g. RL-20260924-0001
  rider: { type: mongoose.Schema.Types.ObjectId, ref: 'Rider', default: null }, // related rider (for activity views)
  previousData: { type: mongoose.Schema.Types.Mixed, default: null },
  newData: { type: mongoose.Schema.Types.Mixed, default: null },
  ip: { type: String },
  userAgent: { type: String },
  timestamp: { type: Date, default: Date.now },
}, { versionKey: false });

auditSchema.index({ timestamp: -1 });
auditSchema.index({ entityType: 1, entityId: 1, timestamp: -1 });
auditSchema.index({ user: 1, timestamp: -1 });
auditSchema.index({ rider: 1, timestamp: -1 });
auditSchema.index({ action: 1 });

// Audit records are append-only: block updates and deletes at the model level.
const blocked = function blocked(next) {
  next(new Error('Audit log records are immutable.'));
};
['updateOne', 'updateMany', 'findOneAndUpdate', 'replaceOne', 'deleteOne', 'deleteMany', 'findOneAndDelete', 'findOneAndReplace']
  .forEach((op) => auditSchema.pre(op, { document: false, query: true }, blocked));
auditSchema.pre('save', function preventEdit(next) {
  if (!this.isNew) return next(new Error('Audit log records are immutable.'));
  return next();
});

module.exports = mongoose.model('AuditLog', auditSchema);
