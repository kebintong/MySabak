/* mysabak landing page (index.html, at /). No libraries.
   - Glide: mouse-wheel scrolling eases to a stop (touch and keyboard stay native). The page still scrolls
     for real (window.scrollTo), so anchors, find-in-page, the scrollbar and screen readers keep working.
   - Lean: scroll speed drives a spring (--lean on <html>); things tilt with the motion and settle back.
   - The day: on desktop the section holds still and the day slides sideways; phones swipe it.
   - Reveals, the How it works sentence, the fare bar, the nav and the phone menu.
   With prefers-reduced-motion: no glide, no lean, nothing tied to scrolling, everything shown at once. */
import { buildScene, paintScene, heroCity } from './landing-scene.js';

const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const root = document.documentElement;
const still = matchMedia('(prefers-reduced-motion: reduce)');
const wide = matchMedia('(min-width: 900px)');
const mouse = matchMedia('(hover: hover) and (pointer: fine)');
const clamp = (n, lo, hi) => Math.min(hi, Math.max(lo, n));
const navH = () => (wide.matches ? 72 : 64);
const maxScroll = () => root.scrollHeight - innerHeight;

/* =================== Glide: wheel scrolling with momentum =================== */
const glide = { on: false, y: 0, target: 0, running: false, mine: false };
function glideTo(y) {
  glide.target = clamp(y, 0, maxScroll());
  if (!glide.running) { glide.y = scrollY; glide.running = true; requestFrame(); }
}
function glideStep(dt) {
  if (!glide.running) return false;
  if (Math.abs(scrollY - glide.y) > 2) { glide.running = false; return false; } // someone else scrolled (keys, scrollbar)
  glide.y += (glide.target - glide.y) * (1 - Math.exp(-dt * 9)); // exponential ease: fast start, soft landing
  if (Math.abs(glide.target - glide.y) < 0.4) { glide.y = glide.target; glide.running = false; }
  scrollTo(0, glide.y);
  return glide.running;
}
function onWheel(e) {
  if (e.ctrlKey || e.defaultPrevented) return; // pinch-zoom
  if (Math.abs(e.deltaX) > Math.abs(e.deltaY)) return; // sideways swipes stay native
  const scroller = e.target.closest('.lp-sheet:not([hidden])');
  if (scroller) return;
  e.preventDefault();
  const unit = e.deltaMode === 1 ? 36 : e.deltaMode === 2 ? innerHeight : 1;
  glideTo((glide.running ? glide.target : scrollY) + e.deltaY * unit);
}
function setGlide() {
  const on = mouse.matches && !still.matches && !root.classList.contains('lp-lite');
  if (on === glide.on) return;
  glide.on = on;
  root.classList.toggle('lp-glide', on);
  if (on) addEventListener('wheel', onWheel, { passive: false });
  else { removeEventListener('wheel', onWheel); glide.running = false; }
}
// In-page links: the same glide (or the browser's smooth scroll when glide is off)
document.addEventListener('click', (e) => {
  const a = e.target.closest('a[href^="#"]');
  if (!a || a.classList.contains('lp-skip')) return;
  const id = a.getAttribute('href').slice(1);
  const el = id ? document.getElementById(id) : null;
  if (!el) return;
  e.preventDefault();
  const y = id === 'top' ? 0 : el.getBoundingClientRect().top + scrollY - navH();
  if (glide.on) glideTo(y); else scrollTo({ top: y, behavior: still.matches ? 'auto' : 'smooth' });
});

