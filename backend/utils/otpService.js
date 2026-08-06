const crypto = require('crypto');
const nodemailer = require('nodemailer');
const { Resend } = require('resend');
const OTP = require('../models/OTP');

const OTP_EXPIRY_MS = 5 * 60 * 1000;
const OTP_RESEND_COOLDOWN_MS = 60 * 1000;

// SMTP Configuration
const SMTP_HOST = process.env.EMAIL_HOST;
const SMTP_PORT = Number(process.env.EMAIL_PORT) || 587;
const SMTP_SECURE = String(process.env.EMAIL_SECURE || 'false').toLowerCase() === 'true';
const SMTP_USER = process.env.EMAIL_USER;
const SMTP_PASS = process.env.EMAIL_PASS || process.env.EMAIL_PASSWORD;
const SMTP_FROM = process.env.EMAIL_FROM || process.env.EMAIL_USER;

const isSmtpConfigured = Boolean(SMTP_HOST && SMTP_PORT && SMTP_USER && SMTP_PASS && SMTP_FROM);

const getSmtpTransport = () => {
  if (!isSmtpConfigured) {
    throw new Error('SMTP not configured: set EMAIL_HOST, EMAIL_PORT, EMAIL_USER, EMAIL_PASS / EMAIL_PASSWORD, and EMAIL_FROM');
  }

  return nodemailer.createTransport({
    host: SMTP_HOST,
    port: SMTP_PORT,
    secure: SMTP_SECURE,
    requireTLS: true,
    auth: {
      user: SMTP_USER,
      pass: SMTP_PASS
    }
  });
};

// Resend Configuration
const RESEND_API_KEY = process.env.RESEND_API_KEY;
const DEFAULT_RESEND_FROM = 'onboarding@resend.dev';
const EMAIL_FROM = process.env.EMAIL_FROM || process.env.RESEND_FROM || DEFAULT_RESEND_FROM;

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
  console.log('📧 Email Service: SMTP configured:', isSmtpConfigured);
  console.log('📧 Email Service: Resend configured:', !!RESEND_API_KEY);
  console.log('📧 EMAIL_FROM:', SMTP_FROM || EMAIL_FROM);
}

const normalizeEmail = (email = '') => email.trim().toLowerCase();

const getSenderCandidates = () => {
  const configured = String(process.env.EMAIL_FROM || process.env.RESEND_FROM || '').trim().toLowerCase();
  return [...new Set([configured, DEFAULT_RESEND_FROM].filter(Boolean))];
};

const sendViaResend = async ({ to, subject, html, text }) => {
  const resend = getResendClient();
  const senderCandidates = getSenderCandidates();
  let lastError = null;

  for (const from of senderCandidates) {
    try {
      const response = await resend.emails.send({
        from,
        to,
        subject,
        html,
        text
      });

      if (response?.error) {
        lastError = new Error(response.error.message || 'Resend returned an error');
        continue;
      }

      return { response, from };
    } catch (error) {
      lastError = error;
      const message = error?.message || '';
      const shouldRetry = message.includes('domain is not verified') || message.includes('validation_error') || error?.statusCode === 403;
      if (!shouldRetry) {
        throw error;
      }
    }
  }

  throw lastError || new Error('Failed to send email via Resend');
};

const sendViaSmtp = async ({ to, subject, html, text }) => {
  const transporter = getSmtpTransport();
  const mailOptions = {
    from: SMTP_FROM,
    to,
    subject,
    text,
    html
  };

  const info = await transporter.sendMail(mailOptions);
  return { response: info, from: SMTP_FROM };
};

const sendEmail = async ({ to, subject, html, text }) => {
  if (isSmtpConfigured) {
    return sendViaSmtp({ to, subject, html, text });
  }

  const { response, from } = await sendViaResend({ to, subject, html, text });
  return { response, from };
};

// Uses crypto for predictable-length, secure numeric OTP generation.
const generateSecureOtp = () => crypto.randomInt(100000, 1000000).toString();

const sendOtpEmail = async (email, otp) => {
  if (!isSmtpConfigured && !RESEND_API_KEY) {
    const message = 'Email service not configured: missing SMTP or Resend config';
    console.error(`❌ ${message}`);
    throw new Error(message);
  }

  try {
    const { response, from } = await sendEmail({
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
      `,
      text: `Your Servisphere verification OTP is ${otp}. It expires in 5 minutes. Do not share it with anyone.`
    });

    console.log('✅ OTP Email sent successfully. From:', from, 'Response ID:', response?.messageId || response.data?.id);
    return response;
    
  } catch (error) {
    const errorMessage = error?.message || 'Failed to send OTP email';
    console.error('❌ Email send error:', errorMessage);
    throw new Error(errorMessage);
  }
};

const sendArrivalOtpEmail = async ({ email, otp, bookingId, serviceName }) => {
  if (!isSmtpConfigured && !RESEND_API_KEY) {
    throw new Error('Email service not configured: missing SMTP or Resend config');
  }

  try {
    const { response, from } = await sendEmail({
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
      `,
      text: `Your service worker has arrived. OTP: ${otp}. Booking ID: ${bookingId}. Service: ${serviceName || 'General Service'}. This OTP expires in 5 minutes.`
    });

    console.log('✅ Arrival OTP Email sent successfully. From:', from, 'Response ID:', response?.messageId || response.data?.id);
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