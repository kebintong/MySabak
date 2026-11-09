/* =========================================================
   mysabak · shared UI for every page
   Top bar + tab bar, toast, place search, tip picker and tip sheet.
   ========================================================= */
import { CONFIG } from './config.js';
import { searchPlaces, placeLocation, sendTip, errorMessage, currentUser, signOut, shopMenu, myActiveTrip, myOrders } from './api.js';
import { peso as formatPeso, cleanTip, cartTotals, isNum } from './money.js';
import { getCart } from './cart.js';

export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));
export const peso = (n) => formatPeso(n, CONFIG.currency);
export const pesoOr = (n, placeholder = '[AMOUNT]') => (typeof n === 'number' ? peso(n) : `${CONFIG.currency}${placeholder}`);

/** Escape text for HTML strings. */
export const calm = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;
// A small "that changed" pop, for values and buttons
export const pop = (n, from = 1.25) => {
  if (n && !calm()) n.animate([{ transform: `scale(${from})` }, { transform: 'none' }], { duration: 200, easing: 'cubic-bezier(.16, 1, .3, 1)' });
};
/**
 * Rolling digits (an odometer): each digit rolls to its value, blurs while it's fast, goes a little past and snaps
 * back; the digits land right to left. `from`: the value shown before (its text), so a change rolls from there and
 * digits that stay the same stay still; none = from 0. The number takes its final width at once.
 * Screen readers get the final text once; the reels are hidden from them. For text-only elements.
 */
export function rollNumber(n, from = null) {
  if (!n) return;
  const text = n.textContent;
  n.dataset.value = text; // the value as text, for the next roll's `from`
  if (calm()) return;
  const digits = (t) => [...String(t || '')].filter((c) => /\d/.test(c)).reverse(); // ones first
  const before = digits(from);
  const after = [...text].filter((c) => /\d/.test(c));
  let i = after.length; // digits left to place, counted from the right
  n.innerHTML = `<span class="roll" aria-hidden="true">${[...text].map((c) => (/\d/.test(c)
    ? `<span class="roll__d"><span class="roll__reel">${'0123456789'.split('').map((d) => `<span>${d}</span>`).join('')}</span></span>`
    : `<span>${esc(c)}</span>`)).join('')}</span><span class="sr-only">${esc(text)}</span>`;
  const reels = [...n.querySelectorAll('.roll__reel')];
  reels.forEach((reel, k) => {
    i -= 1; // this reel's place from the right (0 = ones)
    const to = Number(after[k]);
    const at = Number(before[i] || 0);
    const y = (d) => `translateY(${(-d * 1.1).toFixed(3)}em)`;
    reel.style.transform = y(to);
    if (to === at && from !== null) return; // unchanged digits stay still
    const past = to + (to >= at ? 0.16 : -0.16);
    reel.animate([
      { transform: y(at), filter: 'blur(0)', easing: 'cubic-bezier(.45, 0, .25, 1)' },
      { transform: y(at + (to - at) * 0.78), filter: 'blur(1.1px)', offset: 0.5, easing: 'cubic-bezier(.2, .65, .3, 1)' },
      { transform: y(past), filter: 'blur(.2px)', offset: 0.8, easing: 'cubic-bezier(.3, 0, .25, 1)' },
      { transform: y(to), filter: 'blur(0)' },
    ], { duration: 720, delay: i * 90, fill: 'backwards' });
  });
}
export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const ICONS = '/assets/images/icons.svg';
/** <svg> for an icon in assets/images/icons.svg */
export const icon = (id, cls = '') => `<svg class="icon ${cls}" aria-hidden="true"><use href="${ICONS}#${id}"/></svg>`;

/* ---------- Midnight magic glow (Figma "H-v3 · Mascot · Midnight") ---------- */
const STAR = 'M12 0C13 7 17 11 24 12C17 13 13 17 12 24C11 17 7 13 0 12C7 11 11 7 12 0Z';
// [x%, y%, r] white dots, then gold ones; [x%, y%, px, gold?, delay s] four-point twinkles
const SKY_DOTS = [[6, 8, 1.2], [18, 15, 1.6], [31, 6, 1], [48, 17, 1.4], [67, 7, 1.2], [85, 11, 1.6], [95, 21, 1],
  [64, 37, 1], [97, 63, 1.4], [15, 86, 1.2], [46, 86, 1.4], [77, 81, 1.1]];
const SKY_GOLD = [[38, 13, 1.3], [90, 40, 1.2], [59, 91, 1.3]];
const SKY_TWINKLES = [[41, 9, 8, 0, 1.9], [58, 11, 9, 0, 0.2], [74, 15, 15, 1, 1.1], [30, 85, 9, 0, 2.2], [8, 87, 7, 1, 1.4], [90, 82, 11, 1, 0.7]];

/** Fill an element with the night-sky effects: drifting aurora, sparkle dust, blinking dots, twinkling stars. */
export function paintSky(el) {
  if (!el || el.dataset.painted) return;
  el.dataset.painted = '1';
  const dots = (list, fill) => list.map(([x, y, r], i) => `<circle class="sky-dot" cx="${x}%" cy="${y}%" r="${r}" fill="${fill}" style="animation-delay:-${(i * 0.7) % 3}s"/>`).join('');
  el.innerHTML = '<span class="sky-aurora"></span><span class="sky-aurora sky-aurora--gold"></span>'
    + '<svg class="sky-dust" viewBox="0 0 390 262" preserveAspectRatio="none" aria-hidden="true">'
    + '<path d="M-10 236 C90 210 150 228 230 176 C290 138 330 90 400 70" stroke="#FFE29A" stroke-opacity=".45" stroke-width="2" stroke-dasharray="1 9"/>'
    + '<path d="M-10 244 C96 222 160 238 236 188 C296 150 336 104 400 84" stroke="#FFFFFF" stroke-opacity=".22" stroke-width="1.5" stroke-dasharray="1 13" style="animation-duration:17.5s"/></svg>'
    + `<svg class="sky-dots" aria-hidden="true">${dots(SKY_DOTS, '#fff')}${dots(SKY_GOLD, '#FFE29A')}</svg>`
    + SKY_TWINKLES.map(([x, y, s, gold, d]) => `<svg class="sky-tw" style="left:${x}%;top:${y}%;width:${s}px;height:${s}px;animation-delay:${d}s" viewBox="0 0 24 24" aria-hidden="true"><path d="${STAR}" fill="${gold ? '#FFE29A' : '#fff'}"/></svg>`).join('');
}

/**
 * The edge glow: a light that sweeps around the screen's edge, starting from where you tapped.
 * kind 'arrive' (lilac: you moved somewhere) or 'reward' (gold: you booked, claimed, ordered, tipped…).
 * from: the element tapped, or an angle in degrees (0 = top centre, clockwise).
 */
