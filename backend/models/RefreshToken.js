const mongoose = require('mongoose');

const refreshTokenSchema = new mongoose.Schema({
  tokenHash: { type: String, required: true, unique: true },
  accountId: { type: String, required: true },
  role: { type: String, required: true }, // 'user' | 'worker' | 'admin' | 'special_admin'
  revoked: { type: Boolean, default: false },
  expiresAt: { type: Date, required: true },
  createdAt: { type: Date, default: Date.now }
});

// TTL index: Mongo automatically deletes expired refresh tokens.
refreshTokenSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
refreshTokenSchema.index({ accountId: 1 });

module.exports = mongoose.model('RefreshToken', refreshTokenSchema);
