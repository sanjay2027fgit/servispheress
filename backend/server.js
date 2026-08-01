require('dotenv').config();

const express = require('express');
const http = require('http');
const cors = require('cors');
const path = require('path');
const helmet = require('helmet');
const morgan = require('morgan');
const rateLimit = require('express-rate-limit');
const jwt = require('jsonwebtoken');
const { Server } = require('socket.io');

const connectDB = require('./config/db');

const adminRoutes = require('./routes/adminRoutes');
const authRoutes = require('./routes/authRoutes');
const arrivalOtpRoutes = require('./routes/arrivalOtpRoutes');
const paymentRoutes = require('./routes/paymentRoutes');
const userRoutes = require('./routes/userRoutes');
const workerRoutes = require('./routes/workerRoutes');
const bookingRoutes = require('./routes/bookingRoutes');
const feedbackRoutes = require('./routes/feedbackRoutes');
const paymentsDataRoutes = require('./routes/paymentsDataRoutes');
const payoutRoutes = require('./routes/payoutRoutes');
const chatRoutes = require('./routes/chatRoutes');

const { notFound, errorHandler } = require('./middleware/errorMiddleware');
const { getRazorpayEnvironmentStatus } = require('./utils/razorpayClient');

// Connect to MongoDB
connectDB();

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: true,
    credentials: true
  }
});
app.set('io', io);
const PORT = process.env.PORT || 5000;
const razorpayEnvStatus = getRazorpayEnvironmentStatus();
console.log(`Razorpay Key loaded: ${razorpayEnvStatus.hasKeyId}`);
console.log(`Razorpay Secret loaded: ${razorpayEnvStatus.hasKeySecret}`);
console.log(`Razorpay mode: ${razorpayEnvStatus.mode}`);

/* ==========================
   Middleware
========================== */

app.use(
  helmet({
    // Your frontend uses inline scripts
    contentSecurityPolicy: false,
    // These three default to strict cross-origin isolation policies in Helmet 7.
    // They block loading checkout.razorpay.com's script and/or its popup's
    // postMessage handshake back to this page, which is what was breaking
    // Razorpay. Same category of thing as CSP above -- safe to relax for a
    // same-origin app that embeds a third-party payment widget.
    crossOriginEmbedderPolicy: false,
    crossOriginOpenerPolicy: { policy: 'same-origin-allow-popups' },
    crossOriginResourcePolicy: { policy: 'cross-origin' }
  })
);

app.use(
  morgan(process.env.NODE_ENV === 'production' ? 'combined' : 'dev')
);

const allowedOrigins = [
  'https://servispheress.netlify.app',
  'http://localhost:3000',
  'http://localhost:5000',
  'http://localhost:5500',
  'http://127.0.0.1:3000',
  'http://127.0.0.1:5000',
  'http://127.0.0.1:5500'
];

const corsOptions = {
  origin: (origin, callback) => {
    if (!origin || allowedOrigins.includes(origin)) {
      return callback(null, true);
    }
    console.error('CORS blocked origin:', origin);
    return callback(new Error('Not allowed by CORS'));
  },
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'Accept', 'X-Requested-With', 'Origin'],
  credentials: true,
  optionsSuccessStatus: 200
};

app.use(cors(corsOptions));
app.use((req, res, next) => {
  if (!req.headers.origin || allowedOrigins.includes(req.headers.origin)) {
    res.header('Access-Control-Allow-Origin', req.headers.origin || '*');
  }
  res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization');
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS');
  res.header('Access-Control-Allow-Credentials', 'true');
  next();
});

app.use('/api/payments/webhook', express.raw({ type: 'application/json' }));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

/* ==========================
   Rate Limiting
========================== */

// General API limiter. Real-time location updates now go through Socket.IO
// (throttled server-side above), not this HTTP path, so what counts against
// this limit is legitimate polling: chat (every 6s) + UI refresh (every 10s)
// from one active tracking session is ~240 req/15min worst case. 600 leaves
// headroom for a few tabs/sessions without being a blind "raise the number".
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 600,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    message: 'Too many requests. Please wait a moment and try again.'
  }
});

