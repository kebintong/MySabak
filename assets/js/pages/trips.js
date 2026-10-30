/* Trips (pages/trips.html): the customer's Ride / Express bookings and shop orders. */
import { CONFIG } from '../config.js';
import { myTrips, myOrders, ORDER_STEPS } from '../api.js';
import { $, mountChrome, esc, when, pesoOr } from '../ui.js';

mountChrome({ roles: ['client'] });

const vehicleName = (id) => (CONFIG.vehicles.find((v) => v.id === id) || { name: id }).name;
const stepName = (id) => (ORDER_STEPS.find((s) => s.id === id) || { name: id }).name;

async function load() {
  const [trips, orders] = await Promise.all([myTrips(), myOrders()]);
  $('#rideList').innerHTML = trips.length
    ? trips.map((t) => `<li class="row"><div class="row__main">
        <span class="row__title">${esc((t.dropoff && t.dropoff.label) || 'Pinned location')}</span>
        <span class="row__sub">${t.kind === 'express' ? 'Express' : 'Ride'} · ${esc(vehicleName(t.vehicle))} · ${esc(when(t.at))}</span></div>
        <span class="row__end">${pesoOr(t.price && t.price.total, '[FARE]')}</span></li>`).join('')
    : '<li class="empty">No rides yet. Your rides and deliveries show up here.</li>';
  $('#orderList').innerHTML = orders.length
    ? orders.map((o) => `<li><a class="row row--link" href="/pages/order.html?id=${encodeURIComponent(o.id)}">
        <div class="row__main"><span class="row__title">${esc(o.shop.name)}</span><span class="row__sub">${esc(when(o.placedAt))} · ${esc(stepName(o.status))}</span></div>
        <span class="row__end">${pesoOr(o.subtotal)}</span></a></li>`).join('')
    : '<li class="empty">No shop orders yet. Order food from the Food tab.</li>';
}

load();
