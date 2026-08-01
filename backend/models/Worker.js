const mongoose = require('mongoose');

const workerSchema = new mongoose.Schema({
  id: { type: String },
  email: { type: String, required: true, unique: true },
  // NOTE: password and aadhar were missing from this schema before, so Mongoose's
  // default strict mode silently dropped them on every signup. Adding them here
  // does not change controllers/authController.js at all -- it just lets the
  // fields it already sends actually get persisted.
  password: { type: String },
  aadhar: { type: String },
  name: { type: String },
  role: { type: String }, // worker's service category, e.g. 'Electrician'
  experience: { type: Number },
  phone: { type: String },
  city: { type: String },
  state: { type: String },
  rate: { type: Number, default: 200 }, // hourly rate shown on worker cards
  availability: { type: Boolean, default: true },
  isOnline: { type: Boolean, default: false },
  isBlocked: { type: Boolean, default: false },
  ratingAvg: { type: Number, default: 0 },
  ratingCount: { type: Number, default: 0 },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
});

workerSchema.set('toJSON', {
  transform: (doc, ret) => {
    ret.id = ret._id.toString(); // always the real Mongo id, ignoring any legacy custom 'id' field from old signup data
    delete ret.password;
    delete ret.__v;
    return ret;
  }
});

workerSchema.index({ city: 1, role: 1, availability: 1 });
workerSchema.index({ isBlocked: 1 });

module.exports = mongoose.model('Worker', workerSchema);
