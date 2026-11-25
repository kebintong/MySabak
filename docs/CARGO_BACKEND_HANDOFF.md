# mysabak Cargo · Backend handoff

For: the mysabak backend developer
From: the frontend/demo repo (`MySabak`, branch `Kenn`)
Date: 2026-11-25 (driver dashboard data added 2026-11-26)
Related files:
- In this repo:
  - `js/api.js`: every call below, with the demo body to replace;
  - `PANELS.md`: the screens and the calls each one uses;
  - `README.md`: setup and deploying.
- Ask the frontend team for:
  - `CARGO_IMPLEMENTATION_PLAN.md` (the frontend audit);
  - `driver-wallet-plan.md` (the wallet and the ₱10 fee design).

---

## 1. Why you're getting this
We're adding **mysabak Cargo**: van and truck style deliveries (like Lalamove) for individuals and businesses, inside the
existing app. The frontend is being built now, in the demo repo, against the API described below. Its demo bodies are
saved in the browser. **The real money, dispatch and security rules have to live in your backend.** The frontend never
decides amounts, eligibility or payment status.

The frontend audit only covered the demo repo. We haven't seen the backend, so please answer section 2 first: it
decides what Cargo can reuse.

## 2. Questions for you (please answer before building)
1. **Stack:** language/framework, database (and version), hosting, how it's deployed. Is there a staging environment?
2. **Auth:** how sessions work (cookie / JWT), roles (customer, driver, merchant, admin), and how the API checks ownership.
3. **Bookings:** is there one bookings table for Ride, Parcel and Food, or one per service? The status names and the
   allowed transitions. Is there a status history?
4. **Dispatch:** how a booking reaches a driver today (push, polling, sockets). Is acceptance atomic, so two drivers
   can't both win?
5. **Driver wallet:** does one exist? Ledger or a single balance column? Is there anything for the ₱10 commission
   (reserve on accept, capture on completion, release on cancel)?
6. **Payments:** which provider (PayMongo, Xendit, Maya, GCash direct…)? Are webhooks verified on the server? How is
   cash recorded?
7. **Vehicles:** which vehicle types exist? Are payload/dimensions stored? Is there per-service driver capability?
8. **Files:** where are driver documents and photos stored? Private with signed URLs?
9. **Notifications:** SMS / push / email provider? Can we send a one-time code (OTP) to a recipient?
10. **Routing/maps:** does the backend call TomTom (or others)? Is truck routing (weight/height limits) available?
11. **Money type:** do you store money as DECIMAL/NUMERIC or integer centavos? (Never floats.)
12. **Business accounts:** anything existing for companies and their staff?

## 3. Business rules the backend must enforce
- **Fixed ₱10 platform commission per successfully completed booking.** Not a percentage. It's the same for Ride,
  Parcel and Food. **For Cargo it needs management approval before production**, so put it behind a config switch.
- **Driver wallet (prepaid)**
  - A driver needs at least ₱10 *available* to accept.
  - Available = ledger balance − active reservations.
  - Reserve ₱10 on accept, linked to the booking id. Capture exactly once on verified completion. Release on a cancel
    or failure that isn't charged.
  - Two simultaneous accepts on ₱10: only one succeeds (atomic, e.g. a conditional update or a row lock).
  - The ledger is append-only: reservation, capture, release, top-up, refund and adjustment entries, each with a unique
    reference and an idempotency key.
  - Never negative. Never deducted from the driver's cash collection.
- **Drivers keep 100% of the fare.** The ₱10 comes from the wallet, never from the fare shown to the customer.
- **Payments**
  - Payment status is tracked separately from booking status.
  - Digital payment counts as paid only after verification (webhook or server check); a redirect isn't proof.
  - Cash is recorded and auditable.
- **Business customers are prepaid per booking.** No credit and no postpaid in the first release.
- **Cargo pricing is computed and re-checked on the server.** Fare = base + road km × vehicle rate + cargo surcharge
  + helpers + tolls + approved extras.
  - Store the quote and the pricing-rule version with the booking.
  - All rates, zones, surcharges and capacities are config, not code.
- **Never trust from the client:** fares, balances, commission, payment status, driver eligibility, vehicle
  capacity, booking ownership, completion.

