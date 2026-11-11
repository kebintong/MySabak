/* Shared by the admin pages (pages/admin*.html). Admins sign in on the customer form (pages/account.html);
   nothing on the site links to these pages. */
import { mountChrome } from '../ui.js';

/** Mount the page for admins only: signed-out visitors go to sign in, other roles to their own home. */
export function mountAdmin() {
  return mountChrome({ roles: ['admin'] }).then((user) => {
    if (user && user.role !== 'admin') return null; // being sent to their own home
    if (!user) { location.replace('/pages/account.html'); return null; }
    return user;
  });
}

export const VEHICLE = { motor: 'Motor', sedan: 'Sedan', suv: 'SUV' };
export const VEHICLE_ART = { motor: '/assets/images/3d/moto.svg', sedan: '/assets/images/3d/car.svg', suv: '/assets/images/3d/suv.svg' };
// Trip services, in a fixed order with the validated chart colours (Express needs its labels: low contrast on white)
export const SERVICES = [
  { id: 'ride', name: 'Ride', color: '#7b3fbf' },
  { id: 'express', name: 'Express', color: '#e3933f' },
  { id: 'moto', name: 'Moto', color: '#2f80d1' },
  { id: 'shop', name: 'Shop', color: '#1e8a4c' },
];
// Application statuses. `short` fits the four status tabs side by side on a phone.
export const STATUS = {
  review: { label: 'Waiting', short: 'Waiting' },
  fix: { label: 'Needs a fix', short: 'To fix' },
  approved: { label: 'Approved', short: 'Approved' },
  rejected: { label: 'Rejected', short: 'Rejected' },
};
// Account statuses (Management) and the tag colour each one uses
export const ACCOUNT = {
  active: { label: 'Active', tag: 'approved' },
  pending: { label: 'Pending review', tag: 'review' },
  deactivated: { label: 'Deactivated', tag: 'rejected' },
};
export const ROLE = { rider: 'Rider', driver: 'Driver', merchant: 'Merchant' };
/** A status pill: a word on a soft colour. */
export const tag = (kind, label) => `<span class="tag tag--${kind}">${label}</span>`;
export const minSec = (s) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
export const num = (n) => Number(n).toLocaleString('en-PH');
/** How long ago, in words: "30 secs", "4 mins", "1 hr", "2 days". */
export const ago = (ts) => {
  const s = Math.floor((Date.now() - ts) / 1000);
  const say = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;
  if (s < 1) return 'just now';
  if (s < 60) return say(s, 'sec');
  if (s < 3600) return say(Math.floor(s / 60), 'min');
  if (s < 48 * 3600) return say(Math.floor(s / 3600), 'hr');
  return say(Math.floor(s / 86400), 'day');
};
/** A calendar date: "Nov 4" this year, "Nov 4, 2025" before. */
export const day = (ts) => new Date(ts).toLocaleDateString('en-PH', { day: 'numeric', month: 'short', ...(new Date(ts).getFullYear() === new Date().getFullYear() ? {} : { year: 'numeric' }) });
/** "6 hrs ago", or "just now". */
export const since = (ts) => (ago(ts) === 'just now' ? 'just now' : `${ago(ts)} ago`);

/* ---------- Details on hover, tap or focus ----------
   Any element with data-tip="Title|line|line" shows a small card above it: on hover with a mouse, on tap on a
   touch screen (tap again or anywhere else to close), and on keyboard focus. Line charts use wirePoints().
   One card for the whole page, fixed to the screen so card edges never clip it.

   Why it feels smooth: the card only ever moves with transform (no layout), glides to where it should be on
   each screen refresh (it eases behind the pointer instead of jumping), is measured only when its text changes,
   fades in and out instead of popping, and moving from one bar to the next keeps it on screen so it slides
   across. With "reduce motion" turned on it snaps into place. */
const T = { el: null, owner: null, on: false, key: '', w: 0, h: 0, x: 0, y: 0, tx: 0, ty: 0, raf: 0, last: 0, hideTimer: 0 };
const GLIDE_MS = 55; // how far behind the pointer the card trails (time constant)
const reduceMotion = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
const escT = (t) => String(t).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

const tipBox = () => {
  if (T.el) return T.el;
  T.el = document.createElement('div');
  T.el.className = 'ctip';
  T.el.setAttribute('role', 'tooltip');
  T.el.id = 'ctip';
  document.body.appendChild(T.el);
  const close = () => hideTip(true);
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') close(); });
  document.addEventListener('scroll', close, { capture: true, passive: true });
  window.addEventListener('resize', close);
  document.addEventListener('pointerdown', (e) => { if (T.owner && !T.owner.contains(e.target)) close(); });
  return T.el;
};

