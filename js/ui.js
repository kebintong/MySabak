/* =========================================================
   mysabak · shared UI for every page
   Top bar + tab bar, toast, place search, tip picker and tip sheet.
   ========================================================= */
import { CONFIG } from './config.js';
import { searchPlaces, placeLocation, sendTip, errorMessage, currentUser, signOut } from './api.js';
import { peso as formatPeso, cleanTip } from './money.js';
import { getCart } from './cart.js';

export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));
export const peso = (n) => formatPeso(n, CONFIG.currency);
export const pesoOr = (n, placeholder = '[AMOUNT]') => (typeof n === 'number' ? peso(n) : `${CONFIG.currency}${placeholder}`);

/** Escape text for HTML strings. */
export const calm = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;
// A small "that changed" pop, for values and buttons
export const pop = (n, from = 1.25) => {
  if (n && !calm()) n.animate([{ transform: `scale(${from})` }, { transform: 'none' }], { duration: 200, easing: 'cubic-bezier(.2, .8, .2, 1)' });
};
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
  { id: 'trips', label: 'Trips', icon: 'i-clock', href: '/pages/trips.html' },
  { id: 'food', label: 'Food', icon: 'i-food', href: '/pages/shops.html' }, // the round middle button
  { id: 'wallet', label: 'Wallet', icon: 'i-wallet', href: '/pages/wallet.html' },
  { id: 'account', label: 'Account', icon: 'i-user', href: '/pages/account.html' },
  { id: 'drive', label: 'Drive', icon: 'i-wheel', href: '/pages/drive.html' },
  { id: 'merchant', label: 'My shop', icon: 'i-store', href: '/pages/merchant-home.html' },
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
    label: 'Merchant', tabs: ['merchant', 'support'],
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
 * @param {{signIn?:boolean, roles?:string[]}} opts  signIn: false hides the Sign in button (the profile still
 *   shows when signed in). roles: who may use this page ('guest', 'client', 'driver', 'merchant'); anyone else
 *   is sent to their own home.
 * @returns {Promise<object|null>} the signed-in user
 */
export function mountChrome({ signIn = true, roles = null } = {}) {
  const top = $('[data-topbar]');
  if (top) {
    top.innerHTML = `
      <a class="brand" href="/" aria-label="mysabak home"><img src="/assets/images/logo.svg" alt="mysabak" width="150" height="35"></a>
      <div class="topbar__actions">
        <button type="button" class="btn btn--ghost btn--install" data-install hidden>${icon('i-download')}<span class="mobile-only">Install</span><span class="desktop-only">Install app</span></button>
        <a class="btn btn--dark" href="/pages/account.html" data-account hidden>Sign in</a>
      </div>`;
    setupInstall($('[data-install]', top));
  }
  if (!$('#toast')) document.body.insertAdjacentHTML('beforeend', '<div class="toast" id="toast" role="status" aria-live="polite"></div>');
  registerServiceWorker();
  mountMagic();
  return currentUser().catch(() => null).then((user) => {
    if (guardRole(user, roles)) return user;
    if (top) mountAccount($('[data-account]', top), user, { signIn });
    const nav = $('[data-tabs]');
    if (nav) {
      const active = nav.dataset.tabs;
      const role = ROLES[user ? user.role : 'guest'];
      nav.innerHTML = role.tabs.map((id) => {
        const t = TABS.find((x) => x.id === id);
        const href = (role.hrefs && role.hrefs[id]) || t.href;
        const on = t.id === active;
        return `<a data-tab="${t.id}" class="tab${on ? ' is-active' : ''}" href="${href}"${on ? ' aria-current="page"' : ''}>`
          + `<span class="tab__icon">${t.id === 'food' ? FACE : icon(t.icon, `icon--xl${on ? '' : ' icon--muted'}`)}</span>`
          + `<span class="tab__label">${t.label}</span></a>`;
      }).join('');
      armLoop(nav);
      foodToCart(nav);
    }
    return user;
  });
}

/** With items in the order, a tap on the round button goes to it (checkout) and a gold count shows how many.
    The shop page swaps this for its own order sheet and total. */
function foodToCart(nav) {
  const food = $('[data-tab="food"]', nav);
  const count = getCart().lines.reduce((n, l) => n + l.qty, 0);
  if (!food || !count) return;
  food.href = '/pages/checkout.html';
  food.dataset.order = count;
  food.setAttribute('aria-label', `View order: ${count} item${count === 1 ? '' : 's'}`);
  $$('.tab__count', food).forEach((n) => n.remove());
  $('.tab__icon', food).insertAdjacentHTML('beforeend', `<span class="tab__count">${count}</span>`);
}

