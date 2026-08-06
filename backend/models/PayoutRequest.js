const mongoose = require('mongoose');

const payoutRequestSchema = new mongoose.Schema({
  id: { type: String },
  workerId: { type: String, required: true },
  amount: { type: Number, required: true },
  status: { type: String, enum: ['pending', 'approved', 'rejected'], default: 'pending' },
  note: { type: String },
  requestedAt: { type: Date, default: Date.now },
  resolvedAt: { type: Date }
});

payoutRequestSchema.index({ workerId: 1, status: 1 });

payoutRequestSchema.set('toJSON', {
  transform: (doc, ret) => {
    ret.id = ret._id.toString(); // always the real Mongo id, ignoring any legacy custom 'id' field from old signup data
    delete ret.__v;
    return ret;
  }
});

module.exports = mongoose.model('PayoutRequest', payoutRequestSchema);
