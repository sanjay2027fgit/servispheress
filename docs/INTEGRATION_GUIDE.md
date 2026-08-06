# Integration Guide

## 1. Setup

```bash
cd backend
npm install
cp .env.example .env   # then fill in your real MONGO_URI / EMAIL_* / JWT_SECRET / RAZORPAY_* values
npm start               # or: node server.js
```

`npm install` will pull in a few new packages used for hardening:
`helmet`, `express-rate-limit`, `express-validator`, and `morgan` (request
logging). Everything else reuses dependencies already in your `package.json`.

No new environment variables were introduced. Everything reuses `MONGO_URI`,
`JWT_SECRET`, etc. that your OTP backend already needs. Access tokens now
expire in 1 hour; the frontend should call `POST /api/auth/refresh` with the
stored `refreshToken` when a request gets a `401`, rather than immediately
forcing a re-login.

## 2. What changed vs. what didn't

**Untouched, byte-for-byte:**
- `controllers/authController.js` (OTP send/resend, user & worker signup)
- `utils/otpService.js`, `models/OTP.js`
- `controllers/arrivalOtpController.js`, `models/ArrivalOTP.js`
- `controllers/paymentController.js` (Razorpay order/verify)
- `config/db.js`

**Additive edits only (existing behavior preserved):**
- `models/User.js`, `models/Worker.js`, `models/Admin.js`, `models/Booking.js`, `models/Chat.js`, `models/Feedback.js`, `models/Payment.js` — new optional fields added; nothing removed or renamed. Two real bugs fixed at the schema level: `Worker` was silently dropping `password`/`aadhar` on signup, and `Admin` passwords were stored in plaintext (now bcrypt-hashed via a pre-save hook, so `adminController.js` didn't need to change).
- `routes/authRoutes.js` — new `/login/*` and `/me` routes appended after your existing OTP routes.
- `routes/adminRoutes.js` — same handlers, now wrapped with RBAC middleware (previously **completely unauthenticated**, including the DB-wiping `/seed` route).
- `server.js` — new route files mounted, plus a centralized error handler and a fix so unmatched `/api/*` paths return JSON 404s instead of silently serving `index.html` (which used to break `fetch().then(r => r.json())` on typos).

**New files:** everything under `middleware/`, `utils/queryHelpers.js`, and the controllers/routes for users, workers, bookings, feedback, payments-data, payouts, and chat (see API_DOCUMENTATION.md).

## 3. Migrating existing localStorage data into MongoDB (one-time)

If you have real data sitting in a browser's localStorage right now that you
want preserved, open the app in that browser and run this once from the
console (adjust the URL if you're not on localhost:5000):

```js
fetch('/api/admin/seed', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Authorization': 'Bearer ' + YOUR_SPECIAL_ADMIN_TOKEN
  },
  body: JSON.stringify({
    users: JSON.parse(localStorage.getItem('users') || '[]'),
    workers: JSON.parse(localStorage.getItem('workers') || '[]'),
    bookings: JSON.parse(localStorage.getItem('bookings') || '[]'),
    payments: JSON.parse(localStorage.getItem('payments') || '[]'),
    feedbacks: JSON.parse(localStorage.getItem('feedbacks') || '[]'),
    chats: JSON.parse(localStorage.getItem('chats') || '[]')
  })
}).then(r => r.json()).then(console.log);
```

This is your existing `/api/admin/seed` route (now special_admin-protected) — untouched otherwise.
You'll need at least one special_admin account first; create one directly in
MongoDB Atlas (a document in the `admins` collection with a plaintext
`password` — the pre-save hook will hash it the next time it's saved via the
app, or hash it yourself with bcrypt before inserting).

## 4. Frontend migration plan (next phase)

This upgrade is backend-only so far, on purpose — 15 HTML files with ~8,700
lines of embedded JS is too much to safely rewrite blind in one pass without
your review. The backend above is fully independent and testable via Postman
right now, before any frontend file is touched.

Suggested order, since each step unblocks the next:
1. `admin/login.html`, `special-admin/login.html`, `user/login.html`, `worker/login.html` → wire to `/api/auth/login/*`, store the returned `token` (localStorage is fine for the token itself — that's the one exception your spec calls out).
2. A tiny shared `authFetch(url, opts)` helper (attaches `Authorization: Bearer <token>`, redirects to login on 401) — dropped into each dashboard page.
3. `user/dashboard.html`, `user/booking-form.html`, `user/track.html` → workers list, bookings, live location, chat, feedback.
4. `worker/dashboard.html`, `worker/earnings.html`, `worker/job-details.html` → bookings, availability, payments-data, payouts, chat.
5. `admin/dashboard.html`, `special-admin/dashboard.html` → dashboard aggregate, user/worker block/unblock, payout approval (this UI doesn't exist yet in your current frontend — worth adding since the backend now supports it).

No HTML structure, CSS, or element IDs need to change for any of this — only
the `<script>` blocks that currently read/write `localStorage` get swapped for
`fetch` calls against the endpoints above.

## 5. Postman collection

Import `docs/Servisphere.postman_collection.json`. It uses a collection
variable `{{baseUrl}}` (default `http://localhost:5000`) and auto-saves
`{{userToken}}` / `{{workerToken}}` / `{{adminToken}}` from the login
responses so you can chain requests without copy-pasting tokens.
