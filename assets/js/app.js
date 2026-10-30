/* =========================================================
   mysabak · Home + Ride booking screen
   Vanilla JS modules, no build step.

   index.html opens on the Home dashboard. Ride links switch to the ride screen without a reload:
     #ride / #where (search) = Ride, #moto = Ride with Motor picked, #parcel = Express,
     #rebook = Choose your ride for the latest recent place (Trips → Rebook). Back = Home.
   Two modes: Ride (passengers) and Express (parcels), same screen.
   Steps:
     1. "request" – set a drop-off (search, a recent place, or pick on map)
     2. "choose"  – pick Motor / Sedan / SUV, see the fare, tap Book
                    (Express asks for parcel details first), then the pay sheet:
                    Cash / GCash / Online banking + "Your price" (anything above the fare is a tip)
     3. "search"  – finding a driver
     4. "trip"    – driver on the way → on the trip
   After a trip: showTripDone() shows the Ride complete screen.

   Files:
     config.js  settings (vehicles, fares, map start)
     api.js     every server call (BACKEND: replace this one)
     map.js     the map, markers and route line
     app.js     this file: state, screens, buttons
   ========================================================= */
import { CONFIG } from './config.js';
import {
  searchPlaces, placeLocation, addressFor, routeBetween, straightLine, faresFor, bookRide, errorMessage,
  findDriver, cancelRide, onTripUpdate, rateRide, currentUser,
} from './api.js';
import { initMap, updateMap, frame, zoomIn, zoomOut } from './map.js';
import { openTipSheet, setupInstall, mountAccount, filterTabs, guardRole } from './ui.js';
import { splitPrice, cleanTip } from './money.js';

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
  mode: 'ride',   // 'ride' | 'express'
  parcel: null,   // Express: { receiverName, receiverPhone, size, item, notes }
  payment: CONFIG.defaultRidePayment, // 'cash' | 'gcash' | 'bank'
  price: null,    // { fare, tip, total } chosen on the pay sheet
  booking: null,  // { id, demo }
  driver: null,   // { name, rating, vehicle, …, status, pos, eta }
};
let tripToken = 0;
let bookingToken = 0;
let stopTrip = () => {};

/* Words that change between Ride and Express */
const MODES = {
  ride: {
    askTitle: 'Saan tayo?', askHint: 'Set your drop-off above.', placeholder: 'Where to?',
    bookVerb: 'Book', seeLabel: 'See rides', capacity: (v) => v.capacity,
    payTitle: 'Confirm your ride', searchTitle: 'Finding you a driver',
    steps: ['On the way', 'On the trip', 'Arrived'],
    status: {
      arriving: 'Your driver is on the way', arrived: 'Your driver is here',
      on_trip: () => `On the way to ${state.dest || 'your drop-off'}`, completed: 'You’ve arrived',
    },
    doneTitle: 'You’ve arrived',
  },
  express: {
    askTitle: 'Saan ipapadala?', askHint: 'Set where it goes above.', placeholder: 'Deliver to?',
    bookVerb: 'Send with', seeLabel: 'See options', capacity: (v) => v.parcel,
    payTitle: 'Confirm your delivery', searchTitle: 'Finding a driver for your parcel',
    steps: ['Picking up', 'Delivering', 'Delivered'],
    status: {
      arriving: 'Your driver is coming for the parcel', arrived: 'Your driver is at the pickup',
      on_trip: 'Your parcel is on the way', completed: 'Parcel delivered',
    },
    doneTitle: 'Parcel delivered',
  },
};
const words = () => MODES[state.mode];

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

/** Book button: Express asks for the parcel details first, then everyone picks how to pay. */
function book() {
  if (state.loadingTrip || state.step !== 'choose') return;
  if (state.mode === 'express' && !state.parcel) { openParcelSheet(); return; }
  openPaySheet();
}

/* ---------- Pay sheet: payment method + "Your price" ---------- */
const paymentById = (id) => CONFIG.ridePayments.find((m) => m.id === id) || CONFIG.ridePayments[0];
const fareNumber = () => { const f = fareOf(vehicleById(state.vehicle)); return f ? Math.round(f.total) : null; };
let tipDraft = 0;
let customOpen = false; // the "Custom" chip shows a box to type a price (or a tip while the fare is unknown)
const draftPrice = () => splitPrice({ fare: fareNumber(), tip: tipDraft, max: CONFIG.tips.max });
const totalText = (p) => (p.total !== null ? peso(p.total) : `${CONFIG.currency}[FARE]${p.tip ? ` + ${peso(p.tip)}` : ''}`);

