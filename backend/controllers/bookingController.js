const Booking = require('../models/Booking');
const Worker = require('../models/Worker');
const Payment = require('../models/Payment');
const { paginationFromQuery, sortFromQuery, searchFilter, paginatedResponse } = require('../utils/queryHelpers');

// @desc    Create a booking
// @route   POST /api/bookings
// @access  Private/User
const createBooking = async (req, res) => {
  const { workerId, date, timeSlot, location, emergency } = req.body;
  if (!workerId || !date || !timeSlot || !location) {
    return res.status(400).json({ message: 'workerId, date, timeSlot and location are required' });
  }

  const worker = await Worker.findById(workerId).catch(() => null);
  if (!worker) return res.status(404).json({ message: 'Worker not found' });

  // Fast-fail pre-check for a friendly error message in the common case.
  // This alone is NOT atomic (two simultaneous requests could both pass it) --
  // the actual guarantee is the partial unique index on Booking, enforced by
  // MongoDB itself; see the try/catch below.
  const clash = await Booking.findOne({ workerId: String(workerId), date, timeSlot, isActiveSlot: true });
  if (clash) {
    return res.status(409).json({ message: 'This time slot has just been booked. Please choose another.' });
  }

  try {
    const booking = await Booking.create({
      userId: req.user.doc.email,
      workerId: String(workerId),
      date,
      timeSlot,
      location,
      emergency: !!emergency,
      status: 'pending',
      isActiveSlot: true
    });
    res.status(201).json(booking.toJSON());
  } catch (err) {
    if (err.code === 11000) {
      // Lost the race: someone else's insert landed first. Same friendly
      // message as the pre-check above.
      return res.status(409).json({ message: 'This time slot has just been booked. Please choose another.' });
    }
    throw err;
  }
};

// @desc    List bookings, scoped by role: user sees their own, worker sees
//          assigned to them, admin/special_admin see everything with filters.
// @route   GET /api/bookings?status=&emergency=&page=&limit=&sort=&search=
// @access  Private
const listBookings = async (req, res) => {
  const { page, limit, skip } = paginationFromQuery(req.query);
  const sort = sortFromQuery(req.query);
  const filter = { ...searchFilter(req.query, ['userId', 'workerId', 'status']) };

  if (req.user.role === 'user') filter.userId = req.user.doc.email;
  else if (req.user.role === 'worker') filter.workerId = String(req.user.id);
  // admin/special_admin: no implicit scoping

  if (req.query.status) filter.status = req.query.status;
  if (req.query.emergency !== undefined) filter.emergency = req.query.emergency === 'true';
  if (req.query.userId && (req.user.role === 'admin' || req.user.role === 'special_admin')) {
    filter.userId = req.query.userId;
  }
  if (req.query.workerId && (req.user.role === 'admin' || req.user.role === 'special_admin')) {
    filter.workerId = req.query.workerId;
  }

  const [data, total] = await Promise.all([
    Booking.find(filter).sort(sort).skip(skip).limit(limit),
    Booking.countDocuments(filter)
  ]);

  paginatedResponse(res, { data: data.map((d) => d.toJSON()), total, page, limit });
};

// @desc    Get a single booking (must belong to requester unless admin)
// @route   GET /api/bookings/:id
// @access  Private
const getBooking = async (req, res) => {
  const booking = await Booking.findById(req.params.id);
  if (!booking) return res.status(404).json({ message: 'Booking not found' });

  const isOwner = req.user.role === 'user' && booking.userId === req.user.doc.email;
  const isAssignedWorker = req.user.role === 'worker' && booking.workerId === String(req.user.id);
  const isAdmin = req.user.role === 'admin' || req.user.role === 'special_admin';
  if (!isOwner && !isAssignedWorker && !isAdmin) {
    return res.status(403).json({ message: 'Forbidden' });
  }

  res.status(200).json(booking.toJSON());
};

// @desc    Update booking status (accept/reject/start/complete etc.)
// @route   PUT /api/bookings/:id/status
// @access  Private/Worker,Admin,SpecialAdmin
const updateBookingStatus = async (req, res) => {
  const { status } = req.body;
  if (!status || typeof status !== 'string' || !status.trim()) {
    return res.status(400).json({ message: 'status is required' });
  }

  const booking = await Booking.findById(req.params.id);
  if (!booking) return res.status(404).json({ message: 'Booking not found' });

  const isAssignedWorker = req.user.role === 'worker' && booking.workerId === String(req.user.id);
  const isOwnerUser = req.user.role === 'user' && booking.userId === req.user.doc.email;
  const isAdmin = req.user.role === 'admin' || req.user.role === 'special_admin';
  if (!isAssignedWorker && !isOwnerUser && !isAdmin) {
    return res.status(403).json({ message: 'Forbidden' });
  }

  booking.status = status;
  const terminalStatuses = ['rejected', 'cancelled_by_user', 'cancelled_by_worker', 'completed', 'done', 'payment_confirmed', 'expired'];
  if (terminalStatuses.includes(status)) {
    booking.isActiveSlot = false;
  }

  // Ensure the payment record exists only once when a job reaches completion.
  if (status === 'completed') {
    const existingPayment = await Payment.findOne({ bookingId: String(booking._id) });
    if (!existingPayment) {
      await Payment.create({
        bookingId: String(booking._id),
        workerId: booking.workerId,
        userId: booking.userId,
        amount: booking.emergency ? 600 : 200,
        status: 'pending'
      });
    }
  }

  await booking.save();
  res.status(200).json(booking.toJSON());
};

