const express = require('express');
const router = express.Router();
const { protect, authorize } = require('../middleware/authMiddleware');
const { asyncHandler } = require('../middleware/errorMiddleware');
const { validate, bookingCreateValidation, bookingStatusValidation } = require('../middleware/validators');
const {
  createBooking,
  listBookings,
  getBooking,
  updateBookingStatus,
  cancelBooking,
  updateLiveLocation,
  updateUserLocation,
  getLiveLocation,
  setEmergency
} = require('../controllers/bookingController');

router.post('/', protect, authorize('user'), bookingCreateValidation, validate, asyncHandler(createBooking));
router.get('/', protect, asyncHandler(listBookings));
router.get('/:id', protect, asyncHandler(getBooking));

router.put('/:id/status', protect, authorize('user', 'worker', 'admin', 'special_admin'), bookingStatusValidation, validate, asyncHandler(updateBookingStatus));
router.put('/:id/cancel', protect, authorize('user'), asyncHandler(cancelBooking));
router.put('/:id/emergency', protect, authorize('user'), asyncHandler(setEmergency));

router.put('/:id/location', protect, authorize('worker'), asyncHandler(updateLiveLocation));
router.put('/:id/user-location', protect, authorize('user'), asyncHandler(updateUserLocation));
router.get('/:id/location', protect, asyncHandler(getLiveLocation));

module.exports = router;
