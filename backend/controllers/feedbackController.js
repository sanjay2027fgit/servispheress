const Feedback = require('../models/Feedback');
const Booking = require('../models/Booking');
const Worker = require('../models/Worker');
const { paginationFromQuery, sortFromQuery, paginatedResponse } = require('../utils/queryHelpers');

// @desc    Submit feedback/rating for a completed booking
// @route   POST /api/feedback
// @access  Private/User
const createFeedback = async (req, res) => {
  const { bookingId, rating, comment } = req.body;
  if (!bookingId || !rating) {
    return res.status(400).json({ message: 'bookingId and rating are required' });
  }
  if (rating < 1 || rating > 5) {
    return res.status(400).json({ message: 'rating must be between 1 and 5' });
  }

  const booking = await Booking.findById(bookingId).catch(() => null);
  if (!booking) return res.status(404).json({ message: 'Booking not found' });
  if (booking.userId !== req.user.doc.email) {
    return res.status(403).json({ message: 'Forbidden' });
  }

  const existing = await Feedback.findOne({ bookingId: String(bookingId), userId: req.user.doc.email });
  if (existing) return res.status(400).json({ message: 'Feedback already submitted for this booking' });

  const feedback = await Feedback.create({
    bookingId: String(bookingId),
    userId: req.user.doc.email,
    rating,
    comment
  });

  // Roll the new rating into the worker's aggregate rating.
  const worker = await Worker.findById(booking.workerId).catch(() => null);
  if (worker) {
    const newCount = worker.ratingCount + 1;
    const newAvg = (worker.ratingAvg * worker.ratingCount + rating) / newCount;
    worker.ratingAvg = Math.round(newAvg * 10) / 10;
    worker.ratingCount = newCount;
    await worker.save();
  }

  res.status(201).json(feedback.toJSON ? feedback.toJSON() : feedback);
};

// @desc    List feedback (by booking, by worker's bookings, or all for admin)
// @route   GET /api/feedback?bookingId=&page=&limit=&sort=
// @access  Private
const listFeedback = async (req, res) => {
  const { page, limit, skip } = paginationFromQuery(req.query);
  const sort = sortFromQuery(req.query);
  const filter = {};

  if (req.query.bookingId) filter.bookingId = req.query.bookingId;
  if (req.user.role === 'user') filter.userId = req.user.doc.email;

  const [data, total] = await Promise.all([
    Feedback.find(filter).sort(sort).skip(skip).limit(limit),
    Feedback.countDocuments(filter)
  ]);

  paginatedResponse(res, { data, total, page, limit });
};

module.exports = { createFeedback, listFeedback };
