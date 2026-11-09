/* Trips & Orders (pages/trips.html): a switch between Ongoing (rides and food orders on their way, each a live card
   that opens in place: a live map, its four steps, and the driver or the order's link), Rides (Ride / Express bookings,
   to Rebook) and Food (shop orders). */
import { CONFIG } from '../config.js';
import { myTrips, myOrders, myActiveTrip, orderStatus, orderRoute, onTripUpdate, shopMenu, ORDER_STEPS } from '../api.js';
import { isNum } from '../money.js';
import { $, $$, mountChrome, esc, when, pesoOr, icon } from '../ui.js';
import { shopMap } from '../shop-map.js';

mountChrome({ roles: ['client'] });

const RECENT_KEY = 'mysabak.recent'; // same list as the Ride screen's recent places (app.js)
const DONE = ['delivered', 'cancelled'];
const vehicleName = (id) => (CONFIG.vehicles.find((v) => v.id === id) || { name: id }).name;
const stepName = (id) => (ORDER_STEPS.find((s) => s.id === id) || { name: id }).name;

// What a live ride is doing, and which of its four steps it's on
const TRIP_WORDS = { searching: 'Finding a driver', arriving: 'Driver on the way', arrived: 'Your driver is here', on_trip: 'On the way to the drop-off' };
const TRIP_STEP = { searching: 0, arriving: 0, arrived: 1, on_trip: 2 };
const FOOD_STEP = { placed: 0, accepted: 0, preparing: 1, ready: 1, picked_up: 2 };
const RIDE_STEPS = ['Driver coming', 'Picked up', 'On the way', 'Arrived'];
const FOOD_STEPS = ['Placed', 'Preparing', 'On the way', 'Delivered'];

let rides = [];
let orders = [];
let live = null; // the live ride or parcel
let show = 'ongoing';
let drawn = ''; // the list on screen: redrawn only when it changes, so rows don't slide in again on every refresh
let timer = 0;
let open = null; // the card shown open: 'ride' or a food order's id (one at a time)

/* ---------- Live cards ---------- */
// Four segments: done ones purple, the current one gold
const bar = (at) => `<span class="lcard__bar" aria-hidden="true">${[0, 1, 2, 3].map((i) => `<i${i < at ? ' class="is-done"' : i === at ? ' class="is-now"' : ''}></i>`).join('')}</span>`;
const stepRow = (names, at) => `<span class="lcard__steps">${names.map((n, i) => `<span${i === at ? ' class="is-on"' : ''}>${n}</span>`).join('')}</span>`;

// A card for something on its way: tap the top to open it (a live map, its steps, then `more`)
function liveCard({ key, iconId, tone, at, steps, title, sub, end, label, more }) {
  const isOpen = open === key;
  return `<li class="lcard lcard--${tone}${isOpen ? ' is-open' : ''}">
    <button type="button" class="lcard__head" data-card="${esc(key)}" aria-expanded="${isOpen}" aria-label="${esc(label)}">
      <span class="lcard__icon" aria-hidden="true">${icon(iconId)}</span>
      <span class="lcard__text"><b>${esc(title)}</b><span>${esc(sub)}</span></span>
      <span class="lcard__end">${end}</span>${icon('i-chevron', 'lcard__chev')}
    </button>
    ${isOpen ? `<div class="lcard__body">
      <div class="lcard__map map"><div class="map__canvas" data-map-slot></div></div>
      ${bar(at)}${stepRow(steps, at)}${more}
    </div>` : bar(at)}
  </li>`;
}

const initials = (name) => String(name || '?').trim().split(/\s+/).slice(0, 2).map((w) => w[0]).join('').toUpperCase();

function rideCard(t) {
  const express = t.kind === 'express';
  const b = t.booking;
  const d = t.driver;
  const words = TRIP_WORDS[t.status] || 'Booked';
  const time = t.status === 'arrived' ? 'Here' : t.status !== 'searching' && isNum(t.etaMinutes) ? `${t.etaMinutes} min` : '';
  // Call and Chat show for the demo but don't do anything yet
  const driver = d ? `<div class="lcard__driver">
      <span class="lcard__ava" aria-hidden="true">${esc(initials(d.name))}</span>
      <span class="lcard__who"><b>${esc(d.name)}</b><span>${esc(`${d.vehicle.color} ${d.vehicle.model}, ${d.vehicle.plate}`)}</span></span>
      <button type="button" class="lcard__act" aria-label="Call ${esc(d.name)}">${icon('i-phone')}</button>
      <button type="button" class="lcard__act" aria-label="Chat with ${esc(d.name)}">${icon('i-chat')}</button>
    </div>` : '<p class="lcard__wait">Finding a driver near you…</p>';
  return liveCard({
    key: 'ride', iconId: express ? 'i-box' : 'i-car', tone: 'ride', at: TRIP_STEP[t.status] ?? 0, steps: RIDE_STEPS,
    title: words, sub: `To ${b.dropoff.label}`,
    label: `${express ? 'Parcel' : 'Ride'} to ${b.dropoff.label}, ${words.toLowerCase()}${time ? `, ${time}` : ''}`,
    end: time ? `<span class="lcard__eta">${esc(time)}</span>` : `<span class="lcard__price">${pesoOr(b.price && b.price.total, '[FARE]')}</span>`,
    more: `${driver}<a class="button button--block lcard__go" href="/#${express ? 'parcel' : 'ride'}">${icon('i-pin')}Track ${express ? 'parcel' : 'ride'}</a>`,
  });
}

