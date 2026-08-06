const { getRazorpayClient, getRazorpayEnvironmentStatus } = require('../utils/razorpayClient');
const crypto = require('crypto');
const Booking = require('../models/Booking');
const Payment = require('../models/Payment');

const razorpayWebhookSecret = process.env.RAZORPAY_WEBHOOK_SECRET || '';

const normalizeBookingId = (value) => String(value || '').trim();

const getBookingPayableAmount = (booking, payment) => {
  const fromPayment = Number(payment?.amount);
  if (Number.isFinite(fromPayment) && fromPayment > 0) return fromPayment;
  return booking?.emergency ? 600 : 200;
};

const createRazorpayOrder = async (req, res) => {
  try {
    const bookingId = normalizeBookingId(req.body?.bookingId || req.body?.serviceId);
    if (!bookingId) {
      return res.status(400).json({ message: 'bookingId is required' });
    }

    const razorpay = getRazorpayClient();
    const envStatus = getRazorpayEnvironmentStatus();
    if (!razorpay) {
      if (envStatus.hasKeyId || envStatus.hasKeySecret) {
        return res.status(500).json({
          message: 'Razorpay environment values are present but invalid. Set a valid matching RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET test/live pair in the backend environment.'
        });
      }

      return res.status(500).json({
        message: 'Razorpay is not configured. Set RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET.'
      });
    }

    const booking = await Booking.findById(bookingId).select('userId workerId status emergency').catch(() => null);
    if (!booking) {
      return res.status(404).json({ message: 'Booking not found' });
    }

    const isOwner = req.user.role === 'user' && booking.userId === req.user.doc.email;
    const isAdmin = req.user.role === 'admin' || req.user.role === 'special_admin';
    if (!isOwner && !isAdmin) {
      return res.status(403).json({ message: 'Forbidden: only the booking owner or admin can create a payment order' });
    }

    if (!isAdmin && booking.status !== 'completed') {
      return res.status(400).json({ message: 'Payment can only be created after the booking is completed' });
    }

    let payment = await Payment.findOne({ bookingId }).catch(() => null);
    if (!payment) {
      payment = await Payment.create({
        bookingId,
        workerId: booking.workerId,
        userId: booking.userId,
        amount: getBookingPayableAmount(booking, null),
        status: 'pending',
        paymentStatus: 'pending',
        paymentMethod: 'razorpay',
        provider: 'razorpay'
      });
    }

    if (payment.status === 'paid_by_user' || payment.paymentStatus === 'paid' || payment.status === 'approved') {
      return res.status(409).json({ message: 'This booking has already been paid.' });
    }

    const payableAmount = getBookingPayableAmount(booking, payment);
    const amountInPaise = Math.max(100, Math.round(Number(payableAmount) * 100));

    if (payment.razorpayOrderId) {
      return res.status(200).json({
        message: 'Existing order reused',
        keyId: process.env.RAZORPAY_KEY_ID,
        orderId: payment.razorpayOrderId,
        amount: amountInPaise,
        currency: 'INR',
        bookingId
      });
    }

    const order = await razorpay.orders.create({
      amount: amountInPaise,
      currency: 'INR',
      receipt: `booking_${bookingId}_${Date.now()}`.slice(0, 40),
      notes: {
        bookingId,
        userId: booking.userId,
        workerId: booking.workerId,
        purpose: 'servisphere_booking_payment'
      }
    });

    payment.amount = payableAmount;
    payment.razorpayOrderId = order.id;
    payment.paymentStatus = 'pending';
    payment.paymentMethod = 'razorpay';
    payment.provider = 'razorpay';
    await payment.save();

    return res.status(200).json({
      message: 'Order created',
      keyId: process.env.RAZORPAY_KEY_ID,
      orderId: order.id,
      amount: order.amount,
      currency: order.currency,
      bookingId
    });
  } catch (error) {
    console.error('Error in createRazorpayOrder:', error);
    const statusCode = Number(error?.statusCode) || 500;
    const reason =
      error?.error?.description ||
      error?.description ||
      error?.message ||
      'Unknown Razorpay error';

    if (reason === 'Authentication failed') {
      return res.status(401).json({
        message: 'Razorpay authentication failed. The stored Key ID and Key Secret pair in the backend environment is invalid or mismatched. Generate a fresh matching test key pair in the Razorpay Dashboard and update the existing environment variables.'
      });
    }

    return res.status(statusCode >= 400 && statusCode < 600 ? statusCode : 500).json({
      message: `Failed to create Razorpay order: ${reason}`
    });
  }
};

