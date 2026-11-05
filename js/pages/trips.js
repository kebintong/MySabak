/* Trips & Orders (pages/trips.html): a switch between Ongoing (rides and food orders on their way, each a row with a
   small progress ring), Rides (Ride / Express bookings, to Rebook) and Food (shop orders). */
import { CONFIG } from '../config.js';
import { myTrips, myOrders, myActiveTrip, ORDER_STEPS } from '../api.js';
import { isNum } from '../money.js';
import { $, $$, mountChrome, esc, when, pesoOr, icon } from '../ui.js';

mountChrome({ roles: ['client'] });

const RECENT_KEY = 'mysabak.recent'; // same list as the Ride screen's recent places (app.js)
const DONE = ['delivered', 'cancelled'];
const vehicleName = (id) => (CONFIG.vehicles.find((v) => v.id === id) || { name: id }).name;
const stepName = (id) => (ORDER_STEPS.find((s) => s.id === id) || { name: id }).name;

// What a live ride is doing, and how far along it is: four steps, the current one half done
const TRIP_WORDS = { searching: 'Finding a driver', arriving: 'Driver on the way', arrived: 'Your driver is here', on_trip: 'On the way to the drop-off' };
const TRIP_STEP = { searching: 0, arriving: 0, arrived: 1, on_trip: 2 };
const FOOD_STEP = { placed: 0, accepted: 0, preparing: 1, ready: 1, picked_up: 2 };
const RING = 144.5; // the row ring's circumference (r = 23)

let rides = [];
let orders = [];
let live = null; // the live ride or parcel
let show = 'ongoing';
let drawn = ''; // the list on screen: redrawn only when it changes, so rows don't slide in again on every refresh
let timer = 0;

/* ---------- Rows ---------- */
// A row for something on its way: its icon in a small ring showing how far along it is
function liveRow({ href, label, iconId, tone, at, title, sub, end }) {
  const dash = (RING * ((at + 0.5) / 4)).toFixed(1);
  return `<li><a class="lrow" href="${href}" aria-label="${esc(label)}">
    <span class="lrow__ring lrow__ring--${tone}" aria-hidden="true"><svg viewBox="0 0 52 52"><circle cx="26" cy="26" r="23"/><circle class="lrow__arc" cx="26" cy="26" r="23" style="--dash:${dash}"/><circle class="lrow__glint" cx="26" cy="26" r="23"/></svg>${icon(iconId)}</span>
    <span class="lrow__text"><b>${esc(title)}</b><span>${esc(sub)}</span></span>
    <span class="lrow__end">${end}</span>
    ${icon('i-chevron', 'lrow__go')}
  </a></li>`;
}

function rideRow(t) {
  const express = t.kind === 'express';
  const b = t.booking;
  const words = TRIP_WORDS[t.status] || 'Booked';
  const time = t.status === 'arrived' ? 'Here' : t.status !== 'searching' && isNum(t.etaMinutes) ? `${t.etaMinutes} min` : '';
  return liveRow({
    href: `/#${express ? 'parcel' : 'ride'}`, iconId: express ? 'i-box' : 'i-car', tone: 'ride', at: TRIP_STEP[t.status] ?? 0,
    title: `${express ? 'Parcel' : 'Ride'} to ${b.dropoff.label}`, sub: `${words} · ${vehicleName(b.vehicle)}`,
    label: `${express ? 'Parcel' : 'Ride'} to ${b.dropoff.label}, ${words.toLowerCase()}${time ? `, ${time}` : ''}`,
    end: `${time ? `<span class="lrow__eta">${esc(time)}</span>` : ''}<span class="lrow__price">${pesoOr(b.price && b.price.total, '[FARE]')}</span>`,
  });
}

function foodRow(o) {
  return liveRow({
    href: `/pages/order.html?id=${encodeURIComponent(o.id)}`, iconId: 'i-food', tone: 'food', at: FOOD_STEP[o.status] ?? 0,
    title: o.shop.name, sub: stepName(o.status), label: `${o.shop.name} order, ${stepName(o.status).toLowerCase()}`,
    end: `<span class="lrow__price lrow__price--big">${pesoOr(o.subtotal)}</span>`,
  });
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
    html = count ? [...(live ? [rideRow(live)] : []), ...cooking.map(foodRow)].join('') : empty('Nothing on its way right now.');
  } else if (show === 'rides') {
    const past = rides.filter((t) => !live || t.id !== live.id);
    html = past.length ? past.map(pastRide).join('') : empty('No rides yet. Your rides and deliveries show up here.');
  } else {
    const done = orders.filter((o) => DONE.includes(o.status));
    html = done.length ? done.map(pastOrder).join('') : empty('No food orders yet. Your past orders show up here.');
  }
  $('#quick').hidden = show !== 'ongoing';
  if (html === drawn) return;
  drawn = html;
  const list = $('#tripsList');
  list.className = `tlist tlist--${show}`;
  list.innerHTML = html;
  [...list.children].forEach((li, i) => li.style.setProperty('--i', Math.min(i, 8)));
}

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
