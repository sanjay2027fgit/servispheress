# Servisphere API Documentation

This documents everything **added** in this upgrade. Your existing OTP signup
endpoints (`/api/auth/send-otp`, `/api/auth/resend-otp`, `/api/auth/signup/user`,
`/api/auth/signup/worker`) and arrival-OTP / Razorpay endpoints are unchanged
and not repeated here in full — see the bottom section for a quick reference.

All new endpoints return JSON. Protected endpoints require:

```
Authorization: Bearer <token>
```

The token is obtained from a login endpoint below. It carries the user's role,
which the backend uses for Role-Based Access Control (RBAC) — you don't need
to send the role separately.

---

## Auth / Sessions (`/api/auth`)

| Method | Endpoint | Access | Description |
|---|---|---|---|
| POST | `/api/auth/login/user` | Public | Body: `{ email, password }` → `{ token, refreshToken, role: 'user', user }` |
| POST | `/api/auth/login/worker` | Public | Body: `{ email, password }` → `{ token, refreshToken, role: 'worker', worker }` |
| POST | `/api/auth/login/admin` | Public | Body: `{ email, password }` → `{ token, refreshToken, role: 'admin'\|'special_admin', admin }` (role comes from the Admin document) |
| POST | `/api/auth/refresh` | Public (refresh token is the credential) | Body: `{ refreshToken }` → new `{ token, refreshToken }` pair. Rotates the refresh token (old one is revoked). |
| POST | `/api/auth/logout` | Public | Body: `{ refreshToken }` → revokes it so it can't be reused |
| GET | `/api/auth/me` | Private (any role) | Returns the account tied to the current token |

`token` (the access token) now expires in **1 hour**; `refreshToken` lasts 30
days and is stored server-side only as a SHA-256 hash (in the `RefreshToken`
collection, with a TTL index so expired ones auto-delete). Call `/refresh`
when a request comes back `401` to get a new access token without forcing
the user to log in again.

> These are brand new. Your OTP signup routes are untouched and still live under `/api/auth/*` as before.

## Users (`/api/users`)

| Method | Endpoint | Access | Description |
|---|---|---|---|
| GET | `/api/users/me` | Private/User | Get my profile |
| PUT | `/api/users/me` | Private/User | Update `{ name, phone, city }` (city replaces `localStorage.userCity`) |
| GET | `/api/users?page=&limit=&search=&sort=&isBlocked=` | Admin, SpecialAdmin | Paginated/searchable/sortable list |
| GET | `/api/users/:id` | Admin, SpecialAdmin | Get one user |
| PUT | `/api/users/:id/block` | Admin, SpecialAdmin | Body: `{ isBlocked: true\|false }` |
| DELETE | `/api/users/:id` | Admin, SpecialAdmin | Delete user |

## Workers (`/api/workers`)

| Method | Endpoint | Access | Description |
|---|---|---|---|
| GET | `/api/workers/me` | Private/Worker | Get my profile |
| PUT | `/api/workers/me` | Private/Worker | Update `{ name, phone, city, experience }` |
| PUT | `/api/workers/me/availability` | Private/Worker | Body: `{ isAvailable, isOnline }` |
| GET | `/api/workers?city=&role=&isAvailable=&isOnline=&search=&page=&limit=&sort=` | Any logged-in role | Used by the user dashboard's "available workers near me" filter |
| GET | `/api/workers/:id` | Any logged-in role | Get one worker |
| PUT | `/api/workers/:id/block` | Admin, SpecialAdmin | Body: `{ isBlocked }` |
| DELETE | `/api/workers/:id` | Admin, SpecialAdmin | Delete worker |

## Bookings (`/api/bookings`)

| Method | Endpoint | Access | Description |
|---|---|---|---|
| POST | `/api/bookings` | Private/User | Body: `{ workerId, date, timeSlot, location, emergency }` |
| GET | `/api/bookings?status=&emergency=&page=&limit=&sort=&search=` | Private | Users see only their own; workers see only theirs; admin/special_admin see all (with optional `userId`/`workerId` filters) |
| GET | `/api/bookings/:id` | Private | Owner, assigned worker, or admin |
| PUT | `/api/bookings/:id/status` | Worker, Admin, SpecialAdmin | Body: `{ status }` — one of `pending, accepted, rejected, in_progress, completed, cancelled_by_user, cancelled_by_worker` |
| PUT | `/api/bookings/:id/cancel` | Private/User | Body: `{ reason }` — user-initiated cancel |
| PUT | `/api/bookings/:id/location` | Private/Worker | Body: `{ lat, lng }` — replaces `localStorage.workerLocations[bookingId]` |
| GET | `/api/bookings/:id/location` | Owner user or Admin | Poll live worker location |

