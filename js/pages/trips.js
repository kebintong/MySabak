/* Trips & Orders (pages/trips.html): a live card for each ride and food order on its way (tap one to open its map),
   then the history of Ride / Express bookings and shop orders. */
import { CONFIG } from '../config.js';
import { myTrips, myOrders, myActiveTrip, onTripUpdate, shopMenu, straightLine, ORDER_STEPS } from '../api.js';
import { isNum } from '../money.js';
import { shopMap } from '../shop-map.js';
import { $, $$, mountChrome, esc, when, pesoOr, icon, pop } from '../ui.js';

mountChrome({ roles: ['client'] });

const RECENT_KEY = 'mysabak.recent'; // same list as the Ride screen's recent places (app.js)
const DONE = ['delivered', 'cancelled'];
const vehicleName = (id) => (CONFIG.vehicles.find((v) => v.id === id) || { name: id }).name;
const stepName = (id) => (ORDER_STEPS.find((s) => s.id === id) || { name: id }).name;

// What a live ride is doing, and which of its four steps that is
const TRIP_WORDS = { searching: 'Finding a driver', arriving: 'Driver on the way', arrived: 'Your driver is here', on_trip: 'On the way to the drop-off' };
const TRIP_STEP = { searching: 0, arriving: 0, arrived: 1, on_trip: 2 };
const FOOD_STEP = { placed: 0, accepted: 0, preparing: 1, ready: 1, picked_up: 2 };

let rides = [];
let orders = [];
let show = 'all'; // the History filter
// The live card that's open (its map showing): the one a link asked for (#open=<id>, from an order's Track on map),
// else the first one on the first load
let open = new URLSearchParams(location.hash.slice(1)).get('open');
let shape = ''; // the live cards on screen: a new set (or a driver accepting) redraws them
const maps = new Map(); // card id → its map, made the first time the card opens
let stopLive = () => {}; // the open ride's live driver feed
let timer = 0;

/* ---------- Live cards ---------- */
function rideCard(t) {
  const express = t.kind === 'express';
  const b = t.booking;
  const pill = t.status === 'arrived' ? 'Here' : t.status !== 'searching' && isNum(t.etaMinutes) ? `${t.etaMinutes} min` : '';
  return {
    id: t.id, type: 'ride', icon: express ? 'i-box' : 'i-car', href: `/#${express ? 'parcel' : 'ride'}`, trip: t,
    title: `${express ? 'Parcel' : 'Ride'} to ${b.dropoff.label}`, sub: TRIP_WORDS[t.status] || 'Booked',
    end: pill ? `<span class="ocard__eta">${esc(pill)}</span>` : '',
    steps: ['Driver coming', 'Driver here', 'On the way', express ? 'Delivered' : 'Arrived'], at: TRIP_STEP[t.status] ?? 0,
  };
}

function foodCard(o) {
  return {
    id: o.id, type: 'food', icon: 'i-food', href: `/pages/order.html?id=${encodeURIComponent(o.id)}`, order: o,
    title: o.shop.name, sub: stepName(o.status), end: `<span class="ocard__price">${pesoOr(o.subtotal)}</span>`,
    steps: ['Placed', 'Preparing', 'On the way', 'Delivered'], at: FOOD_STEP[o.status] ?? 0,
  };
}

// a fill inside each step, so a step filling up animates (done: full, current: half)
const segClass = (c, i) => (i < c.at ? 'is-done' : i === c.at ? 'is-now' : '');
const segs = (c) => c.steps.map((_, i) => `<span class="${segClass(c, i)}"><i></i></span>`).join('');
const stepLabels = (c) => c.steps.map((s, i) => `<span${i === c.at ? ' class="is-now"' : ''}>${esc(s)}</span>`).join('');

// Under the map: the driver and a way into the live trip, or the order and its receipt
function extra(c) {
  if (c.type === 'food') return `<a class="ocard__link" href="${c.href}">View order and receipt</a>`;
  const d = c.trip.driver;
  const b = c.trip.booking;
  const fare = `${esc((CONFIG.ridePayments.find((m) => m.id === b.payment) || { name: '' }).name)} · ${pesoOr(b.price && b.price.total, '[FARE]')}`;
  if (!d) return `<div class="ocard__driver"><span class="ocard__text"><b>Finding you a driver</b><span>${fare}</span></span><a class="btn-soft" href="${c.href}">Open trip</a></div>`;
  const initials = d.name.split(/\s+/).map((w) => w[0]).join('').slice(0, 2).toUpperCase();
  return `<div class="ocard__driver"><span class="ocard__ava" aria-hidden="true">${esc(initials)}</span>
    <span class="ocard__text"><b>${esc(d.name)} · ${esc(vehicleName(d.vehicle.type))}</b><span>${esc(`${d.vehicle.color} ${d.vehicle.model} · ${d.vehicle.plate}`)} · ${fare}</span></span>
    <a class="btn-soft" href="${c.href}">Open trip</a></div>`;
}

