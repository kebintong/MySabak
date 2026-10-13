/* Shop list (pages/shops.html): search, categories, nearby shops, your orders. */
import { CONFIG } from '../config.js';
import { listShops, myOrders, ORDER_STEPS } from '../api.js';
import { $, mountChrome, esc, when, peso } from '../ui.js';

mountChrome();

const near = { lng: CONFIG.startCenter[0], lat: CONFIG.startCenter[1] };
let category = 'all';
let timer;

const tile = (s) => `<span class="shop-tile" style="--tile:${esc(s.color)}" aria-hidden="true">${esc(s.name[0])}</span>`;

async function load() {
  const { categories, shops } = await listShops({ near, category, q: $('#shopSearch').value });
  $('#categories').innerHTML = categories.map((c) => `<button type="button" class="chip" data-cat="${c.id}" aria-pressed="${c.id === category}">${esc(c.name)}</button>`).join('');
  $('#shopList').innerHTML = shops.length
    ? shops.map((s) => `<li><a class="shop-card" href="/pages/shop.html?id=${encodeURIComponent(s.id)}">
        ${tile(s)}
        <span class="row__main"><span class="row__title">${esc(s.name)}</span>
        <span class="row__sub">${esc(s.area)}${s.km != null ? ` · ${s.km.toFixed(1)} km` : ''} · ${s.items} items</span>
        <span class="row__sub">${esc(s.hours)}</span></span></a></li>`).join('')
    : '<li class="empty">No shops match that search.</li>';
}

async function loadOrders() {
  const orders = await myOrders();
  $('#ordersCard').hidden = !orders.length;
  const stepName = (id) => (ORDER_STEPS.find((s) => s.id === id) || { name: id }).name;
  $('#orderList').innerHTML = orders.map((o) => `<li><a class="row row--link" href="/pages/order.html?id=${encodeURIComponent(o.id)}">
      <div class="row__main"><span class="row__title">${esc(o.shop.name)}</span><span class="row__sub">${esc(when(o.placedAt))} · ${esc(stepName(o.status))}</span></div>
      <span class="row__end">${peso(o.subtotal)}</span></a></li>`).join('');
}

$('#categories').addEventListener('click', (e) => {
  const b = e.target.closest('[data-cat]');
  if (!b) return;
  category = b.dataset.cat;
  load();
});
$('#shopSearch').addEventListener('input', () => { clearTimeout(timer); timer = setTimeout(load, 200); });

load();
loadOrders();
