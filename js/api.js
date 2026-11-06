/* =========================================================
   mysabak · data layer (every call to a server lives here)

   BACKEND: this is the file to replace. Keep the exported function names
   and the shapes they return (documented above each one, and in PANELS.md);
   nothing else in the app talks to a server.

   Today the demo calls TomTom through /api/tomtom/… (dev/worker.js), which adds the API key server-side.
     Search:  Places Search API · Suggest + Details
              (falls back to the classic Search API if Places can't be reached)
     Address: Reverse Geocoding API (pickup street + barangay)
     Routes:  Routing API (real distance + travel time)
   Everything else (bookings, tips, driver sign-up, shop orders) is DEMO ONLY:
   it's saved in this browser (localStorage) so the screens work end to end.
   Search this file for "DEMO" to find what to replace.
   ========================================================= */
import { CONFIG } from './config.js';
import { isNum, haversineKm, rateFor, cleanTip } from './money.js';
import {
  SHOPS, SHOP_CATEGORIES, DEMO_DRIVERS, DEMO_ACCOUNTS, DEMO_PLACES, DEMO_RIDERS, DEMO_MERCHANT_ORDERS, DEMO_MERCHANT_WEEK,
  DEMO_BRANCHES, DEMO_BRANCH_ORDERS, BRANCH_AREAS, DEMO_APPLICATIONS, DEMO_ADMIN, DEMO_USERS,
} from './demo-data.js';
import { cleanPicks, unitPrice, pickLabels } from './menu.js';

/** Base of the TomTom proxy. map.js uses it for the map style and tiles. */
export const TOMTOM_PROXY = new URL('/api/tomtom', location.origin).href;

/** URL on the TomTom proxy, skipping empty params. */
export function tomtomUrl(path, params = {}) {
  const url = new URL(TOMTOM_PROXY + path);
  Object.entries(params).forEach(([k, v]) => {
    if (v !== undefined && v !== null && v !== '') url.searchParams.set(k, v);
  });
  return url;
}

/** fetch() with friendly errors: err.status 0 = network/blocked. */
async function getJSON(url, options = {}) {
  let res;
  try {
    res = await fetch(url, options);
  } catch (e) {
    if (e.name === 'AbortError') throw e;
    throw Object.assign(new Error('network'), { status: 0 });
  }
  if (!res.ok) throw Object.assign(new Error(`HTTP ${res.status}`), { status: res.status });
  return res.json();
}

/** Plain-language reason a call failed (shown in a toast). */
export function errorMessage(err) {
  if (!err) return 'Something went wrong.';
  if (err.status === 401 || err.status === 403) return 'TomTom refused the API key for this service. Open /api/health to see which TomTom products the key is missing.';
  if (err.status === 503) return 'The map service isn’t set up yet (TOMTOM_KEY is missing on the server).';
  if (err.status === 429) return 'TomTom’s free limit was reached. Try again later.';
  if (err.status === 0) return 'Can’t reach the server. Check your internet, or an ad-blocker.';
  return `The server had a problem (error ${err.status}).`;
}

/* ---------- Place search ---------- */
const searchCache = new Map();
let useClassicSearch = false; // switches on if the newer Places API can't be reached from this browser

/**
 * "Where to?" suggestions near a point, nearest-relevant first (max 5).
 * @param {string} text   what the user typed (3+ characters)
 * @param {{lng:number, lat:number}} near   the pickup
 * @returns {Promise<Array<{title:string, subtitle:string, km:number|null, lat?:number, lng?:number, details?:string}>>}
 *   Each place has lat/lng, or a `details` id that placeLocation() turns into lat/lng.
 *   The array's `far` flag is true when every result is beyond CONFIG.searchRadiusKm.
 */
export async function searchPlaces(text, near, { signal } = {}) {
  const key = `${text.toLowerCase()}|${near.lng.toFixed(2)},${near.lat.toFixed(2)}`;
  if (searchCache.has(key)) return searchCache.get(key);

  let places;
  if (!useClassicSearch) {
    try {
      places = await suggestOrbis(text, near, signal);
    } catch (err) {
      if (err.name === 'AbortError' || err.status === 401 || err.status === 403 || err.status === 429) throw err;
      console.warn('Places Search API unavailable, using the classic Search API.', err);
      useClassicSearch = true;
    }
  }
  if (useClassicSearch) places = await searchClassic(text, near, signal);

  places = places.slice(0, 5);
  places.far = places.length > 0 && places.every((p) => isNum(p.km) && p.km > CONFIG.searchRadiusKm);
  searchCache.set(key, places);
  return places;
}

// Newer Places Search API (Orbis): Suggest. Free tier: 10,000 requests/month.
async function suggestOrbis(text, { lng, lat }, signal) {
  const data = await getJSON(`${TOMTOM_PROXY}/maps/orbis/places/suggest`, {
    method: 'POST',
    signal,
    headers: {
      'TomTom-Api-Version': '3',
      Attributes: 'results',
      'Accept-Language': CONFIG.language,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      query: text,
      maxResults: 8,
      origin: { type: 'point', coordinates: [lng, lat] },
      preferences: { geometry: { type: 'point', coordinates: [lng, lat] } },
      filters: { countryCodesIso2: [CONFIG.countryCode.toUpperCase()] },
    }),
  });
  return (data.results || [])
    .filter((r) => r.id && r.type !== 'discoverAction')
    .map((r) => {
      const params = (r.more && r.more.pathParameters) || [];
      const typeArg = (params.find((p) => p.parameter === 'type') || {}).argument || `${r.type}s`;
      const subs = r.subtitles || [];
      return {
        title: r.title,
        subtitle: subs.slice(0, 2).join(', '),
        km: isNum(r.distanceInMeters) ? r.distanceInMeters / 1000 : null,
        details: `/maps/orbis/places/details/${encodeURIComponent(typeArg)}/${encodeURIComponent(r.id)}`,
      };
    });
}

// Classic Search API (fuzzy, typeahead). Free tier: 2,500 requests/month.
async function searchClassic(text, near, signal) {
  const url = tomtomUrl(`/search/2/search/${encodeURIComponent(text)}.json`, {
    typeahead: 'true',
    limit: 8,
    countrySet: CONFIG.countryCode.toUpperCase(),
    lat: near.lat,
    lon: near.lng,
    language: CONFIG.language,
  });
  const data = await getJSON(url, { signal });
  return (data.results || [])
    .filter((r) => r.position)
    .map((r) => {
      const a = r.address || {};
      const title = (r.poi && r.poi.name) || a.streetName || a.freeformAddress;
      const subtitle = [a.municipalitySubdivision, a.municipality || a.countrySubdivision].filter(Boolean).join(', ');
      return {
        title,
        subtitle,
        km: isNum(r.dist) ? r.dist / 1000 : haversineKm(near, { lat: r.position.lat, lng: r.position.lon }),
        lat: r.position.lat,
        lng: r.position.lon,
      };
    })
    .sort((x, y) => x.km - y.km);
}

/**
 * Coordinates for a picked suggestion.
 * @returns {Promise<{lng:number, lat:number}>}
 */
export async function placeLocation(place) {
  if (isNum(place.lat) && isNum(place.lng)) return { lat: place.lat, lng: place.lng };
  const data = await getJSON(TOMTOM_PROXY + place.details, {
    headers: {
      'TomTom-Api-Version': '3',
      Attributes: 'position',
      'Accept-Language': CONFIG.language,
    },
  });
  const c = data.position && data.position.coordinates;
  if (!c) throw Object.assign(new Error('No position'), { status: 404 });
  return { lng: c[0], lat: c[1] };
}

/**
 * Short address for a point, e.g. "V. Rama Ave, Guadalupe" (pickup label, pinned drop-off).
 * @returns {Promise<string|null>}
 */
export async function addressFor({ lng, lat }) {
  const data = await getJSON(tomtomUrl(`/search/2/reverseGeocode/${lat},${lng}.json`, { language: CONFIG.language }));
  const a = ((data.addresses || [])[0] || {}).address;
  if (!a) return null;
  const street = a.streetName || a.street;
  const area = a.municipalitySubdivision || a.municipality;
  const parts = [street, area].filter(Boolean).filter((v, i, arr) => arr.indexOf(v) === i);
  return parts.join(', ') || a.freeformAddress || null;
}

/**
 * Driving route between two points. `{ steps: true }` also asks for turn-by-turn directions (driver navigation).
 * @returns {Promise<{coords:Array<[number,number]>, distanceKm:number, minutes:number,
 *   eta:{[vehicleId:string]: number|null}, steps:Array<{text, maneuver, street, atM}>, approx:false}>}
 *   coords: [lng, lat] pairs for the line on the map. eta: minutes until a driver arrives, per vehicle.
 *   steps: each turn's words ("Turn right onto Osmeña Boulevard"), TomTom's maneuver code and its distance (m) along the route.
 */
export async function routeBetween(from, to, { steps = false } = {}) {
  const url = tomtomUrl(`/routing/1/calculateRoute/${from.lat},${from.lng}:${to.lat},${to.lng}/json`, {
    travelMode: 'car',
    routeType: 'fastest',
    traffic: 'true',
    ...(steps ? { instructionsType: 'text', language: 'en-GB' } : {}),
  });
  const data = await getJSON(url);
  const r = data.routes && data.routes[0];
  if (!r) throw new Error('No route found');
  const coords = (r.legs || []).flatMap((leg) => (leg.points || []).map((p) => [p.longitude, p.latitude]));
  return {
    coords,
    distanceKm: r.summary.lengthInMeters / 1000,
    minutes: Math.max(1, Math.round(r.summary.travelTimeInSeconds / 60)),
    eta: { motor: null, sedan: null, suv: null }, // needs live driver positions (backend)
    // Turn-by-turn (only when asked): what to do, and how far along the route (m) it happens
    steps: ((steps && r.guidance && r.guidance.instructions) || []).map((i) => ({
      text: i.message || '', maneuver: i.maneuver || '', street: i.street || '', atM: i.routeOffsetInMeters || 0,
    })),
    approx: false,
  };
}

/** Straight line + as-the-crow-flies distance (shown when routing fails). Same shape as routeBetween(). */
export function straightLine(from, to) {
  return {
    coords: [[from.lng, from.lat], [to.lng, to.lat]],
    distanceKm: haversineKm(from, to),
    minutes: null,
    eta: { motor: null, sedan: null, suv: null },
    steps: [],
    approx: true,
  };
}

/**
 * Fare per vehicle for a trip. The demo works it out here from CONFIG (base + perKm × km);
 * the backend should return these from the server so prices can't be edited in the browser.
 * The fare goes 100% to the driver.
 * @returns {{[vehicleId:string]: {total:number, base:number, distance:number} | null}}  null = unknown
 */
export function faresFor(trip) {
  const out = {};
  CONFIG.vehicles.forEach((v) => {
    const km = trip && trip.distanceKm;
    const total = rateFor(v, km);
    out[v.id] = total === null ? null : { total, base: v.base, distance: v.perKm * km };
  });
  return out;
}

/* ---------- Demo storage (this browser only) ---------- */
const demo = {
  get(key, fallback) {
    try { return JSON.parse(localStorage.getItem(`mysabak.demo.${key}`)) ?? fallback; } catch (_) { return fallback; }
  },
  set(key, value) {
    try { localStorage.setItem(`mysabak.demo.${key}`, JSON.stringify(value)); return true; } catch (_) { return false; /* storage off or full */ }
  },
  id: (prefix) => `${prefix}-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`,
};
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/* =========================================================
   Ride + Express bookings
   ========================================================= */