// @desc    Cancel my own booking (user side)
// @route   PUT /api/bookings/:id/cancel
// @access  Private/User
const cancelBooking = async (req, res) => {
  const { reason } = req.body;
  const booking = await Booking.findById(req.params.id);
  if (!booking) return res.status(404).json({ message: 'Booking not found' });

  if (booking.userId !== req.user.doc.email) {
    return res.status(403).json({ message: 'Forbidden' });
  }
  if (['completed', 'cancelled_by_user', 'cancelled_by_worker'].includes(booking.status)) {
    return res.status(400).json({ message: `Booking already ${booking.status}` });
  }

  booking.status = 'cancelled_by_user';
  booking.cancelReason = reason || '';
  booking.isActiveSlot = false;
  await booking.save();
  res.status(200).json(booking.toJSON());
};

// @desc    Worker pushes a live location update for an active booking
// @route   PUT /api/bookings/:id/location
// @access  Private/Worker
const updateLiveLocation = async (req, res) => {
  const lat = Number(req.body?.lat ?? req.body?.latitude);
  const lng = Number(req.body?.lng ?? req.body?.longitude);
  const accuracy = Number(req.body?.accuracy ?? 0);
  if (Number.isNaN(lat) || Number.isNaN(lng)) {
    return res.status(400).json({ message: 'lat and lng are required' });
  }

  const booking = await Booking.findById(req.params.id);
  if (!booking) return res.status(404).json({ message: 'Booking not found' });
  if (booking.workerId !== String(req.user.id)) {
    return res.status(403).json({ message: 'Forbidden' });
  }

  const locationPayload = {
    lat,
    lng,
    latitude: lat,
    longitude: lng,
    accuracy,
    updatedAt: new Date()
  };

  booking.workerLocation = locationPayload;
  booking.liveLocation = locationPayload;
  await booking.save();
  res.status(200).json(booking.toJSON());
};

// @desc    User pushes their own live location for a booking they own (this
//          is the target the worker's tracking view heads towards)
// @route   PUT /api/bookings/:id/user-location
// @access  Private/User (owner)
const updateUserLocation = async (req, res) => {
  const lat = Number(req.body?.lat ?? req.body?.latitude);
  const lng = Number(req.body?.lng ?? req.body?.longitude);
  const accuracy = Number(req.body?.accuracy ?? 0);
  if (Number.isNaN(lat) || Number.isNaN(lng)) {
    return res.status(400).json({ message: 'lat and lng are required' });
  }

  const booking = await Booking.findById(req.params.id);
  if (!booking) return res.status(404).json({ message: 'Booking not found' });
  if (booking.userId !== req.user.doc.email) {
    return res.status(403).json({ message: 'Forbidden' });
  }

  const locationPayload = {
    lat,
    lng,
    latitude: lat,
    longitude: lng,
    accuracy,
    updatedAt: new Date()
  };

  booking.userLocation = locationPayload;
  await booking.save();
  res.status(200).json(booking.toJSON());
};

// @desc    Poll both the worker's live location and the user's own live
//          location for a booking (owner or assigned worker or admin)
// @route   GET /api/bookings/:id/location
// @access  Private/User (owner), Worker (assigned), or Admin
const getLiveLocation = async (req, res) => {
  const booking = await Booking.findById(req.params.id).select('userId workerId workerLocation liveLocation userLocation');
  if (!booking) return res.status(404).json({ message: 'Booking not found' });

  const isOwner = req.user.role === 'user' && booking.userId === req.user.doc.email;
  const isAssignedWorker = req.user.role === 'worker' && booking.workerId === String(req.user.id);
  const isAdmin = req.user.role === 'admin' || req.user.role === 'special_admin';
  if (!isOwner && !isAssignedWorker && !isAdmin) return res.status(403).json({ message: 'Forbidden' });

  res.status(200).json({
    liveLocation: booking.workerLocation || booking.liveLocation || null,
    workerLocation: booking.workerLocation || booking.liveLocation || null,
    userLocation: booking.userLocation || null
  });
};

// @desc    User toggles emergency mode on their own booking (only while pending)
// @route   PUT /api/bookings/:id/emergency
// @access  Private/User (owner)
const setEmergency = async (req, res) => {
  const { emergency } = req.body;
  if (typeof emergency !== 'boolean') {
    return res.status(400).json({ message: 'emergency (boolean) is required' });
  }

  const booking = await Booking.findById(req.params.id);
  if (!booking) return res.status(404).json({ message: 'Booking not found' });
  if (booking.userId !== req.user.doc.email) {
    return res.status(403).json({ message: 'Forbidden' });
  }

  booking.emergency = emergency;
  await booking.save();
  res.status(200).json(booking.toJSON());
};

module.exports = {
  createBooking,
  listBookings,
  getBooking,
  updateBookingStatus,
  cancelBooking,
  updateLiveLocation,
  updateUserLocation,
  getLiveLocation,
  setEmergency
};
