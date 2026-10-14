/* =========================================================
   mysabak · data layer (every call to a server lives here)

   BACKEND: this is the file to replace. Keep the exported function names
   and the shapes they return (documented above each one, and in PANELS.md);
   nothing else in the app talks to a server.

   Today the demo calls TomTom through /api/tomtom/… (assets/dev/worker.js on
   Cloudflare, or serve.py locally), which adds the API key server-side.
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
 * Driving route between two points.
 * @returns {Promise<{coords:Array<[number,number]>, distanceKm:number, minutes:number,
 *   eta:{[vehicleId:string]: number|null}, approx:false}>}
 *   coords: [lng, lat] pairs for the line on the map. eta: minutes until a driver arrives, per vehicle.
 */
export async function routeBetween(from, to) {
  const url = tomtomUrl(`/routing/1/calculateRoute/${from.lat},${from.lng}:${to.lat},${to.lng}/json`, {
    travelMode: 'car',
    routeType: 'fastest',
    traffic: 'true',
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
    try { localStorage.setItem(`mysabak.demo.${key}`, JSON.stringify(value)); } catch (_) { /* storage off */ }
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
  demo.set('lastBooking', { id, ...booking, price: { ...booking.price, tip }, at: Date.now() });
  if (tip) {
    const record = { id: demo.id('TIP'), orderId: id, orderType: booking.kind, amount: tip, method: booking.payment, at: Date.now() };
    demo.set('tips', [record, ...demo.get('tips', [])].slice(0, 50));
  }
  return { id, demo: true };
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
  await wait(3200);
  if ((demo.get('cancelled', []) || []).includes(bookingId)) throw Object.assign(new Error('Cancelled'), { status: 499 });
  const d = DEMO_DRIVERS[booking.vehicle] || DEMO_DRIVERS.sedan;
  return { id: `DRV-${booking.vehicle}`, name: d.name, rating: d.rating, trips: d.trips, phone: null, photo: null,
    vehicle: { type: booking.vehicle, ...d.vehicle }, demo: true };
}

/** Cancel a booking (while searching, or before pickup). DEMO: remembered in this browser. */
export async function cancelRide(bookingId) {
  demo.set('cancelled', [bookingId, ...demo.get('cancelled', [])].slice(0, 20));
  return { ok: true };
}

/**
 * Follow a booking once a driver accepted: where the driver is and what's happening.
 * Calls onUpdate({ status, driver:{lng,lat}, etaMinutes }) whenever it changes.
 * status: 'arriving' → 'arrived' → 'on_trip' → 'completed' (or 'cancelled').
 * Backend: push these from your realtime channel (WebSocket, SSE, Firebase…).
 * DEMO: the driver drives the real roads to the pickup (TomTom route), waits, then follows the trip route;
 * about 25 seconds in all.
 * @returns {() => void}  call to stop listening
 */
export function onTripUpdate(bookingId, onUpdate) {
  const b = demo.get('lastBooking', null);
  if (!b || b.id !== bookingId) return () => {};
  const pickup = [b.pickup.lng, b.pickup.lat];
  const route = (b.trip && b.trip.coords && b.trip.coords.length > 1) ? b.trip.coords : [pickup, [b.dropoff.lng, b.dropoff.lat]];
  // The demo driver starts about 1 km away and drives the real roads to the pickup.
  const from = { lng: pickup[0] - 0.007, lat: pickup[1] + 0.005 };
  let stopped = false;
  let timer = 0;
  let phases = null;
  let started = 0;
  onUpdate({ status: 'arriving', driver: from, etaMinutes: null });

  const begin = (approach) => {
    if (stopped) return;
    const km = approach.distanceKm || 1;
    phases = [
      { status: 'arriving', path: approach.coords, ms: Math.min(12000, Math.max(6000, km * 6000)), eta: approach.minutes || 3 },
      { status: 'arrived', path: [pickup], ms: 2500, eta: 0 },
      { status: 'on_trip', path: route, ms: 14000, eta: (b.trip && b.trip.minutes) || null },
      { status: 'completed', path: [route[route.length - 1]], ms: 0, eta: 0 },
    ];
    started = Date.now();
    tick();
  };
  const tick = () => {
    if (stopped) return;
    let t = Date.now() - started;
    let i = 0;
    while (i < phases.length - 1 && t >= phases[i].ms) { t -= phases[i].ms; i++; }
    const ph = phases[i];
    const f = ph.ms ? t / ph.ms : 1;
    onUpdate({
      status: ph.status,
      driver: pointAlong(ph.path, f),
      etaMinutes: ph.eta === null ? null : Math.max(0, Math.ceil(ph.eta * (1 - f))),
    });
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
   ========================================================= */

/**
 * Who is signed in on this device, or null.
 * Backend: one "who am I" call on your session (e.g. GET /api/me).
 * @returns {Promise<null|{role:'client'|'driver'|'merchant', name:string, email:string|null}>}
 */
export async function currentUser() {
  const client = demo.get('clientSession', null);
  if (client) return { role: 'client', name: client.name, email: client.email || null };
  const merchant = demo.get('merchantSession', null);
  if (merchant) return { role: 'merchant', name: DEMO_ACCOUNTS.merchant.name, email: DEMO_ACCOUNTS.merchant.email, shop: DEMO_ACCOUNTS.merchant.shop.name };
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
 * Customer sign-in with a mobile number OR an email, plus password.
 * DEMO: only the demo customer (demo-data.js → DEMO_ACCOUNTS.client) exists; customer sign-up isn't built.
 * @returns {Promise<{name:string}>}  throws { status: 401 } when they don't match
 */
export async function clientSignIn({ login, password }) {
  if (!login || !password) throw Object.assign(new Error('Enter your mobile number or email, and your password.'), { status: 400 });
  await wait(700);
  const c = DEMO_ACCOUNTS.client;
  const isLogin = login.includes('@') ? sameEmail(c.email, login) : samePhone(c.phone, login);
  if (!isLogin) throw Object.assign(new Error('No customer account uses that mobile number or email.'), { status: 401 });
  if (password !== c.password) throw Object.assign(new Error('Wrong password. Try again.'), { status: 401 });
  endSessions('client');
  demo.set('clientSession', { name: c.name, email: c.email, phone: c.phone, at: Date.now() });
  return { name: c.name };
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
   Merchant (shop owners): sign in, open / close, orders, menu availability. No POS (Stage 2).
   ========================================================= */

/**
 * Merchant sign-in with a mobile number OR an email, plus password.
 * DEMO: only the demo merchant (demo-data.js → DEMO_ACCOUNTS.merchant) exists.
 * @returns {Promise<{shopId:string}>}  throws { status: 401 } when they don't match
 */
export async function merchantSignIn({ login, password }) {
  if (!login || !password) throw Object.assign(new Error('Enter your mobile number or email, and your password.'), { status: 400 });
  await wait(700);
  const m = DEMO_ACCOUNTS.merchant;
  const isLogin = login.includes('@') ? sameEmail(m.email, login) : samePhone(m.phone, login);
  if (!isLogin) throw Object.assign(new Error('No merchant account uses that mobile number or email.'), { status: 401 });
  if (password !== m.password) throw Object.assign(new Error('Wrong password. Try again.'), { status: 401 });
  endSessions('merchant');
  demo.set('merchantSession', { shopId: m.shop.id, at: Date.now() });
  return { shopId: m.shop.id };
}

export async function merchantSignOut() {
  demo.set('merchantSession', null);
}

/** Order statuses a merchant moves through, and the buttons for each. */
export const MERCHANT_ACTIONS = {
  placed: [{ id: 'accept', label: 'Accept', to: 'accepted' }, { id: 'decline', label: 'Decline', to: 'cancelled' }],
  accepted: [{ id: 'preparing', label: 'Start preparing', to: 'preparing' }],
  preparing: [{ id: 'ready', label: 'Ready for pickup', to: 'ready' }],
};

/**
 * Everything the merchant dashboard shows. 401 if not signed in.
 * DEMO: the shop's open/closed switch and item availability are kept in this browser; orders are a few SAMPLE
 * orders (demo-data.js → DEMO_MERCHANT_ORDERS, `demo: true`) plus any placed for this shop in this browser.
 * `week` is sales per day for the last 7 days, oldest first, ending with today (SAMPLE except today).
 * @returns {Promise<{name:string, shop:object, open:boolean, available:Object<string, boolean>,
 *   orders:Array<Order & {customer?:string}>, today:{orders:number, sales:number}, week:number[]}>}
 */
export async function merchantHome() {
  const session = demo.get('merchantSession', null);
  if (!session) throw Object.assign(new Error('Sign in first'), { status: 401 });
  const m = DEMO_ACCOUNTS.merchant;
  const settings = demo.get('merchant', { open: true, available: {} });
  const orders = [...demo.get('orders', []).filter((o) => o.shop.id === m.shop.id), ...sampleMerchantOrders()]
    .sort((a, b) => b.placedAt - a.placedAt);
  const midnight = new Date(); midnight.setHours(0, 0, 0, 0);
  const todays = orders.filter((o) => o.placedAt >= midnight.getTime() && o.status !== 'cancelled');
  const sales = todays.reduce((n, o) => n + o.subtotal, 0);
  return {
    name: m.name,
    shop: m.shop,
    open: settings.open !== false,
    available: Object.fromEntries(m.shop.menu.map((i) => [i.id, settings.available[i.id] !== false])),
    orders,
    today: { orders: todays.length, sales },
    week: DEMO_MERCHANT_WEEK.map((n, i, all) => (i === all.length - 1 ? sales : n)),
  };
}

/** DEMO: Demo Kitchen's sample orders, made once per browser and then kept (so Accept etc. stick). */
function sampleMerchantOrders() {
  let saved = demo.get('merchantOrders', null);
  if (!saved) {
    const now = Date.now();
    saved = DEMO_MERCHANT_ORDERS.map(({ minutesAgo, lines, ...o }) => ({
      ...o,
      shop: { id: DEMO_ACCOUNTS.merchant.shop.id, name: DEMO_ACCOUNTS.merchant.shop.name },
      lines: lines.map((l) => ({ ...l, options: [], note: '' })),
      subtotal: lines.reduce((n, l) => n + l.price * l.qty, 0),
      placedAt: now - minutesAgo * 60000,
      demo: true,
    }));
    demo.set('merchantOrders', saved);
  }
  return saved;
}

/** Open or close the shop for orders. */
export async function setShopOpen(open) {
  if (!demo.get('merchantSession', null)) throw Object.assign(new Error('Sign in first'), { status: 401 });
  const settings = demo.get('merchant', { open: true, available: {} });
  demo.set('merchant', { ...settings, open: Boolean(open) });
  return { open: Boolean(open) };
}

/** Mark a menu item available or sold out. */
export async function setItemAvailable(itemId, available) {
  if (!demo.get('merchantSession', null)) throw Object.assign(new Error('Sign in first'), { status: 401 });
  const settings = demo.get('merchant', { open: true, available: {} });
  demo.set('merchant', { ...settings, available: { ...settings.available, [itemId]: Boolean(available) } });
  return { ok: true };
}

/** Move an order along (Accept, Decline, Start preparing, Ready for pickup). */
export async function updateMerchantOrder(orderId, actionId) {
  if (!demo.get('merchantSession', null)) throw Object.assign(new Error('Sign in first'), { status: 401 });
  const key = sampleMerchantOrders().some((o) => o.id === orderId) ? 'merchantOrders' : 'orders';
  const orders = demo.get(key, []);
  const order = orders.find((o) => o.id === orderId);
  if (!order) throw Object.assign(new Error('Order not found'), { status: 404 });
  const action = (MERCHANT_ACTIONS[order.status] || []).find((a) => a.id === actionId);
  if (!action) throw Object.assign(new Error('That step isn’t possible now.'), { status: 409 });
  order.status = action.to;
  demo.set(key, orders);
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
  const shops = SHOPS
    .filter((s) => category === 'all' || s.category === category)
    .filter((s) => !text || [s.name, s.area].some((t) => t.toLowerCase().includes(text)) || s.menu.some((m) => m.name.toLowerCase().includes(text)))
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
 */
export async function shopMenu(shopId) {
  const shop = SHOPS.find((s) => s.id === shopId);
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
  const byId = new Map(shop.menu.map((m) => [m.id, m]));
  const lines = (order.items || []).filter((l) => byId.has(l.id) && l.qty > 0).map((l) => {
    const item = byId.get(l.id);
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
    shop: { id: shop.id, name: shop.name, area: shop.area },
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
 * DEMO: stays at 'placed' (no shop or rider updates it).
 * @returns {Promise<{id, shop, lines, subtotal, deliveryFee:number|null, address, notes, payment,
 *   status:'placed'|'accepted'|'preparing'|'ready'|'picked_up'|'delivered'|'cancelled', placedAt:number}>}
 */
export async function orderStatus(orderId) {
  const order = demo.get('orders', []).find((o) => o.id === orderId);
  if (!order) throw Object.assign(new Error('Order not found'), { status: 404 });
  return order;
}

/** The signed-in user's shop orders, newest first. DEMO: this browser's. */
export async function myOrders() {
  return demo.get('orders', []);
}
