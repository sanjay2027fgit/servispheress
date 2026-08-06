const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/authMiddleware');
const { asyncHandler } = require('../middleware/errorMiddleware');
const { validate, chatMessageValidation } = require('../middleware/validators');
const { getChatByBooking, sendMessage } = require('../controllers/chatController');

router.get('/:bookingId', protect, asyncHandler(getChatByBooking));
router.post('/:bookingId', protect, chatMessageValidation, validate, asyncHandler(sendMessage));

module.exports = router;