function openPaySheet() {
  const dlg = $('#paySheet');
  tipDraft = state.price ? state.price.tip : 0;
  customOpen = false;
  $$('input[name="payment"]', dlg).forEach((r) => { r.checked = r.value === state.payment; });
  $('#customPrice').value = '';
  renderPrice();
  if (typeof dlg.showModal === 'function') dlg.showModal(); else dlg.setAttribute('open', '');
}

function renderPrice() {
  const p = draftPrice();
  const fare = fareNumber();
  $('#priceValue').textContent = totalText(p);
  $$('[data-tip]', $('#tipChips')).forEach((b) => b.setAttribute('aria-pressed', String(!customOpen && Number(b.dataset.tip) === p.tip)));
  $('[data-custom]').setAttribute('aria-pressed', String(customOpen));
  $('[data-custom]').setAttribute('aria-expanded', String(customOpen));
  $('#customRow').hidden = !customOpen;
  $('[data-price-step="-1"]').disabled = p.tip === 0;
  $('[data-price-step="1"]').disabled = p.tip >= CONFIG.tips.max;
  $('#customLabel').textContent = fare !== null ? `Your price (fare ${peso(fare)} + tip)` : 'Tip amount';
  const input = $('#customPrice');
  input.placeholder = fare !== null ? String(fare) : '0';
  input.min = fare !== null ? String(fare) : '0';
  $('#priceBreakdown').innerHTML = `
    <div class="receipt__row"><dt>Fare<span>100% to your driver</span></dt><dd>${fare !== null ? peso(fare) : `${CONFIG.currency}[FARE]`}</dd></div>
    <div class="receipt__row"><dt>Tip<span>100% to mysabak</span></dt><dd>${p.tip ? peso(p.tip) : 'No tip'}</dd></div>
    <div class="receipt__row receipt__row--total"><dt>You pay</dt><dd>${totalText(p)}</dd></div>`;
  $('#findBtn').textContent = `Find a driver · ${totalText(p)}`;
}

function setupPaySheet() {
  const dlg = $('#paySheet');
  $('#payMethods').insertAdjacentHTML('beforeend', CONFIG.ridePayments.map((m) => `
    <label class="paymethod"><input type="radio" name="payment" value="${m.id}">
      <svg class="icon icon--xl" aria-hidden="true"><use href="assets/images/icons.svg#${m.icon}"/></svg>
      <span class="paymethod__text"><span class="paymethod__name">${m.name}</span><small>${m.hint}</small></span></label>`).join(''));
  $('#tipChips').innerHTML = [0, ...CONFIG.tips.presets].map((n) =>
    `<button type="button" class="chip" data-tip="${n}" aria-pressed="false">${n ? `+${peso(n)}` : 'No tip'}</button>`).join('')
    + '<button type="button" class="chip" data-custom aria-pressed="false" aria-expanded="false" aria-controls="customRow">Custom</button>';
  $('#tipChips').addEventListener('click', (e) => {
    if (e.target.closest('[data-custom]')) {
      customOpen = true;
      renderPrice();
      const input = $('#customPrice');
      const fare = fareNumber();
      if (!input.value) input.value = draftPrice().tip ? String(fare !== null ? fare + draftPrice().tip : draftPrice().tip) : '';
      input.focus();
      return;
    }
    const b = e.target.closest('[data-tip]');
    if (!b) return;
    tipDraft = Number(b.dataset.tip);
    customOpen = false;
    $('#customPrice').value = '';
    renderPrice();
  });
  $$('[data-price-step]', dlg).forEach((b) => b.addEventListener('click', () => {
    tipDraft = Math.min(CONFIG.tips.max, Math.max(0, draftPrice().tip + Number(b.dataset.priceStep) * CONFIG.priceStep));
    customOpen = false;
    $('#customPrice').value = '';
    renderPrice();
  }));
  $('#customPrice').addEventListener('input', (e) => {
    const v = e.target.value;
    const fare = fareNumber();
    tipDraft = v === '' ? 0 : fare !== null ? splitPrice({ fare, price: v, max: CONFIG.tips.max }).tip : cleanTip(v, CONFIG.tips.max);
    renderPrice();
  });
  $('[data-close]', dlg).addEventListener('click', () => dlg.close());
  $('#payForm').addEventListener('submit', (e) => {
    e.preventDefault();
    const picked = $('input[name="payment"]:checked', dlg);
    state.payment = picked ? picked.value : CONFIG.defaultRidePayment;
    state.price = draftPrice();
    dlg.close();
    startBooking();
  });
}

