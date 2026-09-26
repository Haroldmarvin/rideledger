const mongoose = require('mongoose');

/** Atomic sequence counters, e.g. key "delivery:20260924" -> 17 */
const counterSchema = new mongoose.Schema({
  _id: { type: String, required: true },
  seq: { type: Number, default: 0 },
}, { versionKey: false });

counterSchema.statics.next = async function next(key) {
  const doc = await this.findOneAndUpdate(
    { _id: key },
    { $inc: { seq: 1 } },
    { new: true, upsert: true, setDefaultsOnInsert: true },
  );
  return doc.seq;
};

module.exports = mongoose.model('Counter', counterSchema);
