const crypto = require('crypto');
const { Resend } = require('resend');
const OTP = require('../models/OTP');

const OTP_EXPIRY_MS = 5 * 60 * 1000;
const OTP_RESEND_COOLDOWN_MS = 60 * 1000;

// Resend Configuration
const RESEND_API_KEY = process.env.RESEND_API_KEY;
const EMAIL_FROM = process.env.EMAIL_FROM || 'noreply@servisphere.app';

// Initialize Resend client
let resendClient = null;
const getResendClient = () => {
  if (!RESEND_API_KEY) {
    throw new Error('Resend API key not configured: set RESEND_API_KEY environment variable');
  }
  if (!resendClient) {
    resendClient = new Resend(RESEND_API_KEY);
  }
  return resendClient;
};

if (process.env.NODE_ENV === 'production') {
  console.log('📧 Email Service: Resend (Cloud-based)');
  console.log('📧 RESEND_API_KEY configured:', !!RESEND_API_KEY);
  console.log('📧 EMAIL_FROM:', EMAIL_FROM);
}

const normalizeEmail = (email = '') => email.trim().toLowerCase();

// Uses crypto for predictable-length, secure numeric OTP generation.
const generateSecureOtp = () => crypto.randomInt(100000, 1000000).toString();

const sendOtpEmail = async (email, otp) => {
  if (!RESEND_API_KEY) {
    const message = 'Email service not configured: missing RESEND_API_KEY';
    console.error(`❌ ${message}`);
    throw new Error(message);
  }

  try {
    const resend = getResendClient();
    
    const response = await resend.emails.send({
      from: EMAIL_FROM,
      to: email,
      subject: 'Verify Your Email – OTP',
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
          <h2 style="color: #007bff; text-align: center;">Verify Your Email</h2>
          <p style="text-align: center; color: #555;">Your Servisphere verification OTP is:</p>
          <div style="background: #f4f4f4; padding: 20px; border-radius: 8px; text-align: center; margin: 20px 0;">
            <h1 style="margin: 0; letter-spacing: 10px; font-size: 36px; color: #333;">${otp}</h1>
          </div>
          <p style="text-align: center; color: #999; font-size: 14px;">This OTP expires in 5 minutes. Please do not share it.</p>
        </div>
      `
    });

    if (response.error) {
      console.error('❌ Resend error:', response.error.message);
      throw new Error(response.error.message);
    }

    console.log('✅ OTP Email sent successfully via Resend. ID:', response.data?.id);
    return response;
    
  } catch (error) {
    const errorMessage = error?.message || 'Failed to send OTP email';
    console.error('❌ Email send error:', errorMessage);
    throw new Error(errorMessage);
  }
};

const sendArrivalOtpEmail = async ({ email, otp, bookingId, serviceName }) => {
  if (!RESEND_API_KEY) {
    throw new Error('Email service not configured: missing RESEND_API_KEY');
  }

  try {
    const resend = getResendClient();
    
    const response = await resend.emails.send({
      from: EMAIL_FROM,
      to: email,
      subject: `Servisphere Arrival Verification OTP - Booking #${bookingId}`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
          <h2 style="color: #007bff;">Worker Arrival Verification</h2>
          <p>Your service worker has arrived.</p>
          <p><strong>Booking ID:</strong> ${bookingId}</p>
          <p><strong>Service:</strong> ${serviceName || 'General Service'}</p>
          <p>Please share this OTP with the worker to verify and start service safely:</p>
          <div style="background: #f4f4f4; padding: 20px; border-radius: 8px; text-align: center; margin: 20px 0;">
            <h1 style="margin: 0; letter-spacing: 10px; font-size: 36px; color: #333;">${otp}</h1>
          </div>
          <p style="font-size: 14px; color: #999;">This OTP is valid for 5 minutes and can be used only once.</p>
        </div>
      `
    });

    if (response.error) {
      throw new Error(response.error.message);
    }

    console.log('✅ Arrival OTP Email sent successfully via Resend. ID:', response.data?.id);
    return response;
    
  } catch (error) {
    console.error('❌ Arrival OTP Email send error:', error.message);
    throw new Error(error.message);
  }
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

  await OTP.deleteOne({ email: normalizedEmail });
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