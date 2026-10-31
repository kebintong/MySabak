/* =========================================================
   mysabak · Shop maps (Shops list and the shop page)
   A MapLibre map in the mysabak street style with a pin per shop (in the shop's
   colour), the customer's "You" dot and an optional route line. The driver home uses it
   too: one pin per job request, the driver's dot, and the route + drop-off of the chosen job.
   If the map can't load, the container shows the drawn map background instead
   and the screens keep working without it.
   ========================================================= */
import { CONFIG } from './config.js';
import { baseMapOptions, addAttribution } from './map.js';

const ROUTE = '#7b3fbf';
const EMPTY = { type: 'FeatureCollection', features: [] };
const REDUCED_MOTION = window.matchMedia('(prefers-reduced-motion: reduce)');
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const PIN_SVG = '<svg viewBox="0 0 30 40" aria-hidden="true"><path d="M15 39C12 34 2 27 2 15a13 13 0 0 1 26 0c0 12-10 19-13 24Z"/><circle cx="15" cy="15" r="5.5"/></svg>';

/**
 * @param {HTMLElement} container  element to draw the map in
 * @param {object} opts
 * @param {boolean} [opts.interactive=true]  false: a picture of the map (shop page header)
 * @param {(id:string) => void} [opts.onPin]  a shop pin was tapped
 * @param {() => {top,bottom,left,right}} [opts.padding]  space covered by panels, so pins stay in view
 */