export function edgeGlow(kind = 'arrive', from = null) {
  let angle = typeof from === 'number' ? from : 180;
  if (from && typeof from === 'object' && from.getBoundingClientRect) {
    const r = from.getBoundingClientRect();
    const x = r.left + r.width / 2 - innerWidth / 2;
    const y = r.top + r.height / 2 - innerHeight / 2;
    angle = (Math.atan2(x, -y) * 180) / Math.PI;
  }
  document.querySelectorAll('.edgeglow').forEach((n) => n.remove());
  const glow = document.createElement('div');
  glow.className = `edgeglow edgeglow--${kind === 'reward' ? 'reward' : 'arrive'}`;
  glow.setAttribute('aria-hidden', 'true');
  glow.style.setProperty('--o', `${angle}deg`);
  glow.innerHTML = '<span class="edgeglow__rim edgeglow__rim--soft"></span><span class="edgeglow__rim"></span>';
  document.body.append(glow);
  document.body.classList.add('is-glowing');
  setTimeout(() => { glow.remove(); document.body.classList.remove('is-glowing'); }, 1800);
}

// Tabs (and a few buttons) load a new page, so the glow plays on arrival: it is remembered for the next page
const GLOW_KEY = 'mysabak.glow';
const angleOf = (el) => {
  const r = el.getBoundingClientRect();
  return Math.round((Math.atan2(r.left + r.width / 2 - innerWidth / 2, -(r.top + r.height / 2 - innerHeight / 2)) * 180) / Math.PI);
};
/** Play the edge glow on the next page this tab opens (e.g. after placing an order). */
export function glowNext(kind = 'arrive', from = null) {
  try { sessionStorage.setItem(GLOW_KEY, JSON.stringify({ kind, angle: from ? angleOf(from) : 180 })); } catch (_) { /* storage off: no glow */ }
}
function armTabGlow() {
  document.addEventListener('click', (e) => {
    const tab = e.target.closest('.tab');
    if (tab && !tab.classList.contains('is-active') && !e.defaultPrevented) glowNext('arrive', tab);
  });
  let next = null;
  try { next = JSON.parse(sessionStorage.getItem(GLOW_KEY)); sessionStorage.removeItem(GLOW_KEY); } catch (_) { /* storage off */ }
  if (next) requestAnimationFrame(() => edgeGlow(next.kind, Number(next.angle)));
}

/** Night-sky effects on every sky on the page, and the arrival glow. Called once per page. */
export function mountMagic() {
  if (document.body.dataset.magic) return;
  document.body.dataset.magic = '1';
  // the sky headers of the content pages get the same effects as Home's
  $$('.page--head-sky .page-head, .page--sky:not(.page--head-sky) .app, [data-sky]').forEach((host) => {
    if (!$(':scope > .skyfx', host)) host.insertAdjacentHTML('afterbegin', '<div class="skyfx" aria-hidden="true"></div>');
  });
  $$('.skyfx').forEach(paintSky);
  armTabGlow();
}

/* ---------- Top bar + tab bar ---------- */
export const TABS = [
  { id: 'home', label: 'Home', icon: 'i-home', href: '/' },
  { id: 'trips', label: 'Trips & Orders', icon: 'i-clock', href: '/pages/trips.html' },
  { id: 'food', label: 'Food', icon: 'i-food', href: '/pages/shops.html' }, // the round middle button
  { id: 'wallet', label: 'Wallet', icon: 'i-wallet', href: '/pages/wallet.html' },
  { id: 'account', label: 'Account', icon: 'i-user', href: '/pages/account.html' },
  { id: 'drive', label: 'Drive', icon: 'i-wheel', href: '/pages/drive.html' },
  { id: 'merchant', label: 'Dashboard', icon: 'i-store', href: '/pages/merchant-home.html' },
  { id: 'merchantStats', label: 'Analytics', icon: 'i-chart', href: '/pages/merchant-analytics.html' },
  { id: 'merchantManage', label: 'Manage', icon: 'i-pencil', href: '/pages/merchant-manage.html' },
  { id: 'support', label: 'Support', icon: 'i-heart', href: '/pages/support.html' },
  { id: 'admin', label: 'Overview', icon: 'i-shield', href: '/pages/admin.html' },
  { id: 'adminReg', label: 'Registrations', icon: 'i-check', href: '/pages/admin-registrations.html' },
  { id: 'adminStats', label: 'Analytics', icon: 'i-chart', href: '/pages/admin-analytics.html' },
  { id: 'adminManage', label: 'Management', icon: 'i-user', href: '/pages/admin-management.html' },
];

/* What each kind of account sees. Customers (signed in or not) get the Figma bar; Drive and Support
   live on the Account page for them. */
export const ROLES = {
  guest: { tabs: ['home', 'trips', 'food', 'wallet', 'account'] },
  client: {
    label: 'Customer', tabs: ['home', 'trips', 'food', 'wallet', 'account'],
    home: '/pages/account.html', homeLabel: 'My account', homeIcon: 'i-user', signIn: '/pages/account.html',
  },
  driver: {
    label: 'Driver', tabs: ['drive', 'support'], hrefs: { drive: '/pages/driver.html' },
    home: '/pages/driver.html', homeLabel: 'Driver home', homeIcon: 'i-wheel', signIn: '/pages/drive.html',
  },
  merchant: {
    label: 'Merchant', tabs: ['merchant', 'merchantStats', 'merchantManage'],
    home: '/pages/merchant-home.html', homeLabel: 'Shop dashboard', homeIcon: 'i-store', signIn: '/pages/merchant.html',
  },
  // Signs in on the customer form; not shown on any sign-in switch.
  admin: {
    label: 'Admin', tabs: ['admin', 'adminReg', 'adminStats', 'adminManage'],
    home: '/pages/admin.html', homeLabel: 'Admin', homeIcon: 'i-shield', signIn: '/pages/account.html',
  },
};

/**
 * Fill <header data-topbar> and <nav data-tabs="shops"> on a page, and start offline support.
 * @param {{roles?:string[]}} opts  roles: who may use this page ('guest', 'client', 'driver', 'merchant'); anyone
 *   else is sent to their own home.
 * @returns {Promise<object|null>} the signed-in user
 */
