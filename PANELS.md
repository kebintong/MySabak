# mysabak · Panels and the data they need

This is the hand-off contract between the frontend demo and the backend.
Every screen panel is listed with the data it shows and where that data comes from.

**All data goes through one file: `assets/js/api.js`.** Replace the bodies of its functions with calls to
your API, keep the names and return shapes below, and the screens keep working. Nothing else in the
frontend talks to a server. Search `api.js` for `DEMO` to find what's still fake (saved in the browser).

Placeholders like `₱[FARE]` stay visible until real data arrives, so you can see at a glance what's still
missing.

---

## Money rules (Stage 1)

| Order | Customer pays | Goes to |
|---|---|---|
| Ride / Express | Fare (base + per km) | **Driver, 100%** |
| Shop | Items | **Shop** |
| Shop | Delivery fee (base + per km) | **Rider, 100%** |
| Any order | Tip (optional) | **mysabak, 100%** |

- No booking fees, no cut from drivers. mysabak earns from tips. (Shop POS income is Stage 2 and out of scope.)
- Tips: nothing picked by default; ₱10 / ₱20 / ₱50 / Custom, capped at ₱500 (`CONFIG.tips`).
  **E-wallet or card only** (GCash, Maya, card), so drivers never handle mysabak's money on cash trips.
- Wording everywhere: "Tip mysabak · keeps rides fee-free for drivers" + "Your driver keeps 100% of the fare.
  Tips go to mysabak." Receipts show the fare/fee and the tip as separate lines.
- Tips are offered after a trip / delivery ends, from the receipt for 24 hours, and on the Support page
  ("without a ride").

---

## Ride screen (`index.html`)

### Top bar
| Element | Data | Source |
|---|---|---|
| Logo | none | `assets/images/logo.svg` (favicon + app icons: `favicon.svg`, `icons/`) |
| Install app | none | browser install prompt |
| Sign in | user session | not built: goes to `pages/account.html` |

### Ride | Express switch
Switches the whole screen between passenger rides and parcel delivery. Express changes the wording
("Saan ipapadala?", "Deliver to?", "Send with Sedan"), shows what each vehicle carries
(`CONFIG.vehicles[].parcel`) and asks for parcel details before booking.

### Map
| Element | Data | Source |
|---|---|---|
| Pickup pin + label `[Street, barangay]` | short address of the pickup point | `addressFor(point)` |
| Drop-off pin + label `[Drop-off place]` | name of the chosen place | search result title, or `addressFor()` for a pin |
| Route line | `trip.coords` | `routeBetween(from, to)` |
| Time bubble `[Travel time]` | `trip.minutes` | `routeBetween()` |

The map itself (tiles, style, labels) comes from TomTom via `assets/js/map.js`.

### "Saan tayo?" panel (step 1)
| Element | Data | Source |
|---|---|---|
| "Where to?" box + suggestions | places matching the text, near the pickup | `searchPlaces(text, near)` → `placeLocation(place)` |
| From: Current location | pickup label | GPS + `addressFor()` |
| Home / Work chips | the user's saved places | **not built** (needs accounts) |
| Recent chip | last drop-off | this browser only; backend can supply recent trips |
| Pick on map | none | map tap |

### "Choose a vehicle" panel (step 2)
| Element | Placeholder | Data | Source |
|---|---|---|---|
| Summary line | `[Distance] · [Travel time]` | `trip.distanceKm`, `trip.minutes` | `routeBetween()` |
| Vehicle cards | none | vehicles | `CONFIG.vehicles` |
| Fare on each card | `₱[FARE]` | `fares[vehicleId].total` | `faresFor(trip)` |
| Driver ETA | `[ETA]` | `trip.eta[vehicleId]` (minutes) | `routeBetween()`; needs live drivers |
| Fare note (desktop) | `₱[AMOUNT]` + `₱[AMOUNT]` | `.base`, `.distance` | `faresFor(trip)` |
| Payment button | `[Payment method]` | default payment | `CONFIG.paymentMethod`; backend: user profile |
| Book / Send button | `₱[FARE]` | the booking | `bookRide(booking)` |

### Parcel details (Express, before booking)
Receiver name, receiver mobile, size (`CONFIG.parcelSizes`), what's being sent, notes. Sent inside the booking as `parcel`.

### Trip done + tip (after a trip)
Receipt (fare, 100% to the driver) and the tip picker. **Backend: call `showTripDone(order)` in `app.js` when
the trip ends.** The demo shows it right after booking, with a "Demo" note. Tip → `sendTip()`.

---

## Support (`pages/support.html`; the "Support" tab)
| Panel | Data | Source |
|---|---|---|
| Where your money goes | fixed text: fare 100% driver, delivery fee 100% rider, tips 100% mysabak | page |
| This month | `₱[AMOUNT]` tipped, `[NUMBER]` fee-free orders | `supportStats()` |
| What tips pay for | categories with `[—%]` | `supportStats().breakdown` |
| Support without a ride | tip picker | `sendTip({ orderType: 'direct' })` |
| Your tips | the user's tips | `myTips()` |