function foodCard(o) {
  return liveCard({
    key: o.id, iconId: 'i-food', tone: 'food', at: FOOD_STEP[o.status] ?? 0, steps: FOOD_STEPS,
    title: stepName(o.status), sub: `${o.shop.name}, ${pesoOr(o.subtotal)}`, label: `${o.shop.name} order, ${stepName(o.status).toLowerCase()}`,
    end: '',
    more: `<a class="button button--block lcard__go" href="/pages/order.html?id=${encodeURIComponent(o.id)}">${icon('i-pin')}Track order and receipt</a>`,
  });
}

/* ---------- The open card's live map ---------- */
// Made once per open card and moved into each redraw of the list, so it keeps its place and doesn't reload
let mapNow = null; // { sig, el, api, stop }
const PADDING = () => ({ top: 56, bottom: 24, left: 40, right: 40 }); // room above for the pins and their labels

function closeMap() {
  if (!mapNow) return;
  mapNow.stop();
  if (mapNow.api.map) mapNow.api.map.remove();
  mapNow = null;
}

// The ride: your pickup, the drop-off, the trip's route, and the driver moving along it
function rideMap(el, t) {
  const m = shopMap(el, { cooperative: true, padding: PADDING });
  const b = t.booking;
  const route = b.trip && b.trip.coords && b.trip.coords.length > 1 ? b.trip.coords : [[b.pickup.lng, b.pickup.lat], [b.dropoff.lng, b.dropoff.lat]];
  m.setUser(b.pickup);
  m.setDest(b.dropoff, 'Drop-off');
  m.setRoute(route);
  m.fit(route);
  const stop = t.driver ? onTripUpdate(t.id, (u) => m.setRider(u.status === 'completed' ? null : u.driver, { car: b.vehicle !== 'motor' })) : () => {};
  return { api: m, stop };
}

// The food order: the shop, you, the roads between, and the rider gliding along once it's picked up
function foodMap(el, o) {
  const m = shopMap(el, { cooperative: true, padding: PADDING });
  let stopped = false;
  let poll = 0;
  (async () => {
    const shop = await shopMenu(o.shop.id).catch(() => null);
    const to = o.address && typeof o.address.lng === 'number' ? o.address : null;
    if (stopped) return;
    if (shop) { m.setShops([shop]); m.setActive(shop.id); }
    if (to) m.setDest(to, 'You');
    const ends = [shop, to].filter(Boolean).map((p) => [p.lng, p.lat]);
    if (ends.length) m.fit(ends);
    if (shop && to) {
      const coords = await orderRoute(o).catch(() => ends);
      if (stopped) return;
      m.setRoute(coords);
      m.fit(coords);
    }
    // shortcut: re-reads the order every 2 s while the card is open; a backend could push rider positions instead
    const tick = async () => {
      try { const x = await orderStatus(o.id); if (!stopped) m.moveRider(x.rider || null); } catch (_) { /* try again */ }
      if (!stopped) poll = setTimeout(tick, 2000);
    };
    tick();
  })();
  return { api: m, stop: () => { stopped = true; clearTimeout(poll); } };
}

function placeMap() {
  const slot = $('[data-map-slot]');
  if (!slot) { closeMap(); return; }
  const isRide = open === 'ride';
  const thing = isRide ? live : orders.find((o) => o.id === open);
  const sig = isRide ? `ride:${live.id}:${Boolean(live.driver)}` : `food:${open}`; // a driver found: the map starts following them
  if (!mapNow || mapNow.sig !== sig) {
    closeMap();
    const el = document.createElement('div');
    el.className = 'map__canvas';
    slot.replaceWith(el);
    mapNow = { sig, el, ...(isRide ? rideMap(el, thing) : foodMap(el, thing)) };
    return;
  }
  slot.replaceWith(mapNow.el);
  mapNow.api.resize();
}