export function mountChrome({ roles = null } = {}) {
  const top = $('[data-topbar]');
  if (top) {
    top.innerHTML = `
      <a class="brand" href="/" aria-label="mysabak home"><img src="/assets/images/logo.svg" alt="mysabak" width="150" height="35"></a>
      <div class="topbar__actions">
        <button type="button" class="btn btn--ghost btn--install" data-install hidden>${icon('i-download')}<span class="mobile-only">Install</span><span class="desktop-only">Install app</span></button>
        <span data-account hidden></span>
      </div>`;
    setupInstall($('[data-install]', top));
  }
  if (!$('#toast')) document.body.insertAdjacentHTML('beforeend', '<div class="toast" id="toast" role="status" aria-live="polite"></div>');
  registerServiceWorker();
  mountMagic();
  return currentUser().catch(() => null).then((user) => {
    if (guardRole(user, roles)) return user;
    if (top) mountAccount($('[data-account]', top), user);
    const nav = $('[data-tabs]');
    if (nav) {
      const active = nav.dataset.tabs;
      const role = ROLES[user ? user.role : 'guest'];
      nav.innerHTML = role.tabs.map((id) => {
        const t = TABS.find((x) => x.id === id);
        const href = (role.hrefs && role.hrefs[id]) || t.href;
        const on = t.id === active;
        return `<a data-tab="${t.id}" class="tab${on ? ' is-active' : ''}" href="${href}"${on ? ' aria-current="page"' : ''}>`
          + `<span class="tab__icon">${t.id === 'food' ? '' : icon(t.icon, `icon--xl${on ? '' : ' icon--muted'}`)}</span>`
          + `<span class="tab__label">${t.label}</span></a>`;
      }).join('');
      foodToCart(); // first: the dial starts where the order says, without a roll
      armLoop(nav);
      trackTrip();
    }
    return user;
  });
}

/* What the round button shows besides its icons: the shop order (Cart step: its total). One gold badge holds a live
   ride's minutes and the cart's count, taking turns when there are both. Rides and food orders on their way are
   counted on the Trips & Orders tab. */
const order = { count: 0, total: '' };
let trip = null; // { kind:'ride'|'express', fare:'₱120'|'', status, eta:number|null }
let ongoing = 0; // live rides plus food orders on their way: the Trips & Orders tab's count
let onChange = () => {}; // set by armLoop: the dial follows the order and the trip

/** Show the order on the round button: item count and total (e.g. "₱360"); 0 items shows the plain cart. */
export function showOrder(count, total = '') {
  order.count = count;
  order.total = count ? total : '';
  onChange();
}

/** Show the customer's live ride or parcel on the round button and count what's ongoing on the Trips & Orders tab,
    and keep both current while anything is. The ride screen calls this when a booking starts or ends; every page
    calls it once on load. */
const DONE = ['delivered', 'cancelled'];
let tripTimer = 0;
export function trackTrip() {
  clearTimeout(tripTimer);
  Promise.all([myActiveTrip(), myOrders()]).then(([t, orders]) => {
    const live = t && t.status !== 'completed' ? t : null;
    const p = live && live.booking.price;
    trip = live && { kind: live.kind, status: live.status, eta: live.etaMinutes, fare: p && isNum(p.total) ? peso(p.total) : '' };
    ongoing = (live ? 1 : 0) + orders.filter((o) => !DONE.includes(o.status)).length;
    onChange();
    showOngoing();
    // shortcut: polls while anything is ongoing (1 s finding a driver, 5 s on a ride, 15 s for food); a backend could push
    if (live || ongoing) tripTimer = setTimeout(trackTrip, live ? (live.status === 'searching' ? 1000 : 5000) : 15000);
  }).catch(() => { /* nothing shown: the ride screen and the order page still have it */ });
}

// The Trips & Orders tab: a gold count of rides and food orders on their way
function showOngoing() {
  const tab = $('.tab[data-tab="trips"]');
  if (!tab) return;
  $$('.tab__ongoing', tab).forEach((n) => n.remove());
  if (ongoing) $('.tab__icon', tab).insertAdjacentHTML('beforeend', `<span class="tab__ongoing" aria-hidden="true">${ongoing}</span>`);
  tab.setAttribute('aria-label', ongoing ? `Trips & Orders, ${ongoing} ongoing` : 'Trips & Orders');
}

// Every page: the count straight away, the total once the shop's menu is in (prices always come from the menu)
function foodToCart() {
  const cart = getCart();
  showOrder(cart.lines.reduce((n, l) => n + l.qty, 0), order.total);
  if (!cart.lines.length) return;
  shopMenu(cart.shopId).then((s) => {
    if (getCart().shopId !== cart.shopId) return; // the cart changed shops meanwhile
    const t = cartTotals(getCart(), s.menu);
    showOrder(t.count, peso(t.subtotal));
  }).catch(() => { /* shop gone: the count still shows */ });
}

/** Cart lines (money.js cartTotals → lines) as list rows with a −/+ stepper (Cart page, checkout). */
export function cartRows(lines) {
  return lines.map((l) => `<li class="row">
      <div class="row__main"><span class="row__title">${esc(l.name)}</span>
        ${l.options.length ? `<span class="row__sub">${esc(l.options.join(', '))}</span>` : ''}
        ${l.note ? `<span class="row__sub">“${esc(l.note)}”</span>` : ''}
        <span class="row__sub">${peso(l.price)} each</span></div>
      <div class="stepper" role="group" aria-label="${esc(l.name)} quantity">
        <button type="button" data-step="-1" data-line="${esc(l.key)}" aria-label="One less">${icon('i-minus', 'icon--sm')}</button>
        <span>${l.qty}</span>
        <button type="button" data-step="1" data-line="${esc(l.key)}" aria-label="One more">${icon('i-plus', 'icon--sm')}</button>
      </div><span class="row__end">${peso(l.total)}</span></li>`).join('');
}

/* ---------- The round button: a dial of pages ----------
   It shows where you are: Ride, Parcel, the Cart (the Cart page and checkout), or Food (the food pages and every
   other page). With an order, the Cart shows its total, and the food pages rest on it. Turn a finger round it (or
   press → / ←): each quarter turn rolls one icon on, clockwise Food → Ride → Parcel → Cart → Food, back the
   other way. Turning never leaves the page; a tap opens the icon shown (Food, with an order: that order's shop).
   On its own page a tap does nothing. A page can take over a tap (the shop opens its order sheet for Cart) by
   cancelling the 'loop:open' event, whose detail is the step's label. */
const FOOD = 0;
const RIDE = 1;
const PARCEL = 2;
const CART = 3;
export const LOOP = [
  { label: 'Food', href: '/pages/shops.html', icon: 'i-food' },
  { label: 'Ride', href: '/#ride', icon: 'i-car' },
  { label: 'Parcel', href: '/#parcel', icon: 'i-box' },
  { label: 'Cart', href: '/pages/cart.html', icon: 'i-cart' },
];
const QUARTER = 90; // degrees of turn per icon
const DEAD = 12; // px round the centre where the angle jumps about: ignored
const SPRING = 'cubic-bezier(.34, 1.56, .64, 1)';
const GLIDE = 'cubic-bezier(.22, 1, .36, 1)';

/** Which LOOP step a page shows. tab: the tab bar's data-tabs (the food, cart and checkout pages say 'food'). */
export function loopStep(path, hash, tab) {
  if (path.startsWith('/pages/cart') || path.startsWith('/pages/checkout')) return CART;
  if (tab === 'food' || (path !== '/' && path !== '/index.html')) return FOOD;
  if (hash === '#parcel') return PARCEL;
  return ['#ride', '#where', '#moto', '#rebook'].includes(hash) ? RIDE : FOOD;
}