/**
 * Send a booking (Ride or Express), after the customer picked how to pay and their price.
 * `price.tip` is what they added on top of the fare (0 = no tip); it goes 100% to mysabak.
 * The server must work out the fare itself and only trust the tip amount (capped at CONFIG.tips.max).
 * DEMO: saved in this browser and returns a booking id; no driver is dispatched.
 * @param {{kind:'ride'|'express', vehicle:string, pickup:{lng,lat,label}, dropoff:{lng,lat,label},
 *   trip:object, payment:'cash'|'gcash'|'bank', price:{fare:number|null, tip:number, total:number|null},
 *   parcel?:{receiverName, receiverPhone, size, item, notes}}} booking
 * @returns {Promise<{id:string, demo:boolean}>}
 */
export async function bookRide(booking) {
  if (!CONFIG.ridePayments.some((m) => m.id === booking.payment)) throw Object.assign(new Error('Choose how you’ll pay.'), { status: 400 });
  const tip = cleanTip(booking.price && booking.price.tip, CONFIG.tips.max);
  await wait(600);
  const id = demo.id(booking.kind === 'express' ? 'EXP' : 'RIDE');
  const record = { id, ...booking, price: { ...booking.price, tip }, at: Date.now() };
  demo.set('lastBooking', record);
  // Live from now on, on every page (myActiveTrip): first looking for a driver, until endTrip() or cancelRide()
  demo.set('activeTrip', { id, booking: record, driver: null, bookedAt: Date.now(), acceptedAt: null, pausedMs: 0, plan: null });
  demo.set('rides', [record, ...demo.get('rides', [])].slice(0, 20));
  if (tip) {
    const tipRecord = { id: demo.id('TIP'), orderId: id, orderType: booking.kind, amount: tip, method: booking.payment, at: Date.now() };
    demo.set('tips', [tipRecord, ...demo.get('tips', [])].slice(0, 50));
  }
  return { id, demo: true };
}

/**
 * The signed-in user's Ride and Express bookings, newest first (the Trips page).
 * DEMO: this browser's last 20 bookings.
 * @returns {Promise<Array<{id, kind:'ride'|'express', vehicle:string, pickup:{label}, dropoff:{label},
 *   payment:string, price:{fare:number|null, tip:number, total:number|null}, at:number}>>}
 */
export async function myTrips() {
  return demo.get('rides', []);
}

/**
 * Find a driver for a booking. Resolves once a driver accepts.
 * Rejects with status 404 when no driver is free nearby, 499 when the booking was cancelled.
 * DEMO: a sample driver (demo-data.js → DEMO_DRIVERS) "accepts" after ~3 seconds.
 * @returns {Promise<{id:string, name:string, rating:number, trips:number, phone:string|null, photo:string|null,
 *   vehicle:{type:string, model:string, color:string, plate:string}, demo?:boolean}>}
 */
export async function findDriver(bookingId) {
  const booking = demo.get('lastBooking', null);
  if (!booking || booking.id !== bookingId) throw Object.assign(new Error('Booking not found'), { status: 404 });
  const live = demo.get('activeTrip', null);
  const bookedAt = live && live.id === bookingId ? live.bookedAt : Date.now();
  await wait(Math.max(0, bookedAt + DEMO_ACCEPT_MS - Date.now())); // a page opened later waits only what's left
  if ((demo.get('cancelled', []) || []).includes(bookingId)) throw Object.assign(new Error('Cancelled'), { status: 499 });
  const a = demo.get('activeTrip', null);
  if (!a || a.id !== bookingId) throw Object.assign(new Error('Cancelled'), { status: 499 });
  return demoAccept(a).driver;
}

// DEMO: a sample driver accepts 3.2 s after booking, whichever page is open then
const DEMO_ACCEPT_MS = 3200;
function demoAccept(a) {
  if (a.driver) return a;
  const d = DEMO_DRIVERS[a.booking.vehicle] || DEMO_DRIVERS.sedan;
  a.driver = { id: `DRV-${a.booking.vehicle}`, name: d.name, rating: d.rating, trips: d.trips, phone: null, photo: null,
    vehicle: { type: a.booking.vehicle, ...d.vehicle }, demo: true };
  a.acceptedAt = a.bookedAt + DEMO_ACCEPT_MS;
  a.plan = a.plan || demoPlan(a.booking, 1, 3); // timings from the start, so every page has the ETA; the map redraws the paths
  demo.set('activeTrip', a);
  return a;
}

// DEMO: how long each part of a trip takes (ms) and its minutes to show; ~1 km approach unless the route says
function demoPlan(b, km, approachMin) {
  return [
    { status: 'arriving', ms: Math.min(12000, Math.max(6000, km * 6000)), eta: approachMin || 3 },
    { status: 'arrived', ms: 2500, eta: 0 },
    { status: 'on_trip', ms: 14000, eta: (b.trip && b.trip.minutes) || null },
    { status: 'completed', ms: 0, eta: 0 },
  ];
}

/** Cancel a booking (while searching, or before pickup). DEMO: remembered in this browser. */
export async function cancelRide(bookingId) {
  demo.set('cancelled', [bookingId, ...demo.get('cancelled', [])].slice(0, 20));
  endTrip(bookingId);
  return { ok: true };
}

/**
 * The customer's live Ride or Express booking, so any page can show it and the ride screen can pick it up again.
 * null when there's none. status: 'searching' (no driver yet), then as onTripUpdate; 'completed' stays until
 * endTrip(). Backend: the server knows the trip's status; return it here.
 * DEMO: worked out from the clock and the timings onTripUpdate saved.
 * @returns {Promise<null|{id, kind:'ride'|'express', status:string, etaMinutes:number|null, booking:object, driver:object|null}>}
 */
export async function myActiveTrip() {
  let a = demo.get('activeTrip', null);
  if (!a) return null;
  const trip = (status, etaMinutes) => ({ id: a.id, kind: a.booking.kind, status, etaMinutes, booking: a.booking, driver: a.driver });
  if (!a.driver) {
    if (Date.now() < a.bookedAt + DEMO_ACCEPT_MS) return trip('searching', null);
    a = demoAccept(a);
  }
  if (!a.plan) return trip('arriving', null);
  const { i, f } = phaseAt(a.plan, Date.now() - a.acceptedAt - a.pausedMs);
  return trip(a.plan[i].status, etaOf(a.plan[i], f));
}

/** The trip is over (done screen shown, or the driver cancelled): it's no longer live. */
export async function endTrip(bookingId) {
  const a = demo.get('activeTrip', null);
  if (a && a.id === bookingId) demo.set('activeTrip', null);
}

// Which phase of a trip plan a clock (ms since the driver accepted) is in, and how far through it (0–1)
function phaseAt(plan, clock) {
  let t = Math.max(0, clock);
  let i = 0;
  while (i < plan.length - 1 && t >= plan[i].ms) { t -= plan[i].ms; i++; }
  return { i, f: plan[i].ms ? t / plan[i].ms : 1 };
}
const etaOf = (ph, f) => (ph.eta === null ? null : Math.max(0, Math.ceil(ph.eta * (1 - f))));

/**
 * Follow a booking once a driver accepted: where the driver is and what's happening.
 * Calls onUpdate({ status, driver:{lng,lat}, etaMinutes }) whenever it changes.
 * status: 'arriving' → 'arrived' → 'on_trip' → 'completed' (or 'cancelled').
 * Backend: push these from your realtime channel (WebSocket, SSE, Firebase…).
 * DEMO: the driver drives the real roads to the pickup (TomTom route), waits, then follows the trip route;
 * about 25 seconds in all, plus a few random traffic stops. The clock runs from when the driver accepted
 * (saved by findDriver), so a ride screen opened again later picks the trip up where it is.
 * @returns {() => void}  call to stop listening
 */
export function onTripUpdate(bookingId, onUpdate) {
  const a = demo.get('activeTrip', null);
  if (!a || a.id !== bookingId) return () => {};
  const b = a.booking;
  const pickup = [b.pickup.lng, b.pickup.lat];
  const route = (b.trip && b.trip.coords && b.trip.coords.length > 1) ? b.trip.coords : [pickup, [b.dropoff.lng, b.dropoff.lat]];
  // The demo driver starts about 1 km away and drives the real roads to the pickup.
  const from = { lng: pickup[0] - 0.007, lat: pickup[1] + 0.005 };
  let stopped = false;
  let timer = 0;
  let phases = null;
  let stuckUntil = 0;
  let frozen = 0; // the clock while stuck: it stands still, then carries on from there
  // ms of the trip played so far: since the driver accepted, less the time stuck in traffic
  const clock = () => (Date.now() < stuckUntil ? frozen : Date.now() - a.acceptedAt - a.pausedMs);
  onUpdate({ status: 'arriving', driver: from, etaMinutes: null });

  const begin = (approach) => {
    if (stopped) return;
    const km = approach.distanceKm || 1;
    // The timings are saved once (myActiveTrip reads them); a resumed trip keeps them and only redraws the paths
    const plan = a.plan || demoPlan(b, km, approach.minutes);
    const paths = [approach.coords, [pickup], route, [route[route.length - 1]]];
    phases = plan.map((p, i) => ({ ...p, path: paths[i] }));
    if (!a.plan) { a.plan = plan; save(); }
    tick();
  };
  const save = () => { const now = demo.get('activeTrip', null); if (now && now.id === a.id) demo.set('activeTrip', a); };
  const tick = () => {
    if (stopped) return;
    const now = Date.now();
    const { i, f } = phaseAt(phases, clock());
    const ph = phases[i];
    // DEMO traffic: while driving, now and then the driver stops for 1.5–4 s (about once every 10 s)
    if (now >= stuckUntil && ph.path.length > 1 && f > 0.05 && f < 0.9 && Math.random() < 0.02) {
      const stop = 1500 + Math.random() * 2500;
      frozen = clock();
      stuckUntil = now + stop;
      a.pausedMs += stop; // after the stop the clock carries on from `frozen`; myActiveTrip counts it too
      save();
    }
    onUpdate({ status: ph.status, driver: pointAlong(ph.path, f), etaMinutes: etaOf(ph, f) });
    if (ph.status !== 'completed') timer = setTimeout(tick, 200);
  };
  const toPickup = { lng: pickup[0], lat: pickup[1] };
  Promise.race([routeBetween(from, toPickup), wait(3000).then(() => { throw new Error('slow'); })])
    .then((r) => { r.coords.push(pickup); begin(r); })
    .catch(() => begin(straightLine(from, toPickup)));
  return () => { stopped = true; clearTimeout(timer); };
}

// A point a fraction f (0–1) of the way along a line, measured in real distance (km).
function pointAlong(path, f) {
  if (path.length === 1) return { lng: path[0][0], lat: path[0][1] };
  const seg = [];
  let total = 0;
  for (let i = 1; i < path.length; i++) {
    const d = haversineKm({ lng: path[i - 1][0], lat: path[i - 1][1] }, { lng: path[i][0], lat: path[i][1] });
    seg.push(d);
    total += d;
  }
  let left = Math.min(1, Math.max(0, f)) * total;
  for (let i = 0; i < seg.length; i++) {
    if (left <= seg[i] || i === seg.length - 1) {
      const k = seg[i] ? Math.min(1, left / seg[i]) : 0;
      return { lng: path[i][0] + (path[i + 1][0] - path[i][0]) * k, lat: path[i][1] + (path[i + 1][1] - path[i][1]) * k };
    }
    left -= seg[i];
  }
  return { lng: path[path.length - 1][0], lat: path[path.length - 1][1] };
}

