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

const PIN_SVG = '<svg viewBox="0 0 730 965" aria-hidden="true"><path d="M365 0C566.584 6.67149e-05 730 163.416 730 365C730 409.184 722.147 451.533 707.765 490.731C707.145 492.418 706.789 494.187 706.43 495.948C705.799 499.045 704.547 502.116 702.589 505.01C701.877 506.061 701.272 507.181 700.772 508.349C682.355 551.432 655.889 590.253 623.264 622.922C622.343 623.843 621.508 624.847 620.778 625.926L406.394 942.792C386.564 972.1 343.399 972.101 323.569 942.792L109.108 625.813C108.379 624.736 107.547 623.735 106.629 622.815C74.0992 590.215 47.6995 551.497 29.3061 508.536C28.7922 507.336 28.1696 506.184 27.438 505.102L24.208 500.328C22.0607 497.154 20.8736 493.74 20.5119 490.338C20.2022 487.427 19.9894 484.471 19.0538 481.697C6.698 445.055 0 405.81 0 365C0 163.416 163.416 0 365 0Z"/><circle cx="364.483" cy="368.5" r="205.5"/></svg>'; // the Location Fill pin

/**
 * @param {HTMLElement} container  element to draw the map in
 * @param {object} opts
 * @param {boolean} [opts.interactive=true]  false: a picture of the map (shop page header)
 * @param {boolean} [opts.cooperative=false]  a map inside a scrolling page: two fingers (or Ctrl + scroll) move it,
 *   one finger still scrolls the page (Trips & Orders cards)
 * @param {(id:string) => void} [opts.onPin]  a shop pin was tapped
 * @param {() => {top,bottom,left,right}} [opts.padding]  space covered by panels, so pins stay in view
 */
export function shopMap(container, { interactive = true, cooperative = false, onPin = () => {}, padding = () => ({ top: 40, bottom: 40, left: 40, right: 40 }) } = {}) {
  const off = () => container.closest('.map, .shop-hero__map')?.classList.add('is-off');
  if (!window.maplibregl) { off(); return stub(); }

  const base = baseMapOptions();
  const map = new maplibregl.Map({
    container,
    transformRequest: base.transformRequest,
    center: CONFIG.startCenter,
    zoom: 13.5,
    interactive,
    cooperativeGestures: interactive && cooperative,
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
  let rider = null;
  let riderAt = null; // where the rider is drawn now
  let glide = 0;

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
    /** The driver or rider on their way, as the mascot (null hides it). */
    setRider(point) {
      if (!point) { if (rider) rider.remove(); rider = null; return; }
      if (!rider) {
        const el = document.createElement('div');
        el.className = 'rider-mk';
        el.innerHTML = '<img src="/assets/images/mascot.svg" alt="">';
        rider = new maplibregl.Marker({ element: el, anchor: 'center' });
      }
      rider.setLngLat([point.lng, point.lat]).addTo(map);
    },
    /** The rider glides to a new position over `ms`, a frame at a time, instead of jumping (null hides it). */
    moveRider(point, ms = 2000) {
      cancelAnimationFrame(glide);
      const from = riderAt;
      riderAt = point;
      if (!point || !from || REDUCED_MOTION.matches) { api.setRider(point); return; }
      const t0 = performance.now();
      const frame = (now) => {
        const f = Math.min(1, (now - t0) / ms);
        api.setRider({ lng: from.lng + (point.lng - from.lng) * f, lat: from.lat + (point.lat - from.lat) * f });
        if (f < 1) glide = requestAnimationFrame(frame);
      };
      glide = requestAnimationFrame(frame);
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
  return { map: null, setShops: noop, setActive: noop, setUser: noop, setDest: noop, setRider: noop, moveRider: noop, setRoute: noop, fit: noop, resize: noop };
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