app.use('/api', apiLimiter);

/* ==========================
   API Routes
========================== */

app.use('/api/admin', adminRoutes);
app.use('/api/auth', authRoutes);
app.use('/api/arrival-otp', arrivalOtpRoutes);
app.use('/api/payments', paymentRoutes);
app.use('/api/users', userRoutes);
app.use('/api/workers', workerRoutes);
app.use('/api/bookings', bookingRoutes);
app.use('/api/feedback', feedbackRoutes);
app.use('/api/payments-data', paymentsDataRoutes);
app.use('/api/payouts', payoutRoutes);
app.use('/api/chat', chatRoutes);

/* ==========================
   Frontend
========================== */

app.use(express.static(path.join(__dirname, '../frontend')));

// Serve frontend for non-API routes
app.get(/^(?!\/api).*/, (req, res) => {
  res.sendFile(path.join(__dirname, '../frontend/index.html'));
});

/* ==========================
   Error Handling
========================== */

app.use('/api', notFound);
app.use(errorHandler);

/* ==========================
   Socket.IO real-time tracking
========================== */

const Booking = require('./models/Booking');
const User = require('./models/User');
const Worker = require('./models/Worker');

// Server-side location-write throttle: even if a client sends updates more
// often than intended (buggy tab, multiple tabs open, high-frequency GPS
// chip), we only actually write to MongoDB if enough time has passed OR the
// position moved a meaningful distance. This is deliberately independent of
// the client-side throttle below -- the server never trusts the client alone.
const MIN_UPDATE_INTERVAL_MS = 3000; // don't write more than once per 3s per booking+role
const MIN_MOVE_METERS = 8; // ...unless it moved at least this far in the meantime
const lastWriteByKey = new Map(); // `${bookingId}:${role}` -> { lat, lng, at }

