const { body, validationResult } = require('express-validator');

// Runs after a chain of *Validation rules; if any failed, returns a 400 with
// all the messages instead of letting the request reach the controller.
const validate = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      message: 'Validation failed',
      errors: errors.array().map((e) => ({ field: e.path, message: e.msg }))
    });
  }
  next();
};

const loginValidation = [
  body('email').isEmail().withMessage('A valid email is required').normalizeEmail(),
  body('password').isString().isLength({ min: 1 }).withMessage('Password is required')
];

const profileUpdateValidation = [
  body('name').optional().isString().trim().isLength({ max: 100 }),
  body('phone').optional().isString().trim().isLength({ max: 20 }),
  body('city').optional().isString().trim().isLength({ max: 100 })
];

const availabilityValidation = [
  body('availability').optional().isBoolean(),
  body('isOnline').optional().isBoolean()
];

const bookingCreateValidation = [
  body('workerId').isString().notEmpty().withMessage('workerId is required'),
  body('date').isString().notEmpty().withMessage('date is required'),
  body('timeSlot').isString().notEmpty().withMessage('timeSlot is required'),
  body('location').notEmpty().withMessage('location is required'),
  body('emergency').optional().isBoolean()
];

const bookingStatusValidation = [
  body('status').isString().trim().isLength({ min: 1, max: 40 }).withMessage('status is required')
];

const feedbackValidation = [
  body('bookingId').isString().notEmpty().withMessage('bookingId is required'),
  body('rating').isInt({ min: 1, max: 5 }).withMessage('rating must be between 1 and 5'),
  body('comment').optional().isString().trim().isLength({ max: 1000 })
];

const paymentCreateValidation = [
  body('bookingId').isString().notEmpty().withMessage('bookingId is required'),
  body('amount').isFloat({ gt: 0 }).withMessage('amount must be a positive number'),
  body('status').optional().isIn(['pending', 'paid_by_user', 'approved'])
];

const chatMessageValidation = [
  body('message').isString().trim().isLength({ min: 1, max: 2000 }).withMessage('message is required (max 2000 chars)')
];

const adminCreateValidation = [
  body('email').isEmail().withMessage('A valid email is required').normalizeEmail(),
  body('password').isString().isLength({ min: 6 }).withMessage('Password must be at least 6 characters'),
  body('role').optional().isIn(['admin', 'special_admin'])
];

module.exports = {
  validate,
  loginValidation,
  profileUpdateValidation,
  availabilityValidation,
  bookingCreateValidation,
  bookingStatusValidation,
  feedbackValidation,
  paymentCreateValidation,
  chatMessageValidation,
  adminCreateValidation
};