/* ---------- The round button: a loop of pages ----------
   It shows where you are: the mascot (Home), Ride, Food or Parcel. Hold and swipe it right (or press →): it
   rolls to the next one and goes there, Home → Ride → Food → Parcel → Home. A tap does nothing, unless
   there's an order to open. */
const FACE = '<img class="tab__face" src="/assets/images/mascot-face.png" alt="" width="128" height="132">';
export const LOOP = [
  { label: 'Home', href: '/' },
  { label: 'Ride', href: '/#ride', icon: 'i-car' },
  { label: 'Food', href: '/pages/shops.html', icon: 'i-food' },
  { label: 'Parcel', href: '/#parcel', icon: 'i-box' },
];
const SWIPE = 36; // px to the right that counts as a swipe
const SPRING = 'cubic-bezier(.34, 1.56, .64, 1)';
const GLIDE = 'cubic-bezier(.22, 1, .36, 1)';

/** Which LOOP step a page is. tab: the tab bar's data-tabs (the food pages say 'food'). */
export function loopStep(path, hash, tab) {
  if (tab === 'food') return 2;
  if (path !== '/' && path !== '/index.html') return 0;
  if (hash === '#parcel') return 3;
  return ['#ride', '#where', '#moto', '#rebook'].includes(hash) ? 1 : 0;
}

const loopArt = (i) => (LOOP[i].icon ? `<span class="tab__art">${icon(LOOP[i].icon)}</span>` : `<span class="tab__art tab__art--face">${FACE}</span>`);
// How far the icon leans as the thumb pulls right: quick at first, then it stiffens and stops, so it stays in the circle
const lean = (dx) => {
  const k = 1 - Math.exp(-Math.max(0, dx) / 28);
  return k ? `translateX(${(k * 5).toFixed(1)}px) rotate(${(k * 26).toFixed(1)}deg)` : '';
};
const LEARNED_KEY = 'mysabak.swiped'; // set after the first swipe: no more hint

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
  box.innerHTML = '<span class="tab__roll"></span>';
  const roll = $('.tab__roll', box);
  food.insertAdjacentHTML('beforeend', '<span class="sr-only" id="loopHint"></span>');
  food.setAttribute('aria-describedby', 'loopHint');
  const here = () => loopStep(location.pathname, location.hash, nav.dataset.tabs);
  let step = 0;
  let start = null; // where this press began
  let turning = false;
  let swiped = false; // this press turned the button, so its click must not follow the link
  const name = (i) => {
    step = i;
    $('.tab__label', food).textContent = LOOP[i].label;
    $('#loopHint').textContent = `Swipe right, or press the right arrow, for ${LOOP[(i + 1) % LOOP.length].label}.`;
  };
  const paint = (i) => { roll.innerHTML = loopArt(i); name(i); };
  paint(here());

  // Swiping rolls the next icon in while the thumb is still down; letting go opens it, dragging back undoes it
  let armed = null;
  const arm = () => {
    const to = (step + 1) % LOOP.length;
    const old = $('.tab__art', roll);
    roll.insertAdjacentHTML('beforeend', loopArt(to));
    const neu = roll.lastElementChild;
    if (navigator.vibrate) navigator.vibrate(12);
    const quick = calm();
    // a wheel turning right: the old icon rolls out right, the next rolls in from the left and settles
    const out = old.animate(quick ? [{ opacity: 1 }, { opacity: 0 }]
      : [{ transform: old.style.transform || 'none' }, { transform: 'translateX(115%) rotate(150deg) scale(.5)', opacity: 0 }],
    { duration: quick ? 160 : 380, easing: GLIDE, fill: 'forwards' });
    const into = neu.animate(quick ? [{ opacity: 0 }, { opacity: 1 }]
      : [{ transform: 'translateX(-115%) rotate(-150deg) scale(.5)', opacity: 0 }, { transform: 'none', opacity: 1 }],
    { duration: quick ? 160 : 560, easing: quick ? 'linear' : SPRING, fill: 'both' });
    if (!quick) box.animate([{ transform: 'none' }, { transform: 'scale(1.12)', offset: 0.3 }, { transform: 'none' }], { duration: 560, easing: GLIDE });
    food.classList.add('is-turning');
    armed = { to, old, neu, out, into };
  };
  const disarm = () => {
    const { neu, out, into } = armed;
    armed = null;
    food.classList.remove('is-turning');
    out.reverse();
    into.reverse();
    into.finished.then(() => { neu.remove(); out.cancel(); }, () => {});
  };
  const commit = () => {
    const { to, old, into } = armed;
    armed = null;
    turning = true;
    try { localStorage.setItem(LEARNED_KEY, '1'); } catch (_) { /* storage off: the hint keeps showing */ }
    into.finished.then(() => { // a quick flick may let go mid-roll: finish it first
      old.remove();
      food.classList.remove('is-turning', 'is-held');
      name(to);
      turning = false;
      loopGo(LOOP[to].href);
    });
  };

  // Until the first swipe: a second after load the button nudges right, the next icon peeks in, and a bubble says so
  const hint = () => {
    if (start || turning) return;
    box.insertAdjacentHTML('beforeend', '<span class="tab__tip" aria-hidden="true">Swipe me →</span>');
    const tip = box.lastElementChild;
    tip.addEventListener('animationend', () => tip.remove());
    if (calm()) return;
    const art = $('.tab__art', roll);
    roll.insertAdjacentHTML('beforeend', loopArt((step + 1) % LOOP.length));
    const peek = roll.lastElementChild;
    const t = { duration: 1200, easing: GLIDE };
    art.animate([{ transform: 'none' }, { transform: lean(40), offset: 0.4 }, { transform: 'none' }], t);
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
    if (e.button !== 0 || turning) return;
    start = { x: e.clientX, y: e.clientY };
    food.classList.add('is-held');
    swiped = false;
    try { food.setPointerCapture(e.pointerId); } catch (_) { /* pointer already gone */ }
  });
  food.addEventListener('pointermove', (e) => {
    if (!start || turning) return;
    const dx = e.clientX - start.x;
    if (armed) { if (dx < SWIPE / 2) disarm(); return; }
    // mostly rightward counts, even drifting up or down (within ~50°)
    if (dx >= SWIPE && Math.abs(e.clientY - start.y) < dx * 1.2) { swiped = true; arm(); return; }
    $('.tab__art', roll).style.transform = lean(dx); // leans with the thumb, so it feels attached
  });
  const release = (e) => {
    if (!start) return;
    start = null;
    if (armed && e.type === 'pointerup') { commit(); return; }
    if (armed) disarm();
    food.classList.remove('is-held');
    const art = $('.tab__art', roll);
    if (!art.style.transform) return;
    art.animate([{ transform: art.style.transform }, { transform: 'none' }], { duration: 420, easing: SPRING });
    art.style.transform = '';
  };
  food.addEventListener('pointerup', release);
  food.addEventListener('pointercancel', release);
  food.addEventListener('dragstart', (e) => e.preventDefault()); // a dragged link would cancel the pointer
  food.addEventListener('contextmenu', (e) => e.preventDefault());
  food.addEventListener('click', (e) => {
    if (swiped) { swiped = false; e.preventDefault(); e.stopImmediatePropagation(); return; } // nor the shop's order sheet
    if (!food.dataset.order) e.preventDefault(); // a tap does nothing (the shop page still opens its order sheet)
  });
  food.addEventListener('keydown', (e) => { if (e.key === 'ArrowRight' && !start && !turning) { e.preventDefault(); arm(); commit(); } });
  // Home's Back button, the phone's Back, and pages restored from the back/forward cache
  window.addEventListener('hashchange', () => { if (!turning && here() !== step) paint(here()); });
  window.addEventListener('pageshow', (e) => { if (e.persisted && !turning) paint(here()); });
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
  armLoop(nav);
  foodToCart(nav);
}