/* ---------- Booking → finding a driver → trip ---------- */
/* Hide / show the floating status card (steps "search" and "trip") */
function setStatusHidden(hidden) {
  state.statusHidden = hidden;
  el.body.classList.toggle('is-status-hidden', hidden);
  $('#statusBar').setAttribute('aria-expanded', String(!hidden));
  requestAnimationFrame(() => frame());
  if (!hidden) { const btn = $(`#${state.step === 'trip' ? 'tripPanel' : 'searchPanel'} [data-hide-status]`); if (btn) btn.focus(); }
  else $('#statusBar').focus();
}

async function startBooking() {
  const vehicle = vehicleById(state.vehicle);
  const token = ++bookingToken;
  setStatusHidden(false);
  state.step = 'search';
  state.driver = null;
  state.booking = null;
  render();
  requestAnimationFrame(() => frame());
  try {
    const res = await bookRide({
      kind: state.mode,
      vehicle: vehicle.id,
      pickup: { ...state.pickup, label: state.pickupLabel },
      dropoff: { ...state.destPoint, label: state.dest },
      trip: state.trip,
      payment: state.payment,
      price: state.price,
      ...(state.mode === 'express' ? { parcel: state.parcel } : {}),
    });
    if (token !== bookingToken) return;
    state.booking = { id: res.id, demo: res.demo };
    const driver = await findDriver(res.id);
    if (token !== bookingToken) return;
    state.driver = { ...driver, status: 'arriving', pos: null, eta: null };
    state.step = 'trip';
    render();
    stopTrip = onTripUpdate(res.id, onTrip);
  } catch (err) {
    if (token !== bookingToken || err.status === 499) return;
    console.warn(err);
    toast(err.status === 404 ? 'No drivers are free nearby right now. Try again in a few minutes.' : `${errorMessage(err)} Booking didn’t go through.`);
    backToChoose();
  }
}

function onTrip(update) {
  if (!state.driver) return;
  const changed = state.driver.status !== update.status;
  Object.assign(state.driver, { status: update.status, pos: update.driver, eta: update.etaMinutes });
  render();
  if (changed) frame();
  if (update.status === 'completed') {
    stopTrip();
    showTripDone({
      id: state.booking.id, kind: state.mode, vehicle: vehicleById(state.vehicle), driver: state.driver,
      from: fromText(), to: state.dest, distance: distanceText(), duration: durationText(),
      price: state.price, payment: paymentById(state.payment),
    });
  } else if (update.status === 'cancelled') {
    stopTrip();
    toast('Your driver cancelled. You weren’t charged. Book again to find another driver.');
    backToChoose();
  }
}

function backToChoose() {
  bookingToken++;
  stopTrip();
  state.step = 'choose';
  state.driver = null;
  state.booking = null;
  el.body.classList.remove('is-status-hidden');
  render();
  requestAnimationFrame(() => frame());
}

async function cancelBooking({ ask = false } = {}) {
  // eslint-disable-next-line no-alert
  if (ask && !window.confirm('Cancel this ride?')) return;
  const id = state.booking && state.booking.id;
  backToChoose();
  if (id) { try { await cancelRide(id); } catch (err) { console.warn(err); } }
  toast(state.mode === 'express' ? 'Delivery cancelled.' : 'Ride cancelled.');
}

/**
 * Trip / delivery finished: the Ride complete screen (route, driver, what you paid, rating).
 * Backend: the app calls this when onTripUpdate() reports 'completed'.
 */