/** Change in angle from prev to next, in degrees, the short way round: (-180, 180]. */
export function turnDelta(prev, next) {
  const d = (((next - prev) % 360) + 360) % 360;
  return d > 180 ? d - 360 : d;
}

// The live trip's step: Parcel for an Express delivery, Ride otherwise
const tripStep = () => (trip ? (trip.kind === 'express' ? PARCEL : RIDE) : -1);
// Something live on a step: an order on the Cart, the trip on its step (screen readers hear the other one too)
const isLive = (i) => (i === CART && order.count > 0) || i === tripStep();
// A step's money in place of its icon: the Cart's order total ('' = the icon; the trip's step keeps its icon)
const face = (i) => (i === CART ? order.total : '');
// The one gold badge: the ride's minutes ("Here" once the driver is) and the cart's count, the shown step's first.
// Alone it's just its text; two take turns, each with its icon
function badgeItems(i) {
  const ride = trip && (trip.status === 'arrived' ? 'Here' : isNum(trip.eta) ? `${trip.eta}m` : '');
  const items = ride ? [{ icon: trip.kind === 'express' ? 'i-box' : 'i-car', text: ride }] : [];
  if (order.count) items[i === CART ? 'unshift' : 'push']({ icon: 'i-cart', text: String(order.count) });
  return items;
}
// Words for screen readers: what the step holds right now
function says(i) {
  if (i === tripStep()) {
    const t = { searching: 'looking for a driver', arriving: isNum(trip.eta) ? `driver ${trip.eta} min away` : 'driver on the way',
      arrived: 'driver is here', on_trip: isNum(trip.eta) ? `${trip.eta} min to drop-off` : 'on the way' }[trip.status] || 'booked';
    return `${LOOP[i].label}, ${t}${trip.fare ? `, ${trip.fare}` : ''}`;
  }
  if (i === CART && order.count) return `Cart, ${order.count} item${order.count === 1 ? '' : 's'}${order.total ? `, ${order.total}` : ''}`;
  return LOOP[i].label;
}
// The money is smaller when long, so ₱12,345 still fits the circle
const artInner = (i) => (face(i)
  ? `<b class="tab__total${face(i).length > 6 ? ' tab__total--long' : ''}">${esc(face(i))}</b>`
  : icon(LOOP[i].icon));
const loopArt = (i) => `<span class="tab__art" data-face="${esc(face(i))}">${artInner(i)}</span>`;
// The icon tilts with the finger between steps, so it feels attached (at most ±36°)
const tilt = (deg) => (deg ? `rotate(${(deg * 0.4).toFixed(1)}deg)` : '');
const LEARNED_KEY = 'mysabak.swiped'; // set after the first turn: no more hint

// Food with an order goes back to the shop it's from
function loopHref(i) {
  const cart = getCart();
  return LOOP[i].label === 'Food' && cart.lines.length ? `/pages/shop.html?id=${encodeURIComponent(cart.shopId)}` : LOOP[i].href;
}

// Same page (Home's #ride / #parcel): change the hash so app.js routes without a reload
function loopGo(href) {
  const url = new URL(href, location.origin);
  const home = (p) => (p === '/index.html' ? '/' : p);
  if (home(url.pathname) === home(location.pathname)) location.hash = url.hash;
  else location.href = href;
}

