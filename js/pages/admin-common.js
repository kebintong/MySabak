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
export const VEHICLE_ART = { motor: '/assets/images/3d/moto.webp', sedan: '/assets/images/3d/car.webp', suv: '/assets/images/3d/car.webp' };
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
/** A status pill: a coloured dot and a word (no glyphs that read as truncated text). */
export const tag = (kind, label) => `<span class="tag tag--${kind}">${label}</span>`;
export const minSec = (s) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
export const num = (n) => Number(n).toLocaleString('en-PH');
export const initials = (name) => String(name || '?').trim().split(/\s+/).slice(0, 2).map((w) => w[0]).join('').toUpperCase();
/** How long ago, roughly: "6 h", "2 d". */
export const ago = (ts) => {
  const h = Math.max(0, Math.round((Date.now() - ts) / 3600e3));
  return h < 1 ? 'just now' : h < 48 ? `${h} h` : `${Math.round(h / 24)} d`;
};
/** A calendar date: "Nov 4" this year, "Nov 4, 2025" before. */
export const day = (ts) => new Date(ts).toLocaleDateString('en-PH', { day: 'numeric', month: 'short', ...(new Date(ts).getFullYear() === new Date().getFullYear() ? {} : { year: 'numeric' }) });
/** "6 h ago", or "just now". */
export const since = (ts) => (ago(ts) === 'just now' ? 'just now' : `${ago(ts)} ago`);

/* ---------- Details on hover, tap or focus ----------
   Any element with data-tip="Title|line|line" shows a small card above it: on hover with a mouse, on tap on a
   touch screen (tap again or anywhere else to close), and on keyboard focus. Charts with many points call
   showTip() themselves. One card for the whole page, fixed to the screen so card edges never clip it. */
let tipEl = null;
let tipFor = null;
const tipBox = () => {
  if (tipEl) return tipEl;
  tipEl = document.createElement('div');
  tipEl.className = 'ctip';
  tipEl.setAttribute('role', 'tooltip');
  tipEl.id = 'ctip';
  tipEl.hidden = true;
  document.body.appendChild(tipEl);
  const close = () => hideTip();
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') close(); });
  document.addEventListener('scroll', close, true);
  window.addEventListener('resize', close);
  document.addEventListener('pointerdown', (e) => { if (tipFor && !tipFor.contains(e.target)) close(); });
  return tipEl;
};
const escT = (t) => String(t).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

/** Show `lines` (first one bold) above the screen point or box `at` ({left, top, right, bottom} or {x, y}). */
export function showTip(lines, at, owner) {
  const box = tipBox();
  box.innerHTML = lines.map((l, i) => (i === 0 ? `<b>${escT(l)}</b>` : `<span>${escT(l)}</span>`)).join('');
  box.hidden = false;
  tipFor = owner || null;
  const r = 'x' in at ? { left: at.x, right: at.x, top: at.y, bottom: at.y } : at;
  const w = box.offsetWidth;
  const h = box.offsetHeight;
  const cx = (r.left + r.right) / 2;
  box.style.left = `${Math.max(8, Math.min(innerWidth - w - 8, cx - w / 2))}px`;
  box.style.top = `${r.top - h - 10 >= 8 ? r.top - h - 10 : r.bottom + 10}px`;
  if (owner) owner.setAttribute('aria-describedby', 'ctip');
}
export function hideTip() {
  if (!tipEl || tipEl.hidden) return;
  tipEl.hidden = true;
  if (tipFor) tipFor.removeAttribute('aria-describedby');
  tipFor = null;
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
    if (tipFor === el) hideTip(); else show(el);
  });
  root.addEventListener('focusin', (e) => { const el = target(e); if (el && !touch) show(el); });
  root.addEventListener('focusout', (e) => { if (target(e)) hideTip(); });
}

/**
 * A chart with one value per x position (a line or sparkline): pointing anywhere on it shows the nearest point's
 * details and moves a dot there; arrow keys step through the points when it has focus.
 * @param {Element} host  the box the chart fills (position: relative); gets a .cdot marker
 * @param {number} n  how many points
 * @param {(i:number) => {lines:string[], x:number, y:number}} at  details and position (0–1 of the host's box) of point i
 */
export function wirePoints(host, n, at) {
  const dot = document.createElement('span');
  dot.className = 'cdot';
  dot.hidden = true;
  host.appendChild(dot);
  host.tabIndex = 0;
  let cur = n - 1;
  const show = (i) => {
    cur = Math.max(0, Math.min(n - 1, i));
    const p = at(cur);
    const r = host.getBoundingClientRect();
    dot.style.left = `${p.x * 100}%`;
    dot.style.top = `${p.y * 100}%`;
    dot.hidden = false;
    showTip(p.lines, { x: r.left + p.x * r.width, y: r.top + p.y * r.height - 4 }, host);
  };
  const fromEvent = (e) => {
    const r = host.getBoundingClientRect();
    return Math.round(((e.clientX - r.left) / r.width) * (n - 1));
  };
  host.addEventListener('pointermove', (e) => show(fromEvent(e)));
  host.addEventListener('pointerdown', (e) => show(fromEvent(e)));
  host.addEventListener('pointerleave', (e) => { if (e.pointerType === 'mouse') { dot.hidden = true; hideTip(); } });
  host.addEventListener('focus', () => show(cur));
  host.addEventListener('blur', () => { dot.hidden = true; hideTip(); });
  host.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') { e.preventDefault(); show(cur + (e.key === 'ArrowRight' ? 1 : -1)); }
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
  hideTip();
  d.showModal();
  if (onReady) onReady(d);
  return d;
}
