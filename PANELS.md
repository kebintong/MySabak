# mysabak · Panels and the data they need

This is the hand-off contract between the frontend demo and the backend.
Every screen panel is listed with the data it shows and where that data comes from.

**All data goes through one file: `assets/js/api.js`.** Replace the bodies of its functions with calls to
your API, keep the names and return shapes below, and the screens keep working. Nothing else in the
frontend talks to a server.

Placeholders like `₱[FARE]` stay visible until real data arrives, so you can see at a glance what's still
missing.

---

## Ride screen (`index.html`)

### 1. Top bar
| Element | Data | Source today |
|---|---|---|
| Logo | none | `assets/images/logo.png` |
| Install app | none | browser install prompt |
| Sign in | user session | not built: goes to `pages/account.html` placeholder |

### 2. Map
| Element | Data | Source |
|---|---|---|
| Pickup pin + label `[Street, barangay]` | short address of the pickup point | `addressFor(point)` |
| Drop-off pin + label `[Drop-off place]` | name of the chosen place | search result title, or `addressFor()` for a pin |
| Route line | `trip.coords` | `routeBetween(from, to)` |
| Time bubble `[Travel time]` | `trip.minutes` | `routeBetween()` |

The map itself (tiles, style, labels) comes from TomTom via `assets/js/map.js`. To change map provider,
change `styleUrl()` in `map.js`; the rest of the app doesn't care.

### 3. "Saan tayo?" panel (step 1: `request`)
| Element | Data | Source |
|---|---|---|
| "Where to?" box + suggestions | places matching the text, near the pickup | `searchPlaces(text, near)` → `placeLocation(place)` |
| From: Current location | pickup label | GPS + `addressFor()` |
| Home / Work chips | the user's saved places | **not built** (needs accounts); shape: `{ home: {label, lng, lat}, work: {…} }` |
| Recent chip | last drop-off | this browser only (`localStorage`); backend can supply the user's recent trips |
| Pick on map | none | map tap |

### 4. "Choose a vehicle" panel (step 2: `choose`)
| Element | Placeholder | Data | Source |
|---|---|---|---|
| Summary line | `[Drop-off place] · [Distance] · [Travel time]` | `trip.distanceKm`, `trip.minutes` | `routeBetween()` |
| Vehicle cards (Motor / Sedan / SUV) | none | list of vehicles | `CONFIG.vehicles` in `assets/js/config.js` |
| Fare on each card | `₱[FARE]` | `fares[vehicleId].total` | `faresFor(trip)` |
| Driver ETA on each card | `[ETA]` | `trip.eta[vehicleId]` (minutes) | `routeBetween()`, needs live drivers |
| Fare note (desktop) | `₱[AMOUNT]` + `₱[AMOUNT]` | `fares[vehicleId].base`, `.distance` | `faresFor(trip)` |
| Payment button | `[Payment method]` | user's default payment | `CONFIG.paymentMethod`; backend: user profile |
| Book button | `₱[FARE]` | the booking | `bookRide(booking)` |

### 5. Booking
While `bookRide()` runs, the Book button shows "Finding a driver…". When it resolves, a toast confirms.
The next screen (driver assigned, live tracking) is **not built yet**.

---

## Other pages (`pages/`)
`drive.html`, `shops.html`, `donate.html`, `account.html` are placeholders: shared top bar and tab bar,
plus a "coming soon" panel. Replace the `<main>` panel with the real screen.

---

## `assets/js/api.js` functions

| Function | Returns | Used by |
|---|---|---|
| `searchPlaces(text, near, { signal })` | `Place[]` (max 5) with a `far` flag | "Where to?" suggestions |
| `placeLocation(place)` | `{ lng, lat }` | picking a suggestion |
| `addressFor({ lng, lat })` | `string \| null` | pickup label, pinned drop-off |
| `routeBetween(from, to)` | `Trip` | route line, distance, time, ETA |
| `straightLine(from, to)` | `Trip` with `approx: true` | fallback when routing fails |
| `faresFor(trip)` | `{ [vehicleId]: Fare \| null }` | fares on cards and Book button |
| `bookRide(booking)` | `{ id, demo }` | Book button |
| `errorMessage(err)` | `string` | error toasts; throw errors with `err.status` (HTTP code) |

### Shapes (example data)

```jsonc
// Place (searchPlaces). Either lng/lat, or a `details` id for placeLocation() to resolve.
{ "title": "Ayala Center Cebu", "subtitle": "Cebu Business Park, Cebu City", "km": 2.4, "lng": 123.9054, "lat": 10.3181 }

// Trip (routeBetween / straightLine)
{
  "coords": [[123.8854, 10.3157], [123.8902, 10.3170], [123.9054, 10.3181]], // [lng, lat] along the road
  "distanceKm": 6.8,
  "minutes": 20,
  "eta": { "motor": 3, "sedan": 5, "suv": 8 },  // minutes until a driver arrives; null if unknown
  "approx": false                               // true = straight line, no real route
}

// Fare per vehicle (faresFor). null = unknown, shows ₱[FARE]
{ "motor": { "total": 95, "base": 40, "distance": 55 }, "sedan": { "total": 180, "base": 80, "distance": 100 }, "suv": null }

// Booking (what the Book button sends to bookRide)
{
  "vehicle": "sedan",
  "pickup":  { "lng": 123.8854, "lat": 10.3157, "label": "V. Rama Ave, Guadalupe" },
  "dropoff": { "lng": 123.9054, "lat": 10.3181, "label": "Ayala Center Cebu" },
  "trip":    { "distanceKm": 6.8, "minutes": 20, "coords": [ /* … */ ] },
  "payment": "GCash"
}
```

### Suggested endpoints
Any design works as long as `api.js` returns the shapes above. One simple option:

| Endpoint | Feeds |
|---|---|
| `GET /api/places?q=ayala&lng=…&lat=…` | `searchPlaces` |
| `GET /api/address?lng=…&lat=…` | `addressFor` |
| `POST /api/trips/estimate` `{ pickup, dropoff }` → `{ trip, fares }` | `routeBetween` + `faresFor` |
| `POST /api/bookings` `{ booking }` → `{ id }` | `bookRide` |

Work fares out on the server: anything calculated in the browser can be edited by the user.

---

## Open questions
1. Is launch Cebu-only, or nationwide? (Search is limited to the Philippines, favouring 40 km around the pickup.)
2. Fares: the same everywhere, or per city? Base + per-km for Motor / Sedan / SUV are still `null` in `config.js`.
3. Map provider and budget: the demo uses TomTom's free tier (no card): 10,000 place suggestions,
   20,000 address lookups, 20,000 routes and 200,000 map tiles a month.
4. Driver ETA (`trip.eta`) needs live driver locations: driver app + realtime updates.
