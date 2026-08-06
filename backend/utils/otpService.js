const crypto = require('crypto');
const nodemailer = require('nodemailer');
const dns = require('dns').promises;
const OTP = require('../models/OTP');

const OTP_EXPIRY_MS = 5 * 60 * 1000;
const OTP_RESEND_COOLDOWN_MS = 60 * 1000;

// Force IPv4 resolution for DNS (fixes Render IPv6 connectivity issues)
const dns_mod = require('dns');
dns_mod.setDefaultResultOrder('ipv4first');

const EMAIL_HOST = process.env.EMAIL_HOST || 'smtp.gmail.com';
const EMAIL_PORT = Number(process.env.EMAIL_PORT || 587);
const EMAIL_SECURE = process.env.EMAIL_SECURE === 'true' || EMAIL_PORT === 465;
const EMAIL_USER = (process.env.EMAIL_USER || '').trim().toLowerCase();
const EMAIL_PASS = (process.env.EMAIL_PASS || '').trim();
const EMAIL_FROM = (process.env.EMAIL_FROM || EMAIL_USER).trim().toLowerCase();

if (process.env.NODE_ENV === 'production') {
  console.log('📧 Email Service: Gmail SMTP (IPv4-only)');
  console.log('📧 Host:', EMAIL_HOST);
  console.log('📧 Port:', EMAIL_PORT);
  console.log('📧 FROM:', EMAIL_FROM);
  console.log('📧 DNS Result Order: IPv4 first');
}

let transporter = null;

// Create transporter with IPv4 DNS resolution
const createTransporter = async () => {
  if (!EMAIL_USER || !EMAIL_PASS) {
    throw new Error('Email credentials not configured: set EMAIL_USER and EMAIL_PASS');
  }

  try {
    // Resolve Gmail SMTP host to IPv4 address explicitly
    console.log(`🔍 Resolving ${EMAIL_HOST} to IPv4...`);
    const { address } = await dns.lookup(EMAIL_HOST, { family: 4 });
    console.log(`✅ ${EMAIL_HOST} → ${address} (IPv4)`);

    const config = {
      host: address,
      port: EMAIL_PORT,
      secure: EMAIL_SECURE,
      auth: {
        user: EMAIL_USER,
        pass: EMAIL_PASS
      },
      tls: {
        servername: EMAIL_HOST,
        rejectUnauthorized: false
      },
      connectionTimeout: 15000,
      greetingTimeout: 15000,
      socketTimeout: 20000
    };

    return nodemailer.createTransport(config);
  } catch (error) {
    console.error('❌ Failed to resolve SMTP host:', error.message);
    throw error;
  }
};

const getTransporter = async () => {
  if (!transporter) {
    transporter = await createTransporter();
  }
  return transporter;
};

const normalizeEmail = (email = '') => email.trim().toLowerCase();

// Uses crypto for predictable-length, secure numeric OTP generation.
const generateSecureOtp = () => crypto.randomInt(100000, 1000000).toString();

const sendOtpEmail = async (email, otp) => {
  const mailOptions = {
    from: EMAIL_FROM,
    to: email,
    subject: 'Verify Your Email – OTP',
    text: `Your Servisphere verification OTP is ${otp}. It expires in 5 minutes. Do not share it with anyone.`,
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
  };

  try {
    const transporter = await getTransporter();
    const info = await transporter.sendMail(mailOptions);
    console.log('✅ OTP Email sent successfully. Message ID:', info.messageId);
    return info;
    
  } catch (error) {
    const errorDetails = {
      message: error?.message || 'Failed to send OTP email',
      code: error?.code,
      command: error?.command,
      errno: error?.errno,
      syscall: error?.syscall
    };
    
    console.error('❌ Email send error:', JSON.stringify(errorDetails, null, 2));
    
    if (process.env.NODE_ENV === 'production') {
      console.error('📧 SMTP Debug Info:', {
        host: EMAIL_HOST,
        port: EMAIL_PORT,
        secure: EMAIL_SECURE,
        userEmail: EMAIL_USER.substring(0, 10) + '...',
        passLength: EMAIL_PASS.length,
        fromEmail: EMAIL_FROM,
        recipientEmail: email
      });
    }
    
    throw new Error(errorDetails.message);
  }
};

const sendArrivalOtpEmail = async ({ email, otp, bookingId, serviceName }) => {
  const mailOptions = {
    from: EMAIL_FROM,
    to: email,
    subject: `Servisphere Arrival Verification OTP - Booking #${bookingId}`,
    text: `Your service worker has arrived. OTP: ${otp}. Booking ID: ${bookingId}. Service: ${serviceName || 'General Service'}. This OTP expires in 5 minutes.`,
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
  };

  try {
    const transporter = await getTransporter();
    const info = await transporter.sendMail(mailOptions);
    console.log('✅ Arrival OTP Email sent successfully. Message ID:', info.messageId);
    return info;
    
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