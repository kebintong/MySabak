# mysabak · Panels and the data they need

This is the hand-off contract between the frontend demo and the backend.
Every screen panel is listed with the data it shows and where that data comes from.

**All data goes through one file: `js/api.js`.** Replace the bodies of its functions with calls to
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
- Tips: nothing picked by default; capped at ₱500 (`CONFIG.tips`).
- **Rides and Express:** the tip is part of booking. After Book the customer picks Cash, GCash or Online banking
  and can raise "Your price" above the fare (e.g. fare ₱90 → they pay ₱110). The extra (₱20) is the tip.
  "No tip" is the default. The fare part never changes. See open question 1 for cash.
- **Shop orders and the Support page:** tips are sent separately, by e-wallet or card (GCash, Maya, card).
- Wording everywhere: "Tip mysabak · keeps rides fee-free for drivers" + "Your driver keeps 100% of the fare.
  Tips go to mysabak." Receipts show the fare/fee and the tip as separate lines.
- If a rider didn't tip when booking, the Ride complete screen offers "Tip mysabak" (e-wallet or card). Shop
  orders can be tipped from the receipt for 24 hours; anyone can tip from the Support page ("without a ride").

---

## Home (`index.html`; the "Home" tab)
Design: Figma "H-v3 · Mascot · Midnight magic glow". Phones show it like the Figma frame; desktop lays the same cards out wider.

| Panel | Data | Source |
|---|---|---|
| Pickup from `Current location` | pickup label | GPS + `addressFor()` (tap: use my location) |
| Schedule, Multi-stop, Vouchers, + (add a place) | none | **not built**: tapping says "coming soon" |
| "Where are you going?" | none | opens the ride screen with the drop-off box focused (`#where`) |
| Home / Office chips | the user's saved places | **not built** (needs accounts) |
| Ride / Moto / Parcel / Food cards | none | Ride screen (`#ride`), Ride with Motor picked (`#moto`), Express (`#parcel`), Shops |
| Magic pick ("Heading to Ayala Center Cebu?" · Book) | the latest trip: drop-off, vehicle, day, fare | `myTrips()[0]`; hidden when there is none. Book opens "Choose your ride" for that drop-off. Backend: a real prediction (time of day, saved places) can replace it |
| Magic Rides promo ("Save ₱[50] on 3 trips" · Claim offer) | the offer | **DEMO**: claiming is remembered in this browser only and **no discount is applied**. Needs a vouchers API, and a decision on who pays the discount (drivers keep 100% of the fare) |
| Recent | the last two trips: drop-off, vehicle, day, total; Rebook | `myTrips()` |

**Look (every page):** the Midnight magic glow: night-sky headers with drifting aurora, sparkle dust and twinkles
(`paintSky()` in `ui.js`), lilac → gold glow borders with breathing glows (`.glowwrap`, `.glow-border`), grape gradient
buttons, 3D pictures in `assets/images/3d/`, and the **edge glow** (`edgeGlow()` in `ui.js`): lilac when you move to
another tab, gold ("reward") when you book, claim, order, tip, accept a job or send an application.

Tab bar (customers): **Home · Trips · Food · Wallet · Account** (Food is the round middle button on phones).
Drive and Support are linked from the Account page. Drivers and merchants keep their own tabs.

## Ride screen (`index.html#ride`)
Design: Figma "02 · Book a Ride". Phones: back button + route card (pickup, drop-off) on top, steps in a sheet at
the bottom. Desktop: the same in one column on the left of the map. Back: Choose your ride → edit the drop-off;
otherwise → Home.

### Top bar (Home only)
| Element | Data | Source |
|---|---|---|
| Logo | none | `assets/images/logo.svg` (favicon + app icons: `favicon.svg`, `icons/`) |
| Install / Install app | none | on every page, every screen size (hidden once installed). Uses the browser's install prompt where there is one (Chrome, Edge, Brave, Android); otherwise opens step-by-step instructions for iPhone/iPad (Share → Add to Home Screen), Mac Safari (File → Add to Dock), Samsung Internet, Firefox. `setupInstall()` in `ui.js` |
| Sign in / profile | `currentUser()` | Signed out: **Sign in** (goes to `pages/account.html`). Signed in: a **profile** button whose dropdown holds the account's home and **Sign out** (the only place to sign out). See Accounts below |

### Ride | Parcel switch (Express)
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

The map itself (tiles, style, labels) comes from TomTom via `js/map.js`. Map credits (© TomTom, © OpenStreetMap) sit behind a
small ⓘ button that starts closed (`addAttribution()` in `map.js`, used by every map).