## Feedback / Ratings (`/api/feedback`)

| Method | Endpoint | Access | Description |
|---|---|---|---|
| POST | `/api/feedback` | Private/User | Body: `{ bookingId, rating (1-5), comment }`. Also rolls into the worker's `ratingAvg`/`ratingCount`. |
| GET | `/api/feedback?bookingId=&page=&limit=&sort=` | Private | Users see only their own submissions |

## Payments ledger (`/api/payments-data`)

> Distinct from your existing `/api/payments/razorpay/*` endpoints (order creation
> and signature verification), which are unchanged. This is the internal record
> of what's been paid, used for worker earnings / admin payouts.

| Method | Endpoint | Access | Description |
|---|---|---|---|
| POST | `/api/payments-data` | Private | Body: `{ bookingId, amount, status }` — call after a successful Razorpay payment |
| GET | `/api/payments-data?status=&workerId=&page=&limit=&sort=` | Private | Workers see only their own; admin can filter by any `workerId` |
| PUT | `/api/payments-data/:id/status` | Admin, SpecialAdmin | Body: `{ status }` — one of `pending, paid_by_user, approved` |

## Payout requests (`/api/payouts`)

| Method | Endpoint | Access | Description |
|---|---|---|---|
| POST | `/api/payouts` | Private/Worker | Sums up all `paid_by_user` payments for the worker and opens a payout request |
| GET | `/api/payouts?status=&page=&limit=&sort=` | Private | Workers see only their own; admin/special_admin see all |
| PUT | `/api/payouts/:id/status` | Admin, SpecialAdmin | Body: `{ status: 'approved'\|'rejected' }` — approving flips the underlying payments to `approved` |

## Chat (`/api/chat`)

| Method | Endpoint | Access | Description |
|---|---|---|---|
| GET | `/api/chat/:bookingId` | Booking participants, Admin | Fetch thread |
| POST | `/api/chat/:bookingId` | User, Worker | Body: `{ message }` |

> Your existing `POST /api/admin/chat` (admin replies) is unchanged and now RBAC-protected (admin/special_admin only).

## Admin (`/api/admin`) — existing routes, now RBAC-protected

| Method | Endpoint | Access | Notes |
|---|---|---|---|
| GET/POST | `/api/admin` | SpecialAdmin only | Manage admin accounts |
| PUT/DELETE | `/api/admin/:id` | SpecialAdmin only | |
| GET | `/api/admin/dashboard` | Admin, SpecialAdmin | Now also includes `payoutRequests` |
| POST | `/api/admin/chat` | Admin, SpecialAdmin | Unchanged logic |
| POST | `/api/admin/seed` | SpecialAdmin only | **Destructive** — wipes and reseeds core collections. Locked down because it previously had zero protection. |

**Important fix:** admin accounts previously stored passwords in plaintext.
They're now bcrypt-hashed automatically at the schema level — no controller
code changed, so nothing about admin creation/updates broke.

## Untouched endpoints (for reference)

- `POST /api/auth/send-otp`, `/api/auth/resend-otp`, `/api/auth/signup/user`, `/api/auth/signup/worker` — your existing OTP signup flow, byte-for-byte unchanged.
- `POST /api/arrival-otp/send|verify|consume` — unchanged.
- `POST /api/payments/razorpay/order`, `/api/payments/razorpay/verify` — unchanged.

## Hardening

- **Helmet** is applied globally (CSP disabled since the frontend uses inline `<script>` blocks and is same-origin; all other headers active).
- **Rate limiting**: 300 req/15min per IP on all of `/api/*`, tightened to 20 req/15min per IP on `/api/auth/*` (covers OTP send/resend, signup, and login — brute force and OTP-spam protection).
- **Validation**: every new POST/PUT route validates its body with `express-validator` before reaching the controller; failures return `400` with a per-field error list.
- **Refresh tokens**: see the Auth section above.
- **Indexes** added on `Booking` (`userId`, `workerId`, `status`, and the `workerId+date+timeSlot` combo used for the double-booking check), `Worker` (`city+role+isAvailable`, `isBlocked`), `User` (`isBlocked`, `city`), `Payment` (`workerId+status`, `bookingId`), `Feedback` (`bookingId`, `userId`), and `PayoutRequest` (`workerId+status`).

## Error format

All errors return `{ "message": "..." }` with an appropriate status code
(400 validation, 401 unauthenticated, 403 forbidden, 404 not found, 409 conflict,
500 server error).

## Pagination format

List endpoints return:
```json
{
  "data": [ ... ],
  "pagination": { "total": 42, "page": 1, "limit": 20, "totalPages": 3 }
}
```
