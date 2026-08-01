const express = require('express');
const router = express.Router();
const { protect, authorize } = require('../middleware/authMiddleware');
const { asyncHandler } = require('../middleware/errorMiddleware');
const { createPayoutRequest, listPayoutRequests, updatePayoutStatus } = require('../controllers/payoutController');

router.post('/', protect, authorize('worker'), asyncHandler(createPayoutRequest));
router.get('/', protect, asyncHandler(listPayoutRequests));
router.put('/:id/status', protect, authorize('admin', 'special_admin'), asyncHandler(updatePayoutStatus));

module.exports = router;
