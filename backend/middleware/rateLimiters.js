const rateLimit = require('express-rate-limit');

// Applied only to the actual brute-force target (password login), not to
// OTP/signup/refresh which are legitimate high-frequency actions.
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: 'Too many login attempts. Please try again in a few minutes.' }
});

// Applied to OTP send/resend -- prevents spam/abuse of the email-sending
// endpoint without blocking someone who legitimately needs to resend a
// couple of times (typo'd email, slow inbox, etc.)
const otpLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: 'Too many OTP requests. Please wait a few minutes before trying again.' }
});

module.exports = { loginLimiter, otpLimiter };
