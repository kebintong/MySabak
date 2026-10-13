/* =========================================================
   mysabak · Ride booking (Design A)
   Vanilla JS. No build step.

   TomTom (one free API key, no credit card). Every TomTom call goes through /api/tomtom/…,
   which worker/index.js (Cloudflare Worker) forwards with the key added,
   so the key never reaches the browser.

     Map:     TomTom Orbis map style, drawn with MapLibre GL JS
     Search:  Places Search API · Suggest + Details
              (falls back to the classic Search API if the browser blocks it)
     Address: Reverse Geocoding API (pickup street + barangay)
     Routes:  Routing API (real distance + travel time)

   Settings (start position, fares) live in scripts/config.js.

   Two steps on one screen:
     1. "request" – set a drop-off (search, a recent place, or pick on map)
     2. "choose"  – pick Motor / Sedan / SUV, see the fare, book
   ========================================================= */
(() => {
  'use strict';

  /* ---------- Config ---------- */
  const USER = window.MYSABAK_CONFIG || {};
  const RATES = USER.rates || {};

  const CONFIG = {
    currency: '₱',
    vehicles: [
      { id: 'motor', name: 'Motor', capacity: '1 passenger', icon: 'i-motor' },
      { id: 'sedan', name: 'Sedan', capacity: 'Up to 4',     icon: 'i-car' },
      { id: 'suv',   name: 'SUV',   capacity: 'Up to 6',     icon: 'i-suv' },
    ].map((v) => ({ ...v, base: (RATES[v.id] || {}).base ?? null, perKm: (RATES[v.id] || {}).perKm ?? null })),
    defaultVehicle: 'sedan',
    paymentMethod: '[Payment method]',

    mapStyle: USER.mapStyle || 'street', // see THEMES below
    startCenter: USER.startCenter || [123.8854, 10.3157], // Cebu City [lng, lat]
    startZoom: USER.startZoom || 15,
    countryCode: USER.countryCode || 'ph',
    searchRadiusKm: USER.searchRadiusKm || 40, // search favours places within this many km of the pickup
    language: 'en-US',
  };

  const BRAND = '#5630d8';
  const REDUCED_MOTION = window.matchMedia('(prefers-reduced-motion: reduce)');
  const DESKTOP = window.matchMedia('(min-width: 900px)');

  /** Hook for your booking backend. */
  function bookRide(vehicle) {
    // TODO: send the trip to your API, then show the "finding a driver" screen.
    if (el.body.classList.contains('is-booking')) return;
    el.body.classList.add('is-booking');
    setTimeout(() => {
      el.body.classList.remove('is-booking');
      const article = /^[AEIOU]|^SUV/i.test(vehicle.name) ? 'an' : 'a';
      toast(`Booking request sent for ${article} ${vehicle.name}. (Demo — no driver is dispatched.)`);
    }, 2200);
  }

  /* =========================================================
     TomTom APIs
     ========================================================= */
  const TT = new URL('/api/tomtom', location.origin).href; // our proxy (adds the key server-side)
  const TT_HOSTS = /^https:\/\/([a-d]\.)?api\.tomtom\.com/;

  /** fetch() with TomTom-friendly errors: err.status 0 = network/blocked. */
  async function ttFetch(url, options = {}) {
    let res;
    try {
      res = await fetch(url, options);
    } catch (e) {
      if (e.name === 'AbortError') throw e;
      throw Object.assign(new Error('network'), { status: 0 });
    }
    if (!res.ok) throw Object.assign(new Error(`TomTom ${res.status}`), { status: res.status });
    return res.json();
  }

  const ttUrl = (path, params = {}) => {
    const url = new URL(TT + path);
    Object.entries(params).forEach(([k, v]) => {
      if (v !== undefined && v !== null && v !== '') url.searchParams.set(k, v);
    });
    return url;
  };

  /** Plain-language reason a TomTom call failed. */
  function ttError(err) {
    if (!err) return 'Something went wrong.';
    if (err.status === 401 || err.status === 403) return 'TomTom didn’t accept the server’s API key.';
    if (err.status === 503) return 'The map service isn’t set up yet (TOMTOM_KEY is missing on the server).';
    if (err.status === 429) return 'TomTom’s free limit was reached. Try again later.';
    if (err.status === 0) return 'Can’t reach TomTom. Check your internet, or an ad-blocker.';
    return `TomTom had a problem (error ${err.status}).`;
  }

  /* ---------- Place search ---------- */
  const searchCache = new Map();
  let useClassicSearch = false; // switches on if the newer Places API can't be reached from this browser

  /**
   * Suggestions near the pickup (Philippines only), nearest-relevant first.
   * Each place has title, subtitle, km, and either lat/lng or a `details` path.
   */
  async function searchPlaces(text, signal) {
    const { lng, lat } = state.pickup;
    const key = `${text.toLowerCase()}|${lng.toFixed(2)},${lat.toFixed(2)}`;
    if (searchCache.has(key)) return searchCache.get(key);

    let places;
    if (!useClassicSearch) {
      try {
        places = await suggestOrbis(text, signal);
      } catch (err) {
        if (err.name === 'AbortError' || err.status === 401 || err.status === 403 || err.status === 429) throw err;
        console.warn('Places Search API unavailable, using the classic Search API.', err);
        useClassicSearch = true;
      }
    }
    if (useClassicSearch) places = await searchClassic(text, signal);

    places = places.slice(0, 5);
    places.far = places.length > 0 && places.every((p) => isNum(p.km) && p.km > CONFIG.searchRadiusKm);
    searchCache.set(key, places);
    return places;
  }

  // Newer Places Search API (Orbis): Suggest. Free tier: 10,000 requests/month.
  async function suggestOrbis(text, signal) {
    const { lng, lat } = state.pickup;
    const data = await ttFetch(`${TT}/maps/orbis/places/suggest`, {
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
  async function searchClassic(text, signal) {
    const { lng, lat } = state.pickup;
    const url = ttUrl(`/search/2/search/${encodeURIComponent(text)}.json`, {
      typeahead: 'true',
      limit: 8,
      countrySet: CONFIG.countryCode.toUpperCase(),
      lat,
      lon: lng,
      language: CONFIG.language,
    });
    const data = await ttFetch(url, { signal });
    return (data.results || [])
      .filter((r) => r.position)
      .map((r) => {
        const a = r.address || {};
        const title = (r.poi && r.poi.name) || a.streetName || a.freeformAddress;
        const subtitle = [a.municipalitySubdivision, a.municipality || a.countrySubdivision].filter(Boolean).join(', ');
        return {
          title,
          subtitle,
          km: isNum(r.dist) ? r.dist / 1000 : haversineKm(state.pickup, { lat: r.position.lat, lng: r.position.lon }),
          lat: r.position.lat,
          lng: r.position.lon,
        };
      })
      .sort((x, y) => x.km - y.km);
  }

  /** Coordinates for a picked suggestion. */
  async function placeLocation(place) {
    if (isNum(place.lat) && isNum(place.lng)) return { lat: place.lat, lng: place.lng };
    const data = await ttFetch(TT + place.details, {
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

  /* ---------- Street + barangay for a point ---------- */
  async function reverseGeocode({ lng, lat }) {
    const data = await ttFetch(ttUrl(`/search/2/reverseGeocode/${lat},${lng}.json`, { language: CONFIG.language }));
    const a = ((data.addresses || [])[0] || {}).address;
    if (!a) return null;
    const street = a.streetName || a.street;
    const area = a.municipalitySubdivision || a.municipality;
    const parts = [street, area].filter(Boolean).filter((v, i, arr) => arr.indexOf(v) === i);
    return parts.join(', ') || a.freeformAddress || null;
  }

  /* ---------- Driving route ---------- */
  async function fetchRoute(from, to) {
    const url = ttUrl(`/routing/1/calculateRoute/${from.lat},${from.lng}:${to.lat},${to.lng}/json`, {
      travelMode: 'car',
      routeType: 'fastest',
      traffic: 'true',
    });
    const data = await ttFetch(url);
    const r = data.routes && data.routes[0];
    if (!r) throw new Error('No route found');
    const coords = (r.legs || []).flatMap((leg) => (leg.points || []).map((p) => [p.longitude, p.latitude]));
    return {
      coords,
      distanceKm: r.summary.lengthInMeters / 1000,
      minutes: Math.max(1, Math.round(r.summary.travelTimeInSeconds / 60)),
      eta: { motor: null, sedan: null, suv: null }, // needs live driver positions
      approx: false,
    };
  }

  /** Straight line + as-the-crow-flies distance (used when routing fails). */
  function straightTrip(from, to) {
    return {
      coords: [[from.lng, from.lat], [to.lng, to.lat]],
      distanceKm: haversineKm(from, to),
      minutes: null,
      eta: { motor: null, sedan: null, suv: null },
      approx: true,
    };
  }

  async function estimateTrip(from, to) {
    try {
      return await fetchRoute(from, to);
    } catch (err) {
      console.warn(err);
      toast(`${ttError(err)} Showing a straight line instead.`);
      return straightTrip(from, to);
    }
  }

  function haversineKm(a, b) {
    const R = 6371;
    const toRad = (d) => (d * Math.PI) / 180;
    const dLat = toRad(b.lat - a.lat);
    const dLng = toRad(b.lng - a.lng);
    const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
    return 2 * R * Math.asin(Math.sqrt(h));
  }

  /* =========================================================
     State
     ========================================================= */
  const emptyTrip = () => ({ coords: null, distanceKm: null, minutes: null, eta: {}, approx: false });

  const state = {
    step: 'request',
    pickup: { lng: CONFIG.startCenter[0], lat: CONFIG.startCenter[1] },
    pickupLabel: '[Street, barangay]',
    pickupFromGPS: false,
    dest: '',
    destPoint: null,
    vehicle: CONFIG.defaultVehicle,
    trip: emptyTrip(),
    loadingTrip: false,
    picking: false,
  };
  let tripToken = 0;

  /* ---------- Elements ---------- */
  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

  const el = {
    body: document.body,
    app: $('.app'),
    bottom: $('.bottom'),
    vehicles: $('.vehicles'),
    destInputs: $$('[data-dest]'),
    destDesktop: $('#destDesktop'),
    destMobile: $('#destMobile'),
    pickOnMap: $('#pickOnMap'),
    recentChip: $('#recentChip'),
    installBtn: $('#installBtn'),
    toast: $('#toast'),
  };

  /* ---------- Formatting ---------- */
  const isNum = (n) => typeof n === 'number' && Number.isFinite(n);
  const peso = (n) => `${CONFIG.currency}${Math.round(n).toLocaleString('en-PH')}`;
  const vehicleById = (id) => CONFIG.vehicles.find((v) => v.id === id) || CONFIG.vehicles[0];

  function fareFor(v) {
    const km = state.trip.distanceKm;
    if (state.loadingTrip) return `${CONFIG.currency}…`;
    if (!isNum(v.base) || !isNum(v.perKm) || !isNum(km)) return `${CONFIG.currency}[FARE]`;
    return peso(v.base + v.perKm * km);
  }
  const baseFor = (v) => (isNum(v.base) ? peso(v.base) : `${CONFIG.currency}[AMOUNT]`);
  function distanceFareFor(v) {
    const km = state.trip.distanceKm;
    return isNum(v.perKm) && isNum(km) ? peso(v.perKm * km) : `${CONFIG.currency}[AMOUNT]`;
  }
  function etaFor(v) {
    const m = state.trip.eta && state.trip.eta[v.id];
    return isNum(m) ? `${m} min` : '[ETA]';
  }
  function distanceText() {
    if (state.loadingTrip) return 'Getting route…';
    const km = state.trip.distanceKm;
    if (!isNum(km)) return '[Distance]';
    return `${state.trip.approx ? '~' : ''}${km < 10 ? km.toFixed(1) : Math.round(km)} km${state.trip.approx ? ' straight-line' : ''}`;
  }
  function durationText() {
    if (state.loadingTrip) return '…';
    const m = state.trip.minutes;
    if (!isNum(m)) return '[Travel time]';
    return m < 60 ? `${m} min` : `${Math.floor(m / 60)} hr ${m % 60} min`;
  }
  const fromText = () => (state.pickupFromGPS ? 'Current location' : state.pickupLabel);

  /* =========================================================
     Map (MapLibre + OpenFreeMap)
     ========================================================= */
  let map = null;
  let mapReady = false;
  const markers = {};
  const EMPTY_LINE = { type: 'FeatureCollection', features: [] };

  // TomTom's style points at api.tomtom.com (and a–d.api.tomtom.com); send those through our proxy.
  function viaProxy(raw) {
    if (!TT_HOSTS.test(raw)) return { url: raw };
    const u = new URL(raw.replace(TT_HOSTS, TT));
    u.searchParams.delete('key');
    if (u.pathname.includes('/maps/orbis/') && !u.searchParams.has('apiVersion')) u.searchParams.set('apiVersion', '1');
    return { url: u.toString() };
  }

  /* Map looks. `base` is the TomTom style; `street` restyles it as the mysabak street map.
     'street' is the chosen mysabak look; the others are TomTom's own styles (set in config.js). */
  const THEMES = [
    { id: 'street',                     base: 'basic_street-light', street: true },
    { id: 'basic_street-light',         base: 'basic_street-light' },
    { id: 'basic_mono-light',           base: 'basic_mono-light' },
    { id: 'basic_street-light-driving', base: 'basic_street-light-driving' },
    { id: 'basic_mono-dark',            base: 'basic_mono-dark' },
    { id: 'basic_street-dark',          base: 'basic_street-dark' },
    { id: 'basic_street-satellite',     base: 'basic_street-satellite' },
  ];
  const OLD_THEME_NAMES = ['mysabak', 'lavender'];
  const themeById = (id) => THEMES.find((t) => t.id === (OLD_THEME_NAMES.includes(id) ? 'street' : id)) || THEMES[0];

  function styleUrl() {
    return ttUrl('/maps/orbis/assets/styles/0.*/style', { apiVersion: 1, map: themeById(CONFIG.mapStyle).base }).toString();
  }

  function initMap() {
    if (map) return;
    if (!window.maplibregl) {
      toast('The map couldn’t load. Check your internet connection.');
      return;
    }
    map = new maplibregl.Map({
      container: 'mapCanvas',
      // style is set at the end, once the listeners are attached (see setStyle below)
      // Tiles, icons and fonts in TomTom's style go through our proxy, which adds the key.
      transformRequest: (url) => viaProxy(url),
      center: CONFIG.startCenter,
      zoom: CONFIG.startZoom,
      attributionControl: false,
      dragRotate: false,
      pitchWithRotate: false,
      touchPitch: false,
    });
    map.touchZoomRotate.disableRotation();
    map.keyboard.disableRotation();
    map.addControl(new maplibregl.AttributionControl({
      compact: true,
      customAttribution: '© <a href="https://www.tomtom.com/" target="_blank" rel="noopener">TomTom</a>',
    }), 'top-left');

    markers.pickup = new maplibregl.Marker({ element: $('#mkPickup'), anchor: 'center', draggable: true })
      .setLngLat(state.pickup).addTo(map);
    markers.pickup.on('dragstart', () => markers.pickup.getElement().classList.add('is-dragging'));
    markers.pickup.on('dragend', () => {
      markers.pickup.getElement().classList.remove('is-dragging');
      const p = markers.pickup.getLngLat();
      setPickup({ lng: p.lng, lat: p.lat }, { fromGPS: false, recenter: false });
    });
    markers.origin = new maplibregl.Marker({ element: $('#mkOrigin'), anchor: 'center' }).setLngLat(state.pickup).addTo(map);
    markers.dest = new maplibregl.Marker({ element: $('#mkDest'), anchor: 'bottom' }).setLngLat(state.pickup);
    markers.time = new maplibregl.Marker({ element: $('#mkTime'), anchor: 'bottom', offset: [0, -10] }).setLngLat(state.pickup);

    map.on('move', placeLabels);

    let firstLoad = true;
    map.on('style.load', () => {
      addRouteLayers();
      mapReady = true;
      drawnRoute = null; // redraw the route on the new style
      updateMap();
      if (firstLoad) { firstLoad = false; frame({ animate: false }); }
    });

    let styleErrorShown = false;
    map.on('error', (e) => {
      console.warn('Map error:', e && e.error, e && e.error && e.error.url);
      if (!mapReady && !styleErrorShown) {
        styleErrorShown = true;
        const st = e && e.error && e.error.status;
        toast(st ? ttError({ status: st }) : 'Map tiles couldn’t load. Check your connection.');
      }
    });

    map.on('click', (e) => {
      if (!state.picking) return;
      const p = { lng: e.lngLat.lng, lat: e.lngLat.lat };
      goToChoose('Pinned location', p, { nameFromMap: true });
    });

    // The street theme rewrites TomTom's style before the first frame, so its own colours never flash.
    const theme = themeById(CONFIG.mapStyle);
    map.setStyle(styleUrl(), { transformStyle: (_prev, next) => (theme.street ? streetStyle(next) : next) });
  }

  /* ---------- Street theme ----------
     A clean street map like the mysabak mock-up: cream land, white streets, yellow main roads,
     orange highways, soft green parks, blue water, and every map label in Google Sans Text.
     TomTom tags each style layer with metadata.group (area, water, road, building, places_label,
     road_label, …). Colours inside a layer are matched by hue, so TomTom's per-category colour
     expressions keep working. 3D buildings and the small "micro" POIs are hidden to keep it clean.
     Route shields and landmark icons keep TomTom's colours. */
  const STREET = {
    land: '#ece8df', landShade: '#e4e0d6', park: '#cce5c2', wood: '#bedcb2', water: '#aed2ee',
    building: '#e4dfd6', buildingEdge: '#d8d2c7',
    street: '#ffffff', streetEdge: '#ddd8cd', path: '#d3cec3',
    main: '#fce6a4', mainEdge: '#e6c778', highway: '#f7c27a', highwayEdge: '#e2a24e',
    rail: '#cbc6bc', ferry: '#7fb0da',
    text: '#3c4043', textSoft: '#5f6368', district: '#6b6f73', textFaint: '#9aa0a6',
    textGreen: '#3a7d4f', textWater: '#3f78a8', halo: '#ffffff', waterHalo: 'rgba(174, 210, 238, 0.6)',
  };

  /* Map label fonts: Google Sans at its text optical size, which is Google Sans Text, turned into
     MapLibre glyphs in assets/fonts/glyphs (open font licence: assets/fonts/glyphs/OFL.txt).
     Only the map labels use it; the app UI keeps its own fonts. */
  const GLYPHS = `${new URL('/assets/fonts/glyphs/', location.origin).href}{fontstack}/{range}.pbf`;
  const FONT = {
    regular: ['GoogleSansText-Regular'],
    medium: ['GoogleSansText-Medium'],
    bold: ['GoogleSansText-Bold'],
    italic: ['GoogleSansText-Italic'],
  };

  // Keep TomTom's weight for each label (its font names say Regular / Medium / Bold …)
  function fontFor(original) {
    const s = JSON.stringify(original || '');
    if (/medium|semi/i.test(s)) return FONT.medium;
    if (/bold|black|heavy/i.test(s)) return FONT.bold;
    if (/italic/i.test(s)) return FONT.italic;
    return FONT.regular;
  }

  function parseColor(str) {
    if (typeof str !== 'string') return null;
    const s = str.trim().toLowerCase();
    let m = s.match(/^hsla?\(\s*([\d.]+)(?:deg)?[\s,]+([\d.]+)%[\s,]+([\d.]+)%(?:[\s,/]+([\d.]+%?))?\s*\)$/);
    if (m) return { h: +m[1], s: +m[2], l: +m[3], a: m[4] === undefined ? 1 : (m[4].endsWith('%') ? parseFloat(m[4]) / 100 : +m[4]) };
    let r; let g; let b; let a = 1;
    m = s.match(/^rgba?\(\s*([\d.]+)[\s,]+([\d.]+)[\s,]+([\d.]+)(?:[\s,/]+([\d.]+))?\s*\)$/);
    if (m) { [r, g, b] = [+m[1], +m[2], +m[3]]; if (m[4] !== undefined) a = +m[4]; }
    else if ((m = s.match(/^#([0-9a-f]{3,8})$/))) {
      let hex = m[1];
      if (hex.length <= 4) hex = hex.split('').map((c) => c + c).join('');
      r = parseInt(hex.slice(0, 2), 16); g = parseInt(hex.slice(2, 4), 16); b = parseInt(hex.slice(4, 6), 16);
      if (hex.length === 8) a = parseInt(hex.slice(6, 8), 16) / 255;
    } else if (s === 'white') { r = g = b = 255; } else if (s === 'black') { r = g = b = 0; } else return null;
    r /= 255; g /= 255; b /= 255;
    const max = Math.max(r, g, b); const min = Math.min(r, g, b); const l = (max + min) / 2;
    let h = 0; let sat = 0;
    if (max !== min) {
      const d = max - min;
      sat = l > 0.5 ? d / (2 - max - min) : d / (max + min);
      h = max === r ? (g - b) / d + (g < b ? 6 : 0) : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
      h *= 60;
    }
    return { h, s: sat * 100, l: l * 100, a };
  }

  const isGreen = ({ h, s }) => h >= 70 && h <= 170 && s > 15;
  const isBlue = ({ h, s }) => h >= 180 && h <= 240 && s > 20;
  const isWarm = ({ h, s }) => h >= 15 && h <= 70 && s > 25; // TomTom's yellow/orange main roads
  const groupOf = (layer) => (layer.metadata && layer.metadata.group) || '';

  // Keep the original transparency
  function withAlpha(hex, a) {
    if (a >= 1) return hex;
    const n = parseInt(hex.slice(1), 16);
    return `rgba(${n >> 16}, ${(n >> 8) & 255}, ${n & 255}, ${Math.round(a * 1000) / 1000})`;
  }

  // Swap every colour inside a paint value (plain colours and colour expressions alike)
  function recolorValue(v, pick) {
    if (typeof v === 'string') {
      const c = parseColor(v);
      const next = c && pick(c);
      return next ? withAlpha(next, c.a) : v;
    }
    if (Array.isArray(v)) return v.map((x) => recolorValue(x, pick));
    return v;
  }

  function firstColor(v) {
    if (typeof v === 'string') return parseColor(v);
    if (Array.isArray(v)) for (const x of v) { const c = firstColor(x); if (c) return c; }
    return null;
  }

  // Land, water, buildings and roads
  function shapeColor(c, layer) {
    const g = groupOf(layer);
    const id = layer.id.toLowerCase();
    const edge = layer.type === 'line' && /outline|casing/.test(id);

    if (g === 'water') return STREET.water;
    if (g === 'building') return layer.type === 'line' || /outline/.test(id) ? STREET.buildingEdge : STREET.building;
    if (g === 'road' || g === 'road_area' || g === 'transit_area') {
      if (/ferry/.test(id)) return STREET.ferry;
      if (/railway|subway|aerialway|tram/.test(id)) return STREET.rail;
      if (layer.type !== 'line') return isGreen(c) ? STREET.park : STREET.street; // squares, pedestrian areas
      if (isWarm(c)) {
        const highway = c.h < 38 || c.l < 68; // the more orange / darker of TomTom's road colours
        if (highway) return edge ? STREET.highwayEdge : STREET.highway;
        return edge ? STREET.mainEdge : STREET.main;
      }
      if (edge) return STREET.streetEdge;
      return c.l >= 75 ? STREET.street : STREET.path; // grey paths and tracks stay visible
    }
    if (g === 'area' || g === 'background') {
      if (isGreen(c)) return c.l < 75 ? STREET.wood : STREET.park;
      if (isBlue(c)) return STREET.water;
      return g === 'background' || c.l >= 88 ? STREET.land : STREET.landShade;
    }
    return null; // borders and the rest: keep TomTom's colour
  }

  // Text colour for labels that aren't places, roads or water (parks, landmarks, borders)
  function labelColor(c) {
    if (isGreen(c)) return STREET.textGreen;
    if (isBlue(c)) return STREET.textWater;
    return c.l < 35 ? STREET.text : STREET.textSoft;
  }

  const WATER_NAME = /water|ocean|sea|river|lake|bay|strait|channel|stream|canal|reservoir/;

  function styleLabel(layer) {
    const { paint, layout } = layer;
    const g = groupOf(layer);
    const id = layer.id.toLowerCase();
    const textColor = firstColor(paint['text-color']);

    if (g === 'places_label' && /neighbo|suburb|village|hamlet|quarter|district/.test(id)) {
      // Barangays and districts: small grey capitals, like the mock-up
      layout['text-font'] = FONT.medium;
      layout['text-transform'] = 'uppercase';
      layout['text-letter-spacing'] = 0.12;
      paint['text-color'] = STREET.district;
      paint['text-halo-color'] = STREET.halo;
    } else if (g === 'places_label') {
      layout['text-font'] = /city|capital/.test(id) ? FONT.bold : fontFor(layout['text-font']);
      paint['text-color'] = STREET.text;
      paint['text-halo-color'] = STREET.halo;
    } else if (g === 'road_label' && /shield|exit/.test(id)) {
      layout['text-font'] = FONT.medium; // shields keep TomTom's colours
    } else if (g === 'road_label') {
      layout['text-font'] = fontFor(layout['text-font']);
      paint['text-color'] = STREET.textSoft;
      paint['text-halo-color'] = STREET.halo;
    } else if (g === 'address_point_label') {
      layout['text-font'] = FONT.regular;
      paint['text-color'] = STREET.textFaint;
      paint['text-halo-color'] = STREET.halo;
    } else if (WATER_NAME.test(id) || (g === 'label' && textColor && isBlue(textColor))) {
      layout['text-font'] = FONT.italic;
      paint['text-color'] = STREET.textWater;
      paint['text-halo-color'] = STREET.waterHalo;
    } else {
      layout['text-font'] = fontFor(layout['text-font']);
      if (paint['text-color'] !== undefined) paint['text-color'] = recolorValue(paint['text-color'], labelColor);
      if (paint['text-halo-color'] !== undefined) paint['text-halo-color'] = STREET.halo;
    }
  }

  const SHAPE_PROPS = ['background-color', 'fill-color', 'fill-outline-color', 'line-color'];

  function streetStyle(style) {
    style.glyphs = GLYPHS;
    (style.layers || []).forEach((layer) => {
      layer.paint = layer.paint || {};
      layer.layout = layer.layout || {};
      if (layer.type === 'fill-extrusion' || layer.id === 'POI - Micro') {
        layer.layout.visibility = 'none';
      } else if (layer.type === 'symbol') {
        // Every label must switch font: the glyphs URL now only serves Google Sans Text
        if (layer.layout['text-field'] !== undefined) styleLabel(layer);
      } else {
        SHAPE_PROPS.forEach((prop) => {
          if (layer.paint[prop] !== undefined) layer.paint[prop] = recolorValue(layer.paint[prop], (c) => shapeColor(c, layer));
        });
      }
    });
    return style;
  }

  // The route sits on top of everything (roads, buildings, labels) so nothing covers it.
  function addRouteLayers() {
    if (map.getSource('route')) return;
    map.addSource('route', { type: 'geojson', data: EMPTY_LINE });
    const layout = { 'line-cap': 'round', 'line-join': 'round' };
    const byZoom = (a, b, c) => ['interpolate', ['linear'], ['zoom'], 10, a, 14, b, 18, c];
    map.addLayer({
      id: 'route-shadow', type: 'line', source: 'route', layout,
      paint: { 'line-color': '#241957', 'line-opacity': 0.18, 'line-width': byZoom(9, 14, 22), 'line-blur': 4, 'line-translate': [0, 2] },
    });
    map.addLayer({ id: 'route-casing', type: 'line', source: 'route', layout, paint: { 'line-color': '#FFFFFF', 'line-width': byZoom(7, 11, 18) } });
    map.addLayer({ id: 'route-line', type: 'line', source: 'route', layout, paint: { 'line-color': BRAND, 'line-width': byZoom(4, 6.5, 11) } });
    map.addLayer({
      id: 'route-approx', type: 'line', source: 'route', filter: ['==', ['get', 'approx'], true], layout,
      paint: { 'line-color': '#FFFFFF', 'line-width': byZoom(1.5, 2, 3), 'line-dasharray': [1, 2] },
    });
  }

  function routeMidpoint(coords) {
    if (!coords || coords.length < 2) return null;
    if (coords.length === 2) return [(coords[0][0] + coords[1][0]) / 2, (coords[0][1] + coords[1][1]) / 2];
    return coords[Math.floor(coords.length / 2)];
  }

  let lastDest = null;
  function updateMap() {
    if (!map) return;
    markers.pickup.setLngLat(state.pickup);
    markers.origin.setLngLat(state.pickup);

    if (state.destPoint) {
      const isNew = !lastDest || lastDest.lng !== state.destPoint.lng || lastDest.lat !== state.destPoint.lat;
      markers.dest.setLngLat(state.destPoint).addTo(map);
      if (isNew) {
        const pin = markers.dest.getElement();
        pin.classList.remove('is-dropping');
        void pin.offsetWidth;
        pin.classList.add('is-dropping');
      }
      lastDest = state.destPoint;
    } else {
      markers.dest.remove();
      lastDest = null;
    }

    const mid = routeMidpoint(state.trip.coords);
    if (mid && !state.loadingTrip) markers.time.setLngLat(mid).addTo(map);
    else markers.time.remove();

    placeLabels();

    if (mapReady) {
      const show = state.step === 'choose' && state.trip.coords;
      if (!show) {
        drawnRoute = null;
        cancelAnimationFrame(routeAnim);
        map.getSource('route').setData(EMPTY_LINE);
      } else if (drawnRoute !== state.trip.coords) {
        drawnRoute = state.trip.coords;
        animateRoute(state.trip.coords, state.trip.approx);
      }
    }
  }

  /* Draw the route from pickup to drop-off over ~0.8 s */
  let drawnRoute = null;
  let routeAnim = 0;
  function routeFeature(coords, approx) {
    return { type: 'Feature', properties: { approx }, geometry: { type: 'LineString', coordinates: coords } };
  }
  function animateRoute(coords, approx) {
    cancelAnimationFrame(routeAnim);
    const src = map.getSource('route');
    if (REDUCED_MOTION.matches || coords.length < 2) { src.setData(routeFeature(coords, approx)); return; }

    // cumulative lengths so the line grows at an even speed
    const cum = [0];
    for (let i = 1; i < coords.length; i++) {
      const [x1, y1] = coords[i - 1];
      const [x2, y2] = coords[i];
      cum.push(cum[i - 1] + Math.hypot(x2 - x1, y2 - y1));
    }
    const total = cum[cum.length - 1] || 1;
    const start = performance.now();
    const DURATION = 800;
    const ease = (t) => 1 - Math.pow(1 - t, 3);

    const step = (now) => {
      const t = Math.min(1, (now - start) / DURATION);
      const target = ease(t) * total;
      let i = 1;
      while (i < cum.length && cum[i] < target) i++;
      const part = coords.slice(0, i);
      if (i < coords.length) {
        const seg = cum[i] - cum[i - 1] || 1;
        const f = (target - cum[i - 1]) / seg;
        const [x1, y1] = coords[i - 1];
        const [x2, y2] = coords[i];
        part.push([x1 + (x2 - x1) * f, y1 + (y2 - y1) * f]);
      }
      if (part.length >= 2) src.setData(routeFeature(part, approx));
      if (t < 1) routeAnim = requestAnimationFrame(step);
    };
    routeAnim = requestAnimationFrame(step);
  }

  // Put each pin's label on the side of the screen that has room.
  function placeLabels() {
    if (!map) return;
    const W = map.getContainer().clientWidth;
    const xOf = (p) => map.project([p.lng, p.lat]).x;
    markers.pickup.getElement().classList.toggle('is-flip', xOf(state.pickup) > W * 0.6);
    markers.origin.getElement().classList.toggle('is-flip', xOf(state.pickup) > W * 0.5);
    if (state.destPoint) markers.dest.getElement().classList.toggle('is-flip', xOf(state.destPoint) < W * 0.5);
  }

  // Space the panels cover at the bottom of the screen
  function bottomInset() {
    const appRect = el.app.getBoundingClientRect();
    return Math.max(0, appRect.bottom - el.bottom.getBoundingClientRect().top);
  }

  /** Move the camera to fit the current step. */
  function frame({ animate = true } = {}) {
    if (!map) return;
    const duration = animate ? 700 : 0;
    const desk = DESKTOP.matches;
    const bottom = bottomInset() + 24;

    if (state.step === 'choose' && state.destPoint) {
      const ends = [[state.pickup.lng, state.pickup.lat], [state.destPoint.lng, state.destPoint.lat]];
      const pts = (state.trip.coords || []).concat(ends);
      const bounds = pts.reduce((b, c) => b.extend(c), new maplibregl.LngLatBounds(pts[0], pts[0]));
      const side = desk ? 170 : 72;
      map.setPadding({ top: 0, bottom: 0, left: 0, right: 0 });
      map.fitBounds(bounds, {
        padding: { top: desk ? 130 : 140, bottom: Math.min(bottom, window.innerHeight - 200), left: side, right: side },
        maxZoom: 16.5,
        duration,
      });
    } else {
      map.easeTo({
        center: [state.pickup.lng, state.pickup.lat],
        padding: { top: desk ? 90 : 70, bottom, left: 0, right: 0 },
        zoom: Math.max(map.getZoom(), 15),
        duration,
      });
    }
  }

  /* =========================================================
     Pickup + location
     ========================================================= */
  async function setPickup(point, { fromGPS = false, recenter = true } = {}) {
    state.pickup = { lng: point.lng, lat: point.lat };
    state.pickupFromGPS = fromGPS;
    state.pickupLabel = 'Finding address…';
    render();
    if (recenter && state.step === 'request') frame();
    if (state.step === 'choose') refreshTrip();

    const asked = state.pickup;
    try {
      const label = await reverseGeocode(asked);
      if (asked !== state.pickup) return; // pickup moved again meanwhile
      state.pickupLabel = label || 'Pinned pickup';
    } catch (err) {
      console.warn(err);
      state.pickupLabel = 'Pinned pickup';
    }
    render();
  }

  function locateUser({ quiet = false } = {}) {
    if (!('geolocation' in navigator)) {
      if (!quiet) toast('Location isn’t available in this browser. Drag the pickup pin instead.');
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => setPickup({ lng: pos.coords.longitude, lat: pos.coords.latitude }, { fromGPS: true }),
      (err) => {
        if (quiet) return;
        toast(err.code === 1
          ? 'Location is blocked. Allow it in your browser, or drag the pickup pin.'
          : 'Couldn’t find your location. Drag the pickup pin instead.');
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 },
    );
  }

  /* =========================================================
     Saved + recent places (this browser only)
     ========================================================= */
  const store = {
    get(key, fallback) {
      try { return JSON.parse(localStorage.getItem(key)) ?? fallback; } catch (_) { return fallback; }
    },
    set(key, value) {
      try { localStorage.setItem(key, JSON.stringify(value)); } catch (_) { /* storage off */ }
    },
  };
  const RECENT_KEY = 'mysabak.recent';

  function rememberPlace(title, point) {
    if (!title || title === 'Pinned location') return;
    const list = store.get(RECENT_KEY, []).filter((p) => p.title !== title);
    list.unshift({ title, lng: point.lng, lat: point.lat });
    store.set(RECENT_KEY, list.slice(0, 5));
  }
  const latestRecent = () => store.get(RECENT_KEY, [])[0] || null;

  /* =========================================================
     Vehicles
     ========================================================= */
  function buildVehicles() {
    el.vehicles.innerHTML = CONFIG.vehicles.map((v, i) => `
      <button type="button" class="vehicle" role="radio" data-vehicle="${v.id}" aria-checked="false" tabindex="-1" style="--i:${i}">
        <svg class="icon v-icon" aria-hidden="true"><use href="#${v.icon}"/></svg>
        <span class="v-text">
          <span class="v-name">${v.name}</span>
          <span class="v-meta"><span class="v-cap">${v.capacity} · </span><span class="v-eta"></span><span class="v-away"> away</span></span>
        </span>
        <span class="v-fare"></span>
      </button>`).join('');
  }

  function selectVehicle(id, focus = false) {
    const changed = state.vehicle !== id;
    state.vehicle = id;
    render();
    if (changed) {
      const card = $(`[data-vehicle="${id}"]`, el.vehicles);
      card.classList.remove('is-popped');
      void card.offsetWidth;
      card.classList.add('is-popped');
      $$('[data-book]').forEach((b) => { b.classList.remove('is-bumped'); void b.offsetWidth; b.classList.add('is-bumped'); });
    }
    if (focus) {
      const btn = $(`[data-vehicle="${id}"]`, el.vehicles);
      if (btn) btn.focus();
    }
  }

  /* =========================================================
     Render
     ========================================================= */
  function setBind(name, value) {
    $$(`[data-bind="${name}"]`).forEach((node) => { node.textContent = value; });
  }

  function render() {
    updateMap(); // re-attach markers first so their labels get the new text below
    const v = vehicleById(state.vehicle);
    el.body.dataset.state = state.step;
    el.body.classList.toggle('is-picking', state.picking);
    el.body.classList.toggle('is-loading', state.loadingTrip);
    el.pickOnMap.setAttribute('aria-pressed', String(state.picking));

    setBind('pickup', state.pickupLabel);
    setBind('from', fromText());
    setBind('fromShort', fromText());
    setBind('dropoff', state.dest || '[Drop-off place]');
    setBind('distance', distanceText());
    setBind('duration', durationText());
    setBind('vehicle', v.name);
    setBind('fare', fareFor(v));
    setBind('base', baseFor(v));
    setBind('distfare', distanceFareFor(v));
    setBind('payment', CONFIG.paymentMethod);

    const recent = latestRecent();
    el.recentChip.hidden = !recent;
    if (recent) setBind('recent', recent.title);

    $$('.vehicle', el.vehicles).forEach((btn) => {
      const veh = vehicleById(btn.dataset.vehicle);
      const on = veh.id === state.vehicle;
      btn.setAttribute('aria-checked', String(on));
      btn.tabIndex = on ? 0 : -1;
      $('.v-eta', btn).textContent = etaFor(veh);
      $('.v-fare', btn).textContent = fareFor(veh);
      btn.setAttribute('aria-label', `${veh.name}, ${veh.capacity}, ${fareFor(veh)}, ${etaFor(veh)} away`);
    });

    el.destDesktop.readOnly = state.step === 'choose';
    el.destInputs.forEach((input) => {
      if (document.activeElement !== input) input.value = state.dest;
    });
  }

  /* =========================================================
     Steps
     ========================================================= */
  async function goToChoose(title, point, { nameFromMap = false } = {}) {
    state.dest = title;
    state.destPoint = { lng: point.lng, lat: point.lat };
    state.step = 'choose';
    state.picking = false;
    el.toast.classList.remove('is-visible');
    closeAllSuggest();
    if (document.activeElement && document.activeElement.blur) document.activeElement.blur();
    rememberPlace(title, point);
    render();
    requestAnimationFrame(() => frame());
    refreshTrip();

    if (nameFromMap) {
      const asked = state.destPoint;
      try {
        const name = await reverseGeocode(asked);
        if (name && asked === state.destPoint) {
          state.dest = name;
          rememberPlace(name, asked);
          render();
        }
      } catch (_) { /* keep "Pinned location" */ }
    }
  }

  async function refreshTrip() {
    if (!state.destPoint) return;
    const token = ++tripToken;
    state.loadingTrip = true;
    state.trip = emptyTrip();
    render();
    const trip = await estimateTrip(state.pickup, state.destPoint);
    if (token !== tripToken) return; // a newer request replaced this one
    state.trip = trip;
    state.loadingTrip = false;
    render();
    countUpFares();
    frame();
  }

  /* Fares tick up from zero once they're known */
  function countUpFares() {
    if (REDUCED_MOTION.matches) return;
    const nodes = [...$$('.v-fare', el.vehicles), ...$$('[data-bind="fare"]')];
    nodes.forEach((node) => {
      const m = node.textContent.match(/^(\D*)([\d,]+)$/);
      if (!m) return;
      const prefix = m[1];
      const end = Number(m[2].replace(/,/g, ''));
      const start = performance.now();
      const tick = (now) => {
        const t = Math.min(1, (now - start) / 600);
        const v = Math.round(end * (1 - Math.pow(1 - t, 3)));
        node.textContent = prefix + v.toLocaleString('en-PH');
        if (t < 1) requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    });
  }

  function goToRequest({ clear = false } = {}) {
    tripToken++;
    state.step = 'request';
    state.picking = false;
    state.loadingTrip = false;
    state.trip = emptyTrip();
    if (clear) { state.dest = ''; state.destPoint = null; }
    render();
    requestAnimationFrame(() => {
      frame();
      const input = DESKTOP.matches ? el.destDesktop : el.destMobile;
      input.focus();
      input.select();
    });
  }

  /** Enter / "See rides" without picking a suggestion: use the best match. */
  async function submitSearch(input) {
    const text = input.value.trim();
    if (!text) {
      toast('Saan tayo? Type your drop-off first.');
      input.focus();
      return;
    }
    const s = suggest.get(input);
    if (s && s.items.length) {
      chooseSuggestion(s.items[Math.max(0, s.active)]);
      return;
    }
    try {
      const [first] = await searchPlaces(text);
      if (first) chooseSuggestion(first);
      else toast(`No places found for “${text}”.`);
    } catch (err) {
      console.warn(err);
      toast(`${ttError(err)} You can still use “Pick on map”.`);
    }
  }

  /* =========================================================
     Search suggestions (combobox)
     ========================================================= */
  const suggest = new Map(); // input -> { list, items, active, timer, ctrl }

  function setupSuggest(input) {
    const list = document.getElementById(input.getAttribute('aria-controls'));
    const s = { list, items: [], active: -1, timer: null, ctrl: null };
    suggest.set(input, s);

    input.addEventListener('input', () => {
      clearTimeout(s.timer);
      const text = input.value.trim();
      if (text.length < 3) { closeSuggest(input); return; }
      s.timer = setTimeout(async () => {
        if (s.ctrl) s.ctrl.abort();
        s.ctrl = new AbortController();
        renderSuggest(input, [], 'Searching…', { loading: true });
        try {
          const places = await searchPlaces(text, s.ctrl.signal);
          if (input.value.trim() !== text) return;
          renderSuggest(input, places, places.length
            ? (places.far ? 'Nothing nearby matched, so these are farther away.' : '')
            : 'No places found. Try another name, or “Pick on map”.');
        } catch (err) {
          if (err.name === 'AbortError') return;
          console.warn(err);
          renderSuggest(input, [], ttError(err));
        }
      }, 300);
    });

    input.addEventListener('keydown', (e) => {
      if (list.hidden || !s.items.length) {
        if (e.key === 'Escape') closeSuggest(input);
        return;
      }
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault();
        const n = s.items.length;
        s.active = e.key === 'ArrowDown' ? (s.active + 1) % n : (s.active - 1 + n) % n;
        paintActive(input);
      } else if (e.key === 'Enter' && s.active >= 0) {
        e.preventDefault();
        chooseSuggestion(s.items[s.active]);
      } else if (e.key === 'Escape') {
        closeSuggest(input);
      }
    });

    input.addEventListener('blur', () => setTimeout(() => closeSuggest(input), 150));

    // mousedown keeps focus in the input so the click lands
    list.addEventListener('mousedown', (e) => e.preventDefault());
    list.addEventListener('click', (e) => {
      const li = e.target.closest('[data-index]');
      if (li) chooseSuggestion(s.items[Number(li.dataset.index)]);
    });
  }

  function renderSuggest(input, items, message, { loading = false } = {}) {
    const s = suggest.get(input);
    s.items = items;
    s.active = items.length ? 0 : -1;
    const id = s.list.id;
    s.list.classList.toggle('is-loading', loading);
    s.list.innerHTML = items.map((p, i) => `
      <li class="suggest__item" role="option" id="${id}-${i}" data-index="${i}" aria-selected="false" style="--i:${i}">
        <svg class="icon" aria-hidden="true"><use href="#i-pin"/></svg>
        <span class="suggest__text">
          <span class="suggest__title"></span>
          <span class="suggest__sub"></span>
        </span>
        <span class="suggest__km"></span>
      </li>`).join('') + (message ? '<li class="suggest__note" role="presentation"><span class="suggest__msg"></span></li>' : '');
    // Set text safely (no HTML from the API)
    items.forEach((p, i) => {
      const li = s.list.children[i];
      $('.suggest__title', li).textContent = p.title;
      $('.suggest__sub', li).textContent = p.subtitle;
      $('.suggest__km', li).textContent = isNum(p.km) ? (p.km < 10 ? `${p.km.toFixed(1)} km` : `${Math.round(p.km)} km`) : '';
    });
    if (message) {
      $('.suggest__msg', s.list.lastElementChild).textContent = message;
    }
    s.list.hidden = false;
    input.setAttribute('aria-expanded', 'true');
    paintActive(input);
  }

  function paintActive(input) {
    const s = suggest.get(input);
    $$('.suggest__item', s.list).forEach((li, i) => {
      const on = i === s.active;
      li.classList.toggle('is-active', on);
      li.setAttribute('aria-selected', String(on));
    });
    if (s.active >= 0) input.setAttribute('aria-activedescendant', `${s.list.id}-${s.active}`);
    else input.removeAttribute('aria-activedescendant');
  }

  function closeSuggest(input) {
    const s = suggest.get(input);
    if (!s) return;
    s.list.hidden = true;
    s.items = [];
    s.active = -1;
    input.setAttribute('aria-expanded', 'false');
    input.removeAttribute('aria-activedescendant');
  }
  const closeAllSuggest = () => el.destInputs.forEach(closeSuggest);

  async function chooseSuggestion(place) {
    if (!place) return;
    closeAllSuggest();
    try {
      const loc = await placeLocation(place);
      goToChoose(place.title, loc);
    } catch (err) {
      console.warn(err);
      toast(`${ttError(err)} Try another result.`);
    }
  }

  /* =========================================================
     Toast
     ========================================================= */
  let toastTimer;
  function toast(msg) {
    el.toast.textContent = msg;
    el.toast.classList.remove('is-visible');
    void el.toast.offsetWidth; // restart the entrance animation
    el.toast.classList.add('is-visible');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.toast.classList.remove('is-visible'), 3000);
  }

  /* =========================================================
     Events
     ========================================================= */
  el.destInputs.forEach((input) => {
    setupSuggest(input);
    input.addEventListener('input', () => {
      el.destInputs.forEach((other) => { if (other !== input) other.value = input.value; });
    });
  });

  $('#searchMobile').addEventListener('submit', (e) => {
    e.preventDefault();
    submitSearch(el.destMobile);
  });
  $('#searchDesktop').addEventListener('submit', (e) => {
    e.preventDefault();
    if (state.step === 'request') submitSearch(el.destDesktop);
  });

  el.destDesktop.addEventListener('click', () => {
    if (state.step === 'choose') goToRequest();
  });

  el.recentChip.addEventListener('click', () => {
    const r = latestRecent();
    if (r) goToChoose(r.title, r);
  });
  $$('[data-saved]').forEach((chip) => {
    chip.addEventListener('click', () => {
      const name = chip.dataset.saved === 'home' ? 'Home' : 'Work';
      toast(`Sign in to save your ${name} address.`);
    });
  });
  $('.chip--origin').addEventListener('click', () => locateUser());

  el.pickOnMap.addEventListener('click', () => {
    state.picking = !state.picking;
    render();
    if (state.picking) toast('Tap the map to drop your pin.');
  });

  $('#editTrip').addEventListener('click', () => goToRequest());
  $('#clearDest').addEventListener('click', () => goToRequest({ clear: true }));

  el.vehicles.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-vehicle]');
    if (btn) selectVehicle(btn.dataset.vehicle);
  });
  el.vehicles.addEventListener('keydown', (e) => {
    const keys = ['ArrowRight', 'ArrowDown', 'ArrowLeft', 'ArrowUp'];
    if (!keys.includes(e.key)) return;
    e.preventDefault();
    const ids = CONFIG.vehicles.map((v) => v.id);
    const dir = e.key === 'ArrowRight' || e.key === 'ArrowDown' ? 1 : -1;
    selectVehicle(ids[(ids.indexOf(state.vehicle) + dir + ids.length) % ids.length], true);
  });

  $$('[data-book]').forEach((btn) => {
    btn.addEventListener('click', () => {
      if (state.loadingTrip) return;
      bookRide(vehicleById(state.vehicle));
    });
  });

  $('#payBtn').addEventListener('click', () => toast('Payment options are coming soon.'));
  $('#zoomIn').addEventListener('click', () => map && map.zoomIn());
  $('#zoomOut').addEventListener('click', () => map && map.zoomOut());
  $('#locateBtn').addEventListener('click', () => locateUser());

  $$('.tab').forEach((tab) => {
    tab.addEventListener('click', () => {
      const icon = $('.tab__icon', tab);
      icon.classList.remove('is-bouncing');
      void icon.offsetWidth;
      icon.classList.add('is-bouncing');
    });
  });

  $$('[data-soon]').forEach((link) => {
    link.addEventListener('click', (e) => {
      e.preventDefault();
      toast(`${link.dataset.soon} is coming soon.`);
    });
  });
  $('a[href="#/auth"]').addEventListener('click', (e) => {
    e.preventDefault();
    toast('Sign in is coming soon.');
  });

  let resizeTimer;
  window.addEventListener('resize', () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => frame({ animate: false }), 150);
  });
  DESKTOP.addEventListener('change', () => { render(); frame({ animate: false }); });

  /* =========================================================
     PWA: install + offline
     ========================================================= */
  let installPrompt = null;
  const isStandalone = window.matchMedia('(display-mode: standalone)').matches || navigator.standalone;
  if (isStandalone) el.installBtn.hidden = true;

  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    installPrompt = e;
  });
  el.installBtn.addEventListener('click', async () => {
    if (!installPrompt) {
      toast('Use your browser menu → “Install” or “Add to Home Screen”.');
      return;
    }
    installPrompt.prompt();
    await installPrompt.userChoice;
    installPrompt = null;
  });
  window.addEventListener('appinstalled', () => { el.installBtn.hidden = true; });

  if ('serviceWorker' in navigator && location.protocol !== 'file:') {
    window.addEventListener('load', () => {
      const worker = new URL('/sw.js', location.origin).href;
      navigator.serviceWorker.register(worker).catch(() => { /* offline support is optional */ });
      // Older versions installed sw.js elsewhere (/html/sw.js); remove those.
      navigator.serviceWorker.getRegistrations().then((regs) => regs.forEach((r) => {
        const w = r.active || r.waiting || r.installing;
        if (w && w.scriptURL !== worker) r.unregister();
      })).catch(() => {});
    });
  }

  /* =========================================================
     Start
     ========================================================= */
  buildVehicles();
  render();
  initMap();
  setPickup(state.pickup, { fromGPS: false, recenter: false });
  locateUser({ quiet: true });
})();
