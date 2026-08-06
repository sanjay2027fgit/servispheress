const crypto = require('crypto');
const ArrivalOTP = require('../models/ArrivalOTP');
const Booking = require('../models/Booking');
const { normalizeEmail, sendArrivalOtpEmail } = require('../utils/otpService');

const ARRIVAL_OTP_EXPIRY_MS = 5 * 60 * 1000;

const generateArrivalOtp = () => crypto.randomInt(100000, 1000000).toString();
const normalizeOtp = (value = '') => String(value).replace(/\D/g, '');

// @desc    Worker (assigned to the booking) triggers arrival OTP generation.
//          The OTP is emailed to the customer and made available to them via
//          GET /api/arrival-otp/:bookingId -- it is intentionally NEVER
//          returned in this response, since this endpoint is called by the
//          worker's own browser and returning it here would let the worker
//          read their own verification code, defeating the entire point of
//          arrival verification.
// @route   POST /api/arrival-otp/send
// @access  Private/Worker (must be the assigned worker for the booking)
const sendArrivalOtp = async (req, res) => {
  try {
    const { bookingId } = req.body;
    const normalizedBookingId = String(bookingId || '').trim();

    if (!normalizedBookingId) {
      return res.status(400).json({ success: false, message: 'bookingId is required' });
    }
    if (!req.user || req.user.role !== 'worker') {
      return res.status(403).json({ success: false, message: 'Only the assigned worker can request an arrival OTP' });
    }

    const booking = await Booking.findById(normalizedBookingId).catch(() => null);
    if (!booking) return res.status(404).json({ success: false, message: 'Booking not found' });
    if (booking.workerId !== String(req.user.id)) {
      return res.status(403).json({ success: false, message: 'Forbidden' });
    }

    const normalizedEmail = normalizeEmail(booking.userId || '');
    if (!normalizedEmail) {
      return res.status(400).json({ success: false, message: 'No customer email on this booking' });
    }

    const otp = generateArrivalOtp();
    const expiresAt = new Date(Date.now() + ARRIVAL_OTP_EXPIRY_MS);

    // Replaces any previous OTP for the same booking to prevent OTP reuse.
    await ArrivalOTP.deleteMany({ bookingId: normalizedBookingId });
    await ArrivalOTP.create({
      bookingId: normalizedBookingId,
      email: normalizedEmail,
      otp,
      expiresAt
    });

    // Best-effort email -- if it fails, the OTP is still available to the
    // user via GET /api/arrival-otp/:bookingId, so we don't fail the whole
    // request just because email delivery had a problem.
    let emailSent = true;
    let emailError = null;
    try {
      await sendArrivalOtpEmail({
        email: normalizedEmail,
        otp,
        bookingId: normalizedBookingId,
        serviceName: req.body.serviceName
      });
    } catch (err) {
      emailSent = false;
      emailError = err.message;
      console.error('Arrival OTP email failed (OTP still available on track.html):', err.message);
    }

    return res.status(200).json({
      success: true,
      message: emailSent ? 'Arrival OTP generated and emailed to the customer' : 'Arrival OTP generated (email delivery failed, but it is visible on the customer\'s tracking page)',
      emailSent,
      emailError: emailSent ? undefined : emailError,
      expiresInSeconds: Math.floor(ARRIVAL_OTP_EXPIRY_MS / 1000)
    });
  } catch (error) {
    console.error('Error in sendArrivalOtp:', error?.message);
    return res.status(500).json({ success: false, message: error?.message || 'Failed to generate arrival OTP' });
  }
};