const initials = (name) => String(name || '?').trim().split(/\s+/).slice(0, 2).map((w) => w[0]).join('').toUpperCase();

/**
 * The top-right account control: "Sign in" when signed out; when signed in, a profile button whose
 * dropdown holds the account's home and Sign out (Sign out lives only here).
 */
export function mountAccount(link, user, { signIn = true } = {}) {
  if (!link) return;
  if (!user) { link.hidden = !signIn; return; }
  const role = ROLES[user.role];
  const first = String(user.name || role.label).split(/\s+/)[0];
  const wrap = document.createElement('div');
  wrap.className = 'profile';
  wrap.innerHTML = `
    <button type="button" class="btn btn--ghost profile__btn" aria-haspopup="menu" aria-expanded="false" aria-label="Profile: ${esc(user.name || role.label)}">
      <span class="profile__ava" aria-hidden="true">${esc(initials(user.name || role.label))}</span>
      <span class="profile__name desktop-only">${esc(first)}</span>
      ${icon('i-chevron', 'profile__chev')}
    </button>
    <div class="profile__menu" role="menu" hidden>
      <div class="profile__who">
        <span class="profile__ava profile__ava--lg" aria-hidden="true">${esc(initials(user.name || role.label))}</span>
        <div><b>${esc(user.name || role.label)}</b><span>${esc(role.label)}${user.email ? ` · ${esc(user.email)}` : ''}</span></div>
      </div>
      <a class="profile__item" role="menuitem" href="${role.home}">${icon(role.homeIcon)}${esc(role.homeLabel)}</a>
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
    loginInput.setCustomValidity(!v || ok ? '' : 'Enter a mobile number (09XX XXX XXXX) or an email address.');
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
      showError(err.status === 401 || err.status === 400 ? err.message : errorMessage(err));
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