/** Rate the driver after a trip (1–5 stars). DEMO: saved in this browser. */
export async function rateRide(bookingId, stars) {
  const n = Math.round(Number(stars));
  if (!(n >= 1 && n <= 5)) throw Object.assign(new Error('Pick 1 to 5 stars.'), { status: 400 });
  demo.set('ratings', { ...demo.get('ratings', {}), [bookingId]: n });
  return { ok: true };
}

/* =========================================================
   Tips: optional, 100% to mysabak (drivers keep 100% of the fare)
   ========================================================= */

/**
 * Send a tip for an order, or a direct one from the Support page.
 * DEMO: saved in this browser; no money moves.
 * @param {{orderId:string|null, orderType:'ride'|'express'|'shop'|'direct', amount:number, method:'gcash'|'maya'|'card'}} tip
 * @returns {Promise<{id:string, amount:number, demo:boolean}>}
 */
export async function sendTip({ orderId, orderType, amount, method }) {
  const clean = cleanTip(amount, CONFIG.tips.max);
  if (!clean) throw Object.assign(new Error('Pick a tip amount.'), { status: 400 });
  if (!CONFIG.tips.methods.some((m) => m.id === method)) throw Object.assign(new Error('Tips are e-wallet or card only.'), { status: 400 });
  await wait(900);
  const tip = { id: demo.id('TIP'), orderId: orderId || null, orderType, amount: clean, method, at: Date.now() };
  demo.set('tips', [tip, ...demo.get('tips', [])].slice(0, 50));
  return { id: tip.id, amount: clean, demo: true };
}

/**
 * The signed-in user's tips, newest first.
 * DEMO: tips sent from this browser.
 * @returns {Promise<Array<{id, orderId, orderType, amount, method, at:number}>>}
 */
export async function myTips() {
  return demo.get('tips', []);
}

/**
 * Numbers for the Support page. null = not known yet (shows [AMOUNT] / [—%]).
 * DEMO: all null until the backend reports real totals.
 * @returns {Promise<{period:string, tipsTotal:number|null, ordersFeeFree:number|null,
 *   breakdown:Array<{label:string, share:number|null}>}>}  share: 0–100 (%)
 */
export async function supportStats() {
  return {
    period: new Date().toLocaleDateString('en-PH', { month: 'long', year: 'numeric' }),
    tipsTotal: null,
    ordersFeeFree: null,
    breakdown: [
      { label: 'Maps, servers and the app', share: null },
      { label: 'Rider and driver support', share: null },
      { label: 'Driver programs', share: null },
      { label: 'Keeping fares fee-free', share: null },
    ],
  };
}

/* =========================================================
   Accounts: one person is signed in on a device at a time, as a customer, a driver or a merchant.
   Each has its own sign-in form (pages/account.html, pages/drive.html, pages/merchant.html).
   Admins use the customer form; nothing on the site points them there. Their role comes from the account.
   ========================================================= */

/**
 * Who is signed in on this device, or null.
 * Backend: one "who am I" call on your session (e.g. GET /api/me).
 * @returns {Promise<null|{role:'client'|'admin'|'driver'|'merchant', name:string, email:string|null}>}
 */
export async function currentUser() {
  const client = demo.get('clientSession', null);
  if (client) return { role: client.role || 'client', name: client.name, email: client.email || null };
  const merchant = demo.get('merchantSession', null);
  if (merchant && !merchant.branchId) return { role: 'merchant', owner: true, name: DEMO_ACCOUNTS.merchant.name, email: DEMO_ACCOUNTS.merchant.email, shop: DEMO_ACCOUNTS.merchant.shop.name };
  if (merchant) {
    const b = findBranch(merchant.branchId);
    if (b && b.account.status === 'active') {
      const login = b.manager.login;
      return { role: 'merchant', owner: false, name: b.manager.name, email: login.includes('@') ? login : null, shop: DEMO_ACCOUNTS.merchant.shop.name, branch: b.name };
    }
    demo.set('merchantSession', null); // the branch account was turned off or changed hands
  }
  const d = await driverStatus();
  if (d.signedIn) return { role: 'driver', name: d.name, email: d.email || null };
  return null;
}

/** Signing in as one role signs the device out of the others. */
function endSessions(keep) {
  if (keep !== 'client') demo.set('clientSession', null);
  if (keep !== 'merchant') demo.set('merchantSession', null);
  if (keep !== 'driver' && demo.get('driverSession', null)) {
    const d = demo.get('driver', null);
    if (d) demo.set('driver', { ...d, online: false });
    demo.set('driverSession', null);
  }
}

/** Sign out whoever is signed in (the profile menu's Sign out). */
export async function signOut() {
  endSessions(null);
}

/**
 * Customer sign-in with a mobile number OR an email, plus password. Admins sign in here too; the account's
 * role (not the form) decides it, and the pages send an admin on to pages/admin.html.
 * DEMO: only the demo customer and demo admin (demo-data.js → DEMO_ACCOUNTS.client / .admin) exist;
 * customer sign-up isn't built.
 * Backend: the role must come from your user record on the server, and every admin call must check it there.
 * @returns {Promise<{name:string, role:'client'|'admin'}>}  throws { status: 401 } when they don't match
 */
export async function clientSignIn({ login, password }) {
  if (!login || !password) throw Object.assign(new Error('Enter your mobile number or email, and your password.'), { status: 400 });
  await wait(700);
  const c = [DEMO_ACCOUNTS.client, DEMO_ACCOUNTS.admin].find((a) => (login.includes('@') ? sameEmail(a.email, login) : samePhone(a.phone, login)));
  if (!c) throw Object.assign(new Error('No customer account uses that mobile number or email.'), { status: 401 });
  if (password !== c.password) throw Object.assign(new Error('Wrong password. Try again.'), { status: 401 });
  const role = c === DEMO_ACCOUNTS.admin ? 'admin' : 'client';
  if (role === 'client' && accountOff('demo-client')) throw turnedOff();
  endSessions('client');
  demo.set('clientSession', { name: c.name, email: c.email, phone: c.phone, role, at: Date.now() });
  return { name: c.name, role };
}

export async function clientSignOut() {
  demo.set('clientSession', null);
}

/* =========================================================
   Drive (driver side)
   ========================================================= */

const samePhone = (a, b) => {
  const norm = (p) => String(p || '').replace(/\D/g, '').replace(/^63/, '0');
  return norm(a) !== '' && norm(a) === norm(b);
};

const sameEmail = (a, b) => Boolean(a && b) && String(a).trim().toLowerCase() === String(b).trim().toLowerCase();

/**
 * Driver sign-in with a mobile number OR an email, plus password.
 * DEMO: the demo driver account (demo-data.js → DEMO_ACCOUNTS.driver, approved) needs its password; for an
 * account made with the sign-up form any password works (passwords are never stored in the browser).
 * Backend: check the password on the server and start a session (e.g. an httpOnly cookie).
 * @param {{login:string, password:string}} creds  login = mobile number or email
 * @returns {Promise<{status:'review'|'approved'|'rejected'}>}  throws { status: 401 } when they don't match
 */
export async function driverSignIn({ login, password }) {
  if (!login || !password) throw Object.assign(new Error('Enter your mobile number or email, and your password.'), { status: 400 });
  await wait(700);
  const isLogin = (acc) => acc && (login.includes('@') ? sameEmail(acc.email, login) : samePhone(acc.phone, login));
  const demoDriver = DEMO_ACCOUNTS.driver;
  if (isLogin(demoDriver)) {
    if (password !== demoDriver.password) throw Object.assign(new Error('Wrong password. Try again.'), { status: 401 });
    if (accountOff('demo-driver')) throw turnedOff();
    const { password: _, ...profile } = demoDriver; // eslint-disable-line no-unused-vars
    const prev = demo.get('driver', null);
    demo.set('driver', { ...profile, method: 'demo', online: prev && prev.method === 'demo' ? prev.online : false });
    endSessions('driver');
    demo.set('driverSession', { phone: demoDriver.phone, at: Date.now() });
    return { status: demoDriver.status };
  }
  const d = demo.get('driver', null);
  const matches = isLogin(d);
  if (!matches) {
    throw Object.assign(new Error('No driver account uses that mobile number or email. Check it, or sign up.'), { status: 401 });
  }
  if (accountOff(BROWSER_DRIVER)) throw turnedOff();
  endSessions('driver');
  demo.set('driverSession', { phone: d.phone, at: Date.now() });
  return { status: d.status };
}

/** Sign the driver out (and offline). */
export async function driverSignOut() {
  const d = demo.get('driver', null);
  if (d) demo.set('driver', { ...d, online: false });
  demo.set('driverSession', null);
}

/**
 * Online driver application. It goes into review; updates are sent to the driver's email.
 * (Walk-in applicants sign up at the office: see CONFIG.driverOffice.)
 * DEMO: saved in this browser as 'review'. Files aren't uploaded, the password isn't kept and no
 * email is sent. The driver can sign in to see the status.
 * @param {{name, phone, email, city, password, vehicle:'motor'|'sedan'|'suv', plate, model, year,
 *   licenseNumber, files:{license, orcr, selfie}, agreed:boolean}} application
 * @returns {Promise<{status:'review', email:string}>}
 */
export async function driverApply(application) {
  if (!application.email) throw Object.assign(new Error('An email is needed for application updates.'), { status: 400 });
  await wait(1200);
  const { files, password, ...data } = application; // eslint-disable-line no-unused-vars
  demo.set('driver', { ...data, method: 'online', status: 'review', online: false, appliedAt: Date.now() });
  demo.set('driverSession', null);
  return { status: 'review', email: data.email };
}

/* =========================================================
   Admin (pages/admin*.html): live counts, driver and shop registrations, analytics.
   Every call checks the admin session first (403 otherwise). Backend: check the role on the server too.
   ========================================================= */

const requireAdmin = () => {
  const s = demo.get('clientSession', null);
  if (!s || s.role !== 'admin') throw Object.assign(new Error('Admins only'), { status: 403 });
};

/** When this browser first opened the admin pages: the SAMPLE applicants' and accounts' times count back from it. */
const adminOpenedAt = () => demo.get('adminOpenedAt', null) || (demo.set('adminOpenedAt', Date.now()), Date.now());

/** An account an admin turned off (pages/admin-management.html) can't sign in. */
const accountOff = (id) => (demo.get('adminUsers', {})[id] || {}).status === 'deactivated';
const turnedOff = () => Object.assign(new Error('This account is turned off. Contact mysabak support to turn it back on.'), { status: 403 });

const BROWSER_DRIVER = 'browser-driver'; // the application made in this browser on pages/drive-signup.html

/** Every application of one kind, with the decisions made in this browser applied. */
function applications(kind) {
  const decided = demo.get('adminDecisions', {});
  const opened = adminOpenedAt();
  const list = DEMO_APPLICATIONS[kind].map(({ hoursAgo, ...a }) => ({ ...a, kind, sample: true, appliedAt: opened - hoursAgo * 3600e3 }));
  const d = demo.get('driver', null);
  if (kind === 'drivers' && d && d.method === 'online') {
    const papers = { license: 'unknown', orcr: 'unknown', selfie: 'unknown' }; // the demo doesn't keep the photos
    list.unshift({ id: BROWSER_DRIVER, kind, sample: false, name: d.name, phone: d.phone, email: d.email, city: d.city, vehicle: d.vehicle,
      model: d.model, year: d.year, plate: d.plate, licenseNumber: d.licenseNumber, appliedAt: d.appliedAt, papers, status: d.status, reason: d.fixReason });
  }
  return list.map((a) => (decided[a.id] ? { ...a, ...decided[a.id] } : a)).sort((a, b) => b.appliedAt - a.appliedAt);
}

