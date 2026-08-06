/**
 * One-time bootstrap: creates the very first special_admin account.
 * After this, use the app itself (POST /api/admin, special_admin-only) to
 * create additional admin/special_admin accounts.
 *
 * Usage:
 *   node scripts/createFirstAdmin.js "you@example.com" "a-strong-password" [admin|special_admin]
 *
 * (role defaults to special_admin if omitted)
 */
require('dotenv').config();
const mongoose = require('mongoose');
const Admin = require('../models/Admin');

async function main() {
  const [, , email, password, roleArg] = process.argv;
  const role = roleArg === 'admin' ? 'admin' : 'special_admin';

  if (!email || !password) {
    console.error('Usage: node scripts/createFirstAdmin.js <email> <password> [admin|special_admin]');
    process.exit(1);
  }
  if (password.length < 6) {
    console.error('Password must be at least 6 characters.');
    process.exit(1);
  }

  await mongoose.connect(process.env.MONGO_URI);

  const existing = await Admin.findOne({ email: email.toLowerCase() });
  if (existing) {
    console.log(`An admin with email ${email} already exists (role: ${existing.role}). Nothing to do.`);
    await mongoose.disconnect();
    return;
  }

  // Password is hashed automatically by the pre-save hook on the Admin model.
  const admin = await Admin.create({ email: email.toLowerCase(), password, role, name: 'Admin' });
  console.log(`Created ${admin.role} account: ${admin.email}`);
  console.log('You can now log in at /admin/login.html or /special-admin/login.html with these credentials.');

  await mongoose.disconnect();
}

main().catch((err) => {
  console.error('Failed to create admin:', err.message);
  process.exit(1);
});
