const mongoose = require('mongoose');

const bookingSchema = new mongoose.Schema({
  id: { type: String },
  userId: { type: String, required: true },
  workerId: { type: String, required: true },
  status: { type: String, default: 'pending' },
  location: { type: mongoose.Schema.Types.Mixed }, // String or object
  emergency: { type: Boolean, default: false },
  cancelReason: { type: String },
  date: { type: String },
  timeSlot: { type: String },
  paymentStatus: { type: String, default: 'pending' },
  paymentMethod: { type: String },
  provider: { type: String },
  razorpayOrderId: { type: String },
  razorpayPaymentId: { type: String },
  amountPaid: { type: Number, default: 0 },
  paidAt: { type: Date },
  // True while this booking occupies its (workerId, date, timeSlot) slot;
  // flipped to false on cancel/reject/completion so the slot frees up.
  // Backs the partial unique index below, which is what actually prevents
  // two simultaneous requests from double-booking the same slot -- the
  // findOne-then-create check in the controller alone is not atomic.
  isActiveSlot: { type: Boolean, default: true },
  // Worker's latest GPS snapshot for the booking.
  // Kept as an alias so older code paths still read `liveLocation` safely.
  workerLocation: {
    lat: { type: Number },
    lng: { type: Number },
    latitude: { type: Number },
    longitude: { type: Number },
    accuracy: { type: Number, default: 0 },
    updatedAt: { type: Date }
  },
  liveLocation: {
    lat: { type: Number },
    lng: { type: Number },
    latitude: { type: Number },
    longitude: { type: Number },
    accuracy: { type: Number, default: 0 },
    updatedAt: { type: Date }
  },
  // User's latest GPS snapshot for the booking.
  userLocation: {
    lat: { type: Number },
    lng: { type: Number },
    latitude: { type: Number },
    longitude: { type: Number },
    accuracy: { type: Number, default: 0 },
    updatedAt: { type: Date }
  },
  createdAt: { type: Date, default: Date.now }
});

bookingSchema.set('toJSON', {
  transform: (doc, ret) => {
    ret.id = ret._id.toString(); // always the real Mongo id, ignoring any legacy custom 'id' field from old signup data
    delete ret.__v;
    return ret;
  }
});

bookingSchema.index({ userId: 1, createdAt: -1 });
bookingSchema.index({ workerId: 1, createdAt: -1 });
bookingSchema.index({ status: 1 });
// The actual atomicity guarantee: MongoDB rejects a second insert for the same
// worker/date/timeSlot while isActiveSlot is still true, closing the TOCTOU
// race window that a findOne-then-create check alone can't close.
bookingSchema.index(
  { workerId: 1, date: 1, timeSlot: 1 },
  { unique: true, partialFilterExpression: { isActiveSlot: true } }
);

module.exports = mongoose.model('Booking', bookingSchema);