/** One step of the glide: ease the card toward its target, framerate-independent. */
function glide(now) {
  const dt = T.last ? Math.min(64, now - T.last) : 16;
  T.last = now;
  const k = reduceMotion() ? 1 : 1 - Math.exp(-dt / GLIDE_MS);
  T.x += (T.tx - T.x) * k;
  T.y += (T.ty - T.y) * k;
  const done = Math.abs(T.tx - T.x) < 0.25 && Math.abs(T.ty - T.y) < 0.25;
  if (done) { T.x = T.tx; T.y = T.ty; }
  T.el.style.transform = `translate3d(${T.x.toFixed(2)}px, ${T.y.toFixed(2)}px, 0)`;
  T.raf = done ? 0 : requestAnimationFrame(glide);
}

const setOwner = (owner) => {
  if (owner === T.owner) return;
  if (T.owner) { T.owner.classList.remove('is-tip'); T.owner.removeAttribute('aria-describedby'); }
  T.owner = owner || null;
  if (T.owner) { T.owner.classList.add('is-tip'); T.owner.setAttribute('aria-describedby', 'ctip'); }
};

/**
 * Show `lines` (first one bold) above the screen box `at` ({left, top, right, bottom}) or point ({x, y}).
 * `owner` gets .is-tip while its details show (charts dim the other bars with it).
 */
export function showTip(lines, at, owner) {
  const box = tipBox();
  clearTimeout(T.hideTimer);
  const key = lines.join('|');
  if (key !== T.key) { // new text: measure once (the only layout read)
    box.innerHTML = lines.map((l, i) => (i === 0 ? `<b>${escT(l)}</b>` : `<span>${escT(l)}</span>`)).join('');
    T.key = key;
    T.w = box.offsetWidth;
    T.h = box.offsetHeight;
  }
  const r = 'x' in at ? { left: at.x, right: at.x, top: at.y, bottom: at.y } : at;
  const cx = (r.left + r.right) / 2;
  T.tx = Math.max(8, Math.min(innerWidth - T.w - 8, cx - T.w / 2));
  T.ty = r.top - T.h - 10 >= 8 ? r.top - T.h - 10 : r.bottom + 10;
  box.style.setProperty('--cx', `${Math.round(Math.max(14, Math.min(T.w - 14, cx - T.tx)))}px`); // the tag's point stays on what it describes
  box.classList.toggle('is-below', T.ty > r.top);
  // glide within one chart (bar to bar, along a line); a different chart gets a fresh card in place
  const sameChart = T.on && T.owner && owner && (T.owner === owner || T.owner.parentElement === owner.parentElement);
  const appearing = !sameChart;
  T.on = true;
  setOwner(owner);
  box.classList.add('is-on');
  if (appearing) { T.x = T.tx; T.y = T.ty; } // appear in place; glide only once it's showing
  if (!T.raf) { T.last = 0; T.raf = requestAnimationFrame(glide); }
}

/** Hide the card. Not right away by default, so moving to the next bar slides it across instead of blinking. */
export function hideTip(now = false) {
  if (!T.el) return;
  clearTimeout(T.hideTimer);
  const off = () => { T.on = false; T.el.classList.remove('is-on'); setOwner(null); };
  if (now) off(); else T.hideTimer = setTimeout(off, 90);
}

/** Wire every [data-tip] inside `root` (now and later: it listens on root). */
export function wireTips(root) {
  let touch = false;
  const target = (e) => e.target.closest && e.target.closest('[data-tip]');
  const show = (el) => showTip(el.dataset.tip.split('|'), el.getBoundingClientRect(), el);
  root.addEventListener('pointerdown', (e) => { touch = e.pointerType !== 'mouse'; });
  root.addEventListener('pointerover', (e) => {
    const el = target(e);
    if (el && e.pointerType === 'mouse') show(el);
  });
  root.addEventListener('pointerout', (e) => {
    const el = target(e);
    if (el && e.pointerType === 'mouse' && !el.contains(e.relatedTarget)) hideTip();
  });
  root.addEventListener('click', (e) => {
    const el = target(e);
    if (!el || !touch || e.target.closest('a, button:not([data-tip])')) return;
    if (T.owner === el && T.on) hideTip(true); else show(el);
  });
  root.addEventListener('focusin', (e) => { const el = target(e); if (el && !touch) show(el); });
  root.addEventListener('focusout', (e) => { if (target(e)) hideTip(); });
}

