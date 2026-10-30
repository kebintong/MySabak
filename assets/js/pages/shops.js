/* Shops (pages/shops.html), map first: the list sits in a pull-up sheet (phones) or a side panel (desktop).
   The map only pins what the customer asked for: search results, a category, or the shop they tapped.
   Tapping a row or a pin previews that shop on the map; tapping the previewed row again opens it. */
import { CONFIG } from '../config.js';
import { listShops, myOrders, ORDER_STEPS } from '../api.js';
import { openState } from '../menu.js';
import { storefront } from '../placeholders.js';
import { shopMap, knownLocation, askLocation } from '../shop-map.js';
import { $, mountChrome, esc, when, peso, toast, icon } from '../ui.js';

mountChrome({ signIn: false, roles: ['client'] }); // no Sign in button here: customers sign in from Ride or Account

const DESKTOP = window.matchMedia('(min-width: 900px)');
const REDUCED_MOTION = window.matchMedia('(prefers-reduced-motion: reduce)');
let near = { lng: CONFIG.startCenter[0], lat: CONFIG.startCenter[1] };
let category = ''; // '' = none picked: every shop is listed, none is pinned
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
  const bottom = app.bottom - ($('.picked') || $('#sheet')).getBoundingClientRect().top + 24; // the card floats above the sheet
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

const shopRow = (s, mark = true, i = 0) => `<li style="--i:${Math.min(i, 8)}"><button type="button" class="srow${mark && s.id === picked ? ' is-picked' : ''}"${mark ? ` aria-pressed="${s.id === picked}"` : ''} data-id="${esc(s.id)}">
    <span class="srow__img">${thumb(s)}</span>
    <span class="srow__body"><span class="srow__name">${esc(s.name)}</span>
      <span class="srow__sub">${esc(s.area)} · ${esc(categoryName(s.category))} · ${s.items} items</span>${openLine(s)}</span>
    <span class="srow__km">${km(s)}</span></button></li>`;

function renderList() {
  $('.finder__head span').hidden = !shops.length;
  $('#shopCount').textContent = shops.length ? `${shops.length} shop${shops.length === 1 ? '' : 's'} nearby` : filtered() ? 'No shops found' : 'Shops nearby';
  $('#shopList').innerHTML = shops.length
    ? shops.map((s, i) => shopRow(s, true, i)).join('')
    : filtered()
      ? '<li class="empty">No shops match that search. Try another word or category.</li>'
      : `<li class="shops-empty">${icon('i-store', 'icon--xl')}<h3>No shops yet</h3>
          <p>Local shops will show up here, on the map and in this list, once they join mysabak.</p></li>`;
}

let categories = [];
const filtered = () => category !== '' || $('#shopSearch').value.trim() !== '';
const categoryName = (id) => (categories.find((c) => c.id === id) || { name: id }).name;

/* Pins only for what the customer asked for: search results, a category, or the shop they tapped */
function showPins() {
  map.setShops(filtered() ? shops : shops.filter((s) => s.id === picked));
  map.setActive(picked);
}

async function load({ fit = false } = {}) {
  const res = await listShops({ near, category: category || 'all', q: $('#shopSearch').value });
  categories = res.categories;
  shops = res.shops;
  if (!shops.some((s) => s.id === picked)) picked = null;
  $('#categories').innerHTML = categories.filter((c) => c.id !== 'all')
    .map((c) => `<button type="button" class="fchip" data-cat="${c.id}" aria-pressed="${c.id === category}">${esc(c.name)}</button>`).join('');
  renderList();
  renderPicked();
  showPins();
  if (fit && filtered() && shops.length) map.fit(shops.map((s) => [s.lng, s.lat]).concat(near.real ? [[near.lng, near.lat]] : []), { animate: true });
}

