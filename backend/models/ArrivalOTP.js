const mongoose = require('mongoose');

const arrivalOtpSchema = new mongoose.Schema({
  bookingId: {
    type: String,
    required: true,
    index: true
  },
  email: {
    type: String,
    required: true,
    index: true
  },
  otp: {
    type: String,
    required: true
  },
  verified: {
    type: Boolean,
    default: false
  },
  used: {
    type: Boolean,
    default: false
  },
  expiresAt: {
    type: Date,
    required: true,
    index: { expires: 0 }
  },
  createdAt: {
    type: Date,
    default: Date.now
  }
});

module.exports = mongoose.model('ArrivalOTP', arrivalOtpSchema);
