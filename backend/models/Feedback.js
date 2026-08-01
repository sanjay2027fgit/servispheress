const mongoose = require('mongoose');

const feedbackSchema = new mongoose.Schema({
  id: { type: String },
  bookingId: { type: String, required: true },
  userId: { type: String, required: true },
  rating: { type: Number, required: true },
  comment: { type: String },
  createdAt: { type: Date, default: Date.now }
});

feedbackSchema.index({ bookingId: 1 });
feedbackSchema.index({ userId: 1 });

feedbackSchema.set('toJSON', {
  transform: (doc, ret) => {
    ret.id = ret._id.toString(); // always the real Mongo id, ignoring any legacy custom 'id' field from old signup data
    delete ret.__v;
    return ret;
  }
});

module.exports = mongoose.model('Feedback', feedbackSchema);
