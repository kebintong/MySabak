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
   ========================================================= */
import { CONFIG } from './config.js';

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

const isNum = (n) => typeof n === 'number' && Number.isFinite(n);

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
 * @returns {{[vehicleId:string]: {total:number, base:number, distance:number} | null}}  null = unknown
 */
export function faresFor(trip) {
  const out = {};
  CONFIG.vehicles.forEach((v) => {
    const km = trip && trip.distanceKm;
    out[v.id] = isNum(v.base) && isNum(v.perKm) && isNum(km)
      ? { total: v.base + v.perKm * km, base: v.base, distance: v.perKm * km }
      : null;
  });
  return out;
}

/**
 * Send a booking. Demo: waits 2.2 s and pretends it worked; no driver is dispatched.
 * @param {{vehicle:string, pickup:{lng,lat,label}, dropoff:{lng,lat,label}, trip:object, payment:string}} booking
 * @returns {Promise<{id:string|null, demo:boolean}>}
 */
export async function bookRide(booking) { // eslint-disable-line no-unused-vars
  await new Promise((resolve) => setTimeout(resolve, 2200));
  return { id: null, demo: true };
}

function haversineKm(a, b) {
  const R = 6371;
  const toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}
