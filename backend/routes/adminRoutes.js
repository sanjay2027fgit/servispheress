const express = require('express');
const router = express.Router();
const User = require('../models/User');
const Worker = require('../models/Worker');
const Booking = require('../models/Booking');
const Payment = require('../models/Payment');
const Feedback = require('../models/Feedback');
const Chat = require('../models/Chat');
const PayoutRequest = require('../models/PayoutRequest');
const {
  getAdmins,
  createAdmin,
  updateAdmin,
  deleteAdmin
} = require('../controllers/adminController');
const { protect, authorize } = require('../middleware/authMiddleware');
const { validate, adminCreateValidation } = require('../middleware/validators');

// Admin CRUD routes -- restricted to special_admin (managing admin accounts
// is the most sensitive operation in the system).
router.route('/')
  .get(protect, authorize('special_admin'), getAdmins)
  .post(protect, authorize('special_admin'), adminCreateValidation, validate, createAdmin);
router.route('/:id').put(protect, authorize('special_admin'), updateAdmin).delete(protect, authorize('special_admin'), deleteAdmin);

// GET /api/admin/dashboard - Fetch all data for dashboard
router.get('/dashboard', protect, authorize('admin', 'special_admin'), async (req, res) => {
  try {
    const users = await User.find().lean();
    const workers = await Worker.find().lean();
    const bookings = await Booking.find().lean();
    const payments = await Payment.find().lean();
    const feedbacks = await Feedback.find().lean();
    const chats = await Chat.find().lean();
    const payoutRequests = await PayoutRequest.find().lean();

    // The frontend expects the models to have an 'id' instead of '_id', 
    // so we map them to include an 'id' field
    const mapId = (arr) => arr.map(doc => ({ ...doc, id: doc._id.toString() }));

    res.json({
      users: mapId(users),
      workers: mapId(workers),
      bookings: mapId(bookings),
      payments: mapId(payments),
      feedbacks: mapId(feedbacks),
      chats: mapId(chats),
      payoutRequests: mapId(payoutRequests)
    });
  } catch (error) {
    console.error('Error fetching dashboard data:', error);
    res.status(500).json({ error: 'Failed to fetch dashboard data' });
  }
});

// POST /api/admin/chat - Send a chat reply
router.post('/chat', protect, authorize('admin', 'special_admin'), async (req, res) => {
  const { bookingId, message } = req.body;
  if (!bookingId || !message) {
    return res.status(400).json({ error: 'Missing bookingId or message' });
  }

  try {
    let chat = await Chat.findOne({ bookingId });
    if (!chat) {
      chat = new Chat({ bookingId, messages: [] });
    }

    const newMessage = {
      sender: 'admin',
      message: message,
      timestamp: new Date()
    };

    chat.messages.push(newMessage);
    await chat.save();

    res.json({ success: true, chat });
  } catch (error) {
    console.error('Error saving chat message:', error);
    res.status(500).json({ error: 'Failed to save chat message' });
  }
});

// POST /api/admin/seed - Populate the database with data from frontend local storage
// Restricted to special_admin: this WIPES users/workers/bookings/payments/feedbacks/chats.
router.post('/seed', protect, authorize('special_admin'), async (req, res) => {
  try {
    const { users, workers, bookings, payments, feedbacks, chats } = req.body;

    // Clear existing data
    await User.deleteMany();
    await Worker.deleteMany();
    await Booking.deleteMany();
    await Payment.deleteMany();
    await Feedback.deleteMany();
    await Chat.deleteMany();

    // Insert data provided from local storage
    if (users && users.length > 0) await User.insertMany(users);
    if (workers && workers.length > 0) await Worker.insertMany(workers);
    if (bookings && bookings.length > 0) await Booking.insertMany(bookings);
    if (payments && payments.length > 0) await Payment.insertMany(payments);
    if (feedbacks && feedbacks.length > 0) await Feedback.insertMany(feedbacks);
    if (chats && chats.length > 0) await Chat.insertMany(chats);

    res.json({ success: true, message: 'Database seeded with local storage data successfully' });
  } catch (error) {
    console.error('Error seeding database:', error);
    res.status(500).json({ error: 'Failed to seed database' });
  }
});

module.exports = router;