### Route card + "Saan tayo?" panel (step 1)
| Element | Data | Source |
|---|---|---|
| Pickup row | pickup label | GPS + `addressFor()` (tap: use my location) |
| Drop-off box + suggestions | places matching the text, near the pickup | `searchPlaces(text, near)` → `placeLocation(place)` |
| Home / Office chips | the user's saved places | **not built** (needs accounts) |
| Recent chip | last drop-off | this browser only; backend can supply recent trips |
| Pick on map | none | map tap |

### "Choose your ride" panel (step 2)
| Element | Placeholder | Data | Source |
|---|---|---|---|
| Summary line | `[Distance] · [Travel time]` | `trip.distanceKm`, `trip.minutes` | `routeBetween()` |
| Ride options | none | vehicles, each with its picture (`art` → `assets/images/v3/<art>.svg`) | `CONFIG.vehicles` |
| Fare on each card | `₱[FARE]` | `fares[vehicleId].total` | `faresFor(trip)` |
| Driver ETA | `[ETA]` | `trip.eta[vehicleId]` (minutes) | `routeBetween()`; needs live drivers |
| Fare note (desktop) | `₱[AMOUNT]` + `₱[AMOUNT]` | `.base`, `.distance` | `faresFor(trip)` |
| Payment button | `Cash` | chosen payment method | `CONFIG.ridePayments`; opens the pay sheet |
| Book / Send button | `₱[FARE]` | opens the pay sheet | then `bookRide(booking)` |

### Parcel details (Express, before booking)
Receiver name, receiver mobile, size (`CONFIG.parcelSizes`), what's being sent, notes. Sent inside the booking as `parcel`.

### Pay sheet (after Book)
| Element | Data | Source |
|---|---|---|
| Pay with: Cash / GCash / Online banking | payment method | `CONFIG.ridePayments` |
| Your price (− / +, No tip · +₱10 · +₱20 · +₱50 · **Custom**) | fare + tip | `faresFor()`; split with `splitPrice()` in `money.js` |
| Custom (shown after tapping Custom) | "Your price (fare ₱90 + tip)", or "Tip amount" while the fare is unknown | same |
| Breakdown | Fare (100% to your driver), Tip (100% to mysabak), You pay | same |
| Find a driver · ₱110 | the booking | `bookRide({ …, payment, price: { fare, tip, total } })` |

When the fare is still unknown (`null` rates), the price shows `₱[FARE] + ₱20` and the box takes a tip instead of a price.

### Finding a driver (step "search")
Radar around the pickup, "Finding you a driver…", vehicle · price · payment, **Cancel** (`cancelRide(id)`).
`findDriver(id)` resolves when a driver accepts (rejects with 404 when nobody is free).
**The demo "finds" a sample driver after ~3 seconds** (`DEMO_DRIVERS` in `demo-data.js`, shown with a "Demo" tag).

### Driver on the way / on the trip (step "trip")
| Element | Data | Source |
|---|---|---|
| Status + "Arriving in 3 min" / "About 16 min to go" | `status`, `etaMinutes` | `onTripUpdate(id, onUpdate)` |
| Progress: On the way · On the trip · Arrived (Express: Picking up · Delivering · Delivered) | `status` | same |
| Driver card: initials, name, ★ rating, colour + model, plate | driver | `findDriver(id)` |
| Car on the map | `driver: { lng, lat }` | `onTripUpdate()` |
| Call / Message | `driver.phone` | demo shows a toast |
| Cancel ride (before pickup only) | none | `cancelRide(id)` |

`onTripUpdate()` is where the backend plugs in its realtime channel. **The demo driver drives the real roads to
the pickup (TomTom route), waits, then follows the trip route: about 25 seconds.** The car glides between
position updates (`moveDriver()` in `map.js`), so real updates every 1–2 seconds also look smooth.

**Hide / show:** the status card (finding a driver, trip) has a hide button; it shrinks to a slim bar with the
status and a **Show** button.

### Ride complete (when `onTripUpdate` reports `completed`)
Purple header with a check, "You've arrived" (Express: "Parcel delivered") and the drop-off + time; the route
(from → to, vehicle · distance · time); the driver; **rate 1–5 stars** (`rateRide(id, stars)`); receipt (Fare 100% to your
driver, Tip 100% to mysabak, Total + payment method); **Tip mysabak** if they didn't tip (→ `sendTip()`); Done.
Built by `showTripDone(order)` in `app.js`.

---

