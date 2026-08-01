const express = require('express');
const router = express.Router();
const { 
  sendArrivalOtp, 
  verifyArrivalOtp, 
  consumeArrivalOtp 
} = require('../controllers/arrivalOtpController');

// Route to generate and send arrival OTP
router.post('/send', sendArrivalOtp);
router.post('/send-arrival-otp', sendArrivalOtp);

// Route to verify arrival OTP (marks as verified)
router.post('/verify', verifyArrivalOtp);
router.post('/verify-arrival-otp', verifyArrivalOtp);

// Route to consume arrival OTP (marks as used)
router.post('/consume', consumeArrivalOtp);
router.post('/consume-arrival-otp', consumeArrivalOtp);

module.exports = router;