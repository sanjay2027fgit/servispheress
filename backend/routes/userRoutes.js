const express = require('express');
const router = express.Router();
const { protect, authorize } = require('../middleware/authMiddleware');
const { asyncHandler } = require('../middleware/errorMiddleware');
const { validate, profileUpdateValidation } = require('../middleware/validators');
const {
  getMyProfile,
  updateMyProfile,
  listUsers,
  getUser,
  setUserBlocked,
  deleteUser
} = require('../controllers/userController');

router.get('/me', protect, authorize('user'), asyncHandler(getMyProfile));
router.put('/me', protect, authorize('user'), profileUpdateValidation, validate, asyncHandler(updateMyProfile));

router.get('/', protect, authorize('admin', 'special_admin'), asyncHandler(listUsers));
router.get('/:id', protect, authorize('admin', 'special_admin'), asyncHandler(getUser));
router.put('/:id/block', protect, authorize('admin', 'special_admin'), asyncHandler(setUserBlocked));
router.delete('/:id', protect, authorize('admin', 'special_admin'), asyncHandler(deleteUser));

module.exports = router;
