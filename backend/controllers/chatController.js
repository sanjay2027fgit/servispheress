const Chat = require('../models/Chat');
const Booking = require('../models/Booking');

const canAccessBooking = (booking, reqUser) => {
  if (!booking) return false;
  if (reqUser.role === 'user') return booking.userId === reqUser.doc.email;
  if (reqUser.role === 'worker') return booking.workerId === String(reqUser.id);
  return reqUser.role === 'admin' || reqUser.role === 'special_admin';
};

// @desc    Get the chat thread for a booking
// @route   GET /api/chat/:bookingId
// @access  Private (participants of the booking, or admin)
const getChatByBooking = async (req, res) => {
  const booking = await Booking.findById(req.params.bookingId).catch(() => null);
  if (!booking) return res.status(404).json({ message: 'Booking not found' });
  if (!canAccessBooking(booking, req.user)) return res.status(403).json({ message: 'Forbidden' });

  const chat = await Chat.findOne({ bookingId: String(req.params.bookingId) });
  res.status(200).json(chat || { bookingId: String(req.params.bookingId), messages: [] });
};

// @desc    Send a message on a booking's chat thread (user or worker side)
// @route   POST /api/chat/:bookingId
// @access  Private/User,Worker
const sendMessage = async (req, res) => {
  const { message } = req.body;
  if (!message || !message.trim()) {
    return res.status(400).json({ message: 'message is required' });
  }
  if (!['user', 'worker'].includes(req.user.role)) {
    return res.status(403).json({ message: 'Only users and workers can send messages here' });
  }

  const booking = await Booking.findById(req.params.bookingId).catch(() => null);
  if (!booking) return res.status(404).json({ message: 'Booking not found' });
  if (!canAccessBooking(booking, req.user)) return res.status(403).json({ message: 'Forbidden' });

  let chat = await Chat.findOne({ bookingId: String(req.params.bookingId) });
  if (!chat) chat = new Chat({ bookingId: String(req.params.bookingId), messages: [] });

  chat.messages.push({ sender: req.user.role, message: message.trim(), timestamp: new Date() });
  await chat.save();

  res.status(200).json(chat);
};

module.exports = { getChatByBooking, sendMessage };
