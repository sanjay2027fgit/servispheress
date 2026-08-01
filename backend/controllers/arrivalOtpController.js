const crypto = require('crypto');
const ArrivalOTP = require('../models/ArrivalOTP');
const { normalizeEmail } = require('../utils/otpService');

const ARRIVAL_OTP_EXPIRY_MS = 5 * 60 * 1000;

const generateArrivalOtp = () => crypto.randomInt(100000, 1000000).toString();
const normalizeOtp = (value = '') => String(value).replace(/\D/g, '');

const sendArrivalOtp = async (req, res) => {
  try {
    console.log('Arrival OTP generation request:', req.method, req.originalUrl);
    console.log('Origin:', req.headers.origin);
    console.log('Request body:', req.body);

    const { bookingId, email } = req.body;
    const normalizedEmail = normalizeEmail(email || '');
    const normalizedBookingId = String(bookingId || '').trim();

    if (!normalizedBookingId) {
      return res.status(400).json({ success: false, message: 'bookingId is required' });
    }

    const otp = generateArrivalOtp();
    const expiresAt = new Date(Date.now() + ARRIVAL_OTP_EXPIRY_MS);

    if (process.env.NODE_ENV !== 'production') {
      console.log('Generated arrival OTP for booking', normalizedBookingId, otp);
    }

    // Replaces previous OTP for the same booking to prevent OTP reuse.
    await ArrivalOTP.deleteMany({ bookingId: normalizedBookingId });
    await ArrivalOTP.create({
      bookingId: normalizedBookingId,
      email: normalizedEmail,
      otp,
      expiresAt
    });

    return res.status(200).json({
      success: true,
      message: 'Arrival OTP generated successfully',
      otp,
      expiresInSeconds: Math.floor(ARRIVAL_OTP_EXPIRY_MS / 1000)
    });
  } catch (error) {
    console.error('Error in sendArrivalOtp:', {
      message: error?.message,
      code: error?.code,
      response: error?.response,
      stack: error?.stack
    });
    if (error && error.code === 'EAUTH') {
      return res.status(500).json({ success: false, message: 'Email service authentication failed: ' + (error.message || 'authentication error') });
    }
    if (error && ['ENETUNREACH', 'EHOSTUNREACH', 'ECONNREFUSED', 'ETIMEDOUT', 'ESOCKET'].includes(error.code)) {
      return res.status(502).json({ success: false, message: 'Unable to reach the email service. Please check email configuration or network connectivity.' });
    }
    return res.status(500).json({ success: false, message: error?.message || 'Failed to send arrival OTP' });
  }
};

const verifyArrivalOtp = async (req, res) => {
  try {
    console.log('Verify request:', req.method, req.originalUrl);
    console.log('Verify body:', req.body);

    const { bookingId, otp, email } = req.body;
    const normalizedBookingId = String(bookingId || '').trim();
    const normalizedOtp = normalizeOtp(otp);
    const normalizedEmail = normalizeEmail(email || '');

    if (!normalizedBookingId || !normalizedOtp) {
      return res.status(400).json({ message: 'bookingId and otp are required' });
    }

    const otpDoc = await ArrivalOTP.findOne({ bookingId: normalizedBookingId, otp: normalizedOtp }).sort({ createdAt: -1 });
    if (!otpDoc) {
      if (normalizedEmail) {
        const fallbackDoc = await ArrivalOTP.findOne({ email: normalizedEmail }).sort({ createdAt: -1 });
        if (fallbackDoc) {
          console.log('Verify fallback found OTP doc by email for booking', normalizedBookingId, { fallbackBookingId: fallbackDoc.bookingId, expiresAt: fallbackDoc.expiresAt, verified: fallbackDoc.verified, used: fallbackDoc.used });
        }
      }
      return res.status(400).json({ message: 'Invalid arrival OTP' });
    }

    if (process.env.NODE_ENV !== 'production') {
      console.log('Found OTP doc:', {
        bookingId: otpDoc.bookingId,
        otp: otpDoc.otp,
        expiresAt: otpDoc.expiresAt,
        verified: otpDoc.verified,
        used: otpDoc.used
      });
    }

    if (otpDoc.used || otpDoc.verified) {
      return res.status(400).json({ message: 'Arrival OTP already used or verified' });
    }

    if (new Date(otpDoc.expiresAt).getTime() < Date.now()) {
      await ArrivalOTP.deleteMany({ bookingId: normalizedBookingId });
      return res.status(400).json({ message: 'Arrival OTP expired' });
    }

    otpDoc.verified = true;
    await otpDoc.save();

    return res.status(200).json({ message: 'Arrival OTP verified successfully' });
  } catch (error) {
    console.error('Error in verifyArrivalOtp:', {
      message: error?.message,
      code: error?.code,
      response: error?.response,
      stack: error?.stack
    });
    return res.status(500).json({ message: 'Failed to verify arrival OTP' });
  }
};

const consumeArrivalOtp = async (req, res) => {
  try {
    const { bookingId } = req.body;
    const normalizedBookingId = String(bookingId || '').trim();

    if (!normalizedBookingId) {
      return res.status(400).json({ message: 'bookingId is required' });
    }

    const otpDoc = await ArrivalOTP.findOne({ bookingId: normalizedBookingId }).sort({ createdAt: -1 });
    if (!otpDoc) {
      return res.status(400).json({ message: 'Arrival OTP not found or expired' });
    }

    if (otpDoc.used) {
      return res.status(400).json({ message: 'Arrival OTP already used' });
    }

    if (new Date(otpDoc.expiresAt).getTime() < Date.now()) {
      await ArrivalOTP.deleteMany({ bookingId: normalizedBookingId });
      return res.status(400).json({ message: 'Arrival OTP expired' });
    }

    if (!otpDoc.verified) {
      return res.status(400).json({ message: 'Arrival OTP not verified yet' });
    }

    // ✅ Now mark as used (consumed) and save
    otpDoc.used = true;
    await otpDoc.save();

    return res.status(200).json({ message: 'Arrival OTP consumed successfully' });
  } catch (error) {
    console.error('Error in consumeArrivalOtp:', error);
    return res.status(500).json({ message: 'Failed to complete arrival verification' });
  }
};

module.exports = {
  sendArrivalOtp,
  verifyArrivalOtp,
  consumeArrivalOtp
};