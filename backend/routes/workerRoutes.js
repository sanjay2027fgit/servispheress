const express = require('express');
const router = express.Router();
const { protect, authorize } = require('../middleware/authMiddleware');
const { asyncHandler } = require('../middleware/errorMiddleware');
const { validate, profileUpdateValidation, availabilityValidation } = require('../middleware/validators');
const {
  getMyProfile,
  updateMyProfile,
  setMyAvailability,
  listWorkers,
  getWorker,
  getWorkerAvailability,
  setWorkerBlocked,
  deleteWorker
} = require('../controllers/workerController');

router.get('/me', protect, authorize('worker'), asyncHandler(getMyProfile));
router.put('/me', protect, authorize('worker'), profileUpdateValidation, validate, asyncHandler(updateMyProfile));
router.put('/me/availability', protect, authorize('worker'), availabilityValidation, validate, asyncHandler(setMyAvailability));

// Any logged-in role can browse workers (users need this to pick a worker to book)
router.get('/', protect, asyncHandler(listWorkers));
router.get('/:id/availability', protect, asyncHandler(getWorkerAvailability));
router.get('/:id', protect, asyncHandler(getWorker));

router.put('/:id/block', protect, authorize('admin', 'special_admin'), asyncHandler(setWorkerBlocked));
router.delete('/:id', protect, authorize('admin', 'special_admin'), asyncHandler(deleteWorker));

module.exports = router;