## 4. Cargo scope for the first release
- **One pickup and one drop-off** (no multi-stop).
- **Vehicles:** Motorcycle, Sedan, MPV/SUV, Van, Truck, each with a max payload (kg) and cargo-space size
  (L × W × H cm) from config.
- **Cargo details:** type, description, weight, size, number of pieces, fragile flag, photos (optional at booking).
- **Optional helpers** (loading/unloading), only if real staff can be assigned.
- **Coverage:** Cebu Province, configurable service areas. Not a radius: roads, islands and ferries matter.
- **Proof:** photo + condition at pickup; at delivery, recipient OTP + photo (optional signature). Delivery
  exceptions go to admin.

## 5. Booking state machine (proposed; please map it to yours)
`quoted` → (`pending_payment` → verified) → `searching` → `assigned` → `driver_arriving` → `at_pickup` → `picked_up`
→ `in_transit` → `at_destination` → `awaiting_verification` → `completed`.

Side states:
- `cancelled`: before pickup only.
- `failed`: return to sender, after admin resolution.
- `requires_assistance`: any exception after pickup.

Cancelling after `picked_up` is never an ordinary cancel; it goes through `requires_assistance`.

| Event | Wallet effect |
|---|---|
| Driver accepts (`assigned`) | Reserve ₱10 (atomic). If it can't, no assignment. |
| `completed` (OTP + photo verified) | Capture ₱10 once |
| `cancelled` / no-show / `failed` | Release |

## 6. The API the frontend will call
The frontend calls everything through `js/api.js` (one function per call). Please keep these names and shapes, or tell
us yours and we'll adapt the function bodies. **Money is integer centavos** in Cargo payloads (₱120.50 → `12050`).

### Customer (built in the frontend, round 1, 2026-11-25; the demo bodies are in `js/api.js`)
| Function | Returns | Notes |
|---|---|---|
| `cargoFares(trip)` | `{ [vehicleId]: { total, base, distance } \| null }` in **pesos** (same shape as the existing `faresFor`) | "from" fares for the vehicle list (base + distance only) |
| `cargoQuote({ pickup:{lng,lat,label}, dropoff:{…}, trip, vehicle, cargo:{ type, description, weightKg, lengthCm, widthCm, heightCm, pieces, fragile }, helpers })` | `{ quoteId, expiresAt, vehicle, cargo, helpers, distanceKm, lines:[{ id:'base'\|'distance'\|'fragile'\|'helpers', label, amount }], fare, ruleVersion }`, money in **centavos** | Server prices from its own rules and route, and checks the fit and area. **400** bad details, **409** doesn't fit (`{ suggest: vehicleId \| null }`: the smallest that fits), **422** outside the service area |
| `cargoBook({ quoteId, payment, tip, recipient:{ name, phone }, notes, photoCount, key, trip })` | `{ id, deliveryCode, demo }` | The fare comes from the stored quote; only `tip` comes from the client (cap like other tips). `key` = idempotency key: the same key returns the same booking. **400** receiver details, **410** quote expired or unknown. `deliveryCode` (4 digits) is what the receiver gives the driver |
| Tracking, cancel, history | the **existing** `findDriver`, `onTripUpdate`, `myActiveTrip`, `cancelRide`, `myTrips`, `rateRide` | A Cargo booking is a normal booking with `kind:'cargo'`, plus `cargo:{ …details, helpers, lines, quoteId, ruleVersion, recipient, notes, photos, deliveryCode }` |

- **Photos:** the demo only counts them, and nothing is uploaded. The backend needs an upload, e.g. a signed URL per
  photo before `cargoBook`, then the photo ids in the booking.
- **Still needed from the backend:**
  - `cargoOptions()`: vehicles, capacities, types, helper availability and rates, so they come from the server
    instead of the demo's `CONFIG.cargo`;
  - `paymentStatus` / `pending_payment` for digital payments;
  - cancel rules after pickup (409).

