const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/authMiddleware');
const { asyncHandler } = require('../middleware/errorMiddleware');
const { createRazorpayOrder, verifyRazorpayPayment, handleRazorpayWebhook } = require('../controllers/paymentController');

router.post('/create-order', protect, asyncHandler(createRazorpayOrder));
router.post('/verify', protect, asyncHandler(verifyRazorpayPayment));
router.post('/webhook', asyncHandler(handleRazorpayWebhook));
router.post('/razorpay/order', protect, asyncHandler(createRazorpayOrder));
router.post('/razorpay/verify', protect, asyncHandler(verifyRazorpayPayment));

module.exports = router;

