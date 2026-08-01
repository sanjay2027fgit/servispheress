const Payment = require('../models/Payment');
const Booking = require('../models/Booking');
const { paginationFromQuery, sortFromQuery, paginatedResponse } = require('../utils/queryHelpers');

// @desc    Record a payment against a booking (called after Razorpay success,
//          or by admin for manual reconciliation).
// @route   POST /api/payments-data
// @access  Private
const createPayment = async (req, res) => {
  const { bookingId, amount, status } = req.body;
  if (!bookingId || !amount) {
    return res.status(400).json({ message: 'bookingId and amount are required' });
  }

  const booking = await Booking.findById(bookingId).catch(() => null);
  if (!booking) return res.status(404).json({ message: 'Booking not found' });

  const isOwner = req.user.role === 'user' && booking.userId === req.user.doc.email;
  const isWorker = req.user.role === 'worker' && booking.workerId === String(req.user.id);
  const isAdmin = req.user.role === 'admin' || req.user.role === 'special_admin';
  if (!isOwner && !isWorker && !isAdmin) {
    return res.status(403).json({ message: 'Forbidden: only the booking owner, assigned worker, or admin can create a payment' });
  }

  if (!isAdmin && booking.status !== 'completed') {
    return res.status(400).json({ message: 'Payment can only be created for completed bookings' });
  }

  const existingPayment = await Payment.findOne({ bookingId: String(bookingId) });
  if (existingPayment) {
    return res.status(200).json(existingPayment.toJSON());
  }

  const payment = await Payment.create({
    bookingId: String(bookingId),
    workerId: booking.workerId,
    userId: booking.userId,
    amount,
    status: status || 'pending'
  });

  res.status(201).json(payment.toJSON());
};

// @desc    List payments, scoped by role: users see only payments tied to
//          their own bookings, workers see only their own earnings,
//          admin/special_admin see everything with filters. Any role can
//          pass ?bookingId= to look up a specific booking's payment (still
//          subject to the same ownership scoping).
// @route   GET /api/payments-data?status=&workerId=&bookingId=&page=&limit=&sort=
// @access  Private
const listPayments = async (req, res) => {
  const { page, limit, skip } = paginationFromQuery(req.query);
  const sort = sortFromQuery(req.query);
  const filter = {};

  if (req.user.role === 'worker') filter.workerId = String(req.user.id);
  if (req.user.role === 'user') filter.userId = req.user.doc.email;
  if (req.query.status) filter.status = req.query.status;
  if (req.query.bookingId) filter.bookingId = String(req.query.bookingId);
  if (req.query.workerId && (req.user.role === 'admin' || req.user.role === 'special_admin')) {
    filter.workerId = req.query.workerId;
  }

  const [data, total] = await Promise.all([
    Payment.find(filter).sort(sort).skip(skip).limit(limit),
    Payment.countDocuments(filter)
  ]);

  paginatedResponse(res, { data: data.map((d) => d.toJSON()), total, page, limit });
};

// @desc    Update a payment's status.
//          - admin/special_admin can set it to any of pending/paid_by_user/approved
//            (this is how a payment gets released/approved for payout).
//          - the user who owns the underlying booking can only self-mark a
//            'pending' payment as 'paid_by_user' (i.e. "I've paid, awaiting release").
// @route   PUT /api/payments-data/:id/status
// @access  Private/User (owner, pending->paid_by_user only), Admin, SpecialAdmin
const updatePaymentStatus = async (req, res) => {
  const { status } = req.body;
  const allowed = ['pending', 'paid_by_user', 'approved'];
  if (!allowed.includes(status)) {
    return res.status(400).json({ message: `status must be one of: ${allowed.join(', ')}` });
  }

  const payment = await Payment.findById(req.params.id);
  if (!payment) return res.status(404).json({ message: 'Payment not found' });

  const isAdmin = req.user.role === 'admin' || req.user.role === 'special_admin';
  const isOwner = req.user.role === 'user' && payment.userId === req.user.doc.email;

  if (isAdmin) {
    payment.status = status;
  } else if (isOwner) {
    if (payment.status !== 'pending' || status !== 'paid_by_user') {
      return res.status(403).json({ message: "You can only mark a pending payment as paid" });
    }
    payment.status = 'paid_by_user';
  } else {
    return res.status(403).json({ message: 'Forbidden' });
  }

  await payment.save();
  res.status(200).json(payment.toJSON());
};

module.exports = { createPayment, listPayments, updatePaymentStatus };