/**
 * Driver or shop applications, newest first.
 * DEMO: the SAMPLE applicants in demo-data.js (DEMO_APPLICATIONS) plus the driver application made in this
 * browser. Backend: e.g. GET /api/admin/applications?kind=drivers
 * @param {'drivers'|'merchants'} kind
 * @returns {Promise<Array<object>>}  each with id, kind, status ('review'|'fix'|'approved'|'rejected'), reason,
 *   appliedAt, sample, papers ({ name: 'clear'|'unclear'|'missing'|'unknown' }) and the applicant's details
 */
export async function adminApplications(kind) {
  requireAdmin();
  if (!DEMO_APPLICATIONS[kind]) throw Object.assign(new Error('Unknown kind'), { status: 400 });
  return applications(kind);
}

/**
 * Approve, send back to fix (with the reason the applicant is told), or reject an application that is waiting
 * or being fixed. The applicant sees it when they sign in (and, with a backend, gets an email).
 * Backend: e.g. POST /api/admin/applications/:id/decision { decision, reason }
 * @param {{kind:'drivers'|'merchants', id:string, decision:'approved'|'fix'|'rejected', reason?:string}} input
 * @returns {Promise<{status:'approved'|'fix'|'rejected'}>}
 */
export async function adminDecide({ kind, id, decision, reason = '' }) {
  requireAdmin();
  if (!['approved', 'fix', 'rejected'].includes(decision)) throw Object.assign(new Error('Unknown decision'), { status: 400 });
  if (decision === 'fix' && !String(reason).trim()) throw Object.assign(new Error('Say what needs fixing.'), { status: 400 });
  const app = DEMO_APPLICATIONS[kind] && applications(kind).find((a) => a.id === id);
  if (!app || (app.status !== 'review' && app.status !== 'fix')) throw Object.assign(new Error('That application is no longer waiting.'), { status: 404 });
  const entry = { status: decision, reason: decision === 'fix' ? String(reason).trim() : '' };
  demo.set('adminDecisions', { ...demo.get('adminDecisions', {}), [id]: entry });
  if (id === BROWSER_DRIVER) {
    // the driver pages know review / approved / rejected; a fix request keeps them in review
    const d = demo.get('driver', null);
    demo.set('driver', { ...d, status: decision === 'fix' ? 'review' : decision, fixReason: entry.reason || undefined });
  }
  return { status: decision };
}

/**
 * Live counts, today's numbers and this week's tips (tipsWeek: { days, values, lastWeek }) for the admin overview.
 * DEMO: SAMPLE numbers (DEMO_ADMIN); the waiting counts come from the applications.
 * Backend: e.g. GET /api/admin/overview
 */
export async function adminOverview() {
  requireAdmin();
  const waiting = (kind) => applications(kind).filter((a) => a.status === 'review').length;
  const { riders, drivers, merchants, today, tipsPerDay, tripsPerDay } = DEMO_ADMIN;
  const sum = (a) => a.reduce((s, x) => s + x, 0);
  // tips for each of the last 7 days (oldest first; the last is today so far) and the 7 days before, in total
  const tipsWeek = { days: tripsPerDay.map((d) => d.day), values: tipsPerDay.slice(-7), lastWeek: sum(tipsPerDay.slice(-14, -7)) };
  return { sample: true, riders, drivers: { ...drivers, waiting: waiting('drivers') }, merchants: { ...merchants, waiting: waiting('merchants') }, today, tipsWeek };
}

/**
 * Numbers for the analytics page. DEMO: SAMPLE numbers (DEMO_ADMIN). Backend: e.g. GET /api/admin/analytics
 */
export async function adminAnalytics() {
  requireAdmin();
  const { week, tripsPerDay, growth, tipsPerDay, payments, driverFunnel, areas } = DEMO_ADMIN;
  return { sample: true, week, tripsPerDay, growth, tipsPerDay, payments, driverFunnel, areas };
}

/* ---------- Admin: accounts (pages/admin-management.html) ---------- */

const DAY = 86400e3;
const HOUR = 3600e3;
const PH_MOBILE = /^(\+?63|0)9\d{9}$/;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Every account: the demo logins, the SAMPLE accounts, and driver / shop applicants (waiting ones are 'pending'). */
function users() {
  const opened = adminOpenedAt();
  const A = DEMO_ACCOUNTS;
  const logins = [
    { id: 'demo-client', role: 'rider', name: A.client.name, email: A.client.email, phone: A.client.phone, area: A.client.city },
    { id: 'demo-driver', role: 'driver', name: A.driver.name, email: A.driver.email, phone: A.driver.phone, area: A.driver.city, vehicle: A.driver.vehicle, plate: A.driver.plate },
    { id: 'demo-merchant', role: 'merchant', name: A.merchant.name, shop: A.merchant.shop.name, email: A.merchant.email, phone: A.merchant.phone, area: A.merchant.shop.area },
  ].map((u) => ({ trips: 0, status: 'active', reason: '', statusAt: null, sample: false, demoLogin: true, joinedAt: opened - 30 * DAY, lastActiveAt: opened - HOUR, ...u }));
  const sample = DEMO_USERS.map(({ daysAgo, hoursAgo, statusDaysAgo, ...u }) => ({
    reason: '', ...u, sample: true, joinedAt: opened - daysAgo * DAY, lastActiveAt: opened - hoursAgo * HOUR,
    statusAt: statusDaysAgo == null ? null : opened - statusDaysAgo * DAY,
  }));
  const applicants = ['drivers', 'merchants'].flatMap((kind) => applications(kind).filter((a) => a.status !== 'rejected').map((a) => {
    const driver = kind === 'drivers';
    return {
      id: a.id, role: driver ? 'driver' : 'merchant', name: driver ? a.name : a.owner, ...(driver ? { vehicle: a.vehicle, plate: a.plate } : { shop: a.shop }),
      email: a.email, phone: a.phone, area: driver ? a.city : a.area, trips: 0, joinedAt: a.appliedAt, lastActiveAt: a.appliedAt,
      status: a.status === 'approved' ? 'active' : 'pending', reason: '', statusAt: null, application: { kind, status: a.status }, sample: a.sample,
    };
  }));
  const edits = demo.get('adminUsers', {});
  return [...logins, ...sample, ...applicants].map((u) => (edits[u.id] && u.status !== 'pending' ? { ...u, ...edits[u.id] } : u))
    .sort((a, b) => b.joinedAt - a.joinedAt);
}

const findUser = (id) => {
  const u = users().find((x) => x.id === id);
  if (!u) throw Object.assign(new Error('That account no longer exists.'), { status: 404 });
  if (u.status === 'pending') throw Object.assign(new Error('Review their application first.'), { status: 409 });
  return u;
};
const saveUser = (id, change) => demo.set('adminUsers', { ...demo.get('adminUsers', {}), [id]: { ...demo.get('adminUsers', {})[id], ...change } });

/**
 * Every rider, driver and merchant account, newest first.
 * DEMO: SAMPLE accounts (DEMO_USERS), the demo logins and the driver / shop applicants; edits are saved in this browser.
 * Backend: e.g. GET /api/admin/users
 * @returns {Promise<Array<{id, role:'rider'|'driver'|'merchant', name, shop?, email, phone, area, joinedAt, lastActiveAt,
 *   trips, status:'active'|'pending'|'deactivated', reason, statusAt, vehicle?, plate?, application?, sample, demoLogin?}>>}
 */
export async function adminUsers() {
  requireAdmin();
  return users();
}

/**
 * Change an account's name, email, mobile number and area. Applicants still waiting can't be edited (409).
 * Backend: e.g. PATCH /api/admin/users/:id
 * @returns {Promise<object>} the updated account
 */
export async function adminUpdateUser({ id, name, email, phone, area }) {
  requireAdmin();
  const u = findUser(id);
  const clean = { name: String(name || '').trim(), email: String(email || '').trim(), phone: String(phone || '').replace(/[\s-]/g, ''), area: String(area || '').trim() };
  const bad = (message, field) => Object.assign(new Error(message), { status: 400, field });
  if (!clean.name) throw bad('Enter their name.', 'name');
  if (!EMAIL_RE.test(clean.email)) throw bad('Enter a valid email address.', 'email');
  if (!PH_MOBILE.test(clean.phone)) throw bad('Enter a mobile number like 0917 123 4567.', 'phone');
  if (!clean.area) throw bad('Enter their area or city.', 'area');
  clean.phone = clean.phone.replace(/^\+?63/, '0');
  if (users().some((x) => x.id !== id && sameEmail(x.email, clean.email))) throw Object.assign(new Error('Another account already uses that email.'), { status: 409, field: 'email' });
  saveUser(u.id, clean);
  return users().find((x) => x.id === id);
}

/**
 * Turn an account off (needs a reason; it can't sign in until turned back on) or back on.
 * Backend: e.g. POST /api/admin/users/:id/status { status, reason }; end the account's sessions when turning it off.
 * @param {{id:string, status:'active'|'deactivated', reason?:string}} input
 * @returns {Promise<object>} the updated account
 */
export async function adminSetUserStatus({ id, status, reason = '' }) {
  requireAdmin();
  if (!['active', 'deactivated'].includes(status)) throw Object.assign(new Error('Unknown status'), { status: 400 });
  const u = findUser(id);
  if (status === 'deactivated' && !String(reason).trim()) throw Object.assign(new Error('Say why the account is being turned off.'), { status: 400 });
  saveUser(u.id, { status, reason: status === 'deactivated' ? String(reason).trim() : '', statusAt: Date.now() });
  if (status === 'deactivated') {
    // signed in on this device? sign them out (never the admin's own session)
    const c = demo.get('clientSession', null);
    if (id === 'demo-client' && c && c.role !== 'admin') demo.set('clientSession', null);
    if (id === 'demo-merchant') demo.set('merchantSession', null);
    if (id === 'demo-driver' || id === BROWSER_DRIVER) demo.set('driverSession', null);
  }
  return users().find((x) => x.id === id);
}

/**
 * Email an active account a link to set a new password.
 * DEMO: nothing is sent. Backend: e.g. POST /api/admin/users/:id/password-reset
 * @returns {Promise<{sentTo:string}>}
 */
export async function adminPasswordReset(id) {
  requireAdmin();
  const u = findUser(id);
  if (u.status !== 'active') throw Object.assign(new Error('Turn the account back on first.'), { status: 409 });
  await wait(400);
  return { sentTo: u.email };
}

/**
 * The driver's account status and whether they're signed in on this device.
 * @returns {Promise<{status:'none'|'review'|'approved'|'rejected', signedIn:boolean,
 *   name?:string, email?:string, vehicle?:string, plate?:string, online:boolean}>}
 */
export async function driverStatus() {
  const d = demo.get('driver', null);
  const session = demo.get('driverSession', null);
  if (!d) return { status: 'none', signedIn: false, online: false };
  const signedIn = Boolean(session && samePhone(session.phone, d.phone));
  return { status: d.status, signedIn, name: d.name, email: d.email, vehicle: d.vehicle, plate: d.plate, online: signedIn && Boolean(d.online) };
}

/**
 * Go online / offline. Online drivers receive job requests through onJobRequest().
 * @returns {Promise<{online:boolean}>}
 */
export async function setOnline(online) {
  const d = demo.get('driver', null);
  if (!d || !demo.get('driverSession', null)) throw Object.assign(new Error('Sign in first'), { status: 401 });
  if (d.status !== 'approved') throw Object.assign(new Error('Not approved yet'), { status: 403 });
  demo.set('driver', { ...d, online: Boolean(online) });
  return { online: Boolean(online) };
}

