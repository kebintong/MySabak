/* Shops (pages/shops.html), map first: every shop is a pin; the list sits in a pull-up sheet
   (phones) or a side panel (desktop). Tapping a pin previews that shop; tapping a row opens it. */
import { CONFIG } from '../config.js';
import { listShops, myOrders, ORDER_STEPS } from '../api.js';
import { openState } from '../menu.js';
import { storefront } from '../placeholders.js';
import { shopMap, knownLocation, askLocation } from '../shop-map.js';
import { $, mountChrome, esc, when, peso, toast, icon } from '../ui.js';

mountChrome();

const DESKTOP = window.matchMedia('(min-width: 900px)');
let near = { lng: CONFIG.startCenter[0], lat: CONFIG.startCenter[1] };
let category = 'all';
let shops = [];
let picked = null; // id of the shop shown in the preview card
let timer;

const shopUrl = (s) => `/pages/shop.html?id=${encodeURIComponent(s.id)}`;
const thumb = (s) => (s.image ? `<img src="${esc(s.image)}" alt="">` : storefront(s));
const km = (s) => (s.km != null ? `${s.km.toFixed(1)} km` : '');
const openLine = (s) => {
  const o = openState(s);
  return o ? `<span class="${o.open ? 'is-open' : 'is-closed'}">${esc(o.text)}</span>` : `<span>${esc(s.hours)}</span>`;
};

/* Space the panels cover, so pins stay where you can see them */
function mapPadding() {
  const app = $('.app').getBoundingClientRect();
  if (DESKTOP.matches) {
    const panel = $('.finder').getBoundingClientRect();
    return { top: 110, bottom: 140, left: panel.right - app.left + 40, right: 60 };
  }
  const top = $('.finder__top').getBoundingClientRect().bottom - app.top + 30;
  const bottom = app.bottom - $('#sheet').getBoundingClientRect().top + 24;
  return { top, bottom: Math.min(bottom, app.height - top - 80), left: 40, right: 40 };
}

const map = shopMap($('#mapCanvas'), { onPin: (id) => pick(id, { fromMap: true }), padding: mapPadding });

function renderPicked() {
  const s = shops.find((x) => x.id === picked);
  $('#picked').innerHTML = s ? `<article class="picked" aria-label="Selected shop">
      <span class="picked__img">${thumb(s)}</span>
      <div class="picked__body"><h3>${esc(s.name)}</h3><span>${esc(s.area)}${s.km != null ? ` · ${km(s)}` : ''}</span>${openLine(s)}</div>
      <a class="picked__go" href="${shopUrl(s)}">Menu</a></article>` : '';
}

function renderList() {
  $('.finder__head span').hidden = !shops.length;
  $('#shopCount').textContent = shops.length ? `${shops.length} shop${shops.length === 1 ? '' : 's'} nearby` : filtered() ? 'No shops found' : 'Shops nearby';
  $('#shopList').innerHTML = shops.length
    ? shops.map((s) => `<li><a class="srow${s.id === picked ? ' is-picked' : ''}" href="${shopUrl(s)}" data-id="${esc(s.id)}">
        <span class="srow__img">${thumb(s)}</span>
        <span class="srow__body"><span class="srow__name">${esc(s.name)}</span>
          <span class="srow__sub">${esc(s.area)} · ${esc(categoryName(s.category))} · ${s.items} items</span>${openLine(s)}</span>
        <span class="srow__km">${km(s)}</span></a></li>`).join('')
    : filtered()
      ? '<li class="empty">No shops match that search. Try another word or category.</li>'
      : `<li class="shops-empty">${icon('i-store', 'icon--xl')}<h3>No shops yet</h3>
          <p>Local shops will show up here, on the map and in this list, once they join mysabak.</p></li>`;
}

let categories = [];
const filtered = () => category !== 'all' || $('#shopSearch').value.trim() !== '';
const categoryName = (id) => (categories.find((c) => c.id === id) || { name: id }).name;

