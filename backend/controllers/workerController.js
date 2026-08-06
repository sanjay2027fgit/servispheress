const Worker = require('../models/Worker');
const Booking = require('../models/Booking');
const { paginationFromQuery, sortFromQuery, searchFilter, paginatedResponse } = require('../utils/queryHelpers');

// @desc    Get my own worker profile
// @route   GET /api/workers/me
// @access  Private/Worker
const getMyProfile = async (req, res) => {
  const worker = await Worker.findById(req.user.id);
  if (!worker) return res.status(404).json({ message: 'Worker not found' });
  res.status(200).json(worker.toJSON());
};

// @desc    Update my own worker profile
// @route   PUT /api/workers/me
// @access  Private/Worker
const updateMyProfile = async (req, res) => {
  const { name, phone, city, experience } = req.body;
  const worker = await Worker.findById(req.user.id);
  if (!worker) return res.status(404).json({ message: 'Worker not found' });

  if (name !== undefined) worker.name = name;
  if (phone !== undefined) worker.phone = phone;
  if (city !== undefined) worker.city = city;
  if (experience !== undefined) worker.experience = experience;
  worker.updatedAt = new Date();
  await worker.save();

  res.status(200).json(worker.toJSON());
};

// @desc    Toggle my own availability / online status
// @route   PUT /api/workers/me/availability
// @access  Private/Worker
const setMyAvailability = async (req, res) => {
  const { availability, isOnline } = req.body;
  const worker = await Worker.findById(req.user.id);
  if (!worker) return res.status(404).json({ message: 'Worker not found' });

  if (availability !== undefined) worker.availability = !!availability;
  if (isOnline !== undefined) worker.isOnline = !!isOnline;
  worker.updatedAt = new Date();
  await worker.save();

  res.status(200).json(worker.toJSON());
};

// @desc    List workers (public-ish; used by the user dashboard to find
//          available workers by city/role). Pagination/search/filter/sort supported.
// @route   GET /api/workers?city=&role=&availability=&isOnline=&search=&page=&limit=&sort=
// @access  Private (any logged-in role)
const listWorkers = async (req, res) => {
  const { page, limit, skip } = paginationFromQuery(req.query);
  const sort = sortFromQuery(req.query, 'ratingAvg');
  const filter = { ...searchFilter(req.query, ['name', 'email', 'city', 'role']) };

  if (req.query.city) filter.city = new RegExp(`^${req.query.city}$`, 'i');
  if (req.query.role) filter.role = req.query.role;
  if (req.query.availability !== undefined) filter.availability = req.query.availability === 'true';
  if (req.query.isOnline !== undefined) filter.isOnline = req.query.isOnline === 'true';
  if (req.query.isBlocked !== undefined) filter.isBlocked = req.query.isBlocked === 'true';

  const [data, total] = await Promise.all([
    Worker.find(filter).sort(sort).skip(skip).limit(limit),
    Worker.countDocuments(filter)
  ]);

  paginatedResponse(res, { data: data.map((d) => d.toJSON()), total, page, limit });
};

// @desc    Get a single worker by id
// @route   GET /api/workers/:id
// @access  Private
const getWorker = async (req, res) => {
  const worker = await Worker.findById(req.params.id);
  if (!worker) return res.status(404).json({ message: 'Worker not found' });
  res.status(200).json(worker.toJSON());
};

// @desc    Block/unblock a worker
// @route   PUT /api/workers/:id/block
// @access  Private/Admin
const setWorkerBlocked = async (req, res) => {
  const { isBlocked } = req.body;
  const worker = await Worker.findByIdAndUpdate(
    req.params.id,
    { isBlocked: !!isBlocked, updatedAt: new Date() },
    { new: true }
  );
  if (!worker) return res.status(404).json({ message: 'Worker not found' });
  res.status(200).json(worker.toJSON());
};

// @desc    Delete a worker
// @route   DELETE /api/workers/:id
// @access  Private/Admin
const deleteWorker = async (req, res) => {
  const worker = await Worker.findByIdAndDelete(req.params.id);
  if (!worker) return res.status(404).json({ message: 'Worker not found' });
  res.status(200).json({ message: 'Worker removed successfully' });
};

// @desc    Get a worker's booked time slots for a given date (used by the
//          booking form to grey out already-taken slots). Returns only the
//          slot strings, not full booking data, so any logged-in role can call it.
// @route   GET /api/workers/:id/availability?date=YYYY-MM-DD
// @access  Private (any logged-in role)
const getWorkerAvailability = async (req, res) => {
  const { date } = req.query;
  if (!date) return res.status(400).json({ message: 'date query param is required' });

  const bookings = await Booking.find({
    workerId: String(req.params.id),
    date,
    isActiveSlot: true
  }).select('timeSlot');

  res.status(200).json({ bookedSlots: bookings.map((b) => b.timeSlot).filter(Boolean) });
};

module.exports = {
  getMyProfile,
  updateMyProfile,
  setMyAvailability,
  listWorkers,
  getWorker,
  getWorkerAvailability,
  setWorkerBlocked,
  deleteWorker
};