/** Preview a shop: its pin (big), the map moved to it, the dark card on top of the list. */
function pick(id, { fromMap = false } = {}) {
  picked = id;
  renderPicked();
  document.querySelectorAll('#shopList .srow').forEach((r) => { r.classList.toggle('is-picked', r.dataset.id === id); r.setAttribute('aria-pressed', String(r.dataset.id === id)); });
  showPins();
  if (!DESKTOP.matches && level === 2) setLevel(1); // the full sheet would hide the pin
  map.setActive(id, { fly: true });
  if (fromMap && level === 0) setLevel(1); // the preview card lives in the sheet
  const row = document.querySelector(`#shopList .srow[data-id="${CSS.escape(id)}"]`);
  if (row) row.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
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
// Tapping the picked chip again clears it
$('#categories').addEventListener('click', (e) => {
  const b = e.target.closest('[data-cat]');
  if (!b) return;
  category = category === b.dataset.cat ? '' : b.dataset.cat;
  load({ fit: true });
});
$('#shopSearch').addEventListener('input', () => { clearTimeout(timer); timer = setTimeout(() => load({ fit: true }), 200); });

// A row only ever shows its shop on the map (tap again to re-centre); the card's Menu opens it
$('#shopList').addEventListener('click', (e) => {
  const row = e.target.closest('.srow');
  if (row) pick(row.dataset.id);
});

/* Browse: the categories as tiles, the nearest shops (or search results) under them.
   A tile filters the map, a shop is shown on the map, Map goes back with the search kept. */
const svgArt = (paths) => `<svg class="btile__art" viewBox="0 0 24 24" aria-hidden="true">${paths}</svg>`;
const TILE_ART = {
  food: '<img class="btile__art btile__art--pic" src="/assets/images/v3/food.svg" alt="">',
  coffee: svgArt('<path d="M4 9h12v5a5 5 0 0 1-5 5H9a5 5 0 0 1-5-5z"/><path d="M16 11h2a2 2 0 0 1 0 4h-2"/><path d="M8 3v3M12 3v3"/>'),
  bakery: svgArt('<path d="M5 11a4 4 0 0 1 2-7h10a4 4 0 0 1 2 7v8a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1z"/>'),
  grocery: svgArt('<path d="M3 10h18l-2 9H5z"/><path d="M8 10l4-6 4 6"/>'),
  essentials: svgArt('<path d="M6 8h12l-1 12H7z"/><path d="M9 8a3 3 0 0 1 6 0"/>'),
};
const browse = $('#browse');
const browseQuery = $('#browseQuery');

async function renderBrowseList() {
  const q = browseQuery.value.trim();
  const res = await listShops({ near, q });
  const list = q ? res.shops : res.shops.slice(0, 4);
  $('#browseSub').textContent = !q ? 'Nearest to you' : list.length ? `${list.length} shop${list.length === 1 ? '' : 's'} found` : 'No shops found';
  $('#browseNear').innerHTML = list.length
    ? list.map((s, i) => shopRow(s, false, i)).join('')
    : '<li class="empty">No shops match that search. Try another word or a category.</li>';
}
async function openBrowse() {
  const res = await listShops({ near });
  const count = (id) => res.shops.filter((s) => s.category === id).length;
  $('#browseTiles').innerHTML = res.categories.filter((c) => c.id !== 'all').map((c, i) => `<button type="button" class="btile${i % 2 ? ' btile--lilac' : ''}" data-cat="${esc(c.id)}" style="--i:${i}">
      <span class="btile__name">${esc(c.name)}</span><span class="btile__count">${count(c.id)} shop${count(c.id) === 1 ? '' : 's'}</span>
      ${TILE_ART[c.id] || icon('i-store', 'btile__art')}</button>`).join('');
  browseQuery.value = $('#shopSearch').value;
  await renderBrowseList();
  browse.classList.remove('is-closing');
  browse.hidden = false;
  $('#browseOpen').setAttribute('aria-expanded', 'true');
  browse.scrollTop = 0;
}
/** Back to the map, keeping the Browse search; optionally with a category or a shop picked. */
async function leaveBrowse({ cat = null, shopId = null } = {}) {
  $('#browseOpen').setAttribute('aria-expanded', 'false');
  if (REDUCED_MOTION.matches) browse.hidden = true;
  else {
    browse.classList.add('is-closing');
    setTimeout(() => { browse.hidden = true; browse.classList.remove('is-closing'); }, 200);
  }
  $('#shopSearch').value = browseQuery.value;
  if (cat !== null) category = cat;
  await load({ fit: !shopId });
  if (shopId) pick(shopId);
}
$('#browseOpen').addEventListener('click', openBrowse);
$('#browseClose').addEventListener('click', () => leaveBrowse());
browseQuery.addEventListener('input', () => { clearTimeout(timer); timer = setTimeout(renderBrowseList, 200); });
$('#browseTiles').addEventListener('click', (e) => {
  const b = e.target.closest('[data-cat]');
  if (b) leaveBrowse({ cat: b.dataset.cat });
});
$('#browseNear').addEventListener('click', (e) => {
  const row = e.target.closest('.srow');
  if (!row) return;
  leaveBrowse({ cat: '', shopId: row.dataset.id }); // Browse lists every category, so drop the map's
});

// Desktop: hovering a row lights up its pin (when it has one)
$('#shopList').addEventListener('mouseover', (e) => {
  const row = e.target.closest('.srow');
  if (row && DESKTOP.matches) map.setActive(row.dataset.id);
});
$('#shopList').addEventListener('mouseleave', () => map.setActive(picked));

// Phones: drag the handle between three heights: hidden (just the handle), half, full
const sheet = $('#sheet');
const handle = $('#sheetHandle');
let level = 1; // 0 hidden, 1 half, 2 full
function setLevel(n) {
  level = Math.max(0, Math.min(2, n));
  sheet.classList.toggle('is-expanded', level === 2);
  sheet.classList.toggle('is-collapsed', level === 0);
  handle.setAttribute('aria-expanded', String(level === 2));
  handle.querySelector('.sr-only').textContent = level === 2 ? 'Show the map' : level === 0 ? 'Show the list' : 'Show more of the list';
}
let dragY = null;
let draggedAt = 0;
handle.addEventListener('pointerdown', (e) => { dragY = e.clientY; });
window.addEventListener('pointerup', (e) => {
  if (dragY === null) return;
  const dy = e.clientY - dragY;
  dragY = null;
  if (Math.abs(dy) > 30) { draggedAt = Date.now(); setLevel(level + (dy < 0 ? 1 : -1)); }
});
handle.addEventListener('click', () => { if (Date.now() - draggedAt > 400) setLevel(level === 2 ? 1 : level + 1); });
// Scrolling the list with a finger pulls the sheet up too
$('#sheetScroll').addEventListener('touchmove', () => { if (!DESKTOP.matches) setLevel(2); }, { passive: true });

$('#locateBtn').addEventListener('click', async () => {
  try { useLocation(await askLocation()); } catch (_) { toast('Couldn’t get your location. Shops are sorted from Cebu City centre.'); }
});

DESKTOP.addEventListener('change', () => { setLevel(1); map.resize(); });

/* ---------- Start ---------- */
load({ fit: true });
loadOrders();
knownLocation().then((p) => { if (p) useLocation(p); });
