# Fix Pass: DB dashboard data + Razorpay

## What was actually wrong

Your frontend was never touched by anyone — it's the same file set from the
start. Two things I did in the backend hardening pass broke functionality
that was *already working* (insecurely) before:

### 1. Razorpay stopped working
`server.js` added Helmet with only `contentSecurityPolicy: false` set.
Helmet 7's other defaults — `Cross-Origin-Embedder-Policy: require-corp` and
`Cross-Origin-Opener-Policy: same-origin` — silently block loading
`checkout.razorpay.com`'s script and/or the popup's `postMessage` handshake
back to your page. This is a well-known gotcha with Helmet + any third-party
payment widget (Razorpay, Stripe, PayPal all hit it).

**Fix:** `crossOriginEmbedderPolicy: false`, `crossOriginOpenerPolicy: { policy: 'same-origin-allow-popups' }`,
`crossOriginResourcePolicy: { policy: 'cross-origin' }` in `server.js`. Backend-only change.

### 2. Admin dashboard only showed users/workers
`admin/dashboard.html` already had working code that called
`GET /api/admin/dashboard` and merged it with `localStorage` — that's
original code, not something added later. It worked before because that
route had **zero authentication**. When I added RBAC (`protect`,
`authorize('admin', 'special_admin')`) to lock down what was an
unauthenticated admin API, I didn't update the frontend to send a token —
per your instruction at the time not to touch the frontend. Since
`admin/login.html` was still the hardcoded mock login (no real JWT ever
issued), every dashboard fetch now 401'd, silently fell back to empty data,
and only `users`/`workers` survived because your signup pages mirror those
two into `localStorage` as a compatibility shim. Bookings/payments/feedback/
chat never had a `localStorage` path at all, so they showed nothing.

**Fix (script-only, zero visual/UI changes):**
- `admin/login.html`, `special-admin/login.html` now call the real
  `POST /api/auth/login/admin` and store the returned JWT
  (`adminToken`/`specialAdminToken` in `localStorage`), alongside the
  existing `currentAdmin`/`currentSpecialAdmin` flags so nothing else about
  the page's auth-guard logic changed.
- `admin/dashboard.html`'s three existing `fetch()` calls
  (`/api/admin/dashboard`, `/api/admin/chat`, `/api/admin/seed`) now send
  `Authorization: Bearer <token>`. A 401/403 on the dashboard fetch clears
  the stale session and redirects to login, same as if login had never
  happened.
- `/api/admin/seed` is intentionally still special_admin-only — it does
  `deleteMany()` on **every** core collection before reinserting, every time
  it's called. That's pre-existing behavior I didn't change, just secured
  it. A plain `admin` clicking "Sync" now gets a clear message instead of a
  silent failure.

### New: admin bootstrap script
Since creating an admin account requires being logged in as `special_admin`
already, there was no way to create the *first* one. Added
`backend/scripts/createFirstAdmin.js`:

```bash
cd backend
node scripts/createFirstAdmin.js "you@example.com" "a-strong-password" special_admin
```

Run this once against your real `MONGO_URI`, then log in at
`/admin/login.html` or `/special-admin/login.html` with those credentials.
The old hardcoded `admin@servisphere.com` / `admin123` and
`special@servisphere.com` / `special123` credentials no longer work — they
were never real accounts, just a client-side `if` check.

## Not yet touched (flagging, not fixing silently)

- Nothing frontend-wise remains on localStorage for business data. See the
  "Full cloud migration" section below for the complete picture.

## Full cloud migration (this pass)

Every page now reads/writes MongoDB via the API instead of `localStorage`,
except session tokens (`userToken`, `workerToken`, `adminToken`,
`specialAdminToken` + their refresh tokens) and `emergencyMode` (a pure
pre-booking UI toggle -- its *outcome*, `booking.emergency`, is what actually
gets stored, in MongoDB).

**Pages rewired (script-only, zero UI/HTML/CSS changes):**
- `user/login.html`, `worker/login.html` -- real JWT login, replacing the
  plaintext-password-against-localStorage-array check.
- `user/booking-form.html` -- creates bookings via `POST /api/bookings`
  (server-side double-booking check), worker info and slot availability
  fetched live via the API.
