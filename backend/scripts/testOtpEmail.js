const nodemailer = require('nodemailer');

(async () => {
  const config = {
    host: process.env.EMAIL_HOST || 'smtp.gmail.com',
    port: Number(process.env.EMAIL_PORT || 587),
    secure: process.env.EMAIL_SECURE === 'true' || Number(process.env.EMAIL_PORT || 587) === 465,
    auth: {
      user: process.env.EMAIL_USER,
      pass: process.env.EMAIL_PASS || process.env.EMAIL_PASSWORD,
    },
    requireTLS: true,
    tls: { rejectUnauthorized: false }
  };

  const transporter = nodemailer.createTransport(config);
  try {
    await transporter.verify();
    console.log('SMTP verification passed');
    const info = await transporter.sendMail({
      from: process.env.EMAIL_FROM || process.env.EMAIL_USER,
      to: process.env.TEST_EMAIL || process.env.EMAIL_USER,
      subject: 'Servisphere OTP test',
      text: 'SMTP test message' 
    });
    console.log('Mail sent', info.messageId);
  } catch (error) {
    console.error('SMTP test failed:', error.message);
    process.exit(1);
  }
})();
