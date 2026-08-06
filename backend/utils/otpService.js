const crypto = require('crypto');
const nodemailer = require('nodemailer');
const OTP = require('../models/OTP');

const OTP_EXPIRY_MS = 5 * 60 * 1000;
const OTP_RESEND_COOLDOWN_MS = 60 * 1000;

const EMAIL_HOST = process.env.EMAIL_HOST || 'smtp.gmail.com';
const EMAIL_PORT = Number(process.env.EMAIL_PORT || 587);
const EMAIL_SECURE = process.env.EMAIL_SECURE === 'true' || EMAIL_PORT === 465;
const EMAIL_FROM = process.env.EMAIL_FROM || process.env.EMAIL_USER;
const EMAIL_IPV6 = process.env.EMAIL_IPV6 === 'true';

let transporter;

const getTransporter = () => {
  if (!transporter) {
    if (!process.env.EMAIL_USER || !process.env.EMAIL_PASS) {
      throw new Error('Email service is not configured: missing EMAIL_USER or EMAIL_PASS');
    }
    if (!EMAIL_FROM) {
      throw new Error('Email service is not configured: missing EMAIL_FROM or EMAIL_USER');
    }

    const transportConfig = {
      host: EMAIL_HOST,
      port: EMAIL_PORT,
      secure: EMAIL_SECURE,
      auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS,
      },
      connectionTimeout: 30000,
      greetingTimeout: 30000,
      socketTimeout: 30000,
      tls: {
        rejectUnauthorized: false,
      },
      family: EMAIL_IPV6 ? 6 : 4
    };

    if (!EMAIL_SECURE) {
      transportConfig.requireTLS = true;
    }

    transporter = nodemailer.createTransport(transportConfig);
    if (process.env.NODE_ENV !== 'production') {
      console.log('Nodemailer transport config:', {
        host: transportConfig.host,
        port: transportConfig.port,
        secure: transportConfig.secure,
        requireTLS: transportConfig.requireTLS,
        family: transportConfig.family,
      });
    }
  }
  return transporter;
};

const normalizeEmail = (email = '') => email.trim().toLowerCase();

// Uses crypto for predictable-length, secure numeric OTP generation.
const generateSecureOtp = () => crypto.randomInt(100000, 1000000).toString();

const sendOtpEmail = async (email, otp) => {
  // For development/testing: if email service is not configured, log OTP to console
  if (!process.env.EMAIL_USER || !process.env.EMAIL_PASS) {
    console.warn(`⚠️ [DEV MODE] OTP for ${email}: ${otp}`);
    return;
  }

  const mailOptions = {
    from: EMAIL_FROM,
    to: email,
    subject: 'Servisphere - Your OTP Code',
    text: `Your OTP for Servisphere signup is: ${otp}. It will expire in 5 minutes.`,
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #007bff;">Welcome to Servisphere!</h2>
        <p>Your One-Time Password (OTP) for signup is:</p>
        <h1 style="background: #f4f4f4; padding: 10px; border-radius: 5px; text-align: center; letter-spacing: 5px;">${otp}</h1>
        <p>This OTP is valid for 5 minutes. Do not share it with anyone.</p>
      </div>
    `
  };

  try {
    const transporter = getTransporter();
    await transporter.sendMail(mailOptions);
  } catch (error) {
    console.error('Email send error:', error.message);
    // In dev mode, still allow signup with console-logged OTP
    if (process.env.NODE_ENV !== 'production') {
      console.warn(`⚠️ [DEV MODE FALLBACK] OTP for ${email}: ${otp}`);
      return;
    }
    throw error;
  }
};

const sendArrivalOtpEmail = async ({ email, otp, bookingId, serviceName }) => {
  const mailOptions = {
    from: EMAIL_FROM,
    to: email,
    subject: `Servisphere Arrival Verification OTP - Booking #${bookingId}`,
    text: `Your service worker has arrived. OTP: ${otp}. Booking ID: ${bookingId}. Service: ${serviceName || 'General Service'}. This OTP expires in 5 minutes.`,
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #007bff;">Worker Arrival Verification</h2>
        <p>Your service worker has arrived.</p>
        <p><strong>Booking ID:</strong> ${bookingId}</p>
        <p><strong>Service:</strong> ${serviceName || 'General Service'}</p>
        <p>Please share this OTP with the worker to verify and start service safely:</p>
        <h1 style="background: #f4f4f4; padding: 10px; border-radius: 5px; text-align: center; letter-spacing: 5px;">${otp}</h1>
        <p>This OTP is valid for 5 minutes and can be used only once.</p>
      </div>
    `
  };

  const transporter = getTransporter();
  await transporter.sendMail(mailOptions);
};

const isOtpExpired = (otpDoc) => Date.now() - new Date(otpDoc.createdAt).getTime() > OTP_EXPIRY_MS;

const createOrReplaceOtp = async (email) => {
  const normalizedEmail = normalizeEmail(email);
  const existingOtp = await OTP.findOne({ email: normalizedEmail });

  if (existingOtp) {
    const timeSinceLastOtp = Date.now() - new Date(existingOtp.createdAt).getTime();
    if (timeSinceLastOtp < OTP_RESEND_COOLDOWN_MS) {
      const remainingMs = OTP_RESEND_COOLDOWN_MS - timeSinceLastOtp;
      return {
        ok: false,
        reason: 'cooldown',
        retryAfterSeconds: Math.ceil(remainingMs / 1000)
      };
    }

    await OTP.deleteOne({ email: normalizedEmail });
  }

  const otp = generateSecureOtp();
  await OTP.create({ email: normalizedEmail, otp });
  return { ok: true, otp };
};

const verifyOtpForEmail = async (email, otp) => {
  const normalizedEmail = normalizeEmail(email);
  const otpDoc = await OTP.findOne({ email: normalizedEmail });

  if (!otpDoc) {
    return { ok: false, reason: 'expired' };
  }

  if (isOtpExpired(otpDoc)) {
    await OTP.deleteOne({ email: normalizedEmail });
    return { ok: false, reason: 'expired' };
  }

  if (otpDoc.otp !== String(otp)) {
    return { ok: false, reason: 'invalid' };
  }

  return { ok: true };
};

const clearOtp = async (email) => {
  const normalizedEmail = normalizeEmail(email);
  await OTP.deleteOne({ email: normalizedEmail });
};

module.exports = {
  OTP_EXPIRY_MS,
  OTP_RESEND_COOLDOWN_MS,
  normalizeEmail,
  sendOtpEmail,
  sendArrivalOtpEmail,
  createOrReplaceOtp,
  verifyOtpForEmail,
  clearOtp
};