function armLoop(nav) {
  const food = $('[data-tab="food"]', nav);
  if (!food || food.dataset.loop) return;
  food.dataset.loop = '1';
  const box = $('.tab__icon', food);
  box.insertAdjacentHTML('afterbegin', '<span class="tab__roll"></span>'); // keeps the count, if it's in already
  const roll = $('.tab__roll', box);
  food.insertAdjacentHTML('beforeend', '<span class="sr-only" id="loopHint" aria-live="polite"></span>');
  food.setAttribute('aria-describedby', 'loopHint');
  const page = () => loopStep(location.pathname, location.hash, nav.dataset.tabs);
  // Where the dial rests: this page's step, but the food pages rest on the Cart (and its total) with an order
  const rest = () => (page() === FOOD && order.count ? CART : page());
  // On that step's own page? Checkout shows the Cart but isn't the Cart page; other pages show Food but aren't the food pages
  const at = (i) => i === page() && (i === CART ? location.pathname.startsWith('/pages/cart') : i !== FOOD || nav.dataset.tabs === 'food');
  const shown = () => roll.lastElementChild; // older icons may still be rolling out before it
  let step = 0;
  let rested = 0; // the rest step last time we looked: a dial still there follows the order
  let press = null; // this press: the button's centre, the last angle, degrees turned since the last step
  let swiped = false; // this press turned the button, so its click must not follow the link
  let badged = { step: -1, key: '' }; // the badge last drawn: a new number on the same step bounces
  const name = (i) => {
    step = i;
    const label = says(i);
    $('.tab__label', food).textContent = label;
    // The other live step (an order while a ride is shown, or the ride while the Cart is) is named too
    const also = LOOP.map((_, k) => k).filter((k) => k !== i && isLive(k)).map(says);
    $('#loopHint').textContent = `Showing ${label}${at(i) ? '' : ', tap to open it'}.${also.length ? ` Also: ${also.join('; ')}.` : ''} Turn it, or press the arrow keys, to pick another page.`;
    const items = badgeItems(i);
    const key = items.map((b) => b.icon + b.text).join(' ');
    if (key === badged.key && i === badged.step) return;
    $$('.tab__count', food).forEach((n) => n.remove());
    if (items.length === 1) box.insertAdjacentHTML('beforeend', `<span class="tab__count" aria-hidden="true">${esc(items[0].text)}</span>`);
    if (items.length > 1) {
      box.insertAdjacentHTML('beforeend', `<span class="tab__count is-turning" aria-hidden="true">${items.map((b, k) =>
        `<span class="tab__slide" style="animation-delay:${k * 2.5}s">${icon(b.icon)}${esc(b.text)}</span>`).join('')}</span>`);
    }
    if (items.length && badged.key && i === badged.step) pop($('.tab__count', food), 0.6);
    badged = { step: i, key };
  };
  const paint = (i) => { roll.innerHTML = loopArt(i); name(i); rested = rest(); };
  paint(rest());
  // Only a person's turn counts (not the dial following the order)
  const markLearned = () => { try { localStorage.setItem(LEARNED_KEY, '1'); } catch (_) { /* storage off: the hint keeps showing */ } };

  // One icon on (dir 1) or back (dir -1), like a wheel: the shown icon rolls out one side, the next rolls in from the other
  const turn = (dir, to = (step + dir + LOOP.length) % LOOP.length) => {
    const old = shown();
    roll.insertAdjacentHTML('beforeend', loopArt(to));
    const neu = shown();
    if (navigator.vibrate) navigator.vibrate(12);
    const quick = calm();
    const x = 115 * dir;
    const r = 150 * dir;
    old.animate(quick ? [{ opacity: 1 }, { opacity: 0 }]
      : [{ transform: old.style.transform || 'none' }, { transform: `translateX(${x}%) rotate(${r}deg) scale(.5)`, opacity: 0 }],
    { duration: quick ? 160 : 380, easing: GLIDE, fill: 'forwards' }).finished.then(() => old.remove(), () => {});
    // 'backwards', not 'both': once settled, its inline tilt must win again
    neu.animate(quick ? [{ opacity: 0 }, { opacity: 1 }]
      : [{ transform: `translateX(${-x}%) rotate(${-r}deg) scale(.5)`, opacity: 0 }, { transform: 'none', opacity: 1 }],
    { duration: quick ? 160 : 560, easing: quick ? 'linear' : SPRING, fill: 'backwards' });
    if (!quick) box.animate([{ transform: 'none' }, { transform: 'scale(1.12)', offset: 0.3 }, { transform: 'none' }], { duration: 560, easing: GLIDE });
    name(to);
  };

  // The order or the trip changed: a dial resting where it should rolls to the new rest (first item in a shop →
  // the Cart and its total; last one out → back to Food); otherwise the step shown gets its new money and badge
  onChange = () => {
    const was = rested;
    rested = rest();
    if (press) return;
    if (step === was && rested !== was) { turn(1, rested); return; }
    const art = shown();
    const before = art.dataset.face;
    if (before !== face(step)) {
      art.dataset.face = face(step);
      art.innerHTML = artInner(step);
      if (before && face(step)) pop(box, 1.1); // a changed total bounces; the first one arriving on load doesn't
    }
    name(step);
  };

  // Until the first turn: a second after load the button tilts, the next icon peeks in, and a bubble says so
  const hint = () => {
    if (press) return;
    box.insertAdjacentHTML('beforeend', '<span class="tab__tip" aria-hidden="true">Turn me ↻</span>');
    const tip = box.lastElementChild;
    tip.addEventListener('animationend', () => tip.remove());
    if (calm()) return;
    const art = $('.tab__art', roll);
    roll.insertAdjacentHTML('beforeend', loopArt((step + 1) % LOOP.length));
    const peek = roll.lastElementChild;
    const t = { duration: 1200, easing: GLIDE };
    art.animate([{ transform: 'none' }, { transform: tilt(70), offset: 0.4 }, { transform: 'none' }], t);
    peek.animate([
      { transform: 'translateX(-115%) rotate(-150deg)', opacity: 0 },
      { transform: 'translateX(-62%) rotate(-55deg)', opacity: 1, offset: 0.4 },
      { transform: 'translateX(-115%) rotate(-150deg)', opacity: 0 },
    ], { ...t, fill: 'both' }).finished.then(() => peek.remove());
  };
  let learned = true;
  try { learned = localStorage.getItem(LEARNED_KEY) === '1'; } catch (_) { /* storage off: no hint */ }
  if (!learned) setTimeout(hint, 1000);

  food.addEventListener('pointerdown', (e) => {
    if (e.button !== 0) return;
    const r = box.getBoundingClientRect();
    press = { cx: r.left + r.width / 2, cy: r.top + r.height / 2, angle: null, turned: 0 };
    food.classList.add('is-held');
    swiped = false;
    try { food.setPointerCapture(e.pointerId); } catch (_) { /* pointer already gone */ }
  });
  food.addEventListener('pointermove', (e) => {
    if (!press) return;
    const dx = e.clientX - press.cx;
    const dy = e.clientY - press.cy;
    if (Math.hypot(dx, dy) < DEAD) { press.angle = null; return; }
    // screen y points down, so a growing angle is clockwise
    const a = (Math.atan2(dy, dx) * 180) / Math.PI;
    if (press.angle !== null) press.turned += turnDelta(press.angle, a);
    press.angle = a;
    if (Math.abs(press.turned) > 20) swiped = true; // a turn, not a tap
    while (Math.abs(press.turned) >= QUARTER) {
      const dir = Math.sign(press.turned);
      press.turned -= dir * QUARTER;
      food.classList.add('is-turning');
      turn(dir);
      markLearned();
    }
    shown().style.transform = tilt(press.turned);
  });
  const release = () => {
    if (!press) return;
    press = null;
    food.classList.remove('is-held', 'is-turning');
    const art = shown();
    if (!art.style.transform) return;
    art.animate([{ transform: art.style.transform }, { transform: 'none' }], { duration: 420, easing: SPRING });
    art.style.transform = '';
  };
  food.addEventListener('pointerup', release);
  food.addEventListener('pointercancel', release);
  food.addEventListener('dragstart', (e) => e.preventDefault()); // a dragged link would cancel the pointer
  food.addEventListener('contextmenu', (e) => e.preventDefault());
  food.addEventListener('click', (e) => {
    e.preventDefault(); // the link's href is only for no-JS; the dial decides
    if (swiped) { swiped = false; return; }
    if (!at(step)) {
      const open = new CustomEvent('loop:open', { bubbles: true, cancelable: true, detail: LOOP[step].label });
      if (food.dispatchEvent(open)) loopGo(loopHref(step));
      return;
    }
    // its own page: nothing to open, so a little wiggle says "turn me"
    if (!calm()) shown().animate([{ transform: 'none' }, { transform: tilt(-40) }, { transform: tilt(40) }, { transform: 'none' }], { duration: 360, easing: GLIDE });
  });
  food.addEventListener('keydown', (e) => {
    const dir = { ArrowRight: 1, ArrowLeft: -1 }[e.key];
    if (!dir || press) return;
    e.preventDefault();
    turn(dir);
    markLearned();
  });
  // Home's Back button, the phone's Back, a tap that only changed the hash, and the back/forward cache
  window.addEventListener('hashchange', () => { if (!press) (rest() !== step ? paint(rest()) : (name(step), rested = rest())); });
  window.addEventListener('pageshow', (e) => { if (e.persisted && !press) { paint(rest()); foodToCart(); } });
}

/** Send someone whose role may not use this page to their own home. Returns true when it redirected. */
export function guardRole(user, roles) {
  const role = user ? user.role : 'guest';
  if (!roles || roles.includes(role) || role === 'guest') return false;
  location.replace(ROLES[role].home);
  return true;
}

/** Hide the tabs (in a static tab bar with data-tab="id" links, like index.html) this user doesn't see. */
export function filterTabs(nav, user) {
  const role = ROLES[user ? user.role : 'guest'];
  $$('[data-tab]', nav).forEach((a) => { a.hidden = !role.tabs.includes(a.dataset.tab); });
  foodToCart();
  armLoop(nav);
  trackTrip();
}