## Drive (driver side)
| Page | What it does | Source |
|---|---|---|
| `pages/drive.html` | **Driver sign in**: mobile number, password (show/hide), keep me signed in, forgot password, Sign in, Terms of Service + Privacy Policy, then "Wanna work as a driver? Sign up". Signed-in drivers go straight to the driver home | `driverStatus()`, `driverSignIn()` |
| `pages/drive-signup.html` | 3-step sign-up: **About you** (name, mobile, email, city, password) → **Vehicle** (Motor / Sedan / SUV, plate, year, make and model) → **Documents** (license number, license, OR/CR, selfie, consent). "Already a driver? Sign in" | `driverApply(application)` (signs the driver in) |
| `pages/driver.html` | needs sign-in (otherwise back to `drive.html`); approval status, Go online / offline, job requests, earnings, payouts, Sign out | `driverStatus()`, `setOnline()`, `onJobRequest()`, `acceptJob()`, `driverEarnings()`, `driverSignOut()` |

**Job requests:** the driver home listens with `onJobRequest(onJob)` while online and shows each request with
Accept / Decline. The demo sends none. Backend: connect your realtime channel there. Express and Shop jobs
need a photo at pickup and delivery (`updateJob(id, status, { photo })`).

## Shop (Stage 1: ordering + delivery, no POS)
| Page | What it does | Source |
|---|---|---|
| `pages/shops.html` | search, categories, nearby shops, your orders | `listShops()`, `myOrders()` |
| `pages/shop.html?id=…` | menu with + / −, cart bar (one shop per cart, kept in the browser) | `shopMenu()` |
| `pages/checkout.html` | items, delivery address (search or "use my location"), notes, payment, summary | `deliveryQuote()`, `placeOrder()` |
| `pages/order.html?id=…` | status timeline, receipt (items → shop, delivery → rider, tip → mysabak), tip button, details | `orderStatus()`, `myTips()`, `sendTip()` |

Shops and menus in the demo are **samples** (`assets/js/demo-data.js`); delete that file once `listShops()` /
`shopMenu()` call your API.

## Account (`pages/account.html`)
Placeholder until sign-in (mobile number + one-time code) exists. Links to this browser's demo tips, orders and driver home.

---

## `assets/js/api.js` functions

| Function | Returns | Used by |
|---|---|---|
| `searchPlaces(text, near, { signal })` | `Place[]` (max 5) with a `far` flag | "Where to?", checkout address |
| `placeLocation(place)` | `{ lng, lat }` | picking a suggestion |
| `addressFor({ lng, lat })` | `string \| null` | pickup label, pinned drop-off, "use my location" |
| `routeBetween(from, to)` / `straightLine(from, to)` | `Trip` | route, distance, time, ETA |
| `faresFor(trip)` | `{ [vehicleId]: Fare \| null }` | fares |
| `bookRide(booking)` | `{ id, demo }` | Book / Send |
| `sendTip(tip)` / `myTips()` | `{ id, amount }` / `Tip[]` | tip sheet, Support page |
| `supportStats()` | `SupportStats` | Support page |
| `driverSignIn({ phone, password })` / `driverSignOut()` | `{ status }` (401 if no match) / nothing | driver sign in, driver home |
| `driverApply(application)` / `driverStatus()` | `{ status }` / `DriverStatus` | Drive pages |
| `setOnline(online)` | `{ online }` | driver home |
| `onJobRequest(onJob)` → `stop()` | calls `onJob(JobRequest)` | driver home |
| `acceptJob(id)` / `updateJob(id, status, { photo })` | `{ ok }` | driver home |
| `driverEarnings()` | `Earnings` | driver home |
| `listShops({ near, category, q })` / `shopMenu(id)` | `{ categories, shops }` / `Shop` | Shop pages |
| `deliveryQuote(shopId, address)` | `{ km, fee \| null }` | checkout |
| `placeOrder(order)` / `orderStatus(id)` / `myOrders()` | `{ id }` / `Order` / `Order[]` | checkout, order page |
| `errorMessage(err)` | `string` | toasts; throw errors with `err.status` (HTTP code) |

### Shapes (example data)