/**
 * Listen for job requests while online (Ride, Express or Shop delivery).
 * Backend: connect your realtime channel (WebSocket, SSE…) and call `onJob` for each request:
 *   { id, kind:'ride'|'express'|'shop', pickup:{lng,lat,label}, dropoff:{lng,lat,label}, distanceKm, fare,
 *     payment:'cash'|'gcash'|'bank', rider:{name}, shop?:{name}, parcel?:{size, item}, expiresAt:number }
 * DEMO: sends SAMPLE requests (`demo: true`) near `near`: three in the first few seconds, then one every
 * 25 seconds while fewer than five are waiting. Places come from demo-data.js (DEMO_PLACES).
 * @param {(job:object) => void} onJob
 * @param {{near?:{lng:number, lat:number}}} [opts]  where the driver is
 * @returns {() => void} stop listening
 */
export function onJobRequest(onJob, { near } = {}) {
  const here = near || { lng: CONFIG.startCenter[0], lat: CONFIG.startCenter[1] };
  const d = demo.get('driver', {}) || {};
  const vehicle = d.vehicle || 'sedan';
  const timers = [];
  let count = 0;
  const emit = () => {
    const waiting = demo.get('jobs', []).filter((j) => j.expiresAt > Date.now());
    if (waiting.length >= 5) return;
    const job = sampleJob(here, vehicle, count++);
    demo.set('jobs', [...waiting, job]);
    onJob(job);
  };
  [1500, 4000, 7500].forEach((ms) => timers.push(setTimeout(emit, ms)));
  timers.push(setInterval(emit, 25000));
  return () => timers.forEach((t) => { clearTimeout(t); clearInterval(t); });
}

const KINDS = ['ride', 'express', 'ride', 'shop'];
const SAMPLE_RATES = { motor: [30, 9], sedan: [45, 13], suv: [60, 16] }; // base, per km (sample only)
function sampleJob(near, vehicle, n) {
  const byDistance = DEMO_PLACES.map((p) => ({ ...p, km: haversineKm(near, p) })).sort((a, b) => a.km - b.km);
  const pickup = byDistance[n % Math.min(5, byDistance.length)];
  const others = byDistance.filter((p) => p !== pickup);
  const dropoff = others[(n * 3 + 2) % others.length];
  const kind = KINDS[n % KINDS.length];
  const distanceKm = Math.round(haversineKm(pickup, dropoff) * 1.3 * 10) / 10;
  const [base, perKm] = kind === 'shop' ? [39, 8] : SAMPLE_RATES[vehicle] || SAMPLE_RATES.sedan;
  const fare = Math.round((base + perKm * distanceKm) / 5) * 5;
  const strip = ({ km, ...p }) => p; // eslint-disable-line no-unused-vars
  return {
    id: demo.id('JOB'), kind, demo: true,
    pickup: kind === 'shop' ? { ...strip(pickup), label: `${DEMO_ACCOUNTS.merchant.shop.name} · ${pickup.label}` } : strip(pickup),
    dropoff: strip(dropoff), distanceKm, fare,
    payment: ['cash', 'gcash', 'cash', 'bank'][n % 4],
    rider: { name: DEMO_RIDERS[n % DEMO_RIDERS.length] },
    ...(kind === 'shop' ? { shop: { name: DEMO_ACCOUNTS.merchant.shop.name } } : {}),
    ...(kind === 'express' ? { parcel: { size: 'small', item: 'Documents' } } : {}),
    expiresAt: Date.now() + 120000,
  };
}

/** Accept a job request. 410 when it expired or someone else took it. @returns {Promise<{ok:boolean, job:object}>} */
export async function acceptJob(jobId) {
  if (demo.get('activeJob', null)) throw Object.assign(new Error('Finish your current job first.'), { status: 409 });
  const jobs = demo.get('jobs', []);
  const job = jobs.find((j) => j.id === jobId);
  if (!job || job.expiresAt < Date.now()) throw Object.assign(new Error('That request is no longer available.'), { status: 410 });
  await wait(400);
  const active = { ...job, status: 'to_pickup', acceptedAt: Date.now() };
  demo.set('activeJob', active);
  demo.set('jobs', jobs.filter((j) => j.id !== jobId));
  return { ok: true, job: active };
}

/** The job the driver is doing now, or null (e.g. after a page reload). */
export async function activeJob() {
  return demo.get('activeJob', null);
}

const JOB_FLOW = { to_pickup: 'arrived', arrived: 'started', started: 'completed' };
/**
 * Move a job along: 'to_pickup' → 'arrived' → 'started' → 'completed'.
 * Express and Shop jobs attach a photo at pickup and delivery (`photo`, optional in the demo).
 * @returns {Promise<{ok:boolean, status:string}>}  409 if the step is out of order
 */
export async function updateJob(jobId, status, { photo } = {}) { // eslint-disable-line no-unused-vars
  const job = demo.get('activeJob', null);
  if (!job || job.id !== jobId) throw Object.assign(new Error('Job not found'), { status: 404 });
  if (JOB_FLOW[job.status] !== status) throw Object.assign(new Error('That step isn’t possible now.'), { status: 409 });
  await wait(300);
  if (status === 'completed') {
    const trip = { id: job.id, kind: job.kind, at: Date.now(), fare: job.fare, distanceKm: job.distanceKm, demo: Boolean(job.demo) };
    demo.set('driverTrips', [trip, ...demo.get('driverTrips', [])].slice(0, 50));
    demo.set('activeJob', null);
  } else {
    demo.set('activeJob', { ...job, status });
  }
  return { ok: true, status };
}

/** Give a job back before pickup (it goes to another driver). */
export async function cancelJob(jobId) {
  const job = demo.get('activeJob', null);
  if (!job || job.id !== jobId) throw Object.assign(new Error('Job not found'), { status: 404 });
  if (job.status !== 'to_pickup') throw Object.assign(new Error('You can only cancel before pickup.'), { status: 409 });
  demo.set('activeJob', null);
  return { ok: true };
}

/**
 * Driver earnings: fares only (drivers keep 100%; tips go to mysabak).
 * DEMO: the jobs completed in this browser.
 * @returns {Promise<{today:number, week:number, trips:Array<{id, kind, at:number, fare:number, distanceKm:number}>,
 *   tipsToMysabak:number, payout:{method:string|null, next:string|null}}>}
 */
export async function driverEarnings() {
  const trips = demo.get('driverTrips', []);
  const midnight = new Date(); midnight.setHours(0, 0, 0, 0);
  const weekAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
  const sum = (list) => list.reduce((n, t) => n + t.fare, 0);
  return {
    today: sum(trips.filter((t) => t.at >= midnight.getTime())),
    week: sum(trips.filter((t) => t.at >= weekAgo)),
    trips,
    tipsToMysabak: 0,
    payout: { method: null, next: null },
  };
}

/* =========================================================
   Merchant (shop owners and their branches): sign in, open / close, orders, menu availability, branches.
   The owner account runs the main branch, adds branches and sees every one. Each other branch is run by its own
   branch account (its manager), which sees only that branch. The menu and prices are the owner's and shared by
   every branch; each branch has its own orders, Accept orders switch and sold-out items. No POS (Stage 2).
   ========================================================= */

/* ---------- Branches ---------- */

/** Every branch of the demo merchant's shop: the main one, the SAMPLE ones and those added in this browser. */
function branches() {
  const m = DEMO_ACCOUNTS.merchant;
  const s = m.shop;
  const main = {
    id: s.id, name: s.area, area: s.area, address: s.address, phone: s.phone, lng: s.lng, lat: s.lat,
    opensAt: s.opensAt, closesAt: s.closesAt, hours: s.hours, main: true, scale: 1,
    manager: { name: m.name, login: m.email }, account: { status: 'owner' },
  };
  const samples = DEMO_BRANCHES.map(({ password, ...b }) => ({ ...b, sample: true, account: { status: 'active' } })); // eslint-disable-line no-unused-vars
  const changes = demo.get('branchChanges', {});
  return [main, ...samples, ...demo.get('branchesAdded', [])].map((b) => ({ ...b, ...changes[b.id] }))
    .map((b) => (b.account.status === 'invited' ? { ...b, account: { status: 'active' } } : b)); // saved before setup codes were removed
}
const changeBranch = (id, change) => demo.set('branchChanges', { ...demo.get('branchChanges', {}), [id]: { ...demo.get('branchChanges', {})[id], ...change } });
const findBranch = (id) => branches().find((b) => b.id === id);
const MAIN_ID = () => DEMO_ACCOUNTS.merchant.shop.id;

/** A branch's Accept orders switch and sold-out items (the main branch keeps the older 'merchant' key). */
function branchSettings(id) {
  if (id === MAIN_ID()) return demo.get('merchant', { open: true, available: {} });
  return demo.get('branchSettings', {})[id] || { open: true, available: {} };
}
function saveBranchSettings(id, settings) {
  if (id === MAIN_ID()) demo.set('merchant', settings);
  else demo.set('branchSettings', { ...demo.get('branchSettings', {}), [id]: settings });
}

/** The owner's shop as customers see it (name, photo, description, menu with the owner's edits). */
function brandShop() {
  const s = DEMO_ACCOUNTS.merchant.shop;
  const edits = demo.get('merchantEdits', { shop: {}, items: {} });
  return { ...s, ...edits.shop, menu: s.menu.map((i) => ({ ...i, ...edits.items[i.id] })) };
}

/** One branch as a shop: the shared menu at the branch's place and hours, with its sold-out items marked. */
function branchShop(b) {
  const settings = branchSettings(b.id);
  const brand = brandShop();
  return {
    ...brand, id: b.id, brand: brand.id, branch: { id: b.id, name: b.name },
    area: b.area, address: b.address, phone: b.phone, lng: b.lng, lat: b.lat, hours: b.hours, opensAt: b.opensAt, closesAt: b.closesAt,
    accepting: settings.open !== false,
    menu: brand.menu.map((i) => ({ ...i, soldOut: settings.available[i.id] === false })),
    branches: liveBranches().map(({ id, name, area }) => ({ id, name, area })),
  };
}
/** Branches customers can order from: the main one and those whose branch account is set up and on. */
const liveBranches = () => branches().filter((b) => b.main || b.account.status === 'active');

/**
 * The nearest branch that is taking orders, else the nearest one. Exported for the tests.
 * @param {Array<{lng:number, lat:number, accepting?:boolean}>} list
 */
export function nearestBranch(list, near) {
  if (!near) return list[0];
  const byKm = [...list].sort((a, b) => haversineKm(near, a) - haversineKm(near, b));
  return byKm.find((b) => b.accepting !== false) || byKm[0];
}

/* ---------- Sessions ---------- */

const forbidden = (msg) => Object.assign(new Error(msg), { status: 403 });
const VIEW_ONLY = 'You’re viewing this branch. Take over to make changes here.';

/**
 * Who is signed in as a merchant on this device, and which branch they're looking at.
 * role 'owner': sees every branch; acts on the main branch, or another one after Take over.
 * role 'branch': a branch account; sees and acts on its own branch only.
 */