function showTripDone(order) {
  const dlg = document.createElement('dialog');
  dlg.className = 'done';
  dlg.setAttribute('aria-labelledby', 'doneTitle');
  const p = order.price || { fare: null, tip: 0, total: null };
  const d = order.driver;
  const initials = d.name.split(/\s+/).map((w) => w[0]).join('').slice(0, 2).toUpperCase();
  const time = new Date().toLocaleTimeString('en-PH', { hour: 'numeric', minute: '2-digit' });
  dlg.innerHTML = `<div class="done__card">
    <div class="done__hero">
      <span class="done__check" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg></span>
      <h2 class="done__title" id="doneTitle">${esc(words().doneTitle)}</h2>
      <p class="done__sub">${esc(order.to || 'Your drop-off')} · ${esc(time)}</p>
    </div>
    <div class="done__body">
      <ol class="done__route" aria-label="Trip">
        <li class="done__from"><span>From</span>${esc(order.from)}</li>
        <li class="done__to"><span>To</span>${esc(order.to || 'Your drop-off')}</li>
      </ol>
      <p class="done__meta">${esc(order.vehicle.name)} · ${esc(order.distance)} · ${esc(order.duration)}</p>

      <div class="done__driver">
        <span class="driver__ava" aria-hidden="true">${esc(initials)}</span>
        <div class="driver__main"><span class="driver__name">${esc(d.name)}</span>
          <span class="driver__meta">${esc(`${d.vehicle.color} ${d.vehicle.model}`)} · ${esc(d.vehicle.plate)}</span></div>
      </div>
      <div class="done__rate" role="radiogroup" aria-label="Rate ${esc(d.name)}">
        <span class="done__rate-label">How was ${esc(d.name.split(' ')[0])}?</span>
        <span class="stars">${[1, 2, 3, 4, 5].map((n) => `<button type="button" class="star" role="radio" aria-checked="false" data-star="${n}" aria-label="${n} star${n > 1 ? 's' : ''}"><svg class="icon" aria-hidden="true"><use href="assets/images/icons.svg#i-star"/></svg></button>`).join('')}</span>
      </div>

      <dl class="receipt">
        <div class="receipt__row"><dt>Fare<span>100% to your driver</span></dt><dd>${p.fare !== null ? peso(p.fare) : `${CONFIG.currency}[FARE]`}</dd></div>
        ${p.tip ? `<div class="receipt__row"><dt>Tip<span>100% to mysabak · thank you!</span></dt><dd>${peso(p.tip)}</dd></div>` : ''}
        <div class="receipt__row receipt__row--total"><dt>Total<span>${esc(order.payment.name)}</span></dt><dd>${totalText(p)}</dd></div>
      </dl>
    </div>
    <div class="done__foot">
      ${p.tip ? '' : '<button type="button" class="button button--ghost" data-tip-later>Tip mysabak</button>'}
      <button type="button" class="button" data-done autofocus>Done</button>
    </div></div>`;
  document.body.appendChild(dlg);

  $('.stars', dlg).addEventListener('click', (e) => {
    const b = e.target.closest('[data-star]');
    if (!b) return;
    const n = Number(b.dataset.star);
    $$('.star', dlg).forEach((s) => {
      s.classList.toggle('is-on', Number(s.dataset.star) <= n);
      s.setAttribute('aria-checked', String(Number(s.dataset.star) === n));
    });
    $('.done__rate-label', dlg).textContent = `Thanks! You gave ${d.name.split(' ')[0]} ${n} star${n > 1 ? 's' : ''}.`;
    rateRide(order.id, n).catch((err) => console.warn(err));
  });
  const finish = () => {
    dlg.close();
    dlg.remove();
    state.parcel = null;
    state.price = null;
    state.driver = null;
    state.booking = null;
    el.body.classList.remove('is-status-hidden');
    goToRequest({ clear: true });
  };
  $('[data-done]', dlg).addEventListener('click', finish);
  dlg.addEventListener('cancel', (e) => { e.preventDefault(); finish(); });
  const later = $('[data-tip-later]', dlg);
  if (later) {
    later.addEventListener('click', async () => {
      dlg.close();
      await openTipSheet({ orderId: order.id, orderType: order.kind, title: 'Tip mysabak', subtitle: `${order.vehicle.name} · ${order.to || 'your drop-off'}` });
      finish();
    });
  }
  if (typeof dlg.showModal === 'function') dlg.showModal(); else dlg.setAttribute('open', '');
  $('[data-done]', dlg).focus({ preventScroll: true }); // not the first star: focusing it could scroll on iOS
}

/* ---------- Express: parcel details ---------- */
function openParcelSheet() {
  const dlg = $('#parcelSheet');
  if (typeof dlg.showModal === 'function') dlg.showModal(); else dlg.setAttribute('open', '');
  setTimeout(() => $('input[name="receiverName"]', dlg).focus(), 50);
}
function setupParcelSheet() {
  const dlg = $('#parcelSheet');
  const form = $('#parcelForm');
  $('#parcelSizes').insertAdjacentHTML('beforeend', CONFIG.parcelSizes.map((p, i) => `
    <label class="pill-radio pill-radio--card"><input type="radio" name="size" value="${p.id}"${i === 0 ? ' checked' : ''}>
      <span>${p.name}<small>${p.hint}</small></span></label>`).join(''));
  $('[data-close]', dlg).addEventListener('click', () => dlg.close());
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    if (!form.reportValidity()) return;
    const data = Object.fromEntries(new FormData(form));
    state.parcel = {
      receiverName: data.receiverName.trim(),
      receiverPhone: data.receiverPhone.replace(/\s+/g, ''),
      size: data.size,
      item: data.item.trim(),
      notes: data.notes.trim(),
    };
    dlg.close();
    book();
  });
}

