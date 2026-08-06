const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
  id: { type: String },
  email: { type: String, required: true, unique: true },
  password: { type: String }, // optional for now since it's an admin dashboard overview
  name: { type: String },
  phone: { type: String },
  city: { type: String }, // replaces localStorage 'userCity'
  isBlocked: { type: Boolean, default: false },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
});

userSchema.set('toJSON', {
  transform: (doc, ret) => {
    ret.id = ret._id.toString(); // always the real Mongo id, ignoring any legacy custom 'id' field from old signup data
    delete ret.password;
    delete ret.__v;
    return ret;
  }
});

userSchema.index({ isBlocked: 1 });
userSchema.index({ city: 1 });

module.exports = mongoose.model('User', userSchema);