function merchantCtx() {
  const s = demo.get('merchantSession', null);
  if (!s) throw Object.assign(new Error('Sign in first'), { status: 401 });
  if (s.branchId) {
    const b = findBranch(s.branchId);
    if (!b || b.account.status !== 'active') {
      demo.set('merchantSession', null);
      throw Object.assign(new Error('Sign in first'), { status: 401 });
    }
    return { role: 'branch', branch: b, canAct: true, session: s };
  }
  const all = branches();
  const b = all.find((x) => x.id === s.viewing) || all[0];
  return { role: 'owner', branch: b, canAct: Boolean(b.main || s.takeover === b.id), session: s };
}
const ownerCtx = () => {
  const ctx = merchantCtx();
  if (ctx.role !== 'owner') throw forbidden('Only the shop owner can do that.');
  return ctx;
};

/**
 * Merchant sign-in with a mobile number OR an email, plus password: the owner, or a branch account.
 * DEMO: the demo merchant (DEMO_ACCOUNTS.merchant) and the SAMPLE branch accounts (DEMO_BRANCHES) need their
 * password; a branch added in this browser takes any password (passwords are never stored here).
 * Backend: check the password on the server; the session says owner or which branch.
 * @returns {Promise<{shopId:string, branchId?:string}>}  throws { status: 401 } when they don't match
 */
export async function merchantSignIn({ login, password }) {
  if (!login || !password) throw Object.assign(new Error('Enter your mobile number or email, and your password.'), { status: 400 });
  await wait(700);
  const m = DEMO_ACCOUNTS.merchant;
  const matches = (who) => (login.includes('@') ? sameEmail(who, login) : samePhone(who, login));
  if (matches(login.includes('@') ? m.email : m.phone)) {
    if (password !== m.password) throw Object.assign(new Error('Wrong password. Try again.'), { status: 401 });
    if (accountOff('demo-merchant')) throw turnedOff();
    endSessions('merchant');
    demo.set('merchantSession', { shopId: m.shop.id, at: Date.now() });
    return { shopId: m.shop.id };
  }
  const b = branches().find((x) => !x.main && matches(x.manager.login));
  if (!b) throw Object.assign(new Error('No merchant account uses that mobile number or email.'), { status: 401 });
  if (b.account.status === 'disabled') throw forbidden('This branch account is turned off. Ask the shop owner to turn it back on.');
  const sample = DEMO_BRANCHES.find((x) => x.id === b.id);
  if (sample && password !== sample.password) throw Object.assign(new Error('Wrong password. Try again.'), { status: 401 });
  if (accountOff('demo-merchant')) throw turnedOff();
  endSessions('merchant');
  demo.set('merchantSession', { shopId: m.shop.id, branchId: b.id, at: Date.now() });
  return { shopId: m.shop.id, branchId: b.id };
}

export async function merchantSignOut() {
  demo.set('merchantSession', null);
}

const loginTaken = (login, exceptId) => {
  const people = [...Object.values(DEMO_ACCOUNTS).flatMap((a) => [a.email, a.phone]), ...branches().filter((b) => b.id !== exceptId).map((b) => b.manager.login)];
  return people.some((p) => (login.includes('@') ? sameEmail(p, login) : samePhone(p, login)));
};
function cleanManager({ managerName, managerLogin }, exceptId) {
  const name = cleanText(managerName, 60, 'manager’s name', true);
  const login = String(managerLogin || '').trim();
  if (!(login.includes('@') ? EMAIL_RE.test(login) : PH_MOBILE.test(login.replace(/[\s-]/g, '')))) {
    throw bad('Enter the manager’s mobile number (like 0917 123 4567) or email.');
  }
  if (loginTaken(login, exceptId)) throw Object.assign(new Error('That mobile number or email already has a mysabak account.'), { status: 409 });
  return { name, login };
}

/* ---------- Owner: branches ---------- */

const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;
const hoursText = (opens, closes) => {
  const t = (hhmm) => {
    const [h, m] = hhmm.split(':').map(Number);
    return `${((h + 11) % 12) + 1}:${String(m).padStart(2, '0')} ${h < 12 ? 'AM' : 'PM'}`;
  };
  return `${t(opens)} – ${t(closes)}`;
};

/**
 * Add a branch. Its manager signs in on Merchant sign in with the mobile number or email the owner enters. Owner only.
 * DEMO: kept in this browser; the manager signs in with any password. Backend: send them a sign-in link by SMS or email.
 * @param {{name, areaId, street, opensAt, closesAt, phone, managerName, managerLogin}} input
 * @returns {Promise<{branch:object}>}
 */
export async function addBranch(input) {
  ownerCtx();
  const name = cleanText(input.name, 40, 'branch name', true);
  if (branches().some((b) => b.name.toLowerCase() === name.toLowerCase())) throw Object.assign(new Error('You already have a branch with that name.'), { status: 409 });
  const area = BRANCH_AREAS.find((a) => a.id === input.areaId);
  if (!area) throw bad('Pick where the branch is.');
  const street = cleanText(input.street, 80, 'street address', true);
  if (!TIME.test(input.opensAt || '') || !TIME.test(input.closesAt || '')) throw bad('Enter the opening and closing times.');
  if (input.closesAt <= input.opensAt) throw bad('Closing time must be after opening time.');
  const phone = String(input.phone || '').trim();
  if (!PH_MOBILE.test(phone.replace(/[\s-]/g, ''))) throw bad('Enter the branch’s mobile number, like 0917 123 4567.');
  const manager = cleanManager(input);
  const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 20) || 'branch';
  const branch = {
    id: `${MAIN_ID()}-${slug}-${Math.random().toString(36).slice(2, 6)}`, name, area: area.name,
    address: `${street}, ${area.name}`, phone, lng: area.lng, lat: area.lat,
    opensAt: input.opensAt, closesAt: input.closesAt, hours: hoursText(input.opensAt, input.closesAt),
    manager, account: { status: 'active' }, addedAt: Date.now(),
  };
  if (!demo.set('branchesAdded', [...demo.get('branchesAdded', []), branch])) throw Object.assign(new Error('Couldn’t save the branch.'), { status: 507 });
  return { branch };
}

/** Give a branch a new manager: they sign in with their own mobile number or email; the old manager no longer can. Owner only. */
export async function changeBranchManager(branchId, input) {
  ownerCtx();
  const b = findBranch(branchId);
  if (!b || b.main) throw Object.assign(new Error('Branch not found'), { status: 404 });
  const manager = cleanManager(input, b.id);
  changeBranch(b.id, { manager });
  return { manager };
}

/** Turn a branch account off (it can't sign in, customers can't order from it) or back on. Owner only. */
export async function setBranchAccount(branchId, status) {
  ownerCtx();
  const b = findBranch(branchId);
  if (!b || b.main) throw Object.assign(new Error('Branch not found'), { status: 404 });
  if (!['active', 'disabled'].includes(status)) throw bad('Unknown status');
  changeBranch(b.id, { account: { status } });
  return { status };
}

/** Owner: look at another branch (view only until Take over), or back at the main branch (null). */
export async function viewBranch(branchId) {
  const { session } = ownerCtx();
  if (branchId && !findBranch(branchId)) throw Object.assign(new Error('Branch not found'), { status: 404 });
  demo.set('merchantSession', { ...session, viewing: branchId || null, takeover: null });
}

/** Owner: take over the branch being viewed (act on its orders, switch and sold-out items), or stop. */
export async function takeOverBranch(on) {
  const { session, branch } = ownerCtx();
  demo.set('merchantSession', { ...session, takeover: on && !branch.main ? branch.id : null });
}

/* ---------- Dashboard ---------- */

/** Order statuses a merchant moves through, and the buttons for each. */
export const MERCHANT_ACTIONS = {
  placed: [{ id: 'accept', label: 'Accept', to: 'accepted' }, { id: 'decline', label: 'Decline', to: 'cancelled' }],
  accepted: [{ id: 'preparing', label: 'Start preparing', to: 'preparing' }],
  preparing: [{ id: 'ready', label: 'Ready for pickup', to: 'ready' }],
};

/** DEMO: a branch's SAMPLE orders, made once per browser and then kept (so Accept etc. stick). */
function sampleOrders(branchId) {
  const main = branchId === MAIN_ID();
  const key = main ? 'merchantSampleOrders' : 'branchSampleOrders';
  const all = main ? { [branchId]: demo.get(key, null) } : demo.get(key, {});
  if (!all[branchId]) {
    const source = main ? DEMO_MERCHANT_ORDERS : DEMO_BRANCH_ORDERS[branchId];
    if (!source) return [];
    const now = Date.now();
    all[branchId] = source.map(({ minutesAgo, lines, ...o }) => ({
      ...o,
      shop: { id: branchId, name: DEMO_ACCOUNTS.merchant.shop.name },
      lines: lines.map((l) => ({ options: [], ...l, note: '' })),
      subtotal: lines.reduce((n, l) => n + l.price * l.qty, 0),
      placedAt: now - minutesAgo * 60000,
      demo: true,
    }));
    demo.set(key, main ? all[branchId] : all);
  }
  return all[branchId];
}
/** A branch's orders: the ones customers placed in this browser and its SAMPLE ones, newest first. */
const ordersOf = (branchId) => [
  ...demo.get('orders', []).filter((o) => o.shop.id === branchId),
  ...demo.get('posSales', []).filter((o) => o.shop.id === branchId), // counter sales (channel 'counter')
  ...sampleOrders(branchId),
]
  .sort((a, b) => b.placedAt - a.placedAt);
const midnight = (daysAgo = 0) => { const d = new Date(); d.setHours(0, 0, 0, 0); d.setDate(d.getDate() - daysAgo); return d.getTime(); };
const todayOf = (orders) => orders.filter((o) => o.placedAt >= midnight());
const salesOf = (orders) => orders.filter((o) => o.status !== 'cancelled').reduce((n, o) => n + o.subtotal, 0);

/**
 * Sales of a branch on a past day (1 = yesterday), before the orders this browser placed.
 * DEMO: SAMPLE numbers. The main branch's last week is DEMO_MERCHANT_WEEK; older days and SAMPLE branches follow a
 * fixed made-up pattern; branches added in this browser have no history. Backend: real daily totals.
 */
function pastSales(b, daysAgo) {
  if (b.main && daysAgo < 7) return DEMO_MERCHANT_WEEK[6 - daysAgo];
  if (!b.scale) return 0;
  const d = new Date(midnight(daysAgo));
  const n = d.getDate() * 7 + d.getMonth() * 13 + d.getDay() * 29;
  return Math.round(((1600 + (n % 23) * 95) * b.scale) / 5) * 5;
}
/** Sales of a branch on a day: SAMPLE history plus the orders placed then. */
const daySales = (b, daysAgo) => (daysAgo ? pastSales(b, daysAgo) : 0)
  + salesOf(ordersOf(b.id).filter((o) => o.placedAt >= midnight(daysAgo) && o.placedAt < midnight(daysAgo - 1)));
/** The branch's usual sales for a whole day: the average of the last 7 days (0 when it has no history). */
const usualSales = (b) => Math.round([1, 2, 3, 4, 5, 6, 7].reduce((n, d) => n + daySales(b, d), 0) / 7);

/**
 * Everything the merchant dashboard shows, for the branch on screen. 401 if not signed in.
 * The owner sees the main branch (or the one they're viewing) and every branch's status; a branch account sees
 * its own branch only. `canAct` is false while the owner only views another branch.
 * DEMO: switches and sold-out items are kept in this browser; orders are SAMPLE ones (`demo: true`) plus any
 * placed for the branch in this browser. `week` is sales per day for the last 7 days, oldest first, ending today.
 * @returns {Promise<{name:string, role:'owner'|'branch', canAct:boolean, takeover:boolean, branch:object,
 *   branches:Array<object>|null, shop:object, open:boolean, available:Object<string, boolean>, orders:Array<object>,
 *   counter:Array<object> (today's counter sales; `orders` are the online ones),
 *   today:{orders:number, sales:number}, week:number[], usual:number}>}
 */