async function load({ fit = false } = {}) {
  const res = await listShops({ near, category, q: $('#shopSearch').value });
  categories = res.categories;
  shops = res.shops;
  if (!shops.some((s) => s.id === picked)) picked = shops[0] ? shops[0].id : null;
  $('#categories').innerHTML = categories.map((c) => `<button type="button" class="fchip" data-cat="${c.id}" aria-pressed="${c.id === category}">${esc(c.name)}</button>`).join('');
  renderList();
  renderPicked();
  map.setShops(shops);
  map.setActive(picked);
  if (fit && shops.length) map.fit(shops.map((s) => [s.lng, s.lat]).concat(near.real ? [[near.lng, near.lat]] : []), { animate: true });
}

/** Preview a shop: big pin, dark card on top of the list. */
function pick(id, { fromMap = false } = {}) {
  picked = id;
  renderPicked();
  document.querySelectorAll('.srow').forEach((r) => r.classList.toggle('is-picked', r.dataset.id === id));
  map.setActive(id, { fly: fromMap });
  if (fromMap) {
    const row = document.querySelector(`.srow[data-id="${CSS.escape(id)}"]`);
    if (row) row.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }
}

async function loadOrders() {
  const orders = await myOrders();
  $('#ordersCard').hidden = !orders.length;
  const stepName = (id) => (ORDER_STEPS.find((s) => s.id === id) || { name: id }).name;
  $('#orderList').innerHTML = orders.slice(0, 5).map((o) => `<li><a class="row row--link" href="/pages/order.html?id=${encodeURIComponent(o.id)}">
      <div class="row__main"><span class="row__title">${esc(o.shop.name)}</span><span class="row__sub">${esc(when(o.placedAt))} · ${esc(stepName(o.status))}</span></div>
      <span class="row__end">${peso(o.subtotal)}</span></a></li>`).join('');
}

function useLocation(point) {
  near = { ...point, real: true };
  map.setUser(point);
  load({ fit: true });
}

/* ---------- Events ---------- */
$('#categories').addEventListener('click', (e) => {
  const b = e.target.closest('[data-cat]');
  if (!b) return;
  category = b.dataset.cat;
  load({ fit: true });
});
$('#shopSearch').addEventListener('input', () => { clearTimeout(timer); timer = setTimeout(() => load({ fit: true }), 200); });

// Desktop: hovering a row lights up its pin
$('#shopList').addEventListener('mouseover', (e) => {
  const row = e.target.closest('.srow');
  if (row && DESKTOP.matches) map.setActive(row.dataset.id);
});
$('#shopList').addEventListener('mouseleave', () => map.setActive(picked));

// Phones: the handle pulls the sheet up over the map, or back down
const sheet = $('#sheet');
const handle = $('#sheetHandle');
function setExpanded(open) {
  sheet.classList.toggle('is-expanded', open);
  handle.setAttribute('aria-expanded', String(open));
  handle.querySelector('.sr-only').textContent = open ? 'Show the map' : 'Show more of the list';
}
let dragY = null;
let draggedAt = 0;
handle.addEventListener('pointerdown', (e) => { dragY = e.clientY; });
window.addEventListener('pointerup', (e) => {
  if (dragY === null) return;
  const dy = e.clientY - dragY;
  dragY = null;
  if (Math.abs(dy) > 30) { draggedAt = Date.now(); setExpanded(dy < 0); }
});
handle.addEventListener('click', () => { if (Date.now() - draggedAt > 400) setExpanded(!sheet.classList.contains('is-expanded')); });
// Scrolling the list with a finger pulls the sheet up too
$('#sheetScroll').addEventListener('touchmove', () => { if (!DESKTOP.matches) setExpanded(true); }, { passive: true });

$('#locateBtn').addEventListener('click', async () => {
  try { useLocation(await askLocation()); } catch (_) { toast('Couldn’t get your location. Shops are sorted from Cebu City centre.'); }
});

DESKTOP.addEventListener('change', () => { setExpanded(false); map.resize(); });

/* ---------- Start ---------- */
load({ fit: true });
loadOrders();
knownLocation().then((p) => { if (p) useLocation(p); });