/* =================== Lean: scroll speed on a spring =================== */
const lean = { x: 0, v: 0, speed: 0, lastY: scrollY, set: '0' };
const leaners = [...document.querySelectorAll('[data-lean], [data-rider]')];
function leanStep(dt) {
  if (still.matches || root.classList.contains('lp-lite')) return false;
  const raw = dt > 0 ? (scrollY - lean.lastY) / dt : 0; // px per second
  lean.lastY = scrollY;
  lean.speed += (raw - lean.speed) * (1 - Math.exp(-dt * 14));
  const goal = clamp(lean.speed / 2600, -1, 1);
  lean.v += (goal - lean.x) * 180 * dt; // stiffness
  lean.v *= Math.exp(-15 * dt); // damping: a little overshoot, then rest
  lean.x += lean.v * dt;
  const moving = Math.abs(lean.x) > 0.002 || Math.abs(lean.v) > 0.002 || Math.abs(raw) > 1;
  const v = moving ? lean.x.toFixed(4) : '0';
  if (v !== lean.set) { lean.set = v; leaners.forEach((el) => el.style.setProperty('--lean', v)); } // only on the things that lean: setting it on <html> restyles the whole city every frame
  return moving;
}

/* =================== Nav =================== */
const nav = $('[data-nav]');
const navLinks = $$('[data-link]');
const linked = navLinks.map((a) => document.getElementById(a.dataset.link)).filter(Boolean);
/* Where things are on the page, measured once (on load and resize), so scrolling never asks the browser to lay
   the page out again: reading positions every frame was the biggest cost while scrolling. */
const at = { sections: [], day: 0, read: { top: 0, height: 1 }, hero: 1 };
const docTop = (el) => el.getBoundingClientRect().top + scrollY;
function measure() {
  at.sections = linked.map((s) => ({ id: s.id, top: docTop(s), bottom: docTop(s) + s.offsetHeight }));
  at.day = docTop(day);
  at.read = { top: docTop(read), height: read.offsetHeight };
  at.hero = hero.offsetHeight;
}
function paintNav() {
  nav.classList.toggle('is-solid', scrollY > 24);
  const line = scrollY + innerHeight * 0.35;
  const on = at.sections.find((s) => s.top <= line && s.bottom > line);
  navLinks.forEach((a) => (on && a.dataset.link === on.id ? a.setAttribute('aria-current', 'true') : a.removeAttribute('aria-current')));
}

/* =================== Phone menu =================== */
const menuBtn = $('.lp-menu');
const sheet = $('#lpSheet');
function setMenu(open) {
  menuBtn.setAttribute('aria-expanded', String(open));
  menuBtn.setAttribute('aria-label', open ? 'Close the menu' : 'Open the menu');
  nav.classList.toggle('is-open', open);
  if (open) {
    sheet.hidden = false;
    requestAnimationFrame(() => sheet.classList.add('is-in'));
  } else {
    sheet.classList.remove('is-in');
    setTimeout(() => { if (menuBtn.getAttribute('aria-expanded') === 'false') sheet.hidden = true; }, still.matches ? 0 : 300);
  }
}
menuBtn.addEventListener('click', () => setMenu(menuBtn.getAttribute('aria-expanded') !== 'true'));
sheet.addEventListener('click', (e) => { if (e.target.closest('a')) setMenu(false); });
addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && menuBtn.getAttribute('aria-expanded') === 'true') { setMenu(false); menuBtn.focus(); }
});
wide.addEventListener('change', () => setMenu(false));

/* =================== Headings word by word =================== */
$$('[data-split]').forEach((h) => {
  let i = 0;
  const wrap = (text, parent) => text.split(/(\s+)/).forEach((part) => {
    if (!part) return;
    if (/^\s+$/.test(part)) { parent.append(part); return; }
    const w = document.createElement('span');
    w.className = 'lp-w';
    w.innerHTML = `<span style="--i:${i++}"></span>`;
    w.firstChild.textContent = part;
    parent.append(w);
  });
  [...h.childNodes].forEach((node) => {
    if (node.nodeType === 3) { const t = node.textContent; node.remove(); wrap(t, h); return; }
    const t = node.textContent; node.textContent = ''; wrap(t, node); h.append(node);
  });
});

/* =================== Reveals =================== */
const reveals = $$('[data-reveal], [data-split], [data-stop]');
if (still.matches || !('IntersectionObserver' in window)) {
  reveals.forEach((el) => el.classList.add('is-in'));
} else {
  const io = new IntersectionObserver((entries) => entries.forEach((e) => {
    if (!e.isIntersecting) return;
    e.target.classList.add('is-in');
    io.unobserve(e.target);
  }), { rootMargin: '0px -8% -10% 0px', threshold: 0.15 });
  reveals.forEach((el) => io.observe(el));
}

