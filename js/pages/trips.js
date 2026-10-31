/* Trips (pages/trips.html): the customer's Ride / Express bookings and shop orders. */
import { CONFIG } from '../config.js';
import { myTrips, myOrders, ORDER_STEPS } from '../api.js';
import { $, mountChrome, esc, when, pesoOr, icon } from '../ui.js';

mountChrome({ roles: ['client'] });

const RECENT_KEY = 'mysabak.recent'; // same list as the Ride screen's recent places (app.js)
const vehicleName = (id) => (CONFIG.vehicles.find((v) => v.id === id) || { name: id }).name;
const stepName = (id) => (ORDER_STEPS.find((s) => s.id === id) || { name: id }).name;
let trips = [];

async function load() {
  const [rides, orders] = await Promise.all([myTrips(), myOrders()]);
  trips = rides;
  $('#rideList').innerHTML = trips.length
    ? trips.map((t, i) => `<li class="recent__row">
        ${icon(t.kind === 'express' ? 'i-box' : 'i-car', 'icon--lg')}
        <span class="recent__text"><span class="recent__name">${esc((t.dropoff && t.dropoff.label) || 'Pinned location')}</span>
          <span class="recent__meta">${t.kind === 'express' ? 'Parcel' : 'Ride'} · ${esc(vehicleName(t.vehicle))} · ${esc(when(t.at))} · ${pesoOr(t.price && t.price.total, '[FARE]')}</span></span>
        <button type="button" class="btn-soft" data-rebook="${i}">${icon('i-rebook', 'icon--sm icon--deep')}Rebook</button></li>`).join('')
    : `<li class="trips-empty"><img src="/assets/images/v3/car.svg" alt="" width="160" height="100">
        <span>No rides yet. Your rides and deliveries show up here.</span></li>`;
  $('#orderList').innerHTML = orders.length
    ? orders.map((o) => `<li><a class="row row--link" href="/pages/order.html?id=${encodeURIComponent(o.id)}">
        <div class="row__main"><span class="row__title">${esc(o.shop.name)}</span><span class="row__sub">${esc(when(o.placedAt))} · ${esc(stepName(o.status))}</span></div>
        <span class="row__end">${pesoOr(o.subtotal)}</span></a></li>`).join('')
    : '<li class="empty">No shop orders yet. Order food from the Food tab.</li>';
}

// Rebook: put the drop-off first in the recent places, then the Ride screen opens it on "Choose your ride"
$('#rideList').addEventListener('click', (e) => {
  const b = e.target.closest('[data-rebook]');
  if (!b) return;
  const { label, lng, lat } = trips[Number(b.dataset.rebook)].dropoff;
  try {
    const list = JSON.parse(localStorage.getItem(RECENT_KEY) || '[]').filter((p) => p.title !== label);
    localStorage.setItem(RECENT_KEY, JSON.stringify([{ title: label, lng, lat }, ...list].slice(0, 5)));
  } catch (_) { /* storage off: the Ride screen still opens */ }
  location.href = '/#rebook';
});

load();