export function shopMap(container, { interactive = true, onPin = () => {}, padding = () => ({ top: 40, bottom: 40, left: 40, right: 40 }) } = {}) {
  const off = () => container.closest('.map, .shop-hero__map')?.classList.add('is-off');
  if (!window.maplibregl) { off(); return stub(); }

  const base = baseMapOptions();
  const map = new maplibregl.Map({
    container,
    transformRequest: base.transformRequest,
    center: CONFIG.startCenter,
    zoom: 13.5,
    interactive,
    attributionControl: false,
    dragRotate: false,
    pitchWithRotate: false,
    touchPitch: false,
  });
  if (interactive) { map.touchZoomRotate.disableRotation(); map.keyboard.disableRotation(); }
  addAttribution(map, 'bottom-right');

  let ready = false;
  let route = null;
  const pins = new Map(); // id → { marker, el, shop }
  let you = null;
  let dest = null;

  map.on('style.load', () => {
    ready = true;
    map.addSource('shop-route', { type: 'geojson', data: EMPTY });
    const layout = { 'line-cap': 'round', 'line-join': 'round' };
    map.addLayer({ id: 'shop-route-casing', type: 'line', source: 'shop-route', layout, paint: { 'line-color': '#fff', 'line-width': 9 } });
    map.addLayer({ id: 'shop-route-line', type: 'line', source: 'shop-route', layout, paint: { 'line-color': ROUTE, 'line-width': 5 } });
    map.addLayer({ id: 'shop-route-dash', type: 'line', source: 'shop-route', layout, paint: { 'line-color': '#fff', 'line-width': 1.5, 'line-dasharray': [1, 3] } });
    if (route) drawRoute();
  });
  map.on('error', (e) => {
    console.warn('Map error:', e && e.error);
    if (!ready) off();
  });

  function drawRoute() {
    if (!ready) return;
    map.getSource('shop-route').setData(route
      ? { type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: route } }
      : EMPTY);
  }

  const api = {
    map,
    /** Show these shops as pins (replaces the old ones). */
    setShops(shops) {
      const keep = new Set(shops.map((s) => s.id));
      pins.forEach((p, id) => { if (!keep.has(id)) { p.marker.remove(); pins.delete(id); } });
      shops.forEach((s) => {
        if (pins.has(s.id)) return;
        const el = document.createElement(interactive ? 'button' : 'div');
        el.className = 'spin';
        el.style.setProperty('--pin', s.color);
        el.innerHTML = `${PIN_SVG}<span class="spin__label">${esc(s.name)}</span>`;
        if (interactive) {
          el.type = 'button';
          el.setAttribute('aria-label', `${s.name}, ${s.area}`);
          el.addEventListener('click', (e) => { e.stopPropagation(); onPin(s.id); });
        }
        const marker = new maplibregl.Marker({ element: el, anchor: 'bottom' }).setLngLat([s.lng, s.lat]).addTo(map);
        pins.set(s.id, { marker, el, shop: s });
      });
    },
    /** Make one pin big and labelled (null: none). `fly` moves the map to it. */
    setActive(id, { fly = false } = {}) {
      pins.forEach((p, pid) => {
        p.el.classList.toggle('is-active', pid === id);
        p.el.setAttribute?.('aria-pressed', String(pid === id));
      });
      const p = pins.get(id);
      if (p && fly) map.easeTo({ center: [p.shop.lng, p.shop.lat], padding: padding(), zoom: Math.max(map.getZoom(), 14.5), duration: REDUCED_MOTION.matches ? 0 : 600 });
    },
    /** The customer's dot (null hides it). */
    setUser(point) {
      if (!point) { if (you) you.remove(); you = null; return; }
      if (!you) {
        const el = document.createElement('div');
        el.className = 'you-dot';
        el.innerHTML = '<span class="you-dot__ring"></span><span class="you-dot__dot"></span><span class="you-dot__label">You</span>';
        you = new maplibregl.Marker({ element: el, anchor: 'center' });
      }
      you.setLngLat([point.lng, point.lat]).addTo(map);
    },
    /** A drop-off flag (null hides it). */
    setDest(point, label = 'Drop-off') {
      if (!point) { if (dest) dest.remove(); dest = null; return; }
      if (!dest) {
        const el = document.createElement('div');
        el.className = 'dest-flag';
        dest = new maplibregl.Marker({ element: el, anchor: 'bottom' });
      }
      dest.getElement().innerHTML = `<svg viewBox="0 0 30 40" aria-hidden="true"><path d="M15 39C12 34 2 27 2 15a13 13 0 0 1 26 0c0 12-10 19-13 24Z"/><rect x="10" y="10" width="10" height="10" rx="2"/></svg><span class="spin__label">${esc(label)}</span>`;
      dest.setLngLat([point.lng, point.lat]).addTo(map);
    },
    /** Route line from the customer to the shop ([lng, lat] pairs; null clears it). */
    setRoute(coords) { route = coords && coords.length > 1 ? coords : null; drawRoute(); },
    /** Fit these points ([lng, lat]) in view. */
    fit(points, { maxZoom = 15.5, animate = false } = {}) {
      if (!points.length) return;
      const bounds = points.reduce((b, c) => b.extend(c), new maplibregl.LngLatBounds(points[0], points[0]));
      map.fitBounds(bounds, { padding: padding(), maxZoom, duration: animate && !REDUCED_MOTION.matches ? 600 : 0 });
    },
    resize() { map.resize(); },
  };

  map.setStyle(base.style, { transformStyle: base.transformStyle });
  return api;
}

function stub() {
  const noop = () => {};
  return { map: null, setShops: noop, setActive: noop, setUser: noop, setDest: noop, setRoute: noop, fit: noop, resize: noop };
}

/**
 * The customer's position if they already allowed location (never asks).
 * @returns {Promise<{lng:number, lat:number}|null>}
 */
export async function knownLocation() {
  try {
    if (!('geolocation' in navigator) || !navigator.permissions) return null;
    const p = await navigator.permissions.query({ name: 'geolocation' });
    if (p.state !== 'granted') return null;
    return await askLocation();
  } catch (_) { return null; }
}

/** Ask for the customer's position (shows the browser prompt). Rejects if refused. */
export function askLocation() {
  return new Promise((resolve, reject) => {
    if (!('geolocation' in navigator)) { reject(new Error('Location isn’t available in this browser.')); return; }
    navigator.geolocation.getCurrentPosition(
      (pos) => resolve({ lng: pos.coords.longitude, lat: pos.coords.latitude }),
      reject,
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 },
    );
  });
}