function cardHtml(c, i) {
  const on = c.id === open;
  return `<article class="ocard${on ? ' is-open' : ''}" data-card="${esc(c.id)}" style="--i:${i}">
    <button type="button" class="ocard__head" aria-expanded="${on}" aria-controls="more-${esc(c.id)}">
      <span class="ocard__icon">${icon(c.icon)}</span>
      <span class="ocard__text"><b>${esc(c.title)}</b><span data-sub>${esc(c.sub)}</span></span>
      <span data-end data-v="${esc(c.end)}">${c.end}</span>
      ${icon('i-chevron', 'ocard__chev')}
    </button>
    <div class="ocard__segs" data-segs aria-hidden="true">${segs(c)}</div>
    <div class="ocard__more" id="more-${esc(c.id)}"${on ? '' : ' hidden'}>
      <div class="ocard__map" role="img" aria-label="${esc(c.type === 'food' ? `Map: ${c.title} and your address` : `Map: ${c.title}`)}"></div>
      <div class="ocard__steps" data-steps aria-hidden="true">${stepLabels(c)}</div>
      ${extra(c)}
    </div>
  </article>`;
}

const rideRoute = (b) => (b.trip && b.trip.coords && b.trip.coords.length > 1
  ? b.trip.coords : straightLine({ lng: b.pickup.lng, lat: b.pickup.lat }, { lng: b.dropoff.lng, lat: b.dropoff.lat }).coords);

// Live: the driver moves on the open ride's map (the ride screen's own feed); their first sighting is framed in
let following = null; // the ride whose driver the map follows
function followDriver(c, m) {
  if (following === c.id) return;
  stopFeed();
  following = c.id;
  const coords = rideRoute(c.trip.booking);
  let framed = false;
  stopLive = onTripUpdate(c.id, (u) => {
    if (!u.driver) return;
    m.setRider(u.driver);
    if (!framed) { framed = true; m.fit(coords.concat([[u.driver.lng, u.driver.lat]]), { animate: true }); }
  });
}
function stopFeed() {
  stopLive();
  stopLive = () => {};
  following = null;
}

// The map in an open card: the ride's route from pickup to drop-off, or the shop and where the food is going
async function openMap(c) {
  const box = $(`[data-card="${CSS.escape(c.id)}"] .ocard__map`);
  if (!box) return;
  if (maps.has(c.id)) {
    maps.get(c.id).resize();
    if (c.type === 'ride') followDriver(c, maps.get(c.id)); // reopened: pick the driver up again
    return;
  }
  // A real map you can move (two fingers or Ctrl + scroll, so one finger still scrolls the page);
  // room above for the tall shop and drop-off pins, so they aren't cut off at the top
  const m = shopMap(box, { cooperative: true, padding: () => ({ top: 62, bottom: 22, left: 36, right: 36 }) });
  maps.set(c.id, m);
  if (c.type === 'ride') {
    const b = c.trip.booking;
    const coords = rideRoute(b);
    m.setUser({ lng: b.pickup.lng, lat: b.pickup.lat });
    m.setDest({ lng: b.dropoff.lng, lat: b.dropoff.lat }, b.dropoff.label);
    m.setRoute(coords);
    m.fit(coords);
    followDriver(c, m);
    return;
  }
  const o = c.order;
  const shop = await shopMenu(o.shop.id).catch(() => null);
  const to = o.address && isNum(o.address.lng) ? o.address : null;
  if (shop) { m.setShops([shop]); m.setActive(shop.id); }
  if (to) m.setDest(to, 'You');
  // shortcut: a straight line from the shop, since the rider's road isn't known until they pick it up; use the rider's route then
  if (shop && to) { const line = straightLine(shop, to).coords; m.setRoute(line); m.fit(line); } else if (shop || to) m.fit([[(shop || to).lng, (shop || to).lat]]);
  m.setRider(o.rider || null); // once a rider has it: on the way to you (moves each refresh)
}

function drawLive(cards) {
  $('#ongoing').hidden = !cards.length;
  $('#tripsLede').textContent = cards.length ? 'Tap a trip or order to see it on the map.' : 'Your rides, deliveries and shop orders.';
  if (!cards.some((c) => c.id === open)) open = null; // gone (or a link to one that's no longer on its way)
  if (open === null && cards.length && !shape) open = cards[0].id;
  const now = cards.map((c) => c.id + (c.trip && c.trip.driver ? '+' : '')).join(' ');
  if (now !== shape) {
    stopFeed();
    maps.forEach((m) => m.map && m.map.remove());
    maps.clear();
    $('#ongoingList').innerHTML = cards.map(cardHtml).join('');
    shape = now;
  } else {
    // Same cards: just the words and the steps, so an open map isn't redrawn
    // (a changed status or time gives a small bounce; a step that fills up slides along)
    cards.forEach((c) => {
      const card = $(`[data-card="${CSS.escape(c.id)}"]`);
      const sub = $('[data-sub]', card);
      const end = $('[data-end]', card);
      if (sub.textContent !== c.sub) { sub.textContent = c.sub; pop(sub, 1.06); }
      if (end.dataset.v !== c.end) { end.dataset.v = c.end; end.innerHTML = c.end; pop(end.firstElementChild || end, 1.15); }
      $$('[data-segs] > span', card).forEach((seg, i) => { seg.className = segClass(c, i); });
      $('[data-steps]', card).innerHTML = stepLabels(c);
      if (c.type === 'food' && maps.has(c.id)) maps.get(c.id).setRider(c.order.rider || null);
    });
  }
  const c = cards.find((x) => x.id === open);
  if (c) requestAnimationFrame(() => openMap(c));
}

