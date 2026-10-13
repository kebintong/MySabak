/* =========================================================
   mysabak · Ride booking screen (Design A)
   Vanilla JS modules, no build step.

   Two steps on one screen:
     1. "request" – set a drop-off (search, a recent place, or pick on map)
     2. "choose"  – pick Motor / Sedan / SUV, see the fare, book

   Files:
     config.js  settings (vehicles, fares, map start)
     api.js     every server call (BACKEND: replace this one)
     map.js     the map, markers and route line
     app.js     this file: state, screens, buttons
   ========================================================= */
import { CONFIG } from './config.js';
import {
  searchPlaces, placeLocation, addressFor, routeBetween, straightLine, faresFor, bookRide, errorMessage,
} from './api.js';
import { initMap, updateMap, frame, zoomIn, zoomOut } from './map.js';

const REDUCED_MOTION = window.matchMedia('(prefers-reduced-motion: reduce)');
const DESKTOP = window.matchMedia('(min-width: 900px)');

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

/** Real route, or a straight line (with a toast) if routing fails. */
async function estimateTrip(from, to) {
  try {
    return await routeBetween(from, to);
  } catch (err) {
    console.warn(err);
    toast(`${errorMessage(err)} Showing a straight line instead.`);
    return straightLine(from, to);
  }
}

/** Book button: hands the trip to api.bookRide() and shows "Finding a driver…" meanwhile. */
async function book() {
  if (state.loadingTrip || el.body.classList.contains('is-booking')) return;
  const vehicle = vehicleById(state.vehicle);
  el.body.classList.add('is-booking');
  try {
    const res = await bookRide({
      vehicle: vehicle.id,
      pickup: { ...state.pickup, label: state.pickupLabel },
      dropoff: { ...state.destPoint, label: state.dest },
      trip: state.trip,
      payment: CONFIG.paymentMethod,
    });
    const article = /^[AEIOU]|^SUV/i.test(vehicle.name) ? 'an' : 'a';
    toast(`Booking request sent for ${article} ${vehicle.name}.${res && res.demo ? ' (Demo — no driver is dispatched.)' : ''}`);
  } catch (err) {
    console.warn(err);
    toast(`${errorMessage(err)} Booking didn’t go through.`);
  } finally {
    el.body.classList.remove('is-booking');
  }
}

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

const fareOf = (v) => faresFor(state.trip)[v.id]; // { total, base, distance } or null
function fareFor(v) {
  if (state.loadingTrip) return `${CONFIG.currency}…`;
  const f = fareOf(v);
  return f ? peso(f.total) : `${CONFIG.currency}[FARE]`;
}
const baseFor = (v) => (fareOf(v) ? peso(fareOf(v).base) : `${CONFIG.currency}[AMOUNT]`);
const distanceFareFor = (v) => (fareOf(v) ? peso(fareOf(v).distance) : `${CONFIG.currency}[AMOUNT]`);
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
    const label = await addressFor(asked);
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
      <svg class="icon v-icon" aria-hidden="true"><use href="assets/images/icons.svg#${v.icon}"/></svg>
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
      const name = await addressFor(asked);
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
    const [first] = await searchPlaces(text, state.pickup);
    if (first) chooseSuggestion(first);
    else toast(`No places found for “${text}”.`);
  } catch (err) {
    console.warn(err);
    toast(`${errorMessage(err)} You can still use “Pick on map”.`);
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
        const places = await searchPlaces(text, state.pickup, { signal: s.ctrl.signal });
        if (input.value.trim() !== text) return;
        renderSuggest(input, places, places.length
          ? (places.far ? 'Nothing nearby matched, so these are farther away.' : '')
          : 'No places found. Try another name, or “Pick on map”.');
      } catch (err) {
        if (err.name === 'AbortError') return;
        console.warn(err);
        renderSuggest(input, [], errorMessage(err));
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
      <svg class="icon" aria-hidden="true"><use href="assets/images/icons.svg#i-pin"/></svg>
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
    toast(`${errorMessage(err)} Try another result.`);
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

$$('[data-book]').forEach((btn) => btn.addEventListener('click', book));

$('#payBtn').addEventListener('click', () => toast('Payment options are coming soon.'));
$('#zoomIn').addEventListener('click', zoomIn);
$('#zoomOut').addEventListener('click', zoomOut);
$('#locateBtn').addEventListener('click', () => locateUser());

$$('.tab').forEach((tab) => {
  tab.addEventListener('click', () => {
    const icon = $('.tab__icon', tab);
    icon.classList.remove('is-bouncing');
    void icon.offsetWidth;
    icon.classList.add('is-bouncing');
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
    // Lives in assets/js/ but looks after the whole site (the server allows scope '/').
    const worker = new URL('/assets/js/sw.js', location.origin).href;
    navigator.serviceWorker.register(worker, { scope: '/' }).catch(() => { /* offline support is optional */ });
    // Older versions installed sw.js elsewhere (/sw.js, /html/sw.js); remove those.
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
initMap({
  state,
  el,
  on: {
    pickupMoved: (point) => setPickup(point, { fromGPS: false, recenter: false }),
    mapTapped: (point) => { if (state.picking) goToChoose('Pinned location', point, { nameFromMap: true }); },
    error: toast,
  },
});
setPickup(state.pickup, { fromGPS: false, recenter: false });
locateUser({ quiet: true });