const initials = (name) => String(name || '?').trim().split(/\s+/).slice(0, 2).map((w) => w[0]).join('').toUpperCase();

/**
 * The top-right account control: "Sign in" when signed out; when signed in, a profile button whose
 * dropdown holds the account's home and Sign out (Sign out lives only here).
 */
/** A merchant's pages, in the profile menu (the same order as the tab bar). */
const merchantMenu = () => [
  ['i-store', 'Dashboard', '/pages/merchant-home.html'],
  ['i-chart', 'Analytics', '/pages/merchant-analytics.html'],
  ['i-pencil', 'Management', '/pages/merchant-manage.html'],
];

export function mountAccount(link, user) {
  if (!link) return;
  if (!user) { link.remove(); return; } // signed out: the Account tab is the way in, so no Sign in button here
  const role = ROLES[user.role];
  const first = String(user.name || role.label).split(/\s+/)[0];
  const wrap = document.createElement('div');
  wrap.className = 'profile';
  wrap.innerHTML = `
    <button type="button" class="btn btn--ghost profile__btn" aria-haspopup="menu" aria-expanded="false" aria-label="Profile: ${esc(user.name || role.label)}">
      <span class="profile__ava" aria-hidden="true">${esc(initials(user.name || role.label))}</span>
      <span class="profile__name desktop-only">${esc(first)}</span>
    </button>
    <div class="profile__menu" role="menu" hidden>
      <div class="profile__who">
        <span class="profile__ava profile__ava--lg" aria-hidden="true">${esc(initials(user.name || role.label))}</span>
        <div class="profile__id">
          <span class="profile__line"><b>${esc(user.name || role.label)}</b><span class="profile__role">${esc(user.branch ? 'Branch' : role.label)}</span></span>
          ${user.branch ? `<span class="profile__sub">${esc(user.branch)} branch</span>` : ''}
          ${user.email ? `<span class="profile__sub profile__email">${esc(user.email)}</span>` : ''}
        </div>
      </div>
      ${(user.role === 'merchant' ? merchantMenu() : [[role.homeIcon, role.homeLabel, role.home]])
    .map(([ic, label, href]) => `<a class="profile__item" role="menuitem" href="${href}">${icon(ic)}${esc(label)}</a>`).join('')}
      <button type="button" class="profile__item profile__item--out" role="menuitem" data-signout>${icon('i-power')}Sign out</button>
    </div>`;
  link.replaceWith(wrap);
  const btn = $('.profile__btn', wrap);
  const menu = $('.profile__menu', wrap);
  const setOpen = (open) => {
    menu.hidden = !open;
    btn.setAttribute('aria-expanded', String(open));
    wrap.classList.toggle('profile--open', open);
    if (open) $('.profile__item', menu).focus();
  };
  btn.addEventListener('click', () => setOpen(menu.hidden));
  menu.addEventListener('click', (e) => { if (e.target.closest('a')) setOpen(false); }); // a #section link stays on the page
  document.addEventListener('click', (e) => { if (!wrap.contains(e.target)) setOpen(false); });
  wrap.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !menu.hidden) { setOpen(false); btn.focus(); }
  });
  $('[data-signout]', menu).addEventListener('click', async () => {
    await signOut();
    location.href = role.signIn;
  });
}

/**
 * Wire a sign-in form (mobile number or email + password, #signinError, #signinBtn) to a sign-in call.
 * @param {HTMLFormElement} form
 * @param {(creds:{login:string, password:string}) => Promise<any>} signInFn
 * @param {string|((result:any) => string)} next  where to go once signed in (or a function of the sign-in result)
 */
export function wireSignInForm(form, signInFn, next) {
  const button = $('[type="submit"]', form);
  const error = $('.field__error', form);
  wirePasswordReveal(form);
  const loginInput = form.elements.login;
  const PHONE = /^(\+?63|0)9\d{9}$/;
  const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  /** The login must look like a PH mobile number or an email. */
  const checkLogin = () => {
    const v = loginInput.value.trim();
    const ok = v.includes('@') ? EMAIL.test(v) : PHONE.test(v.replace(/[\s-]/g, ''));
    loginInput.setCustomValidity(!v || ok ? '' : 'Enter a mobile number (like 0917 123 4567) or an email address.');
  };
  loginInput.addEventListener('input', checkLogin);
  const showError = (message) => { error.textContent = message; error.hidden = !message; };
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    showError('');
    checkLogin();
    if (!form.checkValidity()) { form.reportValidity(); return; }
    const data = new FormData(form);
    button.disabled = true;
    button.textContent = 'Signing in…';
    try {
      const login = data.get('login').trim();
      const res = await signInFn({ login: login.includes('@') ? login : login.replace(/[\s-]/g, ''), password: data.get('password') });
      location.href = typeof next === 'function' ? next(res) : next;
    } catch (err) {
      showError([400, 401, 403].includes(err.status) ? err.message : errorMessage(err)); // 403: turned off or not set up yet
      button.disabled = false;
      button.textContent = 'Sign in';
    }
  });
}

export function registerServiceWorker() {
  if (!('serviceWorker' in navigator) || location.protocol === 'file:') return;
  window.addEventListener('load', () => {
    const worker = new URL('/sw.js', location.origin).href;
    navigator.serviceWorker.register(worker, { scope: '/' }).catch(() => { /* offline support is optional */ });
    // Older versions installed sw.js elsewhere (/assets/js/sw.js, /html/sw.js); remove those.
    navigator.serviceWorker.getRegistrations().then((regs) => regs.forEach((r) => {
      const w = r.active || r.waiting || r.installing;
      if (w && w.scriptURL !== worker) r.unregister();
    })).catch(() => {});
  });
}

/* ---------- Install (add to Home Screen / Dock) ---------- */
/* Chrome, Edge, Brave, Samsung and Android browsers offer a native prompt (beforeinstallprompt;
   each page's <head> catches it early in window.__installPrompt). Safari on iPhone, iPad and Mac
   never does, so the button opens step-by-step instructions for the browser being used. */
export const isInstalled = () => window.matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;

let installPrompt = null;
window.addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); installPrompt = e; });

/** Which install instructions fit this device and browser. */
export function installPlatform(ua = navigator.userAgent, touchPoints = navigator.maxTouchPoints || 0) {
  const ios = /iPad|iPhone|iPod/.test(ua) || (/Macintosh/.test(ua) && touchPoints > 0); // iPadOS reports "Macintosh" (Macs have no touch)
  const android = /Android/.test(ua);
  const firefox = /Firefox|FxiOS/.test(ua);
  const safari = /Safari/.test(ua) && !/Chrome|Chromium|CriOS|FxiOS|EdgiOS|Edg\/|OPR|SamsungBrowser/.test(ua);
  if (ios) return 'ios';
  if (/Macintosh/.test(ua) && safari) return 'mac-safari';
  if (android && /SamsungBrowser/.test(ua)) return 'samsung';
  if (android && firefox) return 'android-firefox';
  if (android) return 'android';
  if (firefox) return 'desktop-firefox';
  return 'desktop';
}