export async function merchantHome() {
  const ctx = merchantCtx();
  const b = ctx.branch;
  const settings = branchSettings(b.id);
  const shop = brandShop();
  const all = ordersOf(b.id);
  const orders = all.filter((o) => o.channel !== 'counter');
  const today = todayOf(all).filter((o) => o.status !== 'cancelled');
  const sales = salesOf(today);
  const status = (x) => {
    const o = todayOf(ordersOf(x.id)).filter((y) => y.status !== 'cancelled');
    return {
      id: x.id, name: x.name, area: x.area, address: x.address, hours: x.hours, phone: x.phone, main: Boolean(x.main), sample: Boolean(x.sample),
      manager: x.manager, account: x.account, open: branchSettings(x.id).open !== false, todayOrders: o.length, todaySales: salesOf(o),
    };
  };
  return {
    name: ctx.role === 'owner' ? DEMO_ACCOUNTS.merchant.name : b.manager.name,
    role: ctx.role,
    canAct: ctx.canAct,
    takeover: ctx.role === 'owner' && !b.main && ctx.canAct,
    branch: status(b),
    branches: ctx.role === 'owner' ? branches().map(status) : null,
    shop: { ...shop, area: b.area, address: b.address, hours: b.hours, opensAt: b.opensAt, closesAt: b.closesAt },
    open: settings.open !== false,
    available: Object.fromEntries(shop.menu.map((i) => [i.id, settings.available[i.id] !== false])),
    orders,
    counter: todayOf(all).filter((o) => o.channel === 'counter'),
    today: { orders: today.length, sales },
    week: [6, 5, 4, 3, 2, 1, 0].map((d) => daySales(b, d)),
    usual: usualSales(b),
  };
}

/**
 * Sales for the analytics page: one branch or all of them ('all', owner only), for today, the last 7 days or this
 * month. A branch account always gets its own branch.
 * DEMO: days before today are SAMPLE numbers (`sampleHistory`), with orders and cancellations estimated from them;
 * today, the top items and the cancelled list come from the orders in this browser.
 * @param {{range:'day'|'week'|'month', branchId?:string}} q
 * @returns {Promise<{range, branchId, branches:Array<{id,name}>|null, total, previous, orders, average, cancelled,
 *   cancelledAmount, series:Array<{label:string, value:number, now?:boolean}>, top:Array<{name, qty, sales}>,
 *   (previous: the period before (for 'day', yesterday up to the same hour; for 'month', the same days of last month);
 *   compare: the period before as a running total, one value per point of series)
 *   cancelledList:Array<{id, customer, amount, at}>, channels:{online, counter}, sampleHistory:boolean}>}
 *   channels: sales of the orders in this browser, online vs counter (POS)
 */
export async function merchantSales({ range = 'day', branchId = 'all' } = {}) {
  const ctx = merchantCtx();
  if (!['day', 'week', 'month'].includes(range)) throw bad('Unknown range');
  const all = branches();
  let picked;
  if (ctx.role === 'branch') picked = [ctx.branch];
  else picked = branchId === 'all' ? all : all.filter((b) => b.id === branchId);
  if (!picked.length) throw Object.assign(new Error('Branch not found'), { status: 404 });
  const sum = (daysAgo) => picked.reduce((n, b) => n + daySales(b, daysAgo), 0);
  const today = new Date();
  const days = range === 'day' ? 1 : range === 'week' ? 7 : today.getDate();
  const orders = picked.flatMap((b) => ordersOf(b.id));
  const inRange = orders.filter((o) => o.placedAt >= midnight(days - 1));
  const open = Math.min(...picked.map((b) => Number(b.opensAt.slice(0, 2))));
  const close = Math.max(...picked.map((b) => Number(b.closesAt.slice(0, 2))));
  let series;
  if (range === 'day') {
    series = [];
    for (let h = open; h < close; h += 1) {
      const value = salesOf(inRange.filter((o) => new Date(o.placedAt).getHours() === h));
      series.push({ label: `${((h + 11) % 12) + 1}${h < 12 ? 'a' : 'p'}`, value, now: h === today.getHours() });
    }
  } else {
    series = Array.from({ length: days }, (_, i) => {
      const daysAgo = days - 1 - i;
      const d = new Date(midnight(daysAgo));
      const label = range === 'week' ? (daysAgo ? d.toLocaleDateString('en-PH', { weekday: 'short' }) : 'Today') : String(d.getDate());
      return { label, value: sum(daysAgo), now: daysAgo === 0 };
    });
  }
  let total = 0;
  for (let d = 0; d < days; d += 1) total += sum(d);
  // The period before, oldest day first: yesterday; the 7 days before; the same days of last month
  const lastMonthDays = new Date(today.getFullYear(), today.getMonth(), 0).getDate();
  const before = range === 'month'
    ? Array.from({ length: Math.min(days, lastMonthDays) }, (_, k) => days + lastMonthDays - (k + 1))
    : Array.from({ length: days }, (_, k) => days * 2 - 1 - k);
  const beforeSales = before.map(sum);
  let previous = beforeSales.reduce((n, v) => n + v, 0);
  // The chart's dashed line: the period before as a running total, one point per point of `series`.
  // Today's hours: yesterday's day spread evenly over the hours (no hour-by-hour history yet).
  let run = 0;
  const compare = range === 'day'
    ? series.map((_, i) => Math.round((previous * (i + 1)) / series.length))
    : series.map((_, i) => (run += beforeSales[i] || 0));
  // Today is compared with yesterday up to this hour, not with all of yesterday
  if (range === 'day') previous = Math.round(previous * Math.min(1, Math.max(0, (today.getHours() + today.getMinutes() / 60 - open) / (close - open))));
  const pastTotal = total - salesOf(inRange);
  const pastOrders = Math.round(pastTotal / 95); // SAMPLE: about ₱95 an order
  const real = inRange.filter((o) => o.status !== 'cancelled');
  const cancelledReal = inRange.filter((o) => o.status === 'cancelled');
  const count = real.length + pastOrders;
  const top = new Map();
  real.forEach((o) => o.lines.forEach((l) => {
    const t = top.get(l.name) || { name: l.name, qty: 0, sales: 0 };
    t.qty += l.qty; t.sales += l.price * l.qty;
    top.set(l.name, t);
  }));
  return {
    range,
    branchId: ctx.role === 'branch' ? ctx.branch.id : branchId,
    branches: ctx.role === 'owner' ? all.map(({ id, name }) => ({ id, name })) : null,
    total, previous,
    orders: count,
    average: count ? Math.round(total / count) : 0,
    cancelled: cancelledReal.length + Math.round(pastOrders * 0.03),
    cancelledAmount: cancelledReal.reduce((n, o) => n + o.subtotal, 0) + Math.round(pastOrders * 0.03) * 95,
    series,
    compare,
    top: [...top.values()].sort((a, b) => b.sales - a.sales).slice(0, 5),
    cancelledList: cancelledReal.map((o) => ({ id: o.id, customer: o.customer || 'Customer', amount: o.subtotal, at: o.placedAt })),
    channels: { online: salesOf(real.filter((o) => o.channel !== 'counter')), counter: salesOf(real.filter((o) => o.channel === 'counter')) },
    sampleHistory: range !== 'day',
  };
}

/**
 * POS: ring up a counter (walk-in) sale at the branch on screen. Lines are priced from the menu like online
 * orders; sold-out items are refused. Cash needs the amount received (the change is worked out); GCash is
 * paid in full. The sale counts in the dashboard and analytics, but not in the online order columns.
 * DEMO: kept in this browser; no drawer or printer. Backend: e.g. POST /api/merchant/pos/sales
 * @param {{items:Array<{id:string, qty:number, picks?:object}>, payment:'cash'|'gcash', cash?:number}} sale
 * @returns {Promise<{id, lines, subtotal, payment, cash:number|null, change:number|null, placedAt:number}>}
 */
export async function posSale({ items, payment, cash } = {}) {
  const ctx = merchantCtx();
  if (!ctx.canAct) throw forbidden(VIEW_ONLY);
  const shop = branchShop(ctx.branch);
  const byId = new Map(shop.menu.map((m) => [m.id, m]));
  const lines = (items || []).filter((l) => byId.has(l.id) && l.qty > 0).map((l) => {
    const item = byId.get(l.id);
    if (item.soldOut) throw Object.assign(new Error(`${item.name} is sold out. Remove it to finish the sale.`), { status: 409 });
    const picks = cleanPicks(item, l.picks);
    return { id: l.id, name: item.name, price: unitPrice(item, picks), qty: Math.min(Math.round(l.qty), 99), picks, options: pickLabels(item, picks), note: '' };
  });
  if (!lines.length) throw bad('Add something to the sale first.');
  const subtotal = lines.reduce((n, l) => n + l.price * l.qty, 0);
  if (!['cash', 'gcash'].includes(payment)) throw bad('Pick how the customer pays.');
  const received = payment === 'cash' ? Number(cash) : null;
  if (payment === 'cash' && (!Number.isFinite(received) || received < subtotal)) throw bad('The cash received is less than the total.');
  const sale = {
    id: demo.id('POS').toUpperCase(), channel: 'counter', customer: 'Walk-in',
    shop: { id: ctx.branch.id, name: shop.name }, lines, subtotal, payment,
    cash: received, change: received === null ? null : Math.round((received - subtotal) * 100) / 100,
    status: 'completed', placedAt: Date.now(),
  };
  if (!demo.set('posSales', [sale, ...demo.get('posSales', [])].slice(0, 300))) throw Object.assign(new Error('Couldn’t save the sale.'), { status: 507 });
  return sale;
}

/** Open or close the branch on screen for orders. */
export async function setShopOpen(open) {
  const ctx = merchantCtx();
  if (!ctx.canAct) throw forbidden(VIEW_ONLY);
  saveBranchSettings(ctx.branch.id, { ...branchSettings(ctx.branch.id), open: Boolean(open) });
  return { open: Boolean(open) };
}

/** Mark a menu item available or sold out at the branch on screen. */
export async function setItemAvailable(itemId, available) {
  const ctx = merchantCtx();
  if (!ctx.canAct) throw forbidden(VIEW_ONLY);
  const settings = branchSettings(ctx.branch.id);
  saveBranchSettings(ctx.branch.id, { ...settings, available: { ...settings.available, [itemId]: Boolean(available) } });
  return { ok: true };
}

const bad = (msg) => Object.assign(new Error(msg), { status: 400 });
/** A photo is a URL (http(s) or this site) or, before it is uploaded, a JPEG/PNG/WebP data URL. */
const isPhoto = (s) => /^(https:\/\/|\/(?!\/)|data:image\/(jpeg|png|webp);base64,)/.test(String(s));
const cleanText = (s, max, label, required) => {
  const t = String(s ?? '').trim();
  if (required && !t) throw bad(`Enter a ${label}.`);
  if (t.length > max) throw bad(`Keep the ${label} under ${max} characters.`);
  return t;
};
/** DEMO: keep the merchant's edits; a full browser storage (big photos) is an error, not a silent loss. */
function saveEdits(edits) {
  if (!demo.set('merchantEdits', edits)) throw Object.assign(new Error('Couldn’t save. Try a smaller photo.'), { status: 413 });
}

/**
 * Change the shop's photo, name or short description (`about`), for every branch. Only the fields given change.
 * Owner only. DEMO: kept in this browser. BACKEND: upload the photo (a data URL here) and store its URL in `image`.
 * @returns {Promise<object>} the shop as `merchantHome().shop` shows it
 */