const pastRide = (t) => `<li class="recent__row">${icon(t.kind === 'express' ? 'i-box' : 'i-car', 'icon--lg')}
    <span class="recent__text"><span class="recent__name">${esc((t.dropoff && t.dropoff.label) || 'Pinned location')}</span>
      <span class="recent__meta">${t.kind === 'express' ? 'Parcel' : 'Ride'} · ${esc(vehicleName(t.vehicle))} · ${esc(when(t.at))} · ${pesoOr(t.price && t.price.total, '[FARE]')}</span></span>
    <button type="button" class="btn-soft" data-rebook="${esc(t.id)}">${icon('i-rebook', 'icon--sm icon--deep')}Rebook</button></li>`;

const pastOrder = (o) => `<li class="recent__row">${icon('i-food', 'icon--lg')}
    <span class="recent__text"><span class="recent__name">${esc(o.shop.name)}</span>
      <span class="recent__meta">${esc(stepName(o.status))} · ${esc(when(o.placedAt))} · ${pesoOr(o.subtotal)}</span></span>
    <a class="btn-soft" href="/pages/order.html?id=${encodeURIComponent(o.id)}">View</a></li>`;

const empty = (text) => `<li class="tlist__empty">${esc(text)}</li>`;

/* ---------- The list for the switch ---------- */
function draw() {
  const cooking = orders.filter((o) => !DONE.includes(o.status));
  const count = (live ? 1 : 0) + cooking.length;
  $('#ongoingN').textContent = count;
  $('#ongoingN').hidden = !count;
  let html;
  if (show === 'ongoing') {
    if (open && !(open === 'ride' ? live : cooking.some((o) => o.id === open))) open = null; // it arrived or was delivered
    html = count ? [...(live ? [rideCard(live)] : []), ...cooking.map(foodCard)].join('') : empty('Nothing on its way right now.');
  } else if (show === 'rides') {
    const past = rides.filter((t) => !live || t.id !== live.id);
    html = past.length ? past.map(pastRide).join('') : empty('No rides yet. Your rides and deliveries show up here.');
  } else {
    const done = orders.filter((o) => DONE.includes(o.status));
    html = done.length ? done.map(pastOrder).join('') : empty('No food orders yet. Your past orders show up here.');
  }
  $('#quick').hidden = show !== 'ongoing';
  if (show !== 'ongoing') open = null;
  if (html === drawn) return;
  drawn = html;
  const list = $('#tripsList');
  list.className = `tlist tlist--${show}`;
  list.innerHTML = html;
  [...list.children].forEach((li, i) => li.style.setProperty('--i', Math.min(i, 8)));
  placeMap();
}

// Tap a card's top to open it (and close the one that was open), or to close it
$('#tripsList').addEventListener('click', (e) => {
  const head = e.target.closest('[data-card]');
  if (!head) return;
  open = open === head.dataset.card ? null : head.dataset.card;
  drawn = ''; // the open card changed: draw again even if nothing else did
  draw();
  if (open) { const card = $('[data-card].lcard__head[aria-expanded="true"]'); if (card) card.closest('.lcard').scrollIntoView({ block: 'nearest', behavior: 'smooth' }); }
});

$('.tswitch').addEventListener('click', (e) => {
  const b = e.target.closest('[data-show]');
  if (!b || b.dataset.show === show) return;
  show = b.dataset.show;
  $$('.tswitch [data-show]').forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
  draw();
});

// Rebook: put the drop-off first in the recent places, then the Ride screen opens it on "Choose your ride"
$('#tripsList').addEventListener('click', (e) => {
  const b = e.target.closest('[data-rebook]');
  if (!b) return;
  const trip = rides.find((t) => t.id === b.dataset.rebook);
  if (!trip) return;
  const { label, lng, lat } = trip.dropoff;
  try {
    const list = JSON.parse(localStorage.getItem(RECENT_KEY) || '[]').filter((p) => p.title !== label);
    localStorage.setItem(RECENT_KEY, JSON.stringify([{ title: label, lng, lat }, ...list].slice(0, 5)));
  } catch (_) { /* storage off: the Ride screen still opens */ }
  location.href = '/#rebook';
});

/* ---------- Start ---------- */
async function load() {
  clearTimeout(timer);
  const [r, o, t] = await Promise.all([myTrips(), myOrders(), myActiveTrip().catch(() => null)]);
  rides = r;
  orders = o;
  live = t && t.status !== 'completed' ? t : null;
  draw();
  // shortcut: polls while anything is on its way (5 s on a ride, 15 s for food); a backend could push instead
  if (live || orders.some((x) => !DONE.includes(x.status))) timer = setTimeout(load, live ? 5000 : 15000);
}

load();
