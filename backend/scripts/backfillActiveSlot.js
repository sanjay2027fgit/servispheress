/**
 * One-time migration: backfills the new `isActiveSlot` field on bookings
 * that were created before this field existed. Safe to run multiple times
 * (it only touches documents where the field is missing).
 *
 * Usage: node scripts/backfillActiveSlot.js
 */
require('dotenv').config();
const mongoose = require('mongoose');
const Booking = require('../models/Booking');

const TERMINAL_STATUSES = ['rejected', 'cancelled_by_user', 'cancelled_by_worker', 'completed', 'done', 'payment_confirmed', 'expired'];

async function main() {
  await mongoose.connect(process.env.MONGO_URI);

  const activeResult = await Booking.updateMany(
    { isActiveSlot: { $exists: false }, status: { $nin: TERMINAL_STATUSES } },
    { $set: { isActiveSlot: true } }
  );
  const inactiveResult = await Booking.updateMany(
    { isActiveSlot: { $exists: false }, status: { $in: TERMINAL_STATUSES } },
    { $set: { isActiveSlot: false } }
  );

  console.log(`Backfilled ${activeResult.modifiedCount} active bookings and ${inactiveResult.modifiedCount} terminal bookings.`);
  await mongoose.disconnect();
}

main().catch((err) => {
  console.error('Backfill failed:', err.message);
  process.exit(1);
});
