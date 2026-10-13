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
import { SHOPS, SHOP_CATEGORIES } from './demo-data.js';
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
 * Send a booking (Ride or Express).
 * DEMO: waits 2.2 s and returns a booking id; no driver is dispatched.
 * Backend: create the order, dispatch it, and later tell the app the trip finished
 * (the app then shows the tip screen; see showTripDone() in app.js).
 * @param {{kind:'ride'|'express', vehicle:string, pickup:{lng,lat,label}, dropoff:{lng,lat,label},
 *   trip:object, payment:string, parcel?:{receiverName, receiverPhone, size, item, notes}}} booking
 * @returns {Promise<{id:string, demo:boolean}>}
 */
export async function bookRide(booking) {
  await wait(2200);
  const id = demo.id(booking.kind === 'express' ? 'EXP' : 'RIDE');
  demo.set('lastBooking', { id, ...booking, at: Date.now() });
  return { id, demo: true };
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
   Drive (driver side)
   ========================================================= */

const samePhone = (a, b) => {
  const norm = (p) => String(p || '').replace(/\D/g, '').replace(/^63/, '0');
  return norm(a) !== '' && norm(a) === norm(b);
};

const sameEmail = (a, b) => Boolean(a && b) && String(a).trim().toLowerCase() === String(b).trim().toLowerCase();

/**
 * Driver sign-in with a mobile number OR an email, plus password.
 * DEMO: any password works for the number/email used at sign-up (passwords are never stored in the browser).
 * Backend: check the password on the server and start a session (e.g. an httpOnly cookie).
 * @param {{login:string, password:string}} creds  login = mobile number or email
 * @returns {Promise<{status:'review'|'approved'|'rejected'}>}  throws { status: 401 } when they don't match
 */
export async function driverSignIn({ login, password }) {
  if (!login || !password) throw Object.assign(new Error('Enter your mobile number or email, and your password.'), { status: 400 });
  await wait(700);
  const d = demo.get('driver', null);
  const matches = d && (login.includes('@') ? sameEmail(d.email, login) : samePhone(d.phone, login));
  if (!matches) {
    throw Object.assign(new Error('No driver account uses that mobile number or email. Check it, or sign up.'), { status: 401 });
  }
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
 *   { id, kind:'ride'|'express'|'shop', pickup:{lng,lat,label}, dropoff:{lng,lat,label},
 *     distanceKm, fare, expiresAt:number }
 * DEMO: never calls `onJob`: no requests are simulated.
 * @returns {() => void} stop listening
 */
export function onJobRequest(onJob) { // eslint-disable-line no-unused-vars
  return () => {};
}

/** Accept a job request. Backend only (demo has no requests). @returns {Promise<{ok:boolean}>} */
export async function acceptJob(jobId) { // eslint-disable-line no-unused-vars
  throw Object.assign(new Error('Job requests aren’t available in the demo.'), { status: 501 });
}

/**
 * Move a job along: 'to_pickup' → 'arrived' → 'started' → 'completed'.
 * Express and Shop jobs attach a photo at pickup and delivery.
 * Backend only. @returns {Promise<{ok:boolean}>}
 */
export async function updateJob(jobId, status, { photo } = {}) { // eslint-disable-line no-unused-vars
  throw Object.assign(new Error('Job requests aren’t available in the demo.'), { status: 501 });
}

/**
 * Driver earnings: fares only (drivers keep 100%; tips go to mysabak).
 * DEMO: no trips yet.
 * @returns {Promise<{today:number, week:number, trips:Array<{id, kind, at:number, fare:number, distanceKm:number}>,
 *   tipsToMysabak:number, payout:{method:string|null, next:string|null}}>}
 */
export async function driverEarnings() {
  return { today: 0, week: 0, trips: [], tipsToMysabak: 0, payout: { method: null, next: null } };
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
  { id: 'picked_up', name: 'Rider picked up' },
  { id: 'delivered', name: 'Delivered' },
];

/**
 * A shop order and where it is.
 * DEMO: stays at 'placed' (no shop or rider updates it).
 * @returns {Promise<{id, shop, lines, subtotal, deliveryFee:number|null, address, notes, payment,
 *   status:'placed'|'accepted'|'preparing'|'picked_up'|'delivered'|'cancelled', placedAt:number}>}
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