```jsonc
// Place
{ "title": "Ayala Center Cebu", "subtitle": "Cebu Business Park, Cebu City", "km": 2.4, "lng": 123.9054, "lat": 10.3181 }

// Trip
{ "coords": [[123.8854, 10.3157], [123.9054, 10.3181]], "distanceKm": 6.8, "minutes": 20,
  "eta": { "motor": 3, "sedan": 5, "suv": 8 }, "approx": false }

// Fare per vehicle (null = unknown → ₱[FARE])
{ "motor": { "total": 95, "base": 40, "distance": 55 }, "sedan": null, "suv": null }

// Booking (Ride or Express)
{ "kind": "express", "vehicle": "sedan",
  "pickup":  { "lng": 123.8854, "lat": 10.3157, "label": "V. Rama Ave, Guadalupe" },
  "dropoff": { "lng": 123.9054, "lat": 10.3181, "label": "Ayala Center Cebu" },
  "trip": { "distanceKm": 6.8, "minutes": 20, "coords": [] }, "payment": "GCash",
  "parcel": { "receiverName": "Maria Santos", "receiverPhone": "09171234567", "size": "medium",
              "item": "Birthday cake", "notes": "Handle with care" } }   // parcel: Express only

// Tip (orderType "direct" = from the Support page, orderId null)
{ "orderId": "EXP-123", "orderType": "express", "amount": 20, "method": "gcash" }

// SupportStats (null = unknown)
{ "period": "October 2026", "tipsTotal": 125000, "ordersFeeFree": 8400,
  "breakdown": [{ "label": "Maps, servers and the app", "share": 40 }] }

// Driver application (files are File objects from the form; upload them to your storage;
// hash the password on the server; the demo never stores it)
{ "name": "Juan Dela Cruz", "phone": "09175551234", "email": "", "city": "Cebu City", "password": "••••••••",
  "vehicle": "sedan", "plate": "GAA 1234", "model": "Toyota Vios", "year": 2019,
  "licenseNumber": "G01-23-456789", "files": { "license": {}, "orcr": {}, "selfie": {} }, "agreed": true }

// DriverStatus (signedIn: this device has a driver session)
{ "status": "approved", "signedIn": true, "name": "Juan Dela Cruz", "vehicle": "sedan", "plate": "GAA 1234", "online": false }

// JobRequest (from your realtime channel → onJob)
{ "id": "J-1", "kind": "shop", "pickup": { "lng": 123.893, "lat": 10.318, "label": "Lutong Bahay Kitchen" },
  "dropoff": { "lng": 123.89, "lat": 10.317, "label": "Escario St" }, "distanceKm": 1.2, "fare": 65,
  "expiresAt": 1791882196490 }

// Earnings (fares only: drivers keep 100%)
{ "today": 640, "week": 4210, "trips": [{ "id": "R-1", "kind": "ride", "at": 1791882196490, "fare": 180, "distanceKm": 6.8 }],
  "tipsToMysabak": 120, "payout": { "method": "GCash •••• 1234", "next": "Mon, Oct 19" } }

// Shop (list item has `km` and `items` count instead of `menu`)
{ "id": "lutong-bahay", "name": "Lutong Bahay Kitchen", "category": "food", "area": "Capitol Site",
  "hours": "9:00 AM – 9:00 PM", "color": "#f7c27a", "lng": 123.893, "lat": 10.318,
  "menu": [{ "id": "adobo", "name": "Chicken adobo + rice", "price": 120, "note": "Classic, slow-cooked" }] }

// Order
{ "id": "SHOP-1", "shop": { "id": "lutong-bahay", "name": "Lutong Bahay Kitchen", "area": "Capitol Site" },
  "lines": [{ "id": "adobo", "name": "Chicken adobo + rice", "price": 120, "qty": 2 }],
  "subtotal": 240, "deliveryFee": 45, "address": { "lng": 123.89, "lat": 10.317, "label": "Escario St" },
  "notes": "Blue gate", "payment": "cash", "status": "preparing", "placedAt": 1791882196490 }
// status: placed → accepted → preparing → picked_up → delivered (or cancelled)
```

### Suggested endpoints
Any design works as long as `api.js` returns the shapes above. One option:

| Endpoint | Feeds |
|---|---|
| `GET /api/places?q=…&lng=…&lat=…` · `GET /api/address?lng=…&lat=…` | search, addresses |
| `POST /api/trips/estimate` `{ pickup, dropoff }` → `{ trip, fares }` | `routeBetween` + `faresFor` |
| `POST /api/bookings` → `{ id }` | `bookRide` (Ride and Express) |
| `POST /api/tips` · `GET /api/me/tips` · `GET /api/support/stats` | tips, Support page |
| `POST /api/drivers` (multipart) · `POST /api/drivers/session` · `DELETE /api/drivers/session` · `GET /api/drivers/me` · `PUT /api/drivers/me/online` | Drive (sign-up, sign in/out, status, online) |
| `WS /api/drivers/me/jobs` · `POST /api/jobs/:id/accept` · `POST /api/jobs/:id/status` | job requests |
| `GET /api/drivers/me/earnings` | earnings |
| `GET /api/shops` · `GET /api/shops/:id` · `POST /api/shops/:id/quote` | Shop |
| `POST /api/orders` · `GET /api/orders/:id` · `GET /api/me/orders` | orders |

Work fares, fees and tip limits out on the server: anything calculated in the browser can be edited by the user.

---

## Open questions
1. **Cash trips:** is "tip by e-wallet or card only" OK?
2. **Shop payments:** online payment means mysabak collects for shops and pays them out (payment-regulation
   questions); cash on delivery means riders pay the shop up front.
3. **Driver requirements:** the document list depends on LTFRB rules, especially for motorcycle taxis.
4. **Tip cap** (₱500 now) and fares / delivery rates (all `null` in `config.js`).
5. **Legal check** on the tip wording ("Tip mysabak") before launch: tips are mysabak's income, not donations.
6. Launch area: Cebu only, or nationwide? Search favours 40 km around the pickup, Philippines only.
