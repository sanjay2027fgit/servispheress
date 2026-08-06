const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/authMiddleware');
const { asyncHandler } = require('../middleware/errorMiddleware');
const { validate, feedbackValidation } = require('../middleware/validators');
const { createFeedback, listFeedback } = require('../controllers/feedbackController');

router.post('/', protect, feedbackValidation, validate, asyncHandler(createFeedback));
router.get('/', protect, asyncHandler(listFeedback));

module.exports = router;