function setMode(mode) {
  if (state.mode === mode) return;
  state.mode = mode;
  state.parcel = null;
  render();
}

/* ---------- Elements ---------- */
const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

const el = {
  body: document.body,
  app: $('.app'),
  bottom: $('.bottom'),
  ride: $('#ride'),
  vehicles: $('.vehicles'),
  destInputs: $$('[data-dest]'),
  dest: $('#dest'),
  pickOnMap: $('#pickOnMap'),
  toast: $('#toast'),
};

/* ---------- Formatting ---------- */
const isNum = (n) => typeof n === 'number' && Number.isFinite(n);
const esc = (t) => String(t ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
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
      <img class="v-icon" src="assets/images/v3/${v.art}.svg" alt="" width="80" height="50">
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
  const pay = paymentById(state.payment);
  setBind('payment', pay.name);
  $$('[data-pay-icon]').forEach((u) => u.setAttribute('href', `assets/images/icons.svg#${pay.icon}`));
  $$('[data-vehicle-icon], [data-driver-icon]').forEach((u) => u.setAttribute('href', `assets/images/icons.svg#${v.icon}`));
  if (state.price) setBind('priceTotal', totalText(state.price));
  else setBind('priceTotal', fareFor(v));
  renderTrip();
  const w = words();
  ['askTitle', 'askHint', 'bookVerb', 'seeLabel', 'payTitle', 'searchTitle'].forEach((k) => setBind(k, w[k]));
  if (state.step === 'search') { setBind('barTitle', `${w.searchTitle}…`); setBind('barSub', `${v.name} · ${pay.name}`); }
  setBind('stepArriving', w.steps[0]);
  setBind('stepTrip', w.steps[1]);
  setBind('stepDone', w.steps[2]);
  el.destInputs.forEach((input) => { input.placeholder = w.placeholder; });
  el.body.classList.toggle('is-express', state.mode === 'express');
  $$('.mode__btn').forEach((b) => b.setAttribute('aria-checked', String(b.dataset.mode === state.mode)));

  const recent = latestRecent();
  $$('[data-recent]').forEach((node) => { node.hidden = !recent; });
  if (recent) setBind('recent', recent.title);

  $$('.vehicle', el.vehicles).forEach((btn) => {
    const veh = vehicleById(btn.dataset.vehicle);
    const on = veh.id === state.vehicle;
    btn.setAttribute('aria-checked', String(on));
    btn.tabIndex = on ? 0 : -1;
    $('.v-eta', btn).textContent = etaFor(veh);
    $('.v-fare', btn).textContent = fareFor(veh);
    $('.v-cap', btn).textContent = `${w.capacity(veh)} · `;
    btn.setAttribute('aria-label', `${veh.name}, ${w.capacity(veh)}, ${fareFor(veh)}, ${etaFor(veh)} away`);
  });

  el.dest.readOnly = state.step !== 'request';
  el.destInputs.forEach((input) => {
    if (document.activeElement !== input) input.value = state.dest;
  });
}

