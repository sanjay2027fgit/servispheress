const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const Worker = require('../models/Worker');
const {
  normalizeEmail,
  sendOtpEmail,
  createOrReplaceOtp,
  verifyOtpForEmail,
  clearOtp
} = require('../utils/otpService');

// @desc    Send OTP to email
// @route   POST /api/auth/send-otp
// @access  Public
const sendOtp = async (req, res) => {
  try {
    const { email, role } = req.body;
    const normalizedEmail = normalizeEmail(email);

    if (!normalizedEmail) {
      return res.status(400).json({ message: 'Please provide an email' });
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(normalizedEmail)) {
      return res.status(400).json({ message: 'Please provide a valid email' });
    }

    // Protects against duplicate registration in either account type.
    const [existingUser, existingWorker] = await Promise.all([
      User.findOne({ email: normalizedEmail }),
      Worker.findOne({ email: normalizedEmail })
    ]);

    if (existingUser || existingWorker) {
      return res.status(400).json({
        message: `${role === 'worker' ? 'Worker' : 'User'} already exists`
      });
    }

    const otpResult = await createOrReplaceOtp(normalizedEmail);
    if (!otpResult.ok && otpResult.reason === 'cooldown') {
      return res.status(429).json({
        message: 'Please wait 1 minute before requesting another OTP',
        retryAfterSeconds: otpResult.retryAfterSeconds
      });
    }

    // Sends a real Gmail OTP via Nodemailer using env credentials.
    // Wrap with timeout to prevent hanging requests
    const emailTimeout = new Promise((_, reject) =>
      setTimeout(() => reject(new Error('Email sending timeout')), 40000)
    );
    
    try {
      await Promise.race([sendOtpEmail(normalizedEmail, otpResult.otp), emailTimeout]);
      res.status(200).json({ message: 'OTP sent successfully to email' });
    } catch (emailError) {
      // Log error but don't fail - OTP was still created in DB and can be used even if email fails
      console.warn('OTP email send failed, but OTP is still valid in database:', emailError.message);
      res.status(200).json({ message: 'OTP created (check inbox or backend console)' });
    }
  } catch (error) {
    console.error('Error in sendOtp:', error);
    return res.status(500).json({ message: error?.message || 'Failed to create OTP' });
  }
};

// @desc    Signup a User
// @route   POST /api/auth/signup/user
// @access  Public
const signupUser = async (req, res) => {
  try {
    const { email, password, otp } = req.body;
    const normalizedEmail = normalizeEmail(email);

    if (!normalizedEmail || !password || !otp) {
      return res.status(400).json({ message: 'Please provide email, password, and OTP' });
    }

    const otpVerification = await verifyOtpForEmail(normalizedEmail, otp);
    if (!otpVerification.ok) {
      return res.status(400).json({
        message: otpVerification.reason === 'expired' ? 'Expired OTP' : 'Invalid OTP'
      });
    }

    const [userExists, workerExists] = await Promise.all([
      User.findOne({ email: normalizedEmail }),
      Worker.findOne({ email: normalizedEmail })
    ]);

    if (userExists || workerExists) {
      await clearOtp(normalizedEmail);
      return res.status(400).json({ message: 'User already exists' });
    }

    // Hash password
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);

    // Create user
    const user = await User.create({
      email: normalizedEmail,
      password: hashedPassword,
      id: Date.now().toString() // keeping compatibility with old localStorage ID format
    });

    // Delete OTP after successful signup
    await clearOtp(normalizedEmail);

    if (!process.env.JWT_SECRET) {
      return res.status(500).json({ message: 'JWT configuration missing' });
    }

    // Generate token
    const token = jwt.sign({ id: user._id }, process.env.JWT_SECRET, {
      expiresIn: '30d',
    });

    res.status(201).json({
      _id: user.id,
      email: user.email,
      token
    });
  } catch (error) {
    console.error('Error in signupUser:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

// @desc    Signup a Worker
// @route   POST /api/auth/signup/worker
// @access  Public
const signupWorker = async (req, res) => {
  try {
    const { email, password, otp, name, aadhar, role, experience, city, state } = req.body;
    const normalizedEmail = normalizeEmail(email);

    if (!normalizedEmail || !password || !otp || !name || !aadhar || !role || !experience) {
      return res.status(400).json({ message: 'Please provide all required fields' });
    }

    const otpVerification = await verifyOtpForEmail(normalizedEmail, otp);
    if (!otpVerification.ok) {
      return res.status(400).json({
        message: otpVerification.reason === 'expired' ? 'Expired OTP' : 'Invalid OTP'
      });
    }

    const [workerExists, userExists] = await Promise.all([
      Worker.findOne({ email: normalizedEmail }),
      User.findOne({ email: normalizedEmail })
    ]);

    if (workerExists || userExists) {
      await clearOtp(normalizedEmail);
      return res.status(400).json({ message: 'Worker already exists' });
    }

    // Hash password
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);

    // Create worker
    const worker = await Worker.create({
      email: normalizedEmail,
      password: hashedPassword,
      name,
      aadhar,
      role,
      experience,
      city,
      state,
      id: Date.now().toString()
    });

    // Delete OTP
    await clearOtp(normalizedEmail);

    if (!process.env.JWT_SECRET) {
      return res.status(500).json({ message: 'JWT configuration missing' });
    }

    // Generate token
    const token = jwt.sign({ id: worker._id }, process.env.JWT_SECRET, {
      expiresIn: '30d',
    });

    res.status(201).json({
      _id: worker.id,
      email: worker.email,
      name: worker.name,
      token
    });
  } catch (error) {
    console.error('Error in signupWorker:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

module.exports = {
  sendOtp,
  resendOtp: sendOtp,
  signupUser,
  signupWorker
};
