const PayoutRequest = require('../models/PayoutRequest');
const Payment = require('../models/Payment');
const { paginationFromQuery, sortFromQuery, paginatedResponse } = require('../utils/queryHelpers');

// @desc    Worker requests a payout of their approved/paid_by_user balance
// @route   POST /api/payouts
// @access  Private/Worker
const createPayoutRequest = async (req, res) => {
  const workerId = String(req.user.id);

  const existing = await PayoutRequest.findOne({ workerId, status: 'pending' });
  if (existing) {
    return res.status(400).json({ message: 'You already have a pending payout request.' });
  }

  const payments = await Payment.find({ workerId, status: 'paid_by_user' });
  const amount = payments.reduce((sum, p) => sum + (Number(p.amount) || 0), 0);
  if (amount <= 0) {
    return res.status(400).json({ message: 'No pending funds available for payout.' });
  }

  const payout = await PayoutRequest.create({
    workerId,
    amount,
    status: 'pending',
    note: req.body.note || `Payout request for ₹${amount}`
  });

  res.status(201).json(payout.toJSON());
};

// @desc    List payout requests (worker sees own, admin/special_admin see all)
// @route   GET /api/payouts?status=&page=&limit=&sort=
// @access  Private
const listPayoutRequests = async (req, res) => {
  const { page, limit, skip } = paginationFromQuery(req.query);
  const sort = sortFromQuery(req.query, 'requestedAt');
  const filter = {};

  if (req.user.role === 'worker') filter.workerId = String(req.user.id);
  if (req.query.status) filter.status = req.query.status;

  const [data, total] = await Promise.all([
    PayoutRequest.find(filter).sort(sort).skip(skip).limit(limit),
    PayoutRequest.countDocuments(filter)
  ]);

  paginatedResponse(res, { data: data.map((d) => d.toJSON()), total, page, limit });
};

// @desc    Admin/special_admin approves or rejects a payout request
// @route   PUT /api/payouts/:id/status
// @access  Private/Admin,SpecialAdmin
const updatePayoutStatus = async (req, res) => {
  const { status } = req.body;
  if (!['approved', 'rejected'].includes(status)) {
    return res.status(400).json({ message: "status must be 'approved' or 'rejected'" });
  }

  const payout = await PayoutRequest.findByIdAndUpdate(
    req.params.id,
    { status, resolvedAt: new Date() },
    { new: true }
  );
  if (!payout) return res.status(404).json({ message: 'Payout request not found' });

  // On approval, mark the underlying payments as 'approved' so they stop
  // showing as pending release in the worker's earnings view.
  if (status === 'approved') {
    await Payment.updateMany(
      { workerId: payout.workerId, status: 'paid_by_user' },
      { status: 'approved' }
    );
  }

  res.status(200).json(payout.toJSON());
};

module.exports = { createPayoutRequest, listPayoutRequests, updatePayoutStatus };