- `user/dashboard.html` -- workers list, my bookings, completed jobs,
  cancel, pay, feedback all via the API. City preference now syncs to
  `PUT /api/users/me` instead of a local-only value.
- `user/track.html` -- booking, live location (both directions -- see
  below), chat, feedback, and the Razorpay success handler all via the API.
- `worker/dashboard.html` -- bookings, availability toggle, accept/reject,
  payout request, city update all via the API. Also auto-refreshes every 15s
  so bookings made on another device show up without a manual reload.
- `worker/job-details.html` -- booking fetch/status updates via the API. The
  worker-movement simulation is still a client-side visual (it was never real
  GPS), but the simulated position is now pushed to MongoDB every tick so a
  **different device** tracking the same booking actually sees it move.
- `worker/earnings.html` -- payment history and payout requests via the API
  (payout amount is computed authoritatively server-side, not trusted from
  the client).
- `admin/dashboard.html` -- removed the `localStorage` merge-fallback that
  existed alongside the DB fetch (now redundant and, worse, a landmine: since
  nothing writes to those keys anymore, the old "Sync" button would have
  wiped MongoDB and reseeded it with empty arrays). The button is repurposed
  as a safe manual refresh.
- `special-admin/dashboard.html` -- previously had **zero** DB-fetch code
  (100% localStorage from day one). Fully rewired: payment approval queue,
  revenue metrics, and worker/user name lookups all via the API.

**New backend pieces added to support this:**
- `GET /api/workers/:id/availability?date=` -- lets a user check a specific
  worker's booked slots without exposing other users' full booking data.
- `PUT /api/bookings/:id/user-location` + updated `GET /api/bookings/:id/location`
  -- the user's own live position (what the worker's tracking view heads
  towards) is now a real field on the booking (`userLocation`), polled
  cross-device, replacing the old `booking.userLat/userLng` scheme that only
  ever worked within one browser's localStorage.
- `PUT /api/bookings/:id/emergency` -- lets a user toggle emergency mode on
  an existing pending booking (previously a direct localStorage mutation).
- Booking status validation was loosened from a fixed enum to "any non-empty
  string" -- the real frontend state machine (`on_the_way`, `near`, `arrived`,
  `confirmed`, `payment_confirmed`, `done`, `expired`, etc.) turned out to be
  richer than what I'd modeled, and guessing at a complete enum risked
  silently blocking a legitimate transition.
- `Payment.userId` added (denormalized from the booking at creation) so
  payment listing can be scoped per-user, and a user can now self-mark their
  *own* pending payment as `paid_by_user` (previously admin-only, which broke
  both the dashboard's "Pay Now" button and the Razorpay success handler).
- Fixed a second silently-dropped-field bug in `authController.signupWorker`:
  the frontend already sent `city`/`state` at signup, but the controller
  never read them from `req.body`. Since the entire "workers near me" feature
  depends on city data, this was fixed by adding the two fields to the
  destructure and to `Worker.create()` -- OTP verification logic itself is
  untouched.
- `Worker.availability` (renamed from my earlier `isAvailable`) and
  `Worker.rate`/`state` added -- match field names the frontend already used
  so no dashboard code needed to change to read them.

**Known remaining gaps, called out rather than papered over:**
- The worker-approach "simulation" in `job-details.html` is still a scripted
  animation, not real device GPS -- pushing it to MongoDB makes it visible
  cross-device, but it isn't tracking anyone's actual phone location.
- I could not run this against your real MongoDB Atlas cluster from this
  sandbox (no network access here) -- every check below is static
  (syntax + require-graph + a boot test against a stubbed connection). A real
  end-to-end run on your deployment is still the next step.

## Verified this pass
- `node --check` on every backend file and every inline `<script>` block
  across all 15 frontend HTML files (100% pass).
- Full require-graph load of every backend module (models, controllers,
  routes, middleware, utils) with stubs for the hardening packages
  (`helmet`, `morgan`, `express-rate-limit`, `express-validator`) since this
  sandbox has no network access to actually `npm install` them.
- Booted the real `server.js` (stubbed Mongo connection) and hit both a
  no-token protected route (`401`, correct) and confirmed the relaxed
  COOP/COEP/CORP headers are present on responses.
- Could not test the live login → booking → tracking → payment flow against
  your real Atlas cluster or a real Razorpay checkout from this sandbox.