const handleRazorpayWebhook = async (req, res) => {
  try {
    if (!razorpayWebhookSecret) {
      return res.status(500).json({ message: 'Razorpay webhook secret is not configured' });
    }

    const signature = req.headers['x-razorpay-signature'];
    const body = Buffer.isBuffer(req.body) ? req.body.toString('utf8') : JSON.stringify(req.body || {});
    const expectedSignature = crypto
      .createHmac('sha256', razorpayWebhookSecret)
      .update(body)
      .digest('hex');

    if (expectedSignature !== signature) {
      return res.status(400).json({ message: 'Invalid Razorpay webhook signature' });
    }

    const event = JSON.parse(body);
    const paymentEvent = event?.payload?.payment?.entity;
    const orderId = paymentEvent?.order_id;
    const paymentId = paymentEvent?.id;

    if (!orderId || !paymentId) {
      return res.status(400).json({ message: 'Webhook payload missing required Razorpay identifiers' });
    }

    const payment = await Payment.findOne({ razorpayOrderId: orderId }).catch(() => null);
    if (!payment) {
      return res.status(404).json({ message: 'Webhook payment order not found' });
    }

    if (payment.razorpayPaymentId === paymentId && payment.paymentStatus === 'paid') {
      return res.status(200).json({ message: 'Webhook replay acknowledged' });
    }

    payment.razorpayPaymentId = paymentId;
    payment.razorpaySignature = 'webhook';
    payment.amountPaid = Number(payment.amount) || 0;
    payment.paymentStatus = 'paid';
    payment.paymentMethod = 'razorpay';
    payment.provider = 'razorpay';
    payment.paidAt = new Date();
    payment.status = 'paid_by_user';
    await payment.save();

    await Booking.updateOne(
      { _id: payment.bookingId },
      {
        $set: {
          paymentStatus: 'paid',
          paymentMethod: 'razorpay',
          provider: 'razorpay',
          razorpayOrderId: orderId,
          razorpayPaymentId: paymentId,
          amountPaid: Number(payment.amount) || 0,
          paidAt: payment.paidAt
        }
      }
    ).catch(() => null);

    const io = req.app.get('io');
    if (io) {
      io.to(`booking:${payment.bookingId}`).emit('payment:updated', {
        bookingId: payment.bookingId,
        paymentStatus: 'paid',
        paymentMethod: 'razorpay',
        provider: 'razorpay',
        amountPaid: Number(payment.amount) || 0,
        paidAt: payment.paidAt,
        paymentId: payment.id,
        razorpayOrderId: orderId,
        razorpayPaymentId: paymentId
      });
    }

    return res.status(200).json({ message: 'Webhook processed' });
  } catch (error) {
    console.error('Error in handleRazorpayWebhook:', error);
    return res.status(500).json({ message: 'Failed to process Razorpay webhook' });
  }
};

const verifyRazorpayPayment = async (req, res) => {
  try {
    const {
      bookingId,
      razorpay_order_id,
      razorpay_payment_id,
      razorpay_signature
    } = req.body;

    const normalizedBookingId = normalizeBookingId(bookingId);
    if (!normalizedBookingId || !razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
      return res.status(400).json({ message: 'bookingId, razorpay_order_id, razorpay_payment_id and razorpay_signature are required' });
    }

    if (!process.env.RAZORPAY_KEY_SECRET) {
      return res.status(500).json({ message: 'Razorpay secret is not configured' });
    }

    const generatedSignature = crypto
      .createHmac('sha256', process.env.RAZORPAY_KEY_SECRET)
      .update(`${razorpay_order_id}|${razorpay_payment_id}`)
      .digest('hex');

    if (generatedSignature !== razorpay_signature) {
      return res.status(400).json({ message: 'Invalid Razorpay signature' });
    }

    const payment = await Payment.findOne({ bookingId: normalizedBookingId }).catch(() => null);
    if (!payment) {
      return res.status(404).json({ message: 'Payment record not found for this booking' });
    }

    if (payment.razorpayOrderId !== razorpay_order_id) {
      return res.status(400).json({ message: 'Razorpay order does not belong to this booking' });
    }

    const isOwner = req.user.role === 'user' && payment.userId === req.user.doc.email;
    const isAdmin = req.user.role === 'admin' || req.user.role === 'special_admin';
    if (!isOwner && !isAdmin) {
      return res.status(403).json({ message: 'Forbidden: only the booking owner or admin can verify this payment' });
    }

    if (payment.razorpayPaymentId === razorpay_payment_id && payment.paymentStatus === 'paid') {
      return res.status(200).json({
        message: 'Payment already verified',
        paymentId: payment.id,
        paymentStatus: payment.paymentStatus
      });
    }

    payment.razorpayPaymentId = razorpay_payment_id;
    payment.razorpaySignature = razorpay_signature;
    payment.amountPaid = Number(payment.amount) || 0;
    payment.paymentStatus = 'paid';
    payment.paymentMethod = 'razorpay';
    payment.provider = 'razorpay';
    payment.paidAt = new Date();
    payment.status = 'paid_by_user';
    await payment.save();

    await Booking.updateOne(
      { _id: normalizedBookingId },
      {
        $set: {
          paymentStatus: 'paid',
          paymentMethod: 'razorpay',
          provider: 'razorpay',
          razorpayOrderId,
          razorpayPaymentId: razorpay_payment_id,
          amountPaid: Number(payment.amount) || 0,
          paidAt: payment.paidAt
        }
      }
    ).catch(() => null);

    const io = req.app.get('io');
    if (io) {
      io.to(`booking:${normalizedBookingId}`).emit('payment:updated', {
        bookingId: normalizedBookingId,
        paymentStatus: 'paid',
        paymentMethod: 'razorpay',
        provider: 'razorpay',
        amountPaid: Number(payment.amount) || 0,
        paidAt: payment.paidAt,
        paymentId: payment.id,
        razorpayOrderId,
        razorpayPaymentId: razorpay_payment_id
      });
    }

    return res.status(200).json({
      message: 'Razorpay payment verified',
      paymentId: payment.id,
      paymentStatus: 'paid',
      bookingId: normalizedBookingId
    });
  } catch (error) {
    console.error('Error in verifyRazorpayPayment:', error);
    return res.status(500).json({ message: 'Failed to verify Razorpay payment' });
  }
};

module.exports = { createRazorpayOrder, verifyRazorpayPayment };

