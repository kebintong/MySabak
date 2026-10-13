/* =========================================================
   mysabak · map (MapLibre GL JS + TomTom map style, "street" theme)

   Draws the map, the pickup / drop-off markers and the route line.
   It only reads the app's state; taps and drags go back to app.js
   through the callbacks given to initMap().
   Tiles, icons and the style come from TomTom through the proxy in api.js.
   ========================================================= */
import { CONFIG } from './config.js';
import { TOMTOM_PROXY, tomtomUrl, errorMessage } from './api.js';

const BRAND = '#5630d8';
const REDUCED_MOTION = window.matchMedia('(prefers-reduced-motion: reduce)');
const DESKTOP = window.matchMedia('(min-width: 900px)');
const TT_HOSTS = /^https:\/\/([a-d]\.)?api\.tomtom\.com/;

export const zoomIn = () => map && map.zoomIn();
export const zoomOut = () => map && map.zoomOut();

let map = null;
let mapReady = false;
const markers = {};
const EMPTY_LINE = { type: 'FeatureCollection', features: [] };

// Set by initMap(): the app's state (read only) and callbacks back into the app
let state;
let el;
let on;

// TomTom's style points at api.tomtom.com (and a–d.api.tomtom.com); send those through our proxy.
function viaProxy(raw) {
  if (!TT_HOSTS.test(raw)) return { url: raw };
  const u = new URL(raw.replace(TT_HOSTS, TOMTOM_PROXY));
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

const TT_STYLE_VERSION = '0.6.0-0';
function styleUrl() {
  // Same style address TomTom's own Maps SDK uses (style.json, pinned version).
  // The earlier '0.*/style' address got 403 "not allowed to access this endpoint".
  return tomtomUrl(`/maps/orbis/assets/styles/${TT_STYLE_VERSION}/style.json`, { apiVersion: 1, map: themeById(CONFIG.mapStyle).base }).toString();
}

/** What any mysabak map needs: TomTom style through the proxy, restyled as the street theme. Used by shop-map.js too. */
export function baseMapOptions() {
  const theme = themeById(CONFIG.mapStyle);
  return {
    style: styleUrl(),
    transformRequest: (url) => viaProxy(url),
    transformStyle: (_prev, next) => (theme.street ? streetStyle(next) : next),
  };
}

/**
 * Start the map.
 * @param {object} ctx
 * @param {object} ctx.state   the app's state (pickup, destPoint, trip, step, loadingTrip); read only
 * @param {object} ctx.el      { app, bottom } elements, to keep the camera clear of the panels
 * @param {object} ctx.on      callbacks: pickupMoved({lng,lat}), mapTapped({lng,lat}), error(message)
 */
export function initMap(ctx) {
  if (map) return;
  ({ state, el, on } = ctx);
  if (!window.maplibregl) {
    on.error('The map couldn’t load. Check your internet connection.');
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

  markers.pickup = new maplibregl.Marker({ element: document.getElementById('mkPickup'), anchor: 'center', draggable: true })
    .setLngLat(state.pickup).addTo(map);
  markers.pickup.on('dragstart', () => markers.pickup.getElement().classList.add('is-dragging'));
  markers.pickup.on('dragend', () => {
    markers.pickup.getElement().classList.remove('is-dragging');
    const p = markers.pickup.getLngLat();
    on.pickupMoved({ lng: p.lng, lat: p.lat });
  });
  markers.origin = new maplibregl.Marker({ element: document.getElementById('mkOrigin'), anchor: 'center' }).setLngLat(state.pickup).addTo(map);
  markers.dest = new maplibregl.Marker({ element: document.getElementById('mkDest'), anchor: 'bottom' }).setLngLat(state.pickup);
  markers.time = new maplibregl.Marker({ element: document.getElementById('mkTime'), anchor: 'bottom', offset: [0, -10] }).setLngLat(state.pickup);

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
      on.error(st ? errorMessage({ status: st }) : 'Map tiles couldn’t load. Check your connection.');
    }
  });

  map.on('click', (e) => on.mapTapped({ lng: e.lngLat.lng, lat: e.lngLat.lat }));

  // The street theme rewrites TomTom's style before the first frame, so its own colours never flash.
  const base = baseMapOptions();
  map.setStyle(base.style, { transformStyle: base.transformStyle });
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
   MapLibre glyphs in assets/fonts (open font licence: assets/fonts/OFL.txt).
   Only the map labels use it; the app UI keeps its own fonts. */
const GLYPHS = `${new URL('/assets/fonts/', location.origin).href}{fontstack}/{range}.pbf`;
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
/** Sync markers and the route line with the app's state. Call after every state change. */
export function updateMap() {
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
export function frame({ animate = true } = {}) {
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