export async function updateShop({ name, about, image } = {}) {
  ownerCtx();
  const edits = demo.get('merchantEdits', { shop: {}, items: {} });
  const next = { ...edits.shop };
  if (name !== undefined) next.name = cleanText(name, 60, 'shop name', true);
  if (about !== undefined) next.about = cleanText(about, 200, 'description');
  if (image !== undefined) {
    if (!isPhoto(image)) throw bad('That photo can’t be used. Pick a JPEG, PNG or WebP picture.');
    next.image = image;
  }
  saveEdits({ ...edits, shop: next });
  return (await merchantHome()).shop;
}

/**
 * Change a menu item's photo, name, description (`note`), price or section, for every branch. Only the fields given
 * change. `price` is the base price in whole pesos; variant prices stay added on top of it. Owner only.
 * DEMO: kept in this browser. BACKEND: upload the photo and store its URL in `image`.
 * @returns {Promise<object>} the item as `merchantHome().shop.menu` shows it
 */
export async function updateItem(itemId, { name, note, price, section, image } = {}) {
  ownerCtx();
  if (!DEMO_ACCOUNTS.merchant.shop.menu.some((i) => i.id === itemId)) throw Object.assign(new Error('Item not found'), { status: 404 });
  const edits = demo.get('merchantEdits', { shop: {}, items: {} });
  const next = { ...edits.items[itemId] };
  if (name !== undefined) next.name = cleanText(name, 60, 'name', true);
  if (note !== undefined) next.note = cleanText(note, 200, 'description');
  if (section !== undefined) next.section = cleanText(section, 30, 'section', true);
  if (price !== undefined) {
    const p = Number(price);
    if (!Number.isInteger(p) || p < 1 || p > 100000) throw bad('Enter a price in whole pesos, from ₱1.');
    next.price = p;
  }
  if (image !== undefined) {
    if (!isPhoto(image)) throw bad('That photo can’t be used. Pick a JPEG, PNG or WebP picture.');
    next.image = image;
  }
  saveEdits({ ...edits, items: { ...edits.items, [itemId]: next } });
  return (await merchantHome()).shop.menu.find((i) => i.id === itemId);
}

/** Move an order of the branch on screen along (Accept, Decline, Start preparing, Ready for pickup). */
export async function updateMerchantOrder(orderId, actionId) {
  const ctx = merchantCtx();
  const id = ctx.branch.id;
  const inSample = sampleOrders(id).some((o) => o.id === orderId);
  if (!inSample && !demo.get('orders', []).some((o) => o.id === orderId && o.shop.id === id)) throw Object.assign(new Error('Order not found'), { status: 404 });
  if (!ctx.canAct) throw forbidden(VIEW_ONLY);
  const main = id === MAIN_ID();
  const key = !inSample ? 'orders' : main ? 'merchantSampleOrders' : 'branchSampleOrders';
  const stored = demo.get(key, []);
  const orders = inSample && !main ? stored[id] : stored;
  const order = orders.find((o) => o.id === orderId);
  const action = (MERCHANT_ACTIONS[order.status] || []).find((a) => a.id === actionId);
  if (!action) throw Object.assign(new Error('That step isn’t possible now.'), { status: 409 });
  order.status = action.to;
  demo.set(key, stored);
  return { status: order.status };
}

/* =========================================================
   Shop (Stage 1: ordering + delivery; no POS)
   ========================================================= */

/**
 * Shops near a point, nearest first.
 * DEMO: sample shops from demo-data.js.
 * @returns {Promise<{categories:Array<{id,name}>, shops:Array<{id, name, sign, category, area, address, phone,
 *   lng, lat, hours, opensAt, closesAt, color, tint, rating, image, about, items:number, km:number|null}>}>}
 */
export async function listShops({ near, category = 'all', q = '' } = {}) {
  const text = q.trim().toLowerCase();
  // The demo merchant's shop is listed once, as its nearest branch that is taking orders
  const live = liveBranches().map((b) => ({ ...b, accepting: branchSettings(b.id).open !== false }));
  const shops = [...SHOPS, branchShop(nearestBranch(live, near))]
    .filter((s) => category === 'all' || s.category === category)
    .filter((s) => !text || [s.name, s.area, SHOP_CATEGORIES.find((c) => c.id === s.category)?.name || ''].some((t) => t.toLowerCase().includes(text)) || s.menu.some((m) => m.name.toLowerCase().includes(text)))
    .map(({ menu, ...s }) => ({ ...s, items: menu.filter((m) => !m.bundle).length, km: near ? haversineKm(near, s) : null }))
    .sort((a, b) => (a.km ?? 0) - (b.km ?? 0));
  return { categories: SHOP_CATEGORIES, shops };
}

/**
 * One shop and its menu. Menu items keep the order to show them in; `section` groups them.
 * @returns {Promise<{id, name, sign, category, area, address, phone, lng, lat, hours, opensAt, closesAt,
 *   color, tint, rating, image, about,
 *   menu:Array<{id, name, note, price:number, section, tag?, bundle?, image:string|null, art?, options:Array}>}>}
 *   options: [{id, name, type:'one'|'many', required, max?, choices:[{name, price, hint?}], showIf?}] (see menu.js)
 *   A shop with branches also has brand (its main id), branch {id, name}, branches [{id, name, area}], accepting
 *   (its Accept orders switch) and soldOut on its menu items.
 */
export async function shopMenu(shopId) {
  const branch = liveBranches().find((b) => b.id === shopId);
  const shop = SHOPS.find((s) => s.id === shopId) || (branch && branchShop(branch));
  if (!shop) throw Object.assign(new Error('Shop not found'), { status: 404 });
  return shop;
}

/**
 * Delivery fee from a shop to an address (100% to the rider).
 * DEMO: straight-line distance × CONFIG.delivery rates (null rates → fee null → ₱[AMOUNT]).
 * @returns {Promise<{km:number, fee:number|null}>}
 */
export async function deliveryQuote(shopId, address) {
  const shop = await shopMenu(shopId);
  const km = haversineKm(shop, address) * 1.3; // roads are longer than a straight line
  const fee = rateFor(CONFIG.delivery, km);
  return { km, fee: fee === null ? null : Math.round(fee) };
}

/**
 * Place a shop order. Items go to the shop, the delivery fee to the rider.
 * The server prices every line from its own menu (base price + picked options); the browser's prices are ignored.
 * DEMO: saved in this browser with status 'placed'; no shop or rider is told.
 * @param {{shopId, items:Array<{id, qty, picks?, note?}>, address:{lng,lat,label}, notes:string, payment:string}} order
 * @returns {Promise<{id:string}>}
 */
export async function placeOrder(order) {
  const shop = await shopMenu(order.shopId);
  if (shop.accepting === false) throw Object.assign(new Error('This branch isn’t taking orders right now. Try another branch.'), { status: 409 });
  const byId = new Map(shop.menu.map((m) => [m.id, m]));
  const lines = (order.items || []).filter((l) => byId.has(l.id) && l.qty > 0).map((l) => {
    const item = byId.get(l.id);
    if (item.soldOut) throw Object.assign(new Error(`${item.name} is sold out at this branch. Remove it to order.`), { status: 409 });
    const picks = cleanPicks(item, l.picks);
    return {
      id: l.id, name: item.name, price: unitPrice(item, picks), qty: Math.min(Math.round(l.qty), 99),
      picks, options: pickLabels(item, picks), note: String(l.note || '').trim().slice(0, 200),
    };
  });
  if (!lines.length) throw Object.assign(new Error('Your cart is empty.'), { status: 400 });
  const quote = await deliveryQuote(order.shopId, order.address);
  await wait(1000);
  const saved = {
    id: demo.id('SHOP'),
    shop: { id: shop.id, name: shop.name, area: shop.area, ...(shop.branch ? { branch: shop.branch.name } : {}) },
    lines,
    subtotal: lines.reduce((n, l) => n + l.price * l.qty, 0),
    deliveryFee: quote.fee,
    address: order.address,
    notes: order.notes || '',
    payment: order.payment,
    status: 'placed',
    placedAt: Date.now(),
  };
  demo.set('orders', [saved, ...demo.get('orders', [])].slice(0, 20));
  return { id: saved.id };
}

/** Order statuses in order. */
export const ORDER_STEPS = [
  { id: 'placed', name: 'Order placed' },
  { id: 'accepted', name: 'Shop accepted' },
  { id: 'preparing', name: 'Preparing' },
  { id: 'ready', name: 'Ready for pickup' },
  { id: 'picked_up', name: 'Rider picked up' },
  { id: 'delivered', name: 'Delivered' },
];

/**
 * A shop order and where it is.
 * DEMO: a sample shop's order moves along by itself (demoOrder); the demo merchant's moves when the merchant acts.
 * @returns {Promise<{id, shop, lines, subtotal, deliveryFee:number|null, address, notes, payment,
 *   status:'placed'|'accepted'|'preparing'|'ready'|'picked_up'|'delivered'|'cancelled', placedAt:number,
 *   rider?:{lng:number, lat:number}}>}  rider: where the rider is, while it's on the way (picked_up)
 */
export async function orderStatus(orderId) {
  const order = demo.get('orders', []).find((o) => o.id === orderId);
  if (!order) throw Object.assign(new Error('Order not found'), { status: 404 });
  return demoOrder(order);
}

/** The signed-in user's shop orders, newest first. DEMO: this browser's. */
export async function myOrders() {
  return demo.get('orders', []).map(demoOrder);
}

// DEMO: no real shop or rider works a sample shop's order, so it moves along with time since it was placed
// (the demo merchant's own branches move theirs from the merchant pages, so those are left as stored)
const DEMO_ORDER_TIMES = [['accepted', 20e3], ['preparing', 40e3], ['ready', 150e3], ['picked_up', 180e3], ['delivered', 360e3]];
function demoOrder(o) {
  const shop = SHOPS.find((s) => s.id === o.shop.id);
  if (o.status !== 'placed' || !shop) return o;
  const age = Date.now() - o.placedAt;
  const reached = DEMO_ORDER_TIMES.filter(([, ms]) => age >= ms).pop();
  if (!reached) return o;
  if (reached[0] !== 'picked_up' || !o.address) return { ...o, status: reached[0] };
  // On the way: the rider rides the order's road route (orderRoute), or a straight line, picked up → delivered
  const path = demo.get('orderRoutes', {})[o.id] || [[shop.lng, shop.lat], [o.address.lng, o.address.lat]];
  return { ...o, status: 'picked_up', rider: pointAlong(path, (age - 180e3) / (360e3 - 180e3)) };
}

/**
 * The road route of a shop order, shop → drop-off ([lng, lat] pairs). A straight line if routing fails or takes over 3 s.
 * DEMO: worked out once and kept in this browser (last 20), so the demo rider rides it.
 * @returns {Promise<Array<[number, number]>>}
 */
export async function orderRoute(order) {
  const saved = demo.get('orderRoutes', {});
  if (saved[order.id]) return saved[order.id];
  const shop = await shopMenu(order.shop.id);
  const to = order.address;
  const road = await Promise.race([routeBetween(shop, to), wait(3000).then(() => { throw new Error('slow'); })])
    .then((r) => r.coords).catch(() => []);
  if (road.length < 2) return straightLine(shop, to).coords;
  const coords = [[shop.lng, shop.lat], ...road, [to.lng, to.lat]];
  demo.set('orderRoutes', { ...Object.fromEntries(Object.entries(saved).slice(-19)), [order.id]: coords });
  return coords;
}
