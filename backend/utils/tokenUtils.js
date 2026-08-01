const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const RefreshToken = require('../models/RefreshToken');

const ACCESS_TOKEN_TTL = '12h';
const REFRESH_TOKEN_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

const generateAccessToken = (id, role) =>
  jwt.sign({ id, role }, process.env.JWT_SECRET, { expiresIn: ACCESS_TOKEN_TTL });

const hashToken = (token) => crypto.createHash('sha256').update(token).digest('hex');

/**
 * Issues a new refresh token, stores its hash (never the raw value) in Mongo,
 * and returns the raw token to hand back to the client.
 */
const issueRefreshToken = async (accountId, role) => {
  const raw = crypto.randomBytes(48).toString('hex');
  await RefreshToken.create({
    tokenHash: hashToken(raw),
    accountId: String(accountId),
    role,
    expiresAt: new Date(Date.now() + REFRESH_TOKEN_TTL_MS)
  });
  return raw;
};

/**
 * Issues both tokens for a freshly-authenticated account.
 */
const issueTokenPair = async (accountId, role) => {
  const accessToken = generateAccessToken(accountId, role);
  const refreshToken = await issueRefreshToken(accountId, role);
  return { accessToken, refreshToken };
};

module.exports = { generateAccessToken, hashToken, issueRefreshToken, issueTokenPair, ACCESS_TOKEN_TTL };