### Driver (existing job calls, extended)
**Request availability (built in the frontend, 2026-11-25; applies to every service, not only Cargo)**
- `onJobRequest(onJob, { near, onGone })` needs **two** real-time events (WebSocket or SSE):
  - **New request** → `onJob(job)`. Every request carries `postedAt` and `serverTime`, both in server-clock ms.
    - The card shows how long ago it was posted ("New", "2 min ago"), worked out from their difference, so a phone
      with a wrong clock still says it right.
    - There is **no countdown**: requests are a shared list where the first driver to accept wins (2026-11-26
      decision). How long an untaken request stays open is the server's choice. Close it with
      `onGone(id,'expired')`, and widen the search or tell the customer.
    - `expiresAt` is optional: only a fallback in case an `onGone` message is lost.
  - **Request no longer open to this driver** → `onGone(id, reason)`. Send it the moment the request's state changes:
    - `reason` is `'taken'` (another driver accepted), `'cancelled'` (the customer cancelled), `'expired'` or
      `'withdrawn'` (the system or an admin, or the driver stopped being eligible).
    - The page shows the reason for 1.6 s, then removes the card and its map pin.
    - The page never drops a request on its own clock alone: only 1 s after `expiresAt` (if sent), if no event came.
- `acceptJob(id)` must be **atomic**: one winner per request, e.g. a conditional `UPDATE … WHERE status='open' AND
  expires_at > now()`.
  - Errors carry `code`:
    - 409 `taken`;
    - 409 `busy` (the driver already has a job);
    - 410 `expired`;
    - 410 `cancelled`;
    - later, 402 `wallet_low`.
  - Accepting the job the driver already holds returns it again (idempotent), so a double tap is safe.
  - After a successful accept, send `onGone(id,'taken')` to every other driver who was offered it.

**Driver dashboard data (built in the frontend, 2026-11-26)**
- `driverStatus()`: `{ status, signedIn, name, phone, email, vehicle, plate, rating, online }`. Account shows the phone,
  email, vehicle and plate. Online time is counted per device today; please count it on the server.
- `driverEarnings()`:
  - returns `{ today, week, feesToday, feesWeek, feePerTrip, trips, endedEarly, payout }`, in whole pesos;
  - each trip is `{ id, kind, at, fare, fee, distanceKm, payment, from, to }`;
  - send each trip's own `fee` (₱10 on Ride, Parcel and Food; Cargo 0 until approved), so old trips keep their fee if
    the rule changes;
  - `endedEarly` is `[{ id, kind, at, outcome:'cancelled'|'no_show'|'failed', reason, fare, distanceKm, payment, from,
    to }]`. These have no fare and no fee, and the Trips page lists them with their reason.
  - The Earnings page works out periods (Today, 7 days, 30 days), fees, cash vs digital and by service from `trips`,
    so 30+ days of trips are needed.
- `cancelJob(id, { reason })`: the reasons are `rider_asked`, `too_far`, `vehicle`, `safety` and `other` before
  pickup; `no_show` at pickup; `recipient_unavailable`, `wrong_address` and `refused` on the way.
- **Permissions:** the frontend hides driver pages from other roles, but only in the browser. Check the role and
  ownership on every driver call.

**Cargo**
- `onJobRequest()` also sends `kind:'cargo'` requests, **only to eligible drivers** (vehicle fits, Cargo-approved,
  in the service area, ≥ ₱10 available). Each carries `cargo:{…}`, `vehicle`, `helpers`, `fare`.
- `acceptJob(id)`: reserves ₱10. Returns 402 `{ code:'wallet_low', available }` if it can't.
- `updateJob(id, status, { photo, condition, otp })`: Cargo steps `arrived` → `picked_up` (photo + condition
  required) → `in_transit` → `at_destination` → `completed` (OTP + photo required).
- `reportCargoIssue(id, { kind, note, photo })` → `requires_assistance`.
- `driverWallet()`: `{ balance, reserved, available, commission, lowAt }` (see `driver-wallet-plan.md`).

### Admin (later phase)
Cargo bookings list, live dispatch, issues queue, pricing/areas/capacity config, business verification, wallet and
commission records, audit log.

## 7. What the frontend does meanwhile
- Builds the Cargo customer screens first (phone first), then the driver Cargo flow, against the functions above.
  The bodies are simulated in the browser and clearly marked DEMO.
- Sample vehicle capacities and rates live in the frontend config **only for the demo**. The real values come from
  your `cargoOptions()` / `cargoQuote()`.
- When your endpoints are ready, only the function bodies in `js/api.js` change. Screens don't.

## 8. Please send back
1. Answers to section 2.
2. Your existing endpoints for bookings, dispatch, wallet and payments, or confirmation that the section 6 shapes
   work.
3. Anything in sections 3–5 that conflicts with how the backend works today.
