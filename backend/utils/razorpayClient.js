const Razorpay = require('razorpay');

let client;

const readEnvValue = (name) => {
  const value = process.env[name];
  return typeof value === 'string' ? value.trim() : value;
};

const isValidRazorpayKeyId = (keyId) => {
  return typeof keyId === 'string' && (keyId.startsWith('rzp_test_') || keyId.startsWith('rzp_live_'));
};

const getRazorpayEnvironmentStatus = () => {
  const keyId = readEnvValue('RAZORPAY_KEY_ID');
  const keySecret = readEnvValue('RAZORPAY_KEY_SECRET');
  const mode = keyId?.startsWith('rzp_test_') ? 'TEST' : keyId?.startsWith('rzp_live_') ? 'LIVE' : 'UNKNOWN';
  const hasValidKeyPrefix = isValidRazorpayKeyId(keyId);

  return {
    hasKeyId: Boolean(keyId),
    hasKeySecret: Boolean(keySecret),
    hasValidKeyPrefix,
    mode,
    keyIdPreview: keyId ? `${keyId.slice(0, 8)}...` : null
  };
};

const getRazorpayClient = () => {
  const keyId = readEnvValue('RAZORPAY_KEY_ID');
  const keySecret = readEnvValue('RAZORPAY_KEY_SECRET');

  if (!keyId || !keySecret || !isValidRazorpayKeyId(keyId)) {
    return null;
  }

  if (!client || client.key_id !== keyId) {
    client = new Razorpay({
      key_id: keyId,
      key_secret: keySecret
    });
  }

  return client;
};

module.exports = {
  getRazorpayClient,
  getRazorpayEnvironmentStatus,
  isValidRazorpayKeyId
};

