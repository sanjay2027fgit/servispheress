const mongoose = require('mongoose');

const paymentSchema = new mongoose.Schema({
  id: { type: String },
  amount: { type: Number },
  amountPaid: { type: Number, default: 0 },
  bookingId: { type: String, required: true },
  workerId: { type: String, required: true },
  userId: { type: String }, // denormalized from Booking.userId at creation, for user-scoped queries
  status: { type: String, default: 'pending' },
  paymentStatus: { type: String, default: 'pending' },
  paymentMethod: { type: String, default: 'razorpay' },
  provider: { type: String, default: 'razorpay' },
  razorpayOrderId: { type: String },
  razorpayPaymentId: { type: String },
  razorpaySignature: { type: String },
  paidAt: { type: Date },
  createdAt: { type: Date, default: Date.now }
});

paymentSchema.index({ workerId: 1, status: 1 });
paymentSchema.index({ bookingId: 1 });
paymentSchema.index({ userId: 1 });

paymentSchema.set('toJSON', {
  transform: (doc, ret) => {
    ret.id = ret._id.toString(); // always the real Mongo id, ignoring any legacy custom 'id' field from old signup data
    delete ret.__v;
    return ret;
  }
});

module.exports = mongoose.model('Payment', paymentSchema);
