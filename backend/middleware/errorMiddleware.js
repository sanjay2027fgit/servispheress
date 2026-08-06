// Wraps async route handlers so thrown/rejected errors reach the error handler
// below instead of crashing the process or hanging the request.
const asyncHandler = (fn) => (req, res, next) => {
  Promise.resolve(fn(req, res, next)).catch(next);
};

const notFound = (req, res, next) => {
  res.status(404).json({
    success: false,
    message: `Route not found: ${req.method} ${req.originalUrl}`,
    errorCode: 'ROUTE_NOT_FOUND',
    data: null
  });
};

// eslint-disable-next-line no-unused-vars
const errorHandler = (err, req, res, next) => {
  console.error(err);

  let statusCode = res.statusCode && res.statusCode !== 200 ? res.statusCode : 500;
  let message = err.message || 'Server error';
  let errorCode = err.errorCode || 'SERVER_ERROR';

  if (err.name === 'ValidationError') {
    statusCode = 400;
    message = Object.values(err.errors).map((e) => e.message).join(', ');
    errorCode = 'VALIDATION_ERROR';
  }
  if (err.name === 'CastError') {
    statusCode = 400;
    message = `Invalid ${err.path}: ${err.value}`;
    errorCode = 'INVALID_ID';
  }
  if (err.code === 11000) {
    statusCode = 400;
    message = `Duplicate value for ${Object.keys(err.keyValue || {}).join(', ')}`;
    errorCode = 'DUPLICATE_KEY';
  }
  if (statusCode === 401) errorCode = err.errorCode || 'UNAUTHORIZED';
  if (statusCode === 403) errorCode = err.errorCode || 'FORBIDDEN';
  if (statusCode === 404) errorCode = err.errorCode || 'NOT_FOUND';
  if (statusCode === 429) errorCode = err.errorCode || 'RATE_LIMITED';

  // 'message' is kept at the top level (not nested under a new shape) so
  // every existing frontend call that reads `data.message` keeps working
  // unchanged; success/errorCode/data are additive fields on top of that.
  res.status(statusCode).json({ success: false, message, errorCode, data: null });
};

module.exports = { asyncHandler, notFound, errorHandler };
