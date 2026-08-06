const express = require('express');
const router = express.Router();
const { protect, authorize } = require('../middleware/authMiddleware');
const { asyncHandler } = require('../middleware/errorMiddleware');
const { validate, paymentCreateValidation } = require('../middleware/validators');
const { createPayment, listPayments, updatePaymentStatus } = require('../controllers/paymentsDataController');

router.post('/', protect, paymentCreateValidation, validate, asyncHandler(createPayment));
router.get('/', protect, asyncHandler(listPayments));
router.put('/:id/status', protect, authorize('user', 'admin', 'special_admin'), asyncHandler(updatePaymentStatus));

module.exports = router;