const INSTALL_STEPS = {
  ios: {
    title: 'Add mysabak to your Home Screen',
    steps: [`Tap the Share button ${icon('i-share', 'icon--inline')} (bottom of the screen on iPhone, top on iPad).`, 'Scroll down and tap <b>Add to Home Screen</b>.', 'Tap <b>Add</b>. mysabak now opens from your Home Screen like an app.'],
    note: 'Works in Safari, and in Chrome or Edge on iOS 16.4 or later.',
  },
  'mac-safari': {
    title: 'Add mysabak to your Dock',
    steps: [`In the menu bar choose <b>File</b>, or click the Share button ${icon('i-share', 'icon--inline')}.`, 'Choose <b>Add to Dock</b>.', 'Click <b>Add</b>. mysabak opens from your Dock and Launchpad.'],
    note: 'Needs macOS Sonoma (Safari 17) or later. On older Macs, use Chrome, Edge or Brave.',
  },
  samsung: {
    title: 'Add mysabak to your Home screen',
    steps: ['Tap the menu ☰ at the bottom.', 'Tap <b>Add page to</b>, then <b>Home screen</b>.', 'Tap <b>Add</b>.'],
  },
  'android-firefox': {
    title: 'Add mysabak to your Home screen',
    steps: [`Tap the menu ${icon('i-menu-dots', 'icon--inline')}.`, 'Tap <b>Install</b> (or <b>Add to Home screen</b>).', 'Tap <b>Add</b>.'],
  },
  android: {
    title: 'Add mysabak to your Home screen',
    steps: [`Tap the browser menu ${icon('i-menu-dots', 'icon--inline')}.`, 'Tap <b>Install app</b> or <b>Add to Home screen</b>.', 'Tap <b>Install</b>.'],
  },
  'desktop-firefox': {
    title: 'Install mysabak',
    steps: ['Firefox on computers can’t install web apps yet.', 'Open this page in Chrome, Edge or Brave (or Safari on a Mac).', 'Click <b>Install app</b> again.'],
  },
  desktop: {
    title: 'Install mysabak',
    steps: ['Click the install icon at the right end of the address bar, or open the browser menu.', 'Choose <b>Install mysabak</b> (Chrome: <b>Cast, save and share → Install page</b>).', 'Click <b>Install</b>. mysabak opens in its own window.'],
    note: 'Already installed? Open it from your apps or Start menu.',
  },
};

function openInstallSheet() {
  const info = INSTALL_STEPS[installPlatform()];
  const dlg = document.createElement('dialog');
  dlg.className = 'sheet';
  dlg.setAttribute('aria-labelledby', 'installTitle');
  dlg.innerHTML = `
    <form method="dialog" class="sheet__body">
      <span class="sheet__handle" aria-hidden="true"></span>
      <div class="install__head"><img src="/assets/images/icons/icon-192.png" alt="" width="56" height="56">
        <div><h2 class="sheet__title" id="installTitle">${info.title}</h2><p class="sheet__sub">Opens full screen, no app store needed.</p></div></div>
      <ol class="install__steps">${info.steps.map((s) => `<li>${s}</li>`).join('')}</ol>
      ${info.note ? `<p class="field__hint">${info.note}</p>` : ''}
      <button type="submit" class="button button--block">Got it</button>
    </form>`;
  document.body.appendChild(dlg);
  dlg.addEventListener('close', () => dlg.remove());
  if (typeof dlg.showModal === 'function') dlg.showModal(); else dlg.setAttribute('open', '');
}

/** Wire an Install button: native prompt where the browser has one, instructions everywhere else. */
export function setupInstall(button) {
  if (!button) return;
  if (isInstalled()) { button.hidden = true; return; }
  button.hidden = false;
  window.addEventListener('appinstalled', () => { button.hidden = true; toast('mysabak is installed. Find it on your Home Screen or in your apps.'); });
  button.addEventListener('click', async () => {
    const prompt = installPrompt || window.__installPrompt;
    if (prompt) {
      installPrompt = null;
      window.__installPrompt = null;
      prompt.prompt();
      await prompt.userChoice.catch(() => {});
      return;
    }
    openInstallSheet();
  });
}

/** Show / hide buttons next to password fields: <button data-reveal="inputId">. */
export function wirePasswordReveal(root = document) {
  $$('[data-reveal]', root).forEach((btn) => btn.addEventListener('click', () => {
    const input = document.getElementById(btn.dataset.reveal);
    const showing = input.type === 'text';
    input.type = showing ? 'password' : 'text';
    btn.textContent = showing ? 'Show' : 'Hide';
    btn.setAttribute('aria-label', showing ? 'Show password' : 'Hide password');
  }));
}

/* ---------- Toast ---------- */
let toastTimer;
export function toast(msg) {
  const el = $('#toast');
  if (!el) return;
  el.textContent = msg;
  el.classList.remove('is-visible');
  void el.offsetWidth; // restart the entrance animation
  el.classList.add('is-visible');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('is-visible'), 3200);
}