// One card open at a time: tapping the open one closes it
$('#ongoingList').addEventListener('click', (e) => {
  const head = e.target.closest('.ocard__head');
  if (!head) return;
  const id = head.closest('[data-card]').dataset.card;
  open = open === id ? null : id;
  $$('[data-card]').forEach((card) => {
    const on = card.dataset.card === open;
    card.classList.toggle('is-open', on);
    $('.ocard__head', card).setAttribute('aria-expanded', String(on));
    $('.ocard__more', card).hidden = !on;
  });
  if (!last.live || open !== last.live.id) stopFeed(); // the driver feed runs only while the ride's map is open
  if (open) load({ refreshOnly: true });
});

/* ---------- History ---------- */
let historyHtml = ''; // redrawn only when it changes, so the rows don't slide in again on every refresh
function drawHistory(liveId) {
  const items = [
    ...rides.filter((t) => t.id !== liveId).map((t) => ({ type: 'ride', at: t.at, t })),
    ...orders.filter((o) => DONE.includes(o.status)).map((o) => ({ type: 'food', at: o.placedAt, o })),
  ].filter((x) => show === 'all' || x.type === show).sort((a, b) => b.at - a.at);
  const html = items.length ? items.map(({ type, t, o }, i) => (type === 'ride'
    ? `<li class="recent__row" style="--i:${Math.min(i, 8)}">${icon(t.kind === 'express' ? 'i-box' : 'i-car', 'icon--lg')}
        <span class="recent__text"><span class="recent__name">${esc((t.dropoff && t.dropoff.label) || 'Pinned location')}</span>
          <span class="recent__meta">${t.kind === 'express' ? 'Parcel' : 'Ride'} · ${esc(vehicleName(t.vehicle))} · ${esc(when(t.at))} · ${pesoOr(t.price && t.price.total, '[FARE]')}</span></span>
        <button type="button" class="btn-soft" data-rebook="${esc(t.id)}">${icon('i-rebook', 'icon--sm icon--deep')}Rebook</button></li>`
    : `<li class="recent__row" style="--i:${Math.min(i, 8)}">${icon('i-food', 'icon--lg')}
        <span class="recent__text"><span class="recent__name">${esc(o.shop.name)}</span>
          <span class="recent__meta">Food · ${esc(stepName(o.status))} · ${esc(when(o.placedAt))} · ${pesoOr(o.subtotal)}</span></span>
        <a class="btn-soft" href="/pages/order.html?id=${encodeURIComponent(o.id)}">View</a></li>`)).join('')
    : show === 'all'
      ? `<li class="trips-empty"><img src="/assets/images/3d/car.svg" alt="" width="200" height="89">
          <span>Nothing yet. Your rides, deliveries and food orders show up here.</span></li>`
      : `<li class="empty">No ${show === 'ride' ? 'rides' : 'food orders'} yet.</li>`;
  if (html === historyHtml) return;
  historyHtml = html;
  $('#historyList').innerHTML = html;
}

$('.hist__chips').addEventListener('click', (e) => {
  const chip = e.target.closest('[data-show]');
  if (!chip) return;
  show = chip.dataset.show;
  $$('[data-show]').forEach((b) => b.setAttribute('aria-pressed', String(b === chip)));
  load({ refreshOnly: true });
});

// Rebook: put the drop-off first in the recent places, then the Ride screen opens it on "Choose your ride"
$('#historyList').addEventListener('click', (e) => {
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
let last = { live: null };
async function load({ refreshOnly = false } = {}) {
  if (!refreshOnly) {
    clearTimeout(timer);
    const [r, o, t] = await Promise.all([myTrips(), myOrders(), myActiveTrip().catch(() => null)]);
    rides = r;
    orders = o;
    last = { live: t && t.status !== 'completed' ? t : null };
  }
  const { live } = last;
  const cards = [...(live ? [rideCard(live)] : []), ...orders.filter((o) => !DONE.includes(o.status)).map(foodCard)];
  drawLive(cards);
  drawHistory(live && live.id);
  // shortcut: polls while anything is on its way (5 s on a ride, 15 s for food); a backend could push instead
  if (!refreshOnly && cards.length) timer = setTimeout(load, live ? 5000 : 15000);
}

load();