/**
 * A line chart (or sparkline): a dot rides the line under the pointer, between days too, with a thin guide line;
 * the card above the chart slides along with it and shows the nearest day. Arrow keys step day by day.
 * On touch screens, tap or drag a finger along it (scrolling up and down still works).
 * @param {Element} host  the box the chart fills (position: relative); gets the .cdot and .cguide
 * @param {number} n  how many points
 * @param {(i:number) => {lines:string[], x:number, y:number}} at  details and position (0–1 of the host's box) of point i
 */
export function wirePoints(host, n, at) {
  const pts = Array.from({ length: n }, (_, i) => at(i));
  host.insertAdjacentHTML('beforeend', '<span class="cguide" aria-hidden="true"></span><span class="cdot" aria-hidden="true"></span>');
  const guide = host.querySelector(':scope > .cguide');
  const dot = host.querySelector(':scope > .cdot');
  host.tabIndex = 0;
  let cur = n - 1;
  let fx = pts[cur].x;
  let pendingX = null;
  let frame = 0;

  /** Where the line is at fraction fx (0–1) of the width, and which day is nearest. */
  const sample = (f) => {
    let j = 0;
    while (j < n - 2 && pts[j + 1].x < f) j += 1;
    const a = pts[j];
    const b = pts[Math.min(n - 1, j + 1)];
    const t = b.x === a.x ? 0 : Math.max(0, Math.min(1, (f - a.x) / (b.x - a.x)));
    return { y: a.y + (b.y - a.y) * t, i: t < 0.5 ? j : Math.min(n - 1, j + 1) };
  };
  const draw = () => {
    frame = 0;
    const r = host.getBoundingClientRect(); // read first, then only writes: no forced layout
    if (pendingX !== null) { fx = Math.max(pts[0].x, Math.min(pts[n - 1].x, (pendingX - r.left) / r.width)); pendingX = null; }
    const s = sample(fx);
    cur = s.i;
    const px = fx * r.width;
    dot.style.transform = `translate3d(${px.toFixed(2)}px, ${(s.y * r.height).toFixed(2)}px, 0)`;
    guide.style.transform = `translate3d(${px.toFixed(2)}px, 0, 0)`;
    showTip(pts[cur].lines, { left: r.left + px, right: r.left + px, top: r.top, bottom: r.bottom }, host);
  };
  const ask = () => { if (!frame) frame = requestAnimationFrame(draw); };
  const fromPointer = (e) => { pendingX = e.clientX; ask(); };

  host.addEventListener('pointerenter', fromPointer);
  host.addEventListener('pointermove', fromPointer, { passive: true });
  host.addEventListener('pointerdown', fromPointer);
  host.addEventListener('pointerleave', (e) => { if (e.pointerType === 'mouse') hideTip(); });
  host.addEventListener('focus', () => { fx = pts[cur].x; ask(); });
  host.addEventListener('blur', () => hideTip());
  host.addEventListener('keydown', (e) => {
    if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
    e.preventDefault();
    cur = Math.max(0, Math.min(n - 1, cur + (e.key === 'ArrowRight' ? 1 : -1)));
    fx = pts[cur].x;
    ask();
  });
}

/* ---------- Details sheet ----------
   Tapping something with more to see (a paper on Registrations) opens it in a sheet: from the bottom on phones,
   in the middle on bigger screens. Esc, the close button or tapping outside closes it; focus goes back. */
export function openSheet({ title, body, onReady }) {
  let d = document.getElementById('asheet');
  if (!d) {
    document.body.insertAdjacentHTML('beforeend', `<dialog class="asheet" id="asheet" aria-labelledby="asheetTitle">
      <div class="asheet__head"><h2 class="asheet__title" id="asheetTitle"></h2>
        <button type="button" class="asheet__x" data-close aria-label="Close"><svg class="icon" aria-hidden="true"><use href="/assets/images/icons.svg#i-close"/></svg></button></div>
      <div class="asheet__body" id="asheetBody"></div></dialog>`);
    d = document.getElementById('asheet');
    d.addEventListener('click', (e) => { if (e.target === d || e.target.closest('[data-close]')) d.close(); });
  }
  const back = document.activeElement;
  d.querySelector('#asheetTitle').textContent = title;
  d.querySelector('#asheetBody').innerHTML = body;
  d.onclose = () => { if (back && back.focus) back.focus(); };
  hideTip(true);
  d.showModal();
  if (onReady) onReady(d);
  return d;
}