export const when = (ts) => new Date(ts).toLocaleString('en-PH', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
export const params = () => new URLSearchParams(location.search);

/* ---------- Place search (address box with suggestions) ---------- */
/**
 * Turn an <input> + <ul> into an address search.
 * @param {{input:HTMLInputElement, list:HTMLUListElement, near:() => {lng,lat}, onPick:(place:{label,lng,lat}) => void}} opts
 */
export function placeSearch({ input, list, near, onPick }) {
  let timer = null;
  let ctrl = null;
  let items = [];
  const close = () => { list.hidden = true; input.setAttribute('aria-expanded', 'false'); };
  const show = (html) => { list.innerHTML = html; list.hidden = false; input.setAttribute('aria-expanded', 'true'); };

  input.addEventListener('input', () => {
    clearTimeout(timer);
    const text = input.value.trim();
    if (text.length < 3) { close(); return; }
    timer = setTimeout(async () => {
      if (ctrl) ctrl.abort();
      ctrl = new AbortController();
      show('<li class="suggest__note">Searching…</li>');
      try {
        items = await searchPlaces(text, near(), { signal: ctrl.signal });
        if (input.value.trim() !== text) return;
        show(items.length
          ? items.map((p, i) => `<li class="suggest__item" role="option" data-index="${i}">${icon('i-pin')}<span class="suggest__text"><span class="suggest__title">${esc(p.title)}</span><span class="suggest__sub">${esc(p.subtitle)}</span></span></li>`).join('')
          : '<li class="suggest__note">No places found. Try another name.</li>');
      } catch (err) {
        if (err.name !== 'AbortError') show(`<li class="suggest__note">${esc(errorMessage(err))}</li>`);
      }
    }, 300);
  });
  input.addEventListener('blur', () => setTimeout(close, 150));
  list.addEventListener('mousedown', (e) => e.preventDefault());
  list.addEventListener('click', async (e) => {
    const li = e.target.closest('[data-index]');
    if (!li) return;
    const place = items[Number(li.dataset.index)];
    close();
    try {
      const loc = await placeLocation(place);
      input.value = place.title;
      onPick({ label: place.title, lng: loc.lng, lat: loc.lat });
    } catch (err) {
      toast(errorMessage(err));
    }
  });
}

/* ---------- Tip picker ---------- */
/**
 * Tip amount buttons (₱10 / ₱20 / ₱50 / Custom) + e-wallet/card choice, rendered into `root`.
 * Nothing is picked by default.
 * @returns {{amount:() => number, method:() => string|null, reset:() => void}}
 */
export function tipPicker(root, { onChange = () => {} } = {}) {
  const { presets, max, methods } = CONFIG.tips;
  const uid = Math.random().toString(36).slice(2, 7);
  root.classList.add('tip__picker');
  root.innerHTML = `
    <div class="tip__amounts" role="group" aria-label="Tip amount">
      ${presets.map((n) => `<button type="button" class="chip tip__amount" data-amount="${n}" aria-pressed="false">${peso(n)}</button>`).join('')}
      <button type="button" class="chip tip__amount" data-amount="custom" aria-pressed="false">Custom</button>
    </div>
    <label class="tip__custom" hidden>
      <span class="sr-only">Custom tip in pesos</span>
      <span class="tip__currency" aria-hidden="true">${CONFIG.currency}</span>
      <input type="number" inputmode="numeric" min="1" max="${max}" step="1" placeholder="Up to ${max}">
    </label>
    <fieldset class="tip__methods">
      <legend>Pay the tip with</legend>
      ${methods.map((m, i) => `<label class="pill-radio"><input type="radio" name="tipMethod-${uid}" value="${m.id}"${i === 0 ? ' checked' : ''}><span>${m.name}</span></label>`).join('')}
    </fieldset>`;
  let picked = null; // number, 'custom' or null
  const custom = $('.tip__custom', root);
  const customInput = $('input', custom);
  const buttons = $$('.tip__amount', root);

  const amount = () => (picked === 'custom' ? cleanTip(customInput.value, max) : cleanTip(picked, max));
  const paint = () => {
    buttons.forEach((b) => b.setAttribute('aria-pressed', String(String(picked) === b.dataset.amount)));
    custom.hidden = picked !== 'custom';
    onChange(amount());
  };
  buttons.forEach((b) => b.addEventListener('click', () => {
    const v = b.dataset.amount === 'custom' ? 'custom' : Number(b.dataset.amount);
    picked = picked === v ? null : v; // tap again to un-pick
    paint();
    if (picked === 'custom') customInput.focus();
  }));
  customInput.addEventListener('input', () => {
    if (Number(customInput.value) > max) customInput.value = String(max);
    onChange(amount());
  });
  return {
    amount,
    method: () => ($('input[type="radio"]:checked', root) || {}).value || null,
    reset: () => { picked = null; customInput.value = ''; paint(); },
  };
}

/* ---------- Tip sheet (after a trip / delivery, or from a receipt) ---------- */
const TIP_NOTE = {
  ride: 'Your driver keeps 100% of the fare. Tips go to mysabak.',
  express: 'Your driver keeps 100% of the fare. Tips go to mysabak.',
  shop: 'The shop gets the item price and your rider keeps 100% of the delivery fee. Tips go to mysabak.',
};

/**
 * Show the "Tip mysabak" sheet.
 * @param {{orderId:string, orderType:'ride'|'express'|'shop', title:string, subtitle?:string,
 *   lines?:Array<{label:string, to:string, amount:string}>, demoNote?:string}} opts
 * @returns {Promise<{amount:number}|null>}  null = no tip
 */
export function openTipSheet({ orderId, orderType, title, subtitle = '', lines = [], demoNote = '' }) {
  return new Promise((resolve) => {
    const dlg = document.createElement('dialog');
    dlg.className = 'sheet';
    dlg.setAttribute('aria-labelledby', 'tipSheetTitle');
    dlg.innerHTML = `
      <form method="dialog" class="sheet__body">
        <span class="sheet__handle" aria-hidden="true"></span>
        <h2 class="sheet__title" id="tipSheetTitle">${esc(title)}</h2>
        ${subtitle ? `<p class="sheet__sub">${esc(subtitle)}</p>` : ''}
        ${demoNote ? `<p class="demo-note">${esc(demoNote)}</p>` : ''}
        ${lines.length ? `<dl class="receipt">${lines.map((l) => `<div class="receipt__row"><dt>${esc(l.label)}<span>${esc(l.to)}</span></dt><dd>${esc(l.amount)}</dd></div>`).join('')}</dl>` : ''}
        <section class="tip" aria-labelledby="tipHead">
          <h3 class="tip__head" id="tipHead">Tip mysabak <span>· keeps rides fee-free for drivers</span></h3>
          <div data-picker></div>
          <p class="tip__note">${icon('i-shield', 'icon--sm')}${esc(TIP_NOTE[orderType] || TIP_NOTE.ride)}</p>
        </section>
        <div class="sheet__actions">
          <button type="button" class="button button--ghost" data-skip>No tip</button>
          <button type="button" class="button" data-send disabled>Tip</button>
        </div>
      </form>`;
    document.body.appendChild(dlg);
    const send = $('[data-send]', dlg);
    const picker = tipPicker($('[data-picker]', dlg), {
      onChange: (n) => { send.disabled = !n; send.textContent = n ? `Tip ${peso(n)}` : 'Tip'; },
    });
    const done = (result) => {
      dlg.close();
      dlg.remove();
      resolve(result);
    };
    $('[data-skip]', dlg).addEventListener('click', () => done(null));
    dlg.addEventListener('cancel', (e) => { e.preventDefault(); done(null); });
    send.addEventListener('click', async () => {
      const amount = picker.amount();
      if (!amount) return;
      send.disabled = true;
      send.textContent = 'Sending…';
      try {
        await sendTip({ orderId, orderType, amount, method: picker.method() });
        edgeGlow('reward', send);
        toast(`Thank you! Your ${peso(amount)} tip keeps mysabak fee-free for drivers.`);
        done({ amount });
      } catch (err) {
        toast(err.status === 400 ? err.message : errorMessage(err));
        send.disabled = false;
        send.textContent = `Tip ${peso(amount)}`;
      }
    });
    if (typeof dlg.showModal === 'function') dlg.showModal(); else dlg.setAttribute('open', '');
  });
}