/* Driver card and trip status (step "trip") */
const STEP_ORDER = { arriving: 0, arrived: 0, on_trip: 1, completed: 2 };
function renderTrip() {
  const d = state.driver;
  if (!d) return;
  const w = words();
  const title = w.status[d.status];
  setBind('tripTitle', typeof title === 'function' ? title() : title || '');
  const eta = isNum(d.eta) ? d.eta : null;
  const sub = {
    arriving: eta ? `Arriving in ${eta} min` : 'Arriving soon',
    arrived: `Look for a ${d.vehicle.color.toLowerCase()} ${d.vehicle.model} · ${d.vehicle.plate}`,
    on_trip: eta ? `About ${eta} min to go` : (state.mode === 'express' ? 'On the way to the receiver' : 'Enjoy the ride'),
    completed: '',
  }[d.status];
  setBind('tripSub', sub || '');
  setBind('barTitle', typeof title === 'function' ? title() : title || '');
  setBind('barSub', d.status === 'arrived' ? sub : [sub, `${d.name} · ${d.vehicle.plate}`].filter(Boolean).join(' · '));
  const at = STEP_ORDER[d.status] ?? 0;
  $$('.trip__steps li').forEach((li, i) => {
    li.classList.toggle('is-done', i < at);
    li.classList.toggle('is-current', i === at);
  });
  setBind('driverName', d.name);
  setBind('driverInitials', d.name.split(/\s+/).map((x) => x[0]).join('').slice(0, 2).toUpperCase());
  setBind('driverRating', d.rating.toFixed(1));
  setBind('driverCar', `${d.vehicle.color} ${d.vehicle.model}`);
  setBind('driverPlate', d.vehicle.plate);
  $('#driverDemo').hidden = !d.demo;
  $('#cancelTrip').hidden = d.status === 'on_trip' || d.status === 'completed';
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
    el.dest.focus();
    el.dest.select();
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

$('#searchForm').addEventListener('submit', (e) => {
  e.preventDefault();
  if (state.step === 'request') submitSearch(el.dest);
});

el.dest.addEventListener('click', () => {
  if (state.step === 'choose') goToRequest();
});

// Recent place (home chip, home "Rebook", ride chip): straight to Choose your ride
$$('[data-rebook]').forEach((b) => b.addEventListener('click', () => {
  const r = latestRecent();
  if (!r) return;
  if (!el.body.classList.contains('is-ride')) location.hash = 'ride';
  goToChoose(r.title, r);
}));
$$('[data-saved]').forEach((chip) => {
  chip.addEventListener('click', () => {
    const name = chip.dataset.saved === 'home' ? 'Home' : 'Office';
    toast(`Sign in to save your ${name} address.`);
  });
});
$$('[data-soon]').forEach((b) => b.addEventListener('click', () => toast(`${b.dataset.soon}: coming soon.`)));
$$('[data-pickup]').forEach((b) => b.addEventListener('click', () => locateUser()));

el.pickOnMap.addEventListener('click', () => {
  state.picking = !state.picking;
  render();
  if (state.picking) toast('Tap the map to drop your pin.');
});

$$('.mode__btn').forEach((b) => b.addEventListener('click', () => setMode(b.dataset.mode)));
setupParcelSheet();
setupPaySheet();
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

$('#payBtn').addEventListener('click', book);
$('#cancelSearch').addEventListener('click', () => cancelBooking());
$$('[data-hide-status]').forEach((b) => b.addEventListener('click', () => setStatusHidden(true)));
$('#statusBar').addEventListener('click', () => setStatusHidden(false));
$('#cancelTrip').addEventListener('click', () => cancelBooking({ ask: true }));
$('#callDriver').addEventListener('click', () => {
  if (state.driver && state.driver.phone) location.href = `tel:${state.driver.phone}`;
  else toast('Calling your driver works in the live app.');
});
$('#messageDriver').addEventListener('click', () => toast('Messaging your driver works in the live app.'));
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

// Signed in: profile menu instead of Sign in, and only this account's tabs. Drivers and merchants go to their home.
currentUser().catch(() => null).then((user) => {
  if (guardRole(user, ['client'])) return;
  mountAccount($('[data-account]'), user);
  filterTabs($('.dock'), user);
});

/* =========================================================
   Home ↔ ride screen (by URL hash, so the phone's Back button works)
   ========================================================= */
const RIDE_LINKS = ['ride', 'where', 'moto', 'parcel', 'rebook']; // #rebook: from Trips, the latest recent place
function route() {
  const link = location.hash.slice(1);
  const ride = RIDE_LINKS.includes(link);
  el.body.classList.toggle('is-ride', ride);
  el.body.classList.toggle('is-home', !ride);
  $('#map').inert = !ride; // under the home: keep it out of tab order and screen readers
  if (!ride) return;
  setMode(link === 'parcel' ? 'express' : 'ride');
  if (link === 'moto') selectVehicle('motor');
  if (link === 'rebook') {
    const r = latestRecent();
    if (r) goToChoose(r.title, r);
    history.replaceState(null, '', '#ride'); // a reload shouldn't rebook again
  }
  requestAnimationFrame(() => {
    frame({ animate: false });
    if (link === 'where' && state.step === 'request') el.dest.focus();
  });
}
window.addEventListener('hashchange', route);

// Back: Choose your ride → edit the drop-off; otherwise → Home
$('#rideBack').addEventListener('click', () => {
  if (state.step === 'choose') goToRequest();
  else location.hash = '';
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
setupInstall($('[data-install]'));

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
route();
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