function haversineMeters(lat1, lng1, lat2, lng2) {
  const R = 6371000;
  const toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function shouldWriteLocation(key, lat, lng) {
  const last = lastWriteByKey.get(key);
  const now = Date.now();
  if (!last) return true;
  if (now - last.at >= MIN_UPDATE_INTERVAL_MS) return true;
  if (haversineMeters(last.lat, last.lng, lat, lng) >= MIN_MOVE_METERS) return true;
  return false;
}

function recordWrite(key, lat, lng) {
  lastWriteByKey.set(key, { lat, lng, at: Date.now() });
}

// Prevent lastWriteByKey from growing forever across a long-running server:
// drop entries that haven't been touched in 10 minutes.
setInterval(() => {
  const cutoff = Date.now() - 10 * 60 * 1000;
  for (const [key, val] of lastWriteByKey.entries()) {
    if (val.at < cutoff) lastWriteByKey.delete(key);
  }
}, 5 * 60 * 1000);

const socketAuthUser = async (socket, next) => {
  try {
    const authHeader = socket.handshake.auth?.token || socket.handshake.headers.authorization || '';
    const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : authHeader;
    if (!token || !process.env.JWT_SECRET) {
      return next();
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    let account = null;
    if (decoded.role === 'user') {
      account = await User.findById(decoded.id).select('email id');
    } else if (decoded.role === 'worker') {
      account = await Worker.findById(decoded.id).select('email id');
    } else if (decoded.role === 'admin' || decoded.role === 'special_admin') {
      account = { email: decoded.email || '', id: decoded.id, role: decoded.role };
    }

    socket.data.account = account ? { ...account.toJSON(), role: decoded.role } : null;
    socket.data.role = decoded.role;
    socket.data.accountId = decoded.id;
    return next();
  } catch (error) {
    return next();
  }
};

io.use(socketAuthUser);

io.on('connection', (socket) => {
  socket.on('joinBooking', async (bookingId) => {
    const booking = await Booking.findById(bookingId).select('userId workerId status workerLocation liveLocation userLocation').catch(() => null);
    if (!booking) {
      socket.emit('bookingError', { message: 'Booking not found' });
      return;
    }

    const account = socket.data.account;
    if (!account) {
      socket.emit('bookingError', { message: 'Authentication required for booking tracking' });
      return;
    }

    const isOwner = account.role === 'user' && booking.userId === account.email;
    const isAssignedWorker = account.role === 'worker' && String(booking.workerId) === String(account.id);
    const isAdmin = account.role === 'admin' || account.role === 'special_admin';

    if (!isOwner && !isAssignedWorker && !isAdmin) {
      socket.emit('bookingError', { message: 'Forbidden' });
      return;
    }

    const room = `booking:${bookingId}`;
    socket.join(room);
    socket.data.bookingId = bookingId;

    socket.emit('bookingJoined', { bookingId });
    io.to(room).emit('bookingLocations', {
      bookingId,
      userLocation: booking.userLocation || null,
      workerLocation: booking.workerLocation || booking.liveLocation || null
    });
  });

  socket.on('userLocationUpdate', async (payload) => {
    const bookingId = socket.data.bookingId || payload?.bookingId;
    if (!bookingId) return;
    if (!socket.data.account || socket.data.account.role !== 'user') return;

    const lat = Number(payload?.lat ?? payload?.latitude);
    const lng = Number(payload?.lng ?? payload?.longitude);
    const accuracy = Number(payload?.accuracy ?? 0);
    if (Number.isNaN(lat) || Number.isNaN(lng)) return;

    const throttleKey = `${bookingId}:user`;
    if (!shouldWriteLocation(throttleKey, lat, lng)) return;

    const booking = await Booking.findById(bookingId).select('userId status').catch(() => null);
    if (!booking) return;
    if (booking.userId !== socket.data.account.email) return;
    if (['completed', 'cancelled_by_user', 'cancelled_by_worker', 'rejected', 'expired', 'done', 'payment_confirmed'].includes(booking.status)) {
      return;
    }

    const updatedAt = new Date();
    const userLocation = { lat, lng, latitude: lat, longitude: lng, accuracy, updatedAt };
    await Booking.updateOne({ _id: bookingId }, { $set: { userLocation } });
    recordWrite(throttleKey, lat, lng);

    io.to(`booking:${bookingId}`).emit('userLocationChanged', { bookingId, userLocation, updatedAt });
  });

  socket.on('workerLocationUpdate', async (payload) => {
    const bookingId = socket.data.bookingId || payload?.bookingId;
    if (!bookingId) return;
    if (!socket.data.account || socket.data.account.role !== 'worker') return;

    const lat = Number(payload?.lat ?? payload?.latitude);
    const lng = Number(payload?.lng ?? payload?.longitude);
    const accuracy = Number(payload?.accuracy ?? 0);
    if (Number.isNaN(lat) || Number.isNaN(lng)) return;

    const throttleKey = `${bookingId}:worker`;
    if (!shouldWriteLocation(throttleKey, lat, lng)) return;

    const booking = await Booking.findById(bookingId).select('workerId status').catch(() => null);
    if (!booking) return;
    if (String(booking.workerId) !== String(socket.data.account.id)) return;
    if (['completed', 'cancelled_by_user', 'cancelled_by_worker', 'rejected', 'expired', 'done', 'payment_confirmed'].includes(booking.status)) {
      return;
    }

    const updatedAt = new Date();
    const workerLocation = { lat, lng, latitude: lat, longitude: lng, accuracy, updatedAt };
    await Booking.updateOne({ _id: bookingId }, { $set: { workerLocation, liveLocation: workerLocation } });
    recordWrite(throttleKey, lat, lng);

    io.to(`booking:${bookingId}`).emit('workerLocationChanged', { bookingId, workerLocation, updatedAt });
  });
});

/* ==========================
   Start Server
========================== */

server.listen(PORT, () => {
  console.log('===================================');
  console.log(`🚀 Server running on port ${PORT}`);
  console.log(`🌐 Frontend: http://localhost:${PORT}`);
  console.log('===================================');
});