## Trips (`pages/trips.html`; the "Trips" tab)
| Panel | Data | Source |
|---|---|---|
| Rides and deliveries | each Ride / Express booking: drop-off, vehicle, when, total; **Rebook** opens "Choose your ride" for that drop-off (`/#rebook`) | `myTrips()` |
| Shop orders | each order: shop, when, status, subtotal (links to the order page) | `myOrders()` |

## Wallet (`pages/wallet.html`; the "Wallet" tab)
| Panel | Data | Source |
|---|---|---|
| How you can pay | Cash, GCash, Online banking | `CONFIG.ridePayments` |
| Your tips | the user's tips (total + list) | `myTips()` |
| Add a card, mysabak balance | "Coming soon" | page |

## Support (`pages/support.html`; linked from Account)
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
| `pages/drive.html` | **Driver sign in**: "Mobile number or email", password (show/hide), keep me signed in, forgot password, Sign in, Terms of Service + Privacy Policy, then "Wanna work as a driver? Sign up". Signed-in drivers go straight to the driver home | `driverStatus()`, `driverSignIn({ login, password })` |
| `pages/drive-signup.html` | First **choose how to apply**: <br>• **Walk in** (`#walk-in`): office on a small map, address, hours, phone, what to bring, "Get directions" (from `CONFIG.driverOffice`, sample data for now) <br>• **Apply online** (`#online`): About you (name, mobile, **email required**, city, password) → Vehicle → Documents + consent → **"Application sent"**: updates go to their email | `driverApply(application)` → `{ status: 'review', email }` |
| `pages/driver.html` | **Home's night sky (draft Q).** Needs sign-in (otherwise back to `drive.html`). Sky: driving as name · vehicle/plate · status, **today's earnings** in gold, the **online pill** (Go online / offline, like Home's search pill) and glass chips (trips today, this week). Requests: the nearest (or the one tapped) as the **big lilac card** with its illustration (car, parcel, food bowl), pickup, drop-off, trip km, payment, time left, **Accept**, **Skip** and **See route**; the others as small lilac/peach cards (tap to swap). After Accept, the **job card**: what to do now, progress, rider + Call, **Navigate** (in the app), the next step (I’ve arrived → Start trip → Complete) and a Google Maps backup. Shortcuts Trips · Payout · Map, the week as the promo card, then latest trips and payout. **Full-screen map** (Map, See route, Navigate): every request as a pin (tap one to preview its route), a route preview with Accept, or **turn-by-turn navigation** to the next stop: the next turn on night sky, time and distance left, the next step button, following the phone's location and re-routing when 60 m off the route. Sign out is in the profile menu. **Under review**: the online pill is locked | `driverStatus()`, `setOnline()`, `onJobRequest()`, `acceptJob()`, `driverEarnings()`, `driverSignOut()`, `routeBetween(…, { steps: true })` |
| Hide (⌄, phones) | the list and filter chips fold into a slim bar above the tab bar ("3 requests near you · Nearest: Ride ₱65 · 0.3 km away", or the current job step) with **Show**; tapping a pin also brings the list back | `onJobRequest()`, `activeJob()` |
| (accepted job) | the list turns into the **job card**: title per step (Go to pickup → Waiting for Ana / Pick up the parcel / Collect the order → Drive to drop-off), 4-step progress, rider + how they pay ("Collect ₱80 in cash" or "Paid by GCash"), Call, pickup/drop-off, **Navigate** (Google Maps), the next-step button (I've arrived → Start trip / Parcel picked up / Order picked up → Complete trip / Parcel delivered / Order delivered), Cancel job (before pickup). The map shows the route to the pickup, then pickup → drop-off. Completing adds the fare to earnings | `activeJob()`, `updateJob(id, status)`, `cancelJob(id)` |

Backend: send the application emails (received, approved, need more info) and flip `status` to `approved`.
Walk-in applicants are added by office staff; put the real office in `CONFIG.driverOffice` (`js/config.js`).

**Job requests:** the driver home listens with `onJobRequest(onJob)` while online and shows each request with
Skip / Accept. **The demo sends SAMPLE requests** (tagged "Demo"; places from `DEMO_PLACES` in `demo-data.js`):
three in the first few seconds, then one every 25 seconds, each open for 2 minutes. Backend: connect your realtime
channel there. Express and Shop jobs need a photo at pickup and delivery (`updateJob(id, status, { photo })`).

## Shop (Stage 1: ordering + delivery, no POS)
Design: "Map first". Shops are found on the map; each shop opens on a route map.

| Page | What it does | Source |
|---|---|---|
| `pages/shops.html` | full-screen map, one pin per shop in its colour; search + category chips float on top; tap a pin or a list row to preview the shop on the map (dark card; its **Menu** button is the way into the shop); list of shops, closest first, in a pull-up sheet (phones) or a side panel (desktop); your orders | `listShops()`, `myOrders()` |
| `pages/shop.html?id=…` | night sky header: shop photo, address, rating, hours, open now, distance, directions, phone, and the ride time from the customer (when location is allowed; desktop also shows the route on a small map); menu section tabs at its edge; items in a grid of lilac and peach cards, bundles, options that open inside the item's card, "Your order" (a sheet on phones, a dialog on desktop, opened from the round Food button, which shows the total and item count once the order has items) | `shopMenu()`, `routeBetween()` |
| `pages/checkout.html` | items with their options, delivery address (search or "use my location"), notes, payment, summary | `deliveryQuote()`, `placeOrder()` |
| `pages/order.html?id=…` | status timeline, receipt (items → shop, delivery → rider, tip → mysabak), tip button, details | `orderStatus()`, `myTips()`, `sendTip()` |

**Item options.** Each menu item can have option groups (size, make it a meal, drink, rice, add-ons…).
A group is single choice (`one`, defaults to its first choice) or multiple choice (`many`, up to `max`).
`showIf` hides a group until another group has a certain pick (the drink only shows once a meal is picked).
The price of one item is its `price` plus every picked choice. `js/menu.js` has the rules and
`tests/menu.test.mjs` tests them; **the server must price orders the same way** and ignore prices sent by the browser.
Bundles (`bundle: true`) are fixed combos with no options. A cart is for one shop and lives in the browser
(`js/cart.js`).

**Pictures.** Shops and items have `image` (a photo URL). While it is `null`, the page shows a plain placeholder
(`js/placeholders.js`: a drawn storefront in the shop's colour, or the item's first letter).

**The demo has no shops** (`SHOPS = []` in `demo-data.js`), so Shops shows its "No shops yet" state until
`listShops()` / `shopMenu()` return real shops. The tests use a made-up shop in `tests/fixtures.mjs`.

## Merchant (shop owners; no POS, that's Stage 2)
| Page | What it does | Source |
|---|---|---|
| `pages/merchant.html` | **Merchant sign in**: mobile number or email + password, then the dashboard | `merchantSignIn({ login, password })`, `merchantHome()` |
| `pages/merchant-home.html` | **Night sky header**: greeting, shop photo and name, area, hours, live Open/Closed dot and the **Accepting orders** switch, and today's numbers in gold (orders, sales, waiting for you, average order; they count up); **Orders** in three columns New · Preparing · Ready (tabs on phones), one card per order (customer, time, items, note, total) with Accept / Decline / Start preparing / Ready for pickup, and finished ones folded under **Done today**; **Sales this week** (7 bars, today highlighted); **Your shop**: photo, name and description with **Edit shop** (photo, name, about); **Your products**: a card per item with its picture (`image`), short description (`note`), price and the full price of each variant (the first required single-choice option, e.g. Solo ₱120 · Sharing ₱230), a filter by section, **Edit** (photo, name, description, price, section) and an Available switch (sold out). Edits open in a sheet; a picked photo is shrunk to 1000 px and sent as a JPEG data URL. Sign out is in the profile menu | `merchantHome()`, `updateMerchantOrder()`, `setShopOpen()`, `setItemAvailable()`, `updateShop()`, `updateItem()`, `merchantSignOut()` |

Order status gains `ready` (ready for the rider): placed → accepted → preparing → ready → picked_up → delivered.
Backend: `shopMenu()` should leave out (or mark) items the merchant switched off, and a closed shop can't take orders.

## Demo accounts
Given logins so the company can try every side (`DEMO_ACCOUNTS` in `js/demo-data.js`; delete with that file):

| Account | Sign in at | Mobile number | Email | Password |
|---|---|---|---|---|
| Driver (approved, can go online) | `pages/drive.html` | 0917 000 0001 | driver@mysabak.demo | `mysabak-demo` |
| Merchant ("Demo Kitchen", not listed on Shops) | `pages/merchant.html` | 0917 000 0002 | merchant@mysabak.demo | `mysabak-demo` |
| Customer | `pages/account.html` | 0917 000 0003 | client@mysabak.demo | `mysabak-demo` |
| Admin (lands on `pages/admin.html`) | `pages/account.html` | 0917 000 0009 | admin@mysabak.demo | `mysabak-demo` |

The demo driver gets sample job requests when online; the merchant sees a few sample orders and last week's sales
(`DEMO_MERCHANT_ORDERS`, `DEMO_MERCHANT_WEEK`, tagged "Sample").

## Accounts (customer, driver, merchant)
One account is signed in on a device at a time; signing in as one role signs the others out. Each role has its own
sign-in form, with a **Customer · Driver · Merchant** switch at the top of each:

| Role | Sign in at | After sign in | Tabs it sees |
|---|---|---|---|
| Customer | `pages/account.html` (`clientSignIn`) | Ride (`/`) | Ride · Shops · Support |
| Driver | `pages/drive.html` (`driverSignIn`) | `pages/driver.html` | Drive · Support |
| Merchant | `pages/merchant.html` (`merchantSignIn`) | `pages/merchant-home.html` | My shop · Support |
| Admin | `pages/account.html` (`clientSignIn`; not advertised) | `pages/admin.html` | Overview · Registrations · Analytics · Management |

Signed out, everyone sees Ride · Drive · Shops · Support (+ Account on phones). Signed in, the profile menu (top right)
replaces Sign in and the Account tab. Drivers and merchants who open a customer page (Ride, Shops, a shop, checkout, an
order) are sent to their own home. Shops has no Sign in button and no merchant sign-in link. `ROLES` in `ui.js` holds
the tabs and homes per role.

Admins have no sign-in form of their own and no link anywhere on the site: they use the customer form, and the
account's role (returned by `clientSignIn` and `currentUser`) sends them to `pages/admin.html`. Anyone else who opens
an admin page is sent to their own home, or to the sign-in page when signed out. **Backend:** the role must come from the
user record on the server, and every admin endpoint must check it there; hiding the page is not the protection.

## Admin (`pages/admin.html`, `admin-registrations.html`, `admin-analytics.html`, `admin-management.html`)
Midnight look with a horizontal night sky. Numbers marked "Sample" come from `DEMO_ADMIN` in `js/demo-data.js`.
The type scale, weights, radii and the one-glow-per-page rule are written at the top of `css/admin.css`. Every chart
number, count card and status has details on hover (mouse), tap (touch) or focus (keyboard; arrow keys step through
line charts): `wireTips` / `wirePoints` in `js/pages/admin-common.js`. Things with more to see open in a sheet
(`openSheet`): a bottom sheet on phones, centred on bigger screens.

| Page | What it shows | Calls |
|---|---|---|
| Overview (`pages/admin.html`) | Live counts of riders, drivers and merchants (links to the drivers / shops waiting), the newest applications waiting, today's trips, tips, average pickup and trips by service, and **Weekly tips** (7-day total, change on the week before, a bar per day) | `adminOverview()` (incl. `tipsWeek: { days, values, lastWeek }`), `adminApplications(kind)` |
| Registrations (`pages/admin-registrations.html?kind=drivers\|merchants&tab=review\|fix\|approved\|rejected&id=…`) | **Drivers · Merchants** switch; Waiting / To fix / Approved / Rejected tabs; an applicant's details and papers (tap a paper for a larger view, what to look for, and **Ask them to fix this**, which picks the matching reason), three checks that must be ticked to approve, then **Approve**, **Ask to fix** (a reason the applicant is told, plus an optional note of up to 200 characters) or **Reject**. Phones show the list, then one applicant with a back button | `adminApplications(kind)`, `adminDecide(...)` |
| Analytics (`pages/admin-analytics.html`) | This week's numbers, growth of riders / drivers / shops (each on its own scale), trips per day by service (with a table view), tips per day, how riders pay, the new-driver funnel, and each area's status | `adminAnalytics()` |
| Management (`pages/admin-management.html?id=…`) | Every account (riders, drivers, merchants; waiting applicants as *Pending review*) in a table you can search (name, shop, email, mobile) and filter by role and status, 10 rows at a time. One account's profile: **Edit details** (name, email, mobile, area; emails are unique), **Send password reset**, **Turn off** (with a reason; they're signed out and can't sign in) / **Turn account back on**; pending accounts link to their application. **Sign-up links** to copy or share (drivers: `drive-signup.html`; shops and riders: their pages, whose sign-up forms aren't built yet) and **Registration activity** (applicants per status, newest accounts) | `adminUsers()`, `adminUpdateUser(...)`, `adminSetUserStatus(...)`, `adminPasswordReset(id)`, `adminApplications(kind)` |

Sample applicants live in `DEMO_APPLICATIONS`; the driver application made in this browser (`pages/drive-signup.html`) is listed
first. Approving or rejecting it changes what that driver sees when they sign in; a fix request keeps them in review.

## Account (`pages/account.html`)
Signed out: **Customer sign in** (mobile number or email + password; customer sign-up is not built yet). Signed in as a
customer: "Your account" (saved places, trips, payments: coming soon) and this browser's demo tips and orders.

---

## `js/api.js` functions

| Function | Returns | Used by |
|---|---|---|
| `searchPlaces(text, near, { signal })` | `Place[]` (max 5) with a `far` flag | "Where to?", checkout address |
| `placeLocation(place)` | `{ lng, lat }` | picking a suggestion |
| `addressFor({ lng, lat })` | `string \| null` | pickup label, pinned drop-off, "use my location" |
| `routeBetween(from, to, { steps? })` / `straightLine(from, to)` | `Trip` (+ `steps: [{ text, maneuver, street, atM }]` when `steps: true`; `[]` otherwise) | route, distance, time, ETA; turn-by-turn for driver navigation |
| `faresFor(trip)` | `{ [vehicleId]: Fare \| null }` | fares |
| `bookRide(booking)` | `{ id, demo }` (400 if the payment method isn't allowed) | pay sheet → Find a driver |
| `findDriver(id)` / `cancelRide(id)` | `Driver` (404: nobody free) / `{ ok }` | finding a driver |
| `onTripUpdate(id, onUpdate)` → `stop()` | calls `onUpdate(TripUpdate)` | trip panel, car on the map, Ride complete |
| `rateRide(id, stars)` | `{ ok }` | Ride complete |
| `myTrips()` | `Booking[]` (what `bookRide` was sent, plus `id` and `at`), newest first | Trips page |
| `sendTip(tip)` / `myTips()` | `{ id, amount }` / `Tip[]` | tip sheet, Support page |
| `supportStats()` | `SupportStats` | Support page |
| `driverSignIn({ login, password })` / `driverSignOut()` | `{ status }` (401 if no match; `login` = mobile number or email) / nothing | driver sign in, driver home |
| `driverApply(application)` / `driverStatus()` | `{ status: 'review', email }` / `DriverStatus` | Drive pages |
| `setOnline(online)` | `{ online }` | driver home |
| `onJobRequest(onJob, { near })` → `stop()` | calls `onJob(JobRequest)` | driver home |
| `acceptJob(id)` / `updateJob(id, status, { photo })` | `{ ok, job }` (410: gone, 409: already on a job) / `{ ok, status }` (409: out of order) | driver home |
| `activeJob()` / `cancelJob(id)` | the accepted job or `null` / `{ ok }` (before pickup only) | driver home |
| `driverEarnings()` | `Earnings` | driver home |
| `listShops({ near, category, q })` / `shopMenu(id)` | `{ categories, shops }` / `Shop` | Shop pages |
| `merchantSignIn({ login, password })` / `merchantSignOut()` | `{ shopId }` (401 if no match) / nothing | merchant sign in |
| `merchantHome()` | `{ name, shop, open, available: { itemId: bool }, orders, today: { orders, sales }, week: number[7] }` (401 if signed out; `week` = sales per day, oldest first, ending today) | merchant dashboard |
| `currentUser()` / `signOut()` | `{ role: 'client'\|'admin'\|'driver'\|'merchant', name, email }` or `null` / nothing | top bar profile menu, every page |
| `clientSignIn({ login, password })` / `clientSignOut()` | `{ name, role: 'client'\|'admin' }` (401 if no match) / nothing | customer sign in (admins too) |
| `adminApplications(kind)` / `adminDecide({ kind, id, decision, reason })` | applications newest first, each with `status` (`review`\|`fix`\|`approved`\|`rejected`), `reason`, `appliedAt`, `papers` and the applicant's details / `{ status }` (`decision` = `approved`\|`fix`\|`rejected`; `fix` needs a `reason`; 404 unless waiting or being fixed) | admin registrations, overview |
| `adminUsers()` / `adminUpdateUser({ id, name, email, phone, area })` / `adminSetUserStatus({ id, status, reason })` / `adminPasswordReset(id)` | accounts newest first, each `{ id, role: 'rider'\|'driver'\|'merchant', name, shop?, email, phone, area, joinedAt, lastActiveAt, trips, status: 'active'\|'pending'\|'deactivated', reason, statusAt, vehicle?, plate?, application? }` / the updated account (400 with `field` for a bad value, 409 for a taken email or a pending account) / the updated account (`deactivated` needs a `reason`) / `{ sentTo }` (409 unless active) | admin management |
| `adminOverview()` / `adminAnalytics()` | live counts and today's numbers / the week's numbers and charts (see `DEMO_ADMIN`) | admin overview, analytics |
| `setShopOpen(open)` / `setItemAvailable(itemId, available)` | `{ open }` / `{ ok }` | merchant dashboard |
| `updateShop({ name?, about?, image? })` / `updateItem(itemId, { name?, note?, price?, section?, image? })` | the shop / the item, as `merchantHome()` shows it (400 with a plain reason for bad input, 413 if the photo can't be stored). `image` arrives as a JPEG data URL: upload it and store its URL. Names up to 60 characters, descriptions up to 200, `price` a whole peso amount from 1 | merchant dashboard |
| `updateMerchantOrder(orderId, action)` | `{ status }` (409 if the step isn't possible) | merchant dashboard; actions in `MERCHANT_ACTIONS` |
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
  "trip": { "distanceKm": 6.8, "minutes": 20, "coords": [] },
  "payment": "gcash",                                  // cash | gcash | bank
  "price": { "fare": 90, "tip": 20, "total": 110 },    // tip = what they added on top; fare null while unknown
  "parcel": { "receiverName": "Maria Santos", "receiverPhone": "09171234567", "size": "medium",
              "item": "Birthday cake", "notes": "Handle with care" } }   // parcel: Express only

// Driver (from findDriver)
{ "id": "DRV-1", "name": "Mark R.", "rating": 4.8, "trips": 860, "phone": "+639171234567", "photo": null,
  "vehicle": { "type": "sedan", "model": "Toyota Vios", "color": "White", "plate": "ABC 1234" } }

// TripUpdate (from onTripUpdate); status: arriving → arrived → on_trip → completed (or cancelled)
{ "status": "arriving", "driver": { "lng": 123.884, "lat": 10.318 }, "etaMinutes": 3 }

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
{ "status": "review", "signedIn": true, "name": "Juan Dela Cruz", "email": "juan@example.com",
  "vehicle": "sedan", "plate": "GAA 1234", "online": false }

// JobRequest (from your realtime channel → onJob); accepted jobs add "status": to_pickup → arrived → started → completed
{ "id": "J-1", "kind": "shop", "pickup": { "lng": 123.893, "lat": 10.318, "label": "Demo Kitchen · Capitol Site" },
  "dropoff": { "lng": 123.89, "lat": 10.317, "label": "Escario St" }, "distanceKm": 1.2, "fare": 65,
  "payment": "cash", "rider": { "name": "Ana" }, "shop": { "name": "Demo Kitchen" },   // shop: Shop jobs; parcel: Express
  "expiresAt": 1791882196490 }

// Earnings (fares only: drivers keep 100%)
{ "today": 640, "week": 4210, "trips": [{ "id": "R-1", "kind": "ride", "at": 1791882196490, "fare": 180, "distanceKm": 6.8 }],
  "tipsToMysabak": 120, "payout": { "method": "GCash •••• 1234", "next": "Mon, Oct 19" } }

// Shop (list item has `km` and `items` count instead of `menu`)
// opensAt / closesAt: Cebu time, for "Open now". color / tint: pin and placeholder colours. image: photo URL or null.
{ "id": "lutong-bahay", "name": "Lutong Bahay Kitchen", "sign": "LUTONG BAHAY", "category": "food", "area": "Capitol Site",
  "address": "Escario St, Capitol Site, Cebu City", "phone": "0917 555 0142", "rating": 4.8,
  "hours": "9:00 AM – 9:00 PM", "opensAt": "09:00", "closesAt": "21:00",
  "color": "#E0782F", "tint": "#FCE3CC", "image": null, "lng": 123.893, "lat": 10.318,
  "about": "Home-style Filipino plates cooked in small batches through the day.",
  "menu": [
    { "id": "solo", "name": "Solo Busog Meal", "note": "Adobo, rice, iced tea and leche flan.", "price": 199,
      "section": "Bundles", "bundle": true, "image": null, "options": [] },
    { "id": "adobo", "name": "Chicken adobo + rice", "note": "Classic, slow-cooked", "price": 120,
      "section": "Mains", "tag": "Best seller", "image": null, "options": [
        { "id": "size", "name": "Size", "type": "one", "required": true, "choices": [
          { "name": "Solo", "price": 0, "hint": "1 person" }, { "name": "Sharing", "price": 110, "hint": "good for 2–3" }] },
        { "id": "meal", "name": "Make it a meal", "type": "one", "required": true, "choices": [
          { "name": "Ala carte", "price": 0 }, { "name": "Meal", "price": 45, "hint": "with a regular drink" }] },
        { "id": "drink", "name": "Choose your drink", "type": "one", "required": true,
          "showIf": { "group": "meal", "notIn": ["Ala carte"] }, "choices": [{ "name": "Iced tea", "price": 0 }, { "name": "Fresh buko juice", "price": 30 }] },
        { "id": "add", "name": "Add-ons", "type": "many", "required": false, "max": 3, "choices": [
          { "name": "Fried egg", "price": 20 }, { "name": "Atchara", "price": 15 }] }] }] }

// placeOrder() sends items as { id, qty, picks, note }:
{ "id": "adobo", "qty": 2, "picks": { "size": "Sharing", "meal": "Meal", "drink": "Iced tea", "add": ["Fried egg"] }, "note": "no onions" }

// Order (each line priced by the server: price = item price + picked choices)
{ "id": "SHOP-1", "shop": { "id": "lutong-bahay", "name": "Lutong Bahay Kitchen", "area": "Capitol Site" },
  "lines": [{ "id": "adobo", "name": "Chicken adobo + rice", "price": 295, "qty": 2,
    "picks": { "size": "Sharing", "meal": "Meal", "drink": "Iced tea", "add": ["Fried egg"] },
    "options": ["Sharing", "Meal", "Iced tea", "Fried egg"], "note": "no onions" }],
  "subtotal": 590, "deliveryFee": 45, "address": { "lng": 123.89, "lat": 10.317, "label": "Escario St" },
  "notes": "Blue gate", "payment": "cash", "status": "preparing", "placedAt": 1791882196490 }
// status: placed → accepted → preparing → ready → picked_up → delivered (or cancelled)
```

### Suggested endpoints
Any design works as long as `api.js` returns the shapes above. One option:

| Endpoint | Feeds |
|---|---|
| `GET /api/places?q=…&lng=…&lat=…` · `GET /api/address?lng=…&lat=…` | search, addresses |
| `POST /api/trips/estimate` `{ pickup, dropoff }` → `{ trip, fares }` | `routeBetween` + `faresFor` |
| `POST /api/bookings` → `{ id }` · `DELETE /api/bookings/:id` · `POST /api/bookings/:id/rating` | `bookRide`, `cancelRide`, `rateRide` (Ride and Express) |
| `WS /api/bookings/:id` (driver found, position, status) | `findDriver`, `onTripUpdate` |
| `POST /api/tips` · `GET /api/me/tips` · `GET /api/support/stats` | tips, Support page |
| `POST /api/drivers` (multipart) · `POST /api/drivers/session` · `DELETE /api/drivers/session` · `GET /api/drivers/me` · `PUT /api/drivers/me/online` | Drive (sign-up, sign in/out, status, online) |
| `WS /api/drivers/me/jobs` · `POST /api/jobs/:id/accept` · `POST /api/jobs/:id/status` | job requests |
| `GET /api/drivers/me/earnings` | earnings |
| `GET /api/shops` · `GET /api/shops/:id` · `POST /api/shops/:id/quote` | Shop |
| `POST /api/merchants/session` · `GET /api/merchants/me` · `PUT /api/merchants/me/open` · `PUT /api/merchants/me/items/:id` · `PATCH /api/merchants/me/shop` · `PATCH /api/merchants/me/items/:id` · `POST /api/orders/:id/status` | Merchant dashboard |
| `POST /api/orders` · `GET /api/orders/:id` · `GET /api/me/orders` | orders |
| `GET /api/admin/overview` · `GET /api/admin/applications?kind=…` · `POST /api/admin/applications/:id/decision` · `GET /api/admin/analytics` · `GET /api/admin/users` · `PATCH /api/admin/users/:id` · `POST /api/admin/users/:id/status` · `POST /api/admin/users/:id/password-reset` (403 unless the signed-in user's role is admin, checked on the server) | admin pages |

Work fares, fees and tip limits out on the server: anything calculated in the browser can be edited by the user.

---

## Open questions
1. **Tips on cash rides:** the customer hands the driver fare + tip in cash, but the tip belongs to mysabak.
   How does it reach mysabak (driver remits it, deducted from GCash payouts, or allow tips on cash rides only
   by e-wallet)? The demo records the tip with the booking's payment method.
2. **Shop payments:** online payment means mysabak collects for shops and pays them out (payment-regulation
   questions); cash on delivery means riders pay the shop up front.
3. **Driver requirements:** the document list depends on LTFRB rules, especially for motorcycle taxis.
4. **Tip cap** (₱500 now) and fares / delivery rates (all `null` in `config.js`).
5. **Legal check** on the tip wording ("Tip mysabak") before launch: tips are mysabak's income, not donations.
6. Launch area: Cebu only, or nationwide? Search favours 40 km around the pickup, Philippines only.