/* =================== The day: sideways while the section holds still (desktop) =================== */
const day = $('[data-day]');
const pin = $('.lp-day__pin', day);
// The scenery's idle motion (palms, clouds, windows) pauses while its section is off screen
if ('IntersectionObserver' in window) {
  const idle = new IntersectionObserver((list) => list.forEach((e) => e.target.classList.toggle('lp-off', !e.isIntersecting)));
  ['.lp-hero', '[data-day]', '.lp-end'].forEach((q) => { const el = $(q); if (el) idle.observe(el); });
}
const track = $('[data-day-track]', day);
const stops = $$('[data-stop]', track);
const clock = $$('[data-clock] li', day);
let slide = 0; // px the day moves sideways
let SPEED = 1.8; // sideways px per px scrolled down: the day moves a little faster than the page (2.2 on phones)
let marks = []; // where each stop is centred, 0…1
let night = 1;
function sizeDay() {
  const pinned = !still.matches;
  SPEED = innerWidth < 600 ? 2.2 : 1.8;
  day.classList.toggle('is-pinned', pinned);
  track.style.transform = '';
  if (!pinned) { day.style.height = ''; slide = 0; return; }
  slide = Math.max(0, track.scrollWidth - innerWidth);
  day.style.height = `${innerHeight + slide / SPEED}px`;
  marks = stops.map((s) => clamp((s.offsetLeft + s.offsetWidth / 2 - innerWidth / 2) / slide, 0, 1));
  const food = stops.find((s) => s.classList.contains('lp-night'));
  night = food ? clamp((food.offsetLeft - innerWidth * 0.55) / slide, 0, 1) : 1;
  buildScene(pin, { slide, marks, vw: innerWidth, vh: pin.offsetHeight });
  placeRider();
}

/* The rider travels with the time of day: from the left edge in the morning to the right by night. At each stop
   she parks clear of that stop's phone or laptop when she can, and the stop's time sits under her wheels. */
