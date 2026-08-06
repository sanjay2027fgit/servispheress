const express = require('express');
const router = express.Router();
const { sendOtp, resendOtp, signupUser, signupWorker } = require('../controllers/authController');
const { loginUser, loginWorker, loginAdmin, getMe, refresh, logout } = require('../controllers/sessionController');
const { protect } = require('../middleware/authMiddleware');
const { asyncHandler } = require('../middleware/errorMiddleware');
const { validate, loginValidation } = require('../middleware/validators');
const { loginLimiter, otpLimiter } = require('../middleware/rateLimiters');

router.post('/send-otp', otpLimiter, sendOtp);
router.post('/resend-otp', otpLimiter, resendOtp);
router.post('/signup/user', signupUser);
router.post('/signup/worker', signupWorker);

// New: real login endpoints (previously these were mocked/localStorage-only on the frontend)
router.post('/login/user', loginLimiter, loginValidation, validate, asyncHandler(loginUser));
router.post('/login/worker', loginLimiter, loginValidation, validate, asyncHandler(loginWorker));
router.post('/login/admin', loginLimiter, loginValidation, validate, asyncHandler(loginAdmin)); // also handles special_admin (role lives on the Admin doc)
router.get('/me', protect, asyncHandler(getMe));
router.post('/refresh', asyncHandler(refresh));
router.post('/logout', asyncHandler(logout));

module.exports = router;
