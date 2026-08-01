const mongoose = require('mongoose');

const messageSchema = new mongoose.Schema({
  sender: { type: String, enum: ['admin', 'user', 'worker'], required: true },
  message: { type: String, required: true },
  timestamp: { type: Date, default: Date.now }
});

const chatSchema = new mongoose.Schema({
  id: { type: String },
  bookingId: { type: String, required: true, unique: true },
  messages: [messageSchema]
});

module.exports = mongoose.model('Chat', chatSchema);