const spots = []; // her x at each stop (px from where css/landing.css puts her)
function placeRider() {
  spots.length = 0;
  if (!slide) return;
  const box = pin.getBoundingClientRect();
  const rw = rider.offsetWidth * 1.3; // the dash pose is wider than her box
  const top = rider.getBoundingClientRect().top - box.top;
  const start = rider.offsetLeft;
  const end = Math.max(start, innerWidth - rw - Math.max(16, innerWidth * 0.04));
  let prev = start;
  stops.forEach((s, i) => {
    const want = start + ((end - start) * i) / Math.max(1, stops.length - 1);
    // what this stop shows low down when it is centred (the track is untransformed here, so shift by its mark)
    const busy = [...s.children].map((el) => el.getBoundingClientRect()).filter((r) => r.height && r.bottom - box.top > top + 8)
      .map((r) => [r.left - marks[i] * slide - 12, r.right - marks[i] * slide + 12]);
    const free = (x) => busy.every(([a, b]) => x + rw <= a || x >= b);
    const options = [want, ...busy.flatMap(([a, b]) => [a - rw, b])].filter((x) => x >= prev && x <= end && free(x));
    const x = options.length ? options.reduce((m, o) => (Math.abs(o - want) < Math.abs(m - want) ? o : m)) : Math.max(want, prev);
    spots.push(x - start);
    prev = x;
  });
  clock.forEach((li, i) => li.style.setProperty('left', `${start + spots[i] + rider.offsetWidth * 0.45}px`));
  rider.style.translate = `${riderX(dayP).toFixed(1)}px 0`; // after a resize
}
// Between stops she pulls away and brakes into the next one (smoothstep); before the first and after the last she waits
function riderX(p) {
  if (!spots.length) return 0;
  if (p <= marks[0]) return spots[0];
  for (let i = 0; i < marks.length - 1; i++) {
    if (p <= marks[i + 1]) {
      const t = (p - marks[i]) / Math.max(1e-6, marks[i + 1] - marks[i]);
      return spots[i] + (spots[i + 1] - spots[i]) * t * t * (3 - 2 * t);
    }
  }
  return spots[spots.length - 1];
}
let dayP = 0;
let turnFrom = 0;
function paintDay() {
  if (!slide) return;
  const p = clamp(((scrollY - at.day) * SPEED) / slide, 0, 1);
  if (p !== dayP && spots.length) {
    rider.style.translate = `${riderX(p).toFixed(1)}px 0`;
    // she faces the way she is going, back toward the morning when scrolling up; the small nudge that settles
    // her on a stop is too short to turn her round
    if (Math.abs(p - turnFrom) > 0.03) { rider.classList.toggle('is-back', p < turnFrom); turnFrom = p; }
    else if ((p > turnFrom) !== rider.classList.contains('is-back')) turnFrom = p; // still going the same way: the turn is measured from here
  }
  dayP = p;
  track.style.transform = `translate3d(${(-p * slide).toFixed(1)}px,0,0)`;
  paintScene(pin, p);
  let on = 0;
  marks.forEach((m, i) => { if (p >= m - 0.12) on = i; });
  clock.forEach((li, i) => li.classList.toggle('is-on', i === on));
  day.classList.toggle('is-night', p >= night);
}
const rider = $('[data-rider]', day);
const poses = $$('.lp-rider__pose', rider);
let restTimer = 0;
function settle() {
  if (!slide) return;
  if (scrollY < at.day || scrollY > at.day + day.offsetHeight - innerHeight) return; // only while the day is on screen
  const p = dayP;
  if (p < marks[0] - 0.06 || p > marks[marks.length - 1] + 0.06) return; // the start and the end are free
  const m = marks.reduce((a, b) => (Math.abs(p - b) < Math.abs(p - a) ? b : a));
  if (Math.abs(p - m) < 0.002) return;
  const y = scrollY + (m - p) * (slide / SPEED);
  if (glide.on) glideTo(y); else scrollTo({ top: y, behavior: 'smooth' });
}
function onRest() {
  if (!slide) return;
  // the nearest stop picks her pose (waving, phone, map, then round again); before the first stop she waves hello
  const near = marks.reduce((best, m, i) => (Math.abs(dayP - m) < Math.abs(dayP - marks[best]) ? i : best), 0);
  const i = dayP < marks[0] - 0.08 ? 0 : near % poses.length;
  poses.forEach((img, k) => img.classList.toggle('is-on', k === i));
  rider.classList.add('is-resting');
  settle();
}
addEventListener('scroll', () => {
  if (!slide) return;
  rider.classList.remove('is-resting');
  clearTimeout(restTimer);
  restTimer = setTimeout(onRest, 420);
}, { passive: true });

// Tabbing to a stop's link while pinned: scroll the page so that stop is in view
track.addEventListener('focusin', (e) => {
  const panel = e.target.closest('.lp-day__panel');
  if (!slide || !panel) return;
  setTimeout(() => {
    pin.scrollLeft = 0;
    const top = day.getBoundingClientRect().top + scrollY;
    scrollTo(0, top + clamp(panel.offsetLeft, 0, slide) / SPEED);
  });
});

/* =================== How it works: the sentence lights up as you read =================== */
const read = $('[data-read]');
const words = [];
if (!still.matches) {
  const text = read.textContent.trim();
  read.textContent = '';
  text.split(/(\s+)/).forEach((part) => {
    if (/^\s+$/.test(part)) { read.append(part); return; }
    const w = document.createElement('span');
    w.className = 'lp-word';
    w.textContent = part;
    read.append(w);
    words.push(w);
  });
  read.classList.add('is-ready');
}
let lit = 0;
function paintRead() {
  if (!words.length) return;
  const top = at.read.top - scrollY;
  const p = clamp((innerHeight * 0.78 - top) / (at.read.height + innerHeight * 0.2), 0, 1);
  const n = Math.round(p * words.length);
  if (n === lit) return;
  const from = Math.max(0, Math.min(lit, n)), to = Math.max(lit, n);
  for (let i = from; i < to; i++) words[i].classList.toggle('is-lit', i < n);
  lit = n;
}

