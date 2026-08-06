const express = require('express');
const router = express.Router();
const {
  sendArrivalOtp,
  getArrivalOtp,
  verifyArrivalOtp,
  consumeArrivalOtp
} = require('../controllers/arrivalOtpController');
const { protect } = require('../middleware/authMiddleware');
const { asyncHandler } = require('../middleware/errorMiddleware');

// Worker (assigned to the booking) triggers OTP generation + email to customer.
router.post('/send', protect, asyncHandler(sendArrivalOtp));
router.post('/send-arrival-otp', protect, asyncHandler(sendArrivalOtp)); // legacy alias

// Customer (booking owner) reads their own current OTP -- read-only, never regenerates.
router.get('/:bookingId', protect, asyncHandler(getArrivalOtp));

// Worker (assigned to the booking) verifies the OTP the customer gave them.
router.post('/verify', protect, asyncHandler(verifyArrivalOtp));
router.post('/verify-arrival-otp', protect, asyncHandler(verifyArrivalOtp)); // legacy alias

router.post('/consume', protect, asyncHandler(consumeArrivalOtp));
router.post('/consume-arrival-otp', protect, asyncHandler(consumeArrivalOtp)); // legacy alias

module.exports = router;
