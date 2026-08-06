const bcrypt = require('bcrypt');
const User = require('../models/User');
const Worker = require('../models/Worker');
const Admin = require('../models/Admin');
const RefreshToken = require('../models/RefreshToken');
const { normalizeEmail } = require('../utils/otpService');
const { issueTokenPair, generateAccessToken, issueRefreshToken, hashToken } = require('../utils/tokenUtils');

// @desc    Login a user
// @route   POST /api/auth/login/user
// @access  Public
const loginUser = async (req, res) => {
  try {
    const { email, password } = req.body;
    const normalizedEmail = normalizeEmail(email);
    if (!normalizedEmail || !password) {
      return res.status(400).json({ message: 'Please provide email and password' });
    }

    const user = await User.findOne({ email: normalizedEmail });
    if (!user || !user.password) {
      return res.status(401).json({ message: 'Invalid credentials' });
    }

    const match = await bcrypt.compare(password, user.password);
    if (!match) {
      return res.status(401).json({ message: 'Invalid credentials' });
    }
    if (user.isBlocked) {
      return res.status(403).json({ message: 'This account has been blocked. Contact support.' });
    }

    const { accessToken, refreshToken } = await issueTokenPair(user._id, 'user');
    res.status(200).json({ token: accessToken, refreshToken, role: 'user', user: user.toJSON() });
  } catch (error) {
    console.error('Error in loginUser:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

// @desc    Login a worker
// @route   POST /api/auth/login/worker
// @access  Public
const loginWorker = async (req, res) => {
  try {
    const { email, password } = req.body;
    const normalizedEmail = normalizeEmail(email);
    if (!normalizedEmail || !password) {
      return res.status(400).json({ message: 'Please provide email and password' });
    }

    const worker = await Worker.findOne({ email: normalizedEmail });
    if (!worker || !worker.password) {
      return res.status(401).json({ message: 'Invalid credentials' });
    }

    const match = await bcrypt.compare(password, worker.password);
    if (!match) {
      return res.status(401).json({ message: 'Invalid credentials' });
    }
    if (worker.isBlocked) {
      return res.status(403).json({ message: 'This account has been blocked. Contact support.' });
    }

    const { accessToken, refreshToken } = await issueTokenPair(worker._id, 'worker');
    res.status(200).json({ token: accessToken, refreshToken, role: 'worker', worker: worker.toJSON() });
  } catch (error) {
    console.error('Error in loginWorker:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

// @desc    Login an admin or special_admin (role is read from the Admin document itself)
// @route   POST /api/auth/login/admin
// @access  Public
const loginAdmin = async (req, res) => {
  try {
    const { email, password } = req.body;
    const normalizedEmail = normalizeEmail(email);
    if (!normalizedEmail || !password) {
      return res.status(400).json({ message: 'Please provide email and password' });
    }

    const admin = await Admin.findOne({ email: normalizedEmail });
    if (!admin) {
      return res.status(401).json({ message: 'Invalid credentials' });
    }

    const match = await admin.comparePassword(password);
    if (!match) {
      return res.status(401).json({ message: 'Invalid credentials' });
    }

    // admin.role is expected to be 'admin' or 'special_admin'
    const role = admin.role === 'special_admin' ? 'special_admin' : 'admin';
    const { accessToken, refreshToken } = await issueTokenPair(admin._id, role);
    res.status(200).json({ token: accessToken, refreshToken, role: admin.role, admin: admin.toJSON() });
  } catch (error) {
    console.error('Error in loginAdmin:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

// @desc    Return the currently authenticated account
// @route   GET /api/auth/me
// @access  Private (any role)
const getMe = async (req, res) => {
  res.status(200).json({ role: req.user.role, account: req.user.doc });
};

// @desc    Exchange a valid refresh token for a new access token (rotates the refresh token)
// @route   POST /api/auth/refresh
// @access  Public (requires a valid refreshToken in the body)
const refresh = async (req, res) => {
  const { refreshToken } = req.body;
  if (!refreshToken) return res.status(400).json({ message: 'refreshToken is required' });

  const stored = await RefreshToken.findOne({ tokenHash: hashToken(refreshToken) });
  if (!stored || stored.revoked || stored.expiresAt < new Date()) {
    return res.status(401).json({ message: 'Refresh token invalid or expired, please log in again' });
  }

  // Rotate: revoke the old one, issue a new pair.
  stored.revoked = true;
  await stored.save();

  const accessToken = generateAccessToken(stored.accountId, stored.role);
  const newRefreshToken = await issueRefreshToken(stored.accountId, stored.role);

  res.status(200).json({ token: accessToken, refreshToken: newRefreshToken });
};

// @desc    Log out: revoke the given refresh token so it can't be used again
// @route   POST /api/auth/logout
// @access  Public (the refresh token itself is the credential)
const logout = async (req, res) => {
  const { refreshToken } = req.body;
  if (refreshToken) {
    await RefreshToken.updateOne({ tokenHash: hashToken(refreshToken) }, { revoked: true });
  }
  res.status(200).json({ message: 'Logged out' });
};

module.exports = { loginUser, loginWorker, loginAdmin, getMe, refresh, logout };