/* =================== The fare bar fills to 100% once =================== */
const farebar = $('[data-farebar]');
const pct = $('[data-pct]', farebar);
if (!still.matches && 'IntersectionObserver' in window) {
  farebar.style.setProperty('--fill', '0');
  pct.textContent = '0';
  const io = new IntersectionObserver(([e]) => {
    if (!e.isIntersecting) return;
    io.disconnect();
    const t0 = performance.now();
    const tick = (t) => {
      const k = clamp((t - t0) / 1600, 0, 1);
      const eased = 1 - (1 - k) ** 4;
      farebar.style.setProperty('--fill', eased.toFixed(4));
      pct.textContent = String(Math.round(100 * eased));
      if (k < 1) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }, { threshold: 0.7 });
  io.observe(farebar);
}

/* =================== Hero: the city at dawn; the mascot rides off as you scroll =================== */
const hero = $('.lp-hero');
const heroRider = $('[data-hero-rider]');
const city = $('[data-hero-city]');
const endCity = $('[data-end-city]');
function sizeHero() {
  city.innerHTML = heroCity(city.offsetWidth, city.offsetHeight);
  endCity.innerHTML = heroCity(endCity.offsetWidth, endCity.offsetHeight, 33); // the closing panel: home at night
}
function paintHero() {
  if (still.matches) return;
  const k = clamp(scrollY / at.hero, 0, 1);
  if (k >= 1 && heroRider.dataset.gone) return;
  heroRider.dataset.gone = k >= 1 ? '1' : '';
  heroRider.style.transform = `translate3d(${(k * innerWidth * 0.3).toFixed(1)}px,${(k * innerHeight * 0.14).toFixed(1)}px,0) rotate(${(k * -7).toFixed(2)}deg) scale(${(1 - k * 0.28).toFixed(3)})`;
}

/* =================== Devices tilt toward the pointer (desktop) =================== */
if (mouse.matches && !still.matches) {
  $$('[data-tilt]').forEach((dev) => {
    const panel = dev.closest('.lp-day__panel');
    panel.addEventListener('pointermove', (e) => {
      const r = dev.getBoundingClientRect();
      dev.style.setProperty('--ty', `${clamp(((e.clientX - r.left) / r.width - 0.5) * 12, -8, 8).toFixed(2)}deg`);
      dev.style.setProperty('--tx', `${clamp(-((e.clientY - r.top) / r.height - 0.5) * 8, -6, 6).toFixed(2)}deg`);
    });
    panel.addEventListener('pointerleave', () => { dev.style.removeProperty('--ty'); dev.style.removeProperty('--tx'); });
  });
}

/* =================== Buttons lean a little toward the pointer =================== */
if (mouse.matches && !still.matches) {
  $$('[data-magnet]').forEach((btn) => {
    btn.addEventListener('pointermove', (e) => {
      const r = btn.getBoundingClientRect();
      btn.style.translate = `${(((e.clientX - r.left) / r.width - 0.5) * 8).toFixed(1)}px ${(((e.clientY - r.top) / r.height - 0.5) * 6).toFixed(1)}px`;
    });
    btn.addEventListener('pointerleave', () => { btn.style.translate = ''; });
  });
}

/* =================== Lite: a measured fallback for slower devices =================== */
// Shared with the app (js/ui.js): a choice made by hand (?lite=1 / ?lite=0) is kept on this device; the automatic
// switch lasts for this visit only, so the next visit measures again
const LITE_KEY = 'mysabak.lite2';
const AUTO_KEY = 'mysabak.liteAuto';
const saved = (() => {
  try {
    const asked = new URLSearchParams(location.search).get('lite');
    if (asked === '1' || asked === '0') { localStorage.setItem(LITE_KEY, asked === '1' ? 'on' : 'off'); sessionStorage.removeItem(AUTO_KEY); }
    if (localStorage.getItem(LITE_KEY) === 'auto') localStorage.removeItem(LITE_KEY); // the old switch that stuck for good
    const hand = localStorage.getItem(LITE_KEY);
    return hand === 'on' || hand === 'off' ? hand : (sessionStorage.getItem(AUTO_KEY) === '1' ? 'auto' : null); // a choice by hand wins
  } catch (_) { return null; }
})();
let judged = saved === 'on' || saved === 'auto' || saved === 'off';
const gaps = [];
let calmFrom = Infinity; // not while the page is still loading its pictures (that drops frames on any device)
addEventListener('load', () => { calmFrom = performance.now() + 2500; }, { once: true });
if (document.readyState === 'complete') calmFrom = performance.now() + 2500;
function goLite() {
  root.classList.add('lp-lite');
  setGlide(); // plain native wheel scrolling
  leaners.forEach((el) => el.style.setProperty('--lean', '0'));
  try { sessionStorage.setItem(AUTO_KEY, '1'); } catch (_) { /* this page only */ }
}
function judge(dt) {
  if (judged || still.matches || Math.abs(lean.speed) < 150 || performance.now() < calmFrom) return; // only while really scrolling, once settled
  gaps.push(dt * 1000);
  if (gaps.length < 90) return;
  const avg = gaps.reduce((a, b) => a + b, 0) / gaps.length;
  // frames come in steps of 16.7 ms on a 60 Hz screen: 33.3 ms means one frame missed, so count anything past 30
  const slow = gaps.filter((g) => g > 30).length / gaps.length;
  judged = true; // judged once: a smooth device is left alone
  if (avg > 24 && slow > 0.25) goLite();
}
if (saved === 'on' || saved === 'auto') root.classList.add('lp-lite');

/* =================== One loop: runs while something is moving, then sleeps =================== */
let queued = false;
let last = performance.now();
function frame(t) {
  queued = false;
  const dt = Math.min(0.05, (t - last) / 1000);
  last = t;
  const gliding = glideStep(dt);
  judge(dt);
  paintNav();
  paintDay();
  paintRead();
  paintHero();
  const leaning = leanStep(dt);
  if (gliding || leaning) requestFrame();
}
function requestFrame() {
  if (queued) return;
  queued = true;
  requestAnimationFrame(frame);
}
addEventListener('scroll', requestFrame, { passive: true });
// Palms hold still while the page scrolls: their sway repaints the street, and nobody sees it mid-scroll
let scrollRest = 0;
addEventListener('scroll', () => { root.classList.add('lp-scrolling'); clearTimeout(scrollRest); scrollRest = setTimeout(() => root.classList.remove('lp-scrolling'), 250); }, { passive: true });
const resize = () => { sizeHero(); sizeDay(); measure(); requestFrame(); };
// Fonts and pictures can change the page's height after load: measure again when they do
if ('ResizeObserver' in window) new ResizeObserver(() => { measure(); requestFrame(); }).observe(document.body);
addEventListener('resize', resize);
addEventListener('load', () => {
  resize(); // panel sizes settle once fonts and images are in
  $$('img[loading="lazy"]', pin).forEach((img) => { img.loading = 'eager'; }); // the day's screens are ready before they're needed
});
still.addEventListener('change', () => { setGlide(); resize(); });
mouse.addEventListener('change', setGlide);
// A reload starts at the top of the page, with a clean address (the hero's entrance plays again)
if (performance.getEntriesByType('navigation')[0]?.type === 'reload') {
  if (location.hash) history.replaceState(null, '', location.pathname + location.search);
  scrollTo(0, 0);
}
setGlide();
sizeHero();
sizeDay();
measure();
frame(performance.now());
onRest(); // she starts parked

// Offline support: the same service worker as the app
if ('serviceWorker' in navigator) navigator.serviceWorker.register('/sw.js', { scope: '/' }).catch(() => {});