// @desc    Booking owner (customer) fetches their own arrival OTP to display
//          on track.html. Read-only -- does NOT generate/regenerate anything,
//          so refreshing the page never invalidates an OTP the worker is
//          about to be given.
// @route   GET /api/arrival-otp/:bookingId
// @access  Private/User (must own the booking)
const getArrivalOtp = async (req, res) => {
  const normalizedBookingId = String(req.params.bookingId || '').trim();
  if (!normalizedBookingId) return res.status(400).json({ success: false, message: 'bookingId is required' });
  if (!req.user || req.user.role !== 'user') {
    return res.status(403).json({ success: false, message: 'Forbidden' });
  }

  const booking = await Booking.findById(normalizedBookingId).select('userId').catch(() => null);
  if (!booking) return res.status(404).json({ success: false, message: 'Booking not found' });
  if (booking.userId !== req.user.doc.email) {
    return res.status(403).json({ success: false, message: 'Forbidden' });
  }

  const otpDoc = await ArrivalOTP.findOne({ bookingId: normalizedBookingId }).sort({ createdAt: -1 });
  if (!otpDoc) {
    return res.status(200).json({ success: true, status: 'not_generated' });
  }
  if (otpDoc.used || otpDoc.verified) {
    return res.status(200).json({ success: true, status: 'verified' });
  }
  if (new Date(otpDoc.expiresAt).getTime() < Date.now()) {
    return res.status(200).json({ success: true, status: 'expired' });
  }

  const secondsRemaining = Math.max(0, Math.floor((new Date(otpDoc.expiresAt).getTime() - Date.now()) / 1000));
  return res.status(200).json({ success: true, status: 'available', otp: otpDoc.otp, expiresInSeconds: secondsRemaining });
};

// @desc    Assigned worker verifies the OTP the customer gave them in person
// @route   POST /api/arrival-otp/verify
// @access  Private/Worker (must be the assigned worker for the booking)
const verifyArrivalOtp = async (req, res) => {
  try {
    const { bookingId, otp } = req.body;
    const normalizedBookingId = String(bookingId || '').trim();
    const normalizedOtp = normalizeOtp(otp);

    if (!normalizedBookingId || !normalizedOtp) {
      return res.status(400).json({ message: 'bookingId and otp are required' });
    }
    if (!req.user || req.user.role !== 'worker') {
      return res.status(403).json({ message: 'Only the assigned worker can verify an arrival OTP' });
    }

    const booking = await Booking.findById(normalizedBookingId).select('workerId').catch(() => null);
    if (!booking) return res.status(404).json({ message: 'Booking not found' });
    if (booking.workerId !== String(req.user.id)) {
      return res.status(403).json({ message: 'Forbidden' });
    }

    const otpDoc = await ArrivalOTP.findOne({ bookingId: normalizedBookingId }).sort({ createdAt: -1 });
    if (!otpDoc || otpDoc.otp !== normalizedOtp) {
      return res.status(400).json({ message: 'Invalid arrival OTP' });
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
    console.error('Error in verifyArrivalOtp:', error?.message);
    return res.status(500).json({ message: 'Failed to verify arrival OTP' });
  }
};

// @desc    Marks an already-verified arrival OTP as consumed. Not currently
//          called by the frontend (verify already blocks reuse), kept for
//          API completeness. Secured the same way as verify.
// @route   POST /api/arrival-otp/consume
// @access  Private/Worker (must be the assigned worker for the booking)
const consumeArrivalOtp = async (req, res) => {
  try {
    const { bookingId } = req.body;
    const normalizedBookingId = String(bookingId || '').trim();

    if (!normalizedBookingId) {
      return res.status(400).json({ message: 'bookingId is required' });
    }
    if (!req.user || req.user.role !== 'worker') {
      return res.status(403).json({ message: 'Forbidden' });
    }

    const booking = await Booking.findById(normalizedBookingId).select('workerId').catch(() => null);
    if (!booking) return res.status(404).json({ message: 'Booking not found' });
    if (booking.workerId !== String(req.user.id)) {
      return res.status(403).json({ message: 'Forbidden' });
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
  getArrivalOtp,
  verifyArrivalOtp,
  consumeArrivalOtp
};