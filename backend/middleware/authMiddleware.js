const jwt = require('jsonwebtoken');
const User = require('../models/User');
const Worker = require('../models/Worker');
const Admin = require('../models/Admin');

/**
 * Verifies the Bearer JWT and attaches req.user = { id, role, doc }.
 *
 * Tokens issued by the NEW login endpoints (controllers/sessionController.js)
 * carry a `role` claim: 'user' | 'worker' | 'admin' | 'special_admin'.
 *
 * Tokens issued by the EXISTING OTP signup flow (controllers/authController.js)
 * do NOT carry a role claim (they were never consumed by the frontend before).
 * To stay backward compatible with that untouched flow, if `role` is missing
 * we fall back to checking the User collection, then Worker.
 */
const protect = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization || '';
    if (!authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ message: 'Not authorized, no token' });
    }

    const token = authHeader.split(' ')[1];
    if (!process.env.JWT_SECRET) {
      return res.status(500).json({ message: 'JWT configuration missing' });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    let role = decoded.role;
    let doc = null;

    if (role === 'user') {
      doc = await User.findById(decoded.id).select('-password');
    } else if (role === 'worker') {
      doc = await Worker.findById(decoded.id).select('-password');
    } else if (role === 'admin' || role === 'special_admin') {
      doc = await Admin.findById(decoded.id).select('-password');
    } else {
      // Legacy token without a role claim: try User then Worker.
      doc = await User.findById(decoded.id).select('-password');
      role = 'user';
      if (!doc) {
        doc = await Worker.findById(decoded.id).select('-password');
        role = 'worker';
      }
    }

    if (!doc) {
      return res.status(401).json({ message: 'Not authorized, account not found' });
    }

    req.user = { id: decoded.id, role, doc };
    next();
  } catch (error) {
    return res.status(401).json({ message: 'Not authorized, invalid or expired token' });
  }
};

/**
 * Restricts a route to specific roles. 'admin' and 'special_admin' are treated
 * as distinct roles; pass both explicitly if a route should allow either.
 * Usage: router.get('/x', protect, authorize('admin', 'special_admin'), handler)
 */
const authorize = (...roles) => (req, res, next) => {
  if (!req.user || !roles.includes(req.user.role)) {
    return res.status(403).json({ message: 'Forbidden: insufficient role permissions' });
  }
  next();
};

module.exports = { protect, authorize };
