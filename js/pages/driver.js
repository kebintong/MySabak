/* Drive (pages/driver.html): map first. The status panel on the night sky (the online switch, the connection,
   location and alert status, and today's numbers), then the map with every request as a pin in its service's
   colour (Ride purple, Parcel orange, Food green, each with its icon), and the requests: the tapped one as the
   big card, the rest below (beside the map on desktop). Money is on Earnings.
   The map sits on the page; "Full map" opens it full screen for a route preview or in-app navigation to the next
   stop (turn by turn from TomTom, following the phone's location). Google Maps stays as a backup.
   Accept one and follow it: to pickup → arrived (wait timer, check it's the right rider, or a no-show after
   5 minutes) → on the trip (safety always one tap away; hold to complete) → a summary (cash collected? rate the
   rider). Express and Shop jobs add the sender and recipient, a photo at pickup and delivery, and a
   "can't deliver" path.
   Job requests come from onJobRequest(); the demo sends SAMPLE ones. */
import { CONFIG } from '../config.js';
import {
  driverStatus, setOnline, onJobRequest, acceptJob, activeJob, updateJob, cancelJob, closeJob, driverEarnings,
  routeBetween, straightLine, errorMessage,
} from '../api.js';
import { haversineKm } from '../money.js';
import { routeProgress, nextStep } from '../nav.js';
import { shopMap, knownLocation, askLocation } from '../shop-map.js';
import { $, $$, mountChrome, toast, peso, esc, icon, edgeGlow, ava, emptyRows, rollNumber, sheet } from '../ui.js';
import { CANCEL_REASONS, FAIL_REASONS } from '../trip-list.js';

mountChrome({ roles: ['driver'] });

// One colour and one icon per service, everywhere: the pin, the card's stripe and label, the job card.
// color: pins and stripes; ink: the darker shade for text, so it passes contrast on white.
const SVG = {
  car: '<path d="M5 16V11l2-5h10l2 5v5"/><path d="M3 11h18v5H3z"/><circle cx="7.5" cy="16" r="1.6"/><circle cx="16.5" cy="16" r="1.6"/>',
  box: '<path d="M3 7l9-4 9 4v10l-9 4-9-4z"/><path d="M3 7l9 4 9-4M12 11v10"/>',
  bag: '<path d="M5 8h14l-1 12H6z"/><path d="M9 8V6a3 3 0 0 1 6 0v2"/>',
};
const svgIcon = (d, cls = 'dkind__ic') => `<svg class="${cls}" viewBox="0 0 24 24" aria-hidden="true">${d}</svg>`;
const KIND = {
  ride: { name: 'Ride', color: '#5630d8', ink: '#5b2596', svg: SVG.car },
  express: { name: 'Parcel', color: '#E0782F', ink: '#8a4b0f', svg: SVG.box },
  shop: { name: 'Food', color: '#1E7A44', ink: '#1f6b3a', svg: SVG.bag },
};
const kindStyle = (k) => `--kind:${k.color};--kind-ink:${k.ink}`;
const kindLabel = (k) => `<span class="dkind">${svgIcon(k.svg)}${esc(k.name)}</span>`;
const PAY = { cash: 'Cash', gcash: 'GCash', bank: 'Online banking' };
const NO_SHOW_MS = 5 * 60 * 1000; // how long a driver waits at the pickup before they can end the job as a no-show
const QUICK = ['On my way po.', 'Nandito na po ako sa pickup.', 'Saan po kayo banda?', 'Traffic po, konting antay lang.', 'I’m outside, in front of the gate.'];

let me = { lng: CONFIG.startCenter[0], lat: CONFIG.startCenter[1] };
let online = false;
let approved = false;
let jobs = [];        // waiting requests
let picked = null;    // id of the request in the big card (null: the nearest)
let job = null;       // the accepted job
let stopJobs = () => {};
let mapMode = null;   // null (closed) · 'all' · 'preview' · 'nav'
let trip = null;      // the route on the map (with turn-by-turn steps while navigating)
let watchId = null;
let gps = null;       // null: not asked yet · true: we have the phone's location · false: location is off
const messages = new Map(); // job id → messages sent this visit

const bindAll = (name, text) => $$(`[data-bind="${name}"]`).forEach((n) => { n.textContent = text; });
const kmAway = (p) => haversineKm(me, p);
const mins = (km) => Math.max(1, Math.round(km * 3)); // ~20 km/h in Cebu traffic; the live app uses the routing ETA
const mmss = (ms) => { const s = Math.max(0, Math.round(ms / 1000)); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; };
const dirUrl = (p) => `https://www.google.com/maps/dir/?api=1&destination=${p.lat},${p.lng}`;
const metres = (m) => (m >= 950 ? `${(m / 1000).toFixed(1)} km` : `${Math.max(10, Math.round(m / 10) * 10)} m`);
const targetOf = (j) => (j.status === 'started' ? j.dropoff : j.pickup);
const netUp = () => navigator.onLine !== false;

const needNet = () => { if (netUp()) return true; toast('No connection. Try again when you’re back online.'); return false; };

/* ---------- Connection and location: always visible while working ---------- */
function paintLive() {
  const net = netUp();
  const WIFI = '<path d="M2.5 9a14 14 0 0 1 19 0"/><path d="M5.5 12.5a9.5 9.5 0 0 1 13 0"/><path d="M8.7 16a5 5 0 0 1 6.6 0"/><path d="M12 19.5h.01"/>';
  const PIN = '<path d="M12 21s-7-6.2-7-11.5A7 7 0 0 1 19 9.5C19 14.8 12 21 12 21z"/><circle cx="12" cy="9.5" r="2.5"/>';
  $('#liveStatus').innerHTML = `<span class="dlive__item${net ? '' : ' is-bad'}">${svgIcon(WIFI, 'icon')}${net ? 'Connected' : 'No connection'}</span>`
    + `<span class="dlive__item${gps === false ? ' is-bad' : ''}">${svgIcon(PIN, 'icon')}${gps ? 'Location on' : gps === false ? 'Location off' : 'Location not checked'}</span>`;
  const b = $('#banner');
  if (!net) {
    b.className = 'dbanner dbanner--bad';
    b.innerHTML = '<b>No connection.</b><span>You can’t accept or update jobs until you’re back online. Your current job is kept.</span>';
    b.hidden = false;
  } else if (online && gps === false) {
    b.className = 'dbanner';
    b.innerHTML = '<b>Location is off.</b><span>Requests are sorted from Cebu City centre, and riders can’t see where you are.</span><button type="button" class="dbanner__btn" data-gps>Turn on location</button>';
    b.hidden = false;
  } else b.hidden = true;
}
async function checkGps() {
  try {
    me = await askLocation();
    gps = true;
    map.setUser(me);
  } catch (_) { gps = false; }
  paintLive();
  return gps;
}
addEventListener('online', () => { paintLive(); renderJobs(); toast('You’re back online.'); });
addEventListener('offline', () => { paintLive(); renderJobs(); });
$('#banner').addEventListener('click', async (e) => {
  if (!e.target.closest('[data-gps]')) return;
  if (await checkGps()) { toast('Location is on.'); if (online && !job) listen(); renderJobs(); }
  else toast('Location is still off. Allow it for mysabak in your browser’s site settings.');
});

/* ---------- New request alert: a short chime and a buzz (the switch beside Map turns it off) ---------- */
let alerts = (() => { try { return localStorage.getItem('mysabak.driverAlerts') !== 'off'; } catch (_) { return true; } })();
let audio = null;
function paintAlerts() {
  const b = $('#soundBtn');
  b.setAttribute('aria-pressed', String(alerts));
  $('span', b).textContent = alerts ? 'Alerts on' : 'Alerts off';
}
function chime() {
  if (!alerts) return;
  try {
    audio = audio || new (window.AudioContext || window.webkitAudioContext)();
    const t = audio.currentTime;
    [880, 1320].forEach((f, i) => {
      const o = audio.createOscillator();
      const g = audio.createGain();
      o.type = 'sine';
      o.frequency.value = f;
      g.gain.setValueAtTime(0.0001, t + i * 0.16);
      g.gain.exponentialRampToValueAtTime(0.22, t + i * 0.16 + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, t + i * 0.16 + 0.24);
      o.connect(g).connect(audio.destination);
      o.start(t + i * 0.16);
      o.stop(t + i * 0.16 + 0.26);
    });
  } catch (_) { /* no sound on this device */ }
  if (navigator.vibrate) navigator.vibrate([120, 60, 120]);
}
$('#soundBtn').addEventListener('click', () => {
  alerts = !alerts;
  try { localStorage.setItem('mysabak.driverAlerts', alerts ? 'on' : 'off'); } catch (_) { /* this visit only */ }
  paintAlerts();
  if (alerts) chime(); // a sample, and it unlocks sound on phones
});

/* ---------- Map (full screen, drawn only while open) ---------- */
const map = shopMap($('#mapCanvas'), {
  cooperative: true, // on the page: one finger scrolls the page, two move the map
  onPin: (id) => { if (!job) { picked = id; renderJobs(); if (mapMode) openMap('preview'); else $('.rq.is-open')?.scrollIntoView({ block: 'nearest', behavior: 'smooth' }); } },
  padding: () => (mapMode
    ? { top: mapMode === 'nav' ? 170 : 70, bottom: ($('#mapSheet').offsetHeight || 220) + 30, left: 40, right: 40 }
    : $('#mapSlot').offsetHeight < 260 ? { top: 48, bottom: 10, left: 36, right: 36 } : { top: 80, bottom: 36, left: 60, right: 60 }), // room for the pins and their labels (less on the phone's short map)
});
// The map service didn't answer: say so instead of showing an empty map
if (map.map) map.map.on('error', () => { if (!map.map.isStyleLoaded()) $('#mapOff').hidden = false; });
else $('#mapOff').hidden = false;
// The job gets its own pin (labelled with who, not the fare)
const pinOf = (j) => ({ id: job && j.id === job.id ? `${j.id}-job` : j.id, name: job ? (job.status === 'started' ? 'Pickup' : `Pickup · ${contactOf(j).name}`) : peso(j.fare), area: `${KIND[j.kind].name}, ${j.pickup.label}`, color: KIND[j.kind].color, icon: `<svg viewBox="0 0 24 24">${KIND[j.kind].svg}</svg>`, lng: j.pickup.lng, lat: j.pickup.lat });
const fitAll = () => map.fit([[me.lng, me.lat]].concat(visibleJobs().map((j) => [j.pickup.lng, j.pickup.lat])), { animate: true, maxZoom: 15 });

let routeToken = 0;
let routeKey = '';
async function showRoute(from, to, { steps = false } = {}) {
  const key = `${from.lng},${from.lat}>${to.lng},${to.lat}${steps ? '+steps' : ''}`;
  if (key === routeKey) return;
  routeKey = key;
  const token = ++routeToken;
  let t;
  try { t = await routeBetween(from, to, { steps }); } catch (_) { t = { ...straightLine(from, to), approx: true }; }
  if (token !== routeToken) return;
  trip = t;
  map.setRoute(t.coords);
  map.fit(t.coords.concat([[from.lng, from.lat], [to.lng, to.lat]]), { animate: true });
  paintNav();
}
function clearRoute() { routeToken++; routeKey = ''; trip = null; map.setRoute(null); map.setDest(null); }

function paintMap() {
  if (!mapMode) { paintInline(); return; }
  if (job) {
    map.setShops([pinOf(job)]);
    map.setActive(`${job.id}-job`);
    map.setDest(job.status === 'started' ? job.dropoff : null);
    if (mapMode === 'nav') showRoute(me, targetOf(job), { steps: true });
    else showRoute(...(job.status === 'started' ? [job.pickup, job.dropoff] : [me, job.pickup]));
    return;
  }
  const shown = visibleJobs();
  map.setShops(shown.map(pinOf));
  map.setActive(picked);
  const p = mapMode === 'preview' && shown.find((j) => j.id === picked);
  if (p) { map.setDest(p.dropoff, 'Drop-off'); showRoute(p.pickup, p.dropoff); } else { clearRoute(); fitAll(); }
}

// On the page: the requests as pins (the tapped one bigger), or the job's pickup and its route
let inlineKey = '';
function paintInline() {
  if (job) {
    map.setShops([pinOf(job)]);
    map.setActive(`${job.id}-job`);
    map.setDest(job.status === 'started' ? job.dropoff : null);
    showRoute(...(job.status === 'started' ? [job.pickup, job.dropoff] : [me, job.pickup]));
    inlineKey = '';
    return;
  }
  const shown = visibleJobs();
  map.setShops(shown.map(pinOf));
  map.setActive(picked || (shown[0] && shown[0].id));
  map.setDest(null);
  const key = shown.map((j) => j.id).join();
  if (key !== inlineKey) { inlineKey = key; clearRoute(); fitAll(); } // refit only when the set of requests changes
}
function paintCaption() {
  const n = visibleJobs().length;
  const cap = $('#mapCaption');
  cap.textContent = job
    ? (job.status === 'started' ? `Route to ${job.dropoff.label}. Full map for turn-by-turn.` : `Route to the pickup at ${job.pickup.label}. Full map for turn-by-turn.`)
    : !online ? 'Go online to see requests on the map.'
      : n ? '' : 'Waiting for requests nearby.';
  cap.hidden = !cap.textContent;
}

function openMap(mode) {
  if (mode === 'nav' && !job) return;
  mapMode = mode;
  const view = $('#mapView');
  if (!view.classList.contains('is-full')) { document.body.appendChild(view); view.classList.add('is-full'); } // full screen, above everything
  if (map.map && map.map.cooperativeGestures) map.map.cooperativeGestures.disable();
  document.body.classList.add('is-map-open');
  const p = job ? targetOf(job) : (visibleJobs().find((j) => j.id === picked) || {}).pickup;
  if (p) $('#mapOffLink').href = dirUrl(p);
  paintSheet();
  paintNav();
  if (mode === 'nav') watchMe(); else stopWatch();
  requestAnimationFrame(() => {
    $('#mapView').style.setProperty('--sheet-h', `${$('#mapSheet').offsetHeight}px`);
    map.resize();
    routeKey = '';
    paintMap();
  });
}
function closeMap() {
  if (!mapMode) return;
  mapMode = null;
  stopWatch();
  const view = $('#mapView');
  view.classList.remove('is-full');
  $('#mapSlot').appendChild(view); // back on the page
  if (map.map && map.map.cooperativeGestures) map.map.cooperativeGestures.enable();
  document.body.classList.remove('is-map-open');
  $('#turn').hidden = true;
  $('#turnThen').hidden = true;
  requestAnimationFrame(() => { map.resize(); routeKey = ''; inlineKey = ''; paintInline(); });
}

/* What the sheet at the bottom of the map says */
function paintSheet() {
  const sheetEl = $('#mapSheet');
  if (mapMode === 'nav' && job) {
    const to = targetOf(job);
    const w = jobWords(job);
    sheetEl.innerHTML = `<div class="dsheet__big"><b data-left>…</b><span>to ${esc(to.label)}</span></div>
      <span class="dsheet__who">${esc(KIND[job.kind].name)} · ${esc(contactOf(job).name)} · ${peso(job.fare)} ${esc(PAY[job.payment] || job.payment)}</span>
      <div class="dsheet__actions"><button type="button" class="button button--ghost" data-close>Back</button>
        ${job.status === 'to_pickup' ? `<button type="button" class="button" data-next>${esc(w.next)}</button>` : '<button type="button" class="button" data-close>Back to the job</button>'}</div>
      <a class="dsheet__alt" href="${dirUrl(to)}" target="_blank" rel="noopener">Open in Google Maps instead</a>`;
    return;
  }
  const p = mapMode === 'preview' && !job && visibleJobs().find((j) => j.id === picked);
  if (p) {
    sheetEl.innerHTML = `<h2>${esc(KIND[p.kind].name)} · ${peso(p.fare)}</h2>
      <p>${esc(p.pickup.label)} → ${esc(p.dropoff.label)} · ~${mins(p.distanceKm)} min · ${p.distanceKm.toFixed(1)} km trip · ${mins(kmAway(p.pickup))} min from you</p>
      <div class="dsheet__actions"><button type="button" class="button button--ghost" data-close>Close</button>
        <button type="button" class="button" data-accept="${esc(p.id)}"${accepting ? ' disabled aria-busy="true"' : ''}>${accepting === p.id ? 'Accepting…' : `Accept ${peso(p.fare)}`}</button></div>`;
    return;
  }
  const n = visibleJobs().length;
  sheetEl.innerHTML = job
    ? `<h2>${esc(jobWords(job).title)}</h2><p>${esc(jobWords(job).sub)}</p>
      <div class="dsheet__actions"><button type="button" class="button button--ghost" data-close>Close</button><button type="button" class="button" data-nav>Navigate</button></div>`
    : `<h2>${online ? `${n} request${n === 1 ? '' : 's'} near you` : 'You’re offline'}</h2>
      <p>${online ? 'Tap a pin to see its route.' : 'Go online to see requests on the map.'}</p>
      <div class="dsheet__actions"><button type="button" class="button" data-close>Close map</button></div>`;
}

/* Navigation: the next turn (from where the phone is along the route) and what's left */
const TURN = {
  left: '<svg viewBox="0 0 24 24" style="transform:scaleX(-1)"><path d="M6 20V11a3 3 0 0 1 3-3h9"/><path d="M14 4l4 4-4 4"/></svg>',
  right: '<svg viewBox="0 0 24 24"><path d="M6 20V11a3 3 0 0 1 3-3h9"/><path d="M14 4l4 4-4 4"/></svg>',
  ahead: '<svg viewBox="0 0 24 24"><path d="M12 20V5"/><path d="M7 9l5-5 5 5"/></svg>',
  arrive: '<svg viewBox="0 0 24 24"><path d="M6 21V4"/><path d="M6 4h11l-2 4 2 4H6"/></svg>',
};
const turnKind = (m) => (/ARRIVE/.test(m) ? 'arrive' : /LEFT/.test(m) ? 'left' : /RIGHT/.test(m) ? 'right' : 'ahead');

function paintNav() {
  const on = mapMode === 'nav' && job && trip;
  const p = on ? routeProgress(trip.coords, me) : null;
  const next = on && trip.steps.length ? nextStep(trip.steps, p.alongM) : null;
  $('#turn').hidden = !next;
  $('#turnThen').hidden = !(next && next.after);
  if (next) {
    $('#turnIcon').innerHTML = TURN[turnKind(next.step.maneuver)];
    $('#turnIn').textContent = metres(next.inM);
    $('#turnText').textContent = next.step.text;
    if (next.after) $('#turnThen').textContent = `Then ${next.after.text.charAt(0).toLowerCase()}${next.after.text.slice(1)}`;
  }
  const left = $('[data-left]', $('#mapSheet'));
  if (left && on) {
    const leftM = Math.max(0, p.totalM - p.alongM);
    const m = trip.minutes ? Math.max(1, Math.round((trip.minutes * leftM) / Math.max(p.totalM, 1))) : null;
    left.textContent = `${m ? `${m} min · ` : ''}${metres(leftM)}${trip.approx ? ' (straight line)' : ''}`;
  }
}

/* Follow the phone while navigating; off the route by 60 m or more → a new route */
function watchMe() {
  if (watchId !== null || !navigator.geolocation) return;
  watchId = navigator.geolocation.watchPosition((pos) => {
    me = { lng: pos.coords.longitude, lat: pos.coords.latitude };
    if (!gps) { gps = true; paintLive(); }
    map.setUser(me);
    if (trip && !trip.approx && routeProgress(trip.coords, me).offM >= 60) { routeKey = ''; paintMap(); } else paintNav();
  }, () => { if (gps !== false) { gps = false; paintLive(); toast('Lost your location. The route won’t follow you until it’s back.'); } },
  { enableHighAccuracy: true, maximumAge: 5000 });
}
function stopWatch() {
  if (watchId !== null && navigator.geolocation) navigator.geolocation.clearWatch(watchId);
  watchId = null;
}

/* ---------- Online pill ---------- */
function paintOnline() {
  const btn = $('#onlineBtn');
  btn.setAttribute('aria-checked', String(online));
  btn.classList.toggle('is-on', online);
  if (!approved) {
    bindAll('onlineTitle', 'Application under review');
    bindAll('onlineHint', 'You can go online once you’re approved.');
    bindAll('onlineAction', 'Not yet');
    btn.disabled = true;
  } else if (job) {
    bindAll('onlineTitle', 'On a job');
    bindAll('onlineHint', 'New requests pause until you finish.');
    bindAll('onlineAction', 'Online');
    btn.disabled = true;
  } else {
    btn.disabled = false;
    bindAll('onlineTitle', online ? 'You’re online' : 'You’re offline');
    bindAll('onlineHint', online ? 'Requests near you show below.' : 'Go online to get Ride, Parcel and Food requests.');
    bindAll('onlineAction', online ? 'Go offline' : 'Go online');
  }
  document.body.classList.toggle('is-online', online);
  paintLive();
}

/* ---------- Requests: one card each, the picked one open with its actions ---------- */
// A request the server says is gone stays a moment, locked and saying why, so the list never jumps under a finger
const GONE_MS = 1600;
const GONE_WORDS = { taken: 'Another driver accepted it', cancelled: 'The customer cancelled', expired: 'Expired', withdrawn: 'No longer available' };
const gone = new Map(); // id → reason
let accepting = null;   // id of the request being accepted (its buttons locked)
const byNear = (a, b) => kmAway(a.pickup) - kmAway(b.pickup);
const visibleJobs = () => jobs.filter((j) => !gone.has(j.id)).sort(byNear); // still open: the count and the pins
const listedJobs = () => [...jobs].sort(byNear);                            // the cards: gone ones too, for a moment
const stars = (r) => (r ? ` ★ ${Number(r).toFixed(1)}` : '');

function requestCard(j, open) {
  const k = KIND[j.kind];
  const km = kmAway(j.pickup);
  const why = gone.get(j.id);
  const busy = accepting === j.id;
  const who = j.kind === 'ride' ? `${esc(j.rider.name)}${stars(j.rider.rating)}`
    : j.kind === 'express' ? `${esc(j.parcel ? j.parcel.item : 'Parcel')} · from ${esc(j.rider.name)} to ${esc(j.recipient ? j.recipient.name : 'the recipient')}`
      : `Order for ${esc(j.recipient ? j.recipient.name : j.rider.name)}`;
  const lock = busy ? ' disabled' : '';
  return `<article class="rq${open ? ' is-open' : ''}${why ? ' is-gone' : ''}" style="${kindStyle(k)}" data-id="${esc(j.id)}">
      ${open || why ? '' : `<button type="button" class="rq__pick" data-pick aria-label="${esc(`${k.name}, ${peso(j.fare)}, ${j.pickup.label} to ${j.dropoff.label}, ${mins(km)} minutes away. Show details`)}"></button>`}
      <p class="rq__top">${kindLabel(k)}<span>${mins(km)} min away · ${km.toFixed(1)} km</span></p>
      <p class="rq__fare">${peso(j.fare)}</p>
      <ol class="rq__route"><li><span class="sr-only">Pickup: </span>${esc(j.pickup.label)}</li><li><span class="sr-only">Drop-off: </span>${esc(j.dropoff.label)}</li></ol>
      <p class="rq__meta"><span>${j.distanceKm.toFixed(1)} km · ~${mins(j.distanceKm)} min trip</span><span>${esc(PAY[j.payment] || j.payment)}</span>${why
        ? `<b class="rq__why" role="status">${esc(GONE_WORDS[why] || GONE_WORDS.withdrawn)}</b>`
        : `<span class="rq__left"><b data-expires="${j.until}">${mmss(j.until - Date.now())}</b> left</span>`}</p>
      ${open && !why ? `<p class="rq__who">${who}${j.note ? `<span>“${esc(j.note)}”</span>` : ''}</p>
      <div class="rq__actions">
        <button type="button" class="button" data-accept${lock}${busy ? ' aria-busy="true"' : ''}>${busy ? 'Accepting…' : 'Accept'}</button>
        <button type="button" class="button button--ghost" data-skip${lock}>Skip</button>
        <button type="button" class="rq__map" data-route${lock}>${icon('i-pin', 'icon--sm')}Route</button>
      </div>` : ''}
    </article>`;
}

// Keyboard users keep their place when the list is redrawn (a new request every few seconds)
function focusKey() {
  const a = document.activeElement;
  const c = a && a.closest && a.closest('#jobList .rq');
  return c ? [c.dataset.id, ['data-accept', 'data-skip', 'data-route', 'data-pick'].find((k) => a.hasAttribute(k))] : null;
}
function refocus(key) {
  if (!key) return;
  const c = $(`#jobList .rq[data-id="${CSS.escape(key[0])}"]`);
  const el = c && (c.querySelector(`[${key[1]}]:not([disabled])`) || c.querySelector('[data-accept], [data-pick]'));
  if (el) el.focus({ preventScroll: true });
}

function renderJobs() {
  const open = visibleJobs();
  const listed = listedJobs();
  if (!listed.some((j) => j.id === picked)) picked = null;
  if (!picked && open[0]) picked = open[0].id; // the open card stays put while new requests arrive, until it's taken, skipped or gone
  $('#reqCount').textContent = job ? 'Your job' : online && open.length && netUp() ? `${open.length} request${open.length === 1 ? '' : 's'} near you` : 'Requests';
  let html;
  if (job) html = '';
  else if (!approved) html = '<div class="dempty dcard"><h3>Application under review</h3><p>We’ll email you when you’re approved. Then you can go online here.</p></div>';
  else if (!online) html = `<div class="dempty dempty--quiet"><ul class="list">${emptyRows('No requests yet', 'They show up here while you’re online.')}</ul></div>`; // the sky above already says you're offline
  else if (!netUp()) html = '<div class="dempty dcard"><h3>Requests are paused</h3><p>They come back as soon as you’re connected again.</p></div>';
  else if (!listed.length) html = '<div class="dempty dcard"><p class="jobs-wait">Waiting for requests nearby…</p><p>They show here, nearest first, with a chime.</p></div>';
  else html = `<div class="rqs">${[...listed.filter((j) => j.id === picked), ...listed.filter((j) => j.id !== picked)] // the open one first: Accept is always in the same place
    .map((j) => requestCard(j, j.id === picked)).join('')}</div>`;
  const key = focusKey();
  $('#jobList').innerHTML = html;
  refocus(key);
  paintCaption();
  if (!mapMode) paintInline();
  else if (mapMode !== 'nav') { paintSheet(); paintMap(); }
}

const skipped = new Set(); // skipped requests stay gone, even after going offline and back
let lastChime = 0;
function addJob(j) {
  if (skipped.has(j.id) || jobs.some((x) => x.id === j.id)) return;
  jobs.push({ ...j, until: j.expiresAt - ((j.serverTime ?? Date.now()) - Date.now()) }); // the server's time left, on this phone's clock
  if (online && !job && Date.now() - lastChime > 2000) { lastChime = Date.now(); chime(); } // five at once: one chime
  renderJobs();
}
// The server says a request is no longer open (taken, cancelled, expired, withdrawn): say why, then remove it and its pin
function goneJob(id, reason) {
  if ((job && job.id === id) || gone.has(id) || !jobs.some((j) => j.id === id)) return;
  if (reason === 'taken' && !job) { // maybe taken by you, on your other phone or tab: then it's your job here too
    activeJob().then((mine) => {
      if (mine && mine.id === id && !job) { job = mine; jobs = jobs.filter((j) => j.id !== id); picked = null; toast(`You accepted this on another device. Head to ${job.pickup.label}.`); paintAll(); }
      else markGone(id, reason);
    }, () => markGone(id, reason));
    return;
  }
  markGone(id, reason);
}
function markGone(id, reason) {
  if (gone.has(id) || !jobs.some((j) => j.id === id)) return;
  gone.set(id, reason);
  if (mapMode === 'preview' && picked === id) toast(`${GONE_WORDS[reason] || GONE_WORDS.withdrawn}.`);
  renderJobs();
  setTimeout(() => { gone.delete(id); jobs = jobs.filter((j) => j.id !== id); renderJobs(); }, GONE_MS);
}

/* ---------- Accepted job ---------- */
const STEPS = ['to_pickup', 'arrived', 'started', 'completed'];
// Who the driver deals with now: the rider; for Express the sender, then the recipient; for Shop the shop, then the customer
function contactOf(j) {
  if (j.kind === 'ride') return { role: 'Rider', name: j.rider.name };
  if (j.status === 'started') return { role: j.kind === 'express' ? 'Recipient' : 'Customer', name: j.recipient ? j.recipient.name : j.rider.name };
  return j.kind === 'express' ? { role: 'Sender', name: j.rider.name } : { role: 'Shop', name: j.shop ? j.shop.name : 'The shop' };
}
function jobWords(j) {
  const who = contactOf(j).name;
  return {
    to_pickup: { title: `Head to ${j.pickup.label}`, sub: `${who} is waiting · ${mins(kmAway(j.pickup))} min · ${kmAway(j.pickup).toFixed(1)} km away`, next: 'I’ve arrived' },
    arrived: {
      title: j.kind === 'ride' ? `Waiting for ${who}` : j.kind === 'express' ? 'Pick up the parcel' : `Collect the order at ${who}`,
      sub: j.pickup.label,
      next: j.kind === 'ride' ? 'Start trip' : j.kind === 'express' ? 'Parcel picked up' : 'Order picked up',
    },
    started: {
      title: `Drive to ${j.dropoff.label}`, sub: `~${mins(j.distanceKm)} min · ${j.distanceKm.toFixed(1)} km`,
      next: j.kind === 'ride' ? `Complete trip · ${peso(j.fare)}` : j.kind === 'express' ? 'Parcel delivered' : 'Order delivered',
    },
  }[j.status];
}

function renderActive() {
  const box = $('#activeJob');
  document.body.classList.toggle('has-job', Boolean(job));
  if (!job) { box.innerHTML = ''; return; }
  const k = KIND[job.kind];
  const w = jobWords(job);
  const at = STEPS.indexOf(job.status);
  const c = contactOf(job);
  const waiting = job.status === 'arrived';
  const money = job.payment === 'cash' ? `Collect ${peso(job.fare)} in cash` : `Paid by ${esc(PAY[job.payment] || job.payment)} · ${peso(job.fare)}`;
  const sent = (messages.get(job.id) || []).length;
  let main;
  if (job.status === 'to_pickup') {
    main = `<button type="button" class="button activejob__nav" data-nav>${icon('i-arrow', 'icon--sm icon--white')}Navigate to ${esc(job.pickup.label)}</button>
      <button type="button" class="button button--ghost activejob__next" data-next>${esc(w.next)}</button>
      <a class="activejob__gmaps" href="${dirUrl(job.pickup)}" target="_blank" rel="noopener">Google Maps</a>`;
  } else if (waiting) {
    main = `<button type="button" class="button activejob__next activejob__next--wide" data-next>${esc(w.next)}</button>
      <button type="button" class="button button--ghost activejob__noshow" data-noshow disabled>${esc(c.name)} didn’t show up<span data-noshow-left></span></button>`;
  } else {
    main = `<button type="button" class="button activejob__nav" data-nav>${icon('i-arrow', 'icon--sm icon--white')}Navigate to ${esc(job.dropoff.label)}</button>
      <button type="button" class="button button--ghost activejob__next activejob__hold" data-next><span class="activejob__fill" aria-hidden="true"></span><span class="activejob__label">${esc(w.next)}</span></button>
      <a class="activejob__gmaps" href="${dirUrl(job.dropoff)}" target="_blank" rel="noopener">Google Maps</a>
      ${job.kind !== 'ride' ? '<button type="button" class="trip__cancel" data-fail>Can’t deliver</button>' : ''}`;
  }
  box.innerHTML = `<article class="activejob dcard" style="${kindStyle(k)}">
      <div class="activejob__top">${kindLabel(k)}<b>${peso(job.fare)}</b>
        <button type="button" class="dsos" data-sos>${icon('i-shield', 'icon--sm')}Safety</button></div>
      <h2 class="activejob__title">${esc(w.title)}${waiting ? ` <span class="activejob__wait">· <b data-wait="${job.arrivedAt || Date.now()}">0:00</b></span>` : ''}</h2>
      <p class="activejob__sub">${esc(w.sub)}${job.note && job.status !== 'started' ? ` · “${esc(job.note)}”` : ''}</p>
      <ol class="trip__steps" aria-label="Job progress">
        ${['To pickup', 'At pickup', 'On the way', 'Done'].map((t, i) => `<li class="${i < at ? 'is-done' : i === at ? 'is-current' : ''}"><span>${t}</span></li>`).join('')}
      </ol>
      ${waiting && job.kind === 'ride' ? `<p class="dcheck">${icon('i-user', 'icon--sm')}<span>Check it’s <b>${esc(c.name)}</b> before you start: ask for the name on the booking.</span></p>` : ''}
      ${waiting && job.kind === 'express' && job.parcel ? `<p class="dcheck">${icon('i-box', 'icon--sm')}<span>Check the parcel: <b>${esc(job.parcel.item)}</b>, ${esc(job.parcel.size)}. Take a photo when you pick it up.</span></p>` : ''}
      <div class="driver">
        ${ava(c.name, 'driver__ava')}
        <div class="driver__main"><span class="driver__name">${esc(c.name)}${job.kind === 'ride' ? stars(job.rider.rating) : ''}</span>
          <span class="driver__meta">${c.role} · ${money}</span></div>
        <button type="button" class="dlink" data-msg>${icon('i-chat', 'icon--sm')}${sent ? `Chat (${sent})` : 'Message'}</button>
        <button type="button" class="dlink" data-call aria-label="Call ${esc(c.name)}">${icon('i-phone', 'icon--sm')}<span class="dlink__word">Call</span></button>
      </div>
      <div class="activejob__actions">${main}</div>
      ${job.status === 'to_pickup' ? '<button type="button" class="trip__cancel" data-cancel-job>Cancel job</button>' : ''}
    </article>`;
  tick();
}

function paintAll() {
  paintOnline();
  renderActive();
  renderJobs();
  if (mapMode) { paintSheet(); paintMap(); }
}

async function accept(id) {
  if (accepting || gone.has(id) || !needNet()) return;
  accepting = id;
  renderJobs();
  try {
    ({ job } = await acceptJob(id));
    accepting = null;
    jobs = jobs.filter((j) => j.id !== id);
    picked = null;
    toast(`Accepted. Head to ${job.pickup.label}.`);
    paintAll();
    edgeGlow('reward', $('#activeJob .activejob') || $('#activeJob'));
    if (mapMode) openMap('nav');
  } catch (err) {
    accepting = null;
    if (['taken', 'expired', 'cancelled'].includes(err.code)) { goneJob(id, err.code); if (mapMode) toast(err.message); }
    else { toast(err.status === 409 ? err.message : errorMessage(err)); renderJobs(); }
  }
}

/* A photo at pickup and delivery (Express and Shop): proof for both sides. Optional in the demo, nothing is uploaded. */
function proofSheet(step) {
  const delivering = step === 'completed';
  const what = job.kind === 'express' ? 'parcel' : 'order';
  const to = job.recipient ? job.recipient.name : 'the recipient';
  return sheet(delivering ? `Deliver the ${what}` : `Pick up the ${what}`,
    `<p class="sheet__sub">${delivering ? `Hand it to <b>${esc(to)}</b>, then take a photo of the ${what} at the door.` : job.kind === 'express' && job.parcel ? `Check it’s the right parcel: <b>${esc(job.parcel.item)}</b>, ${esc(job.parcel.size)}.` : 'Check the order with the shop.'}</p>
     <label class="dphoto"><input type="file" accept="image/*" capture="environment" data-photo>${icon('i-upload')}<span data-photo-label>Take a photo (recommended)</span></label>
     <div class="sheet__actions"><button type="button" class="button button--ghost" data-done="">Back</button><button type="button" class="button" data-go>${delivering ? `${what === 'parcel' ? 'Parcel' : 'Order'} delivered` : `${what === 'parcel' ? 'Parcel' : 'Order'} picked up`}</button></div>`,
    (dlg, done) => {
      let file = null;
      $('[data-photo]', dlg).addEventListener('change', (e) => { file = e.target.files[0] || null; $('[data-photo-label]', dlg).textContent = file ? 'Photo added · tap to retake' : 'Take a photo (recommended)'; });
      $('[data-go]', dlg).addEventListener('click', () => done({ photo: file }));
    });
}

async function advance(btn) {
  if (!job || !needNet()) return;
  const to = STEPS[STEPS.indexOf(job.status) + 1];
  let opts = {};
  if (to === 'started' && job.kind === 'ride') {
    const ok = await sheet(`Is this ${esc(job.rider.name)}?`,
      `<p class="sheet__sub">Ask for the name on the booking before anyone gets in. Never start a trip for someone else.</p>
       <div class="sheet__actions"><button type="button" class="button button--ghost" data-done="no">Not my rider</button><button type="button" class="button" data-done="yes">Yes, start trip</button></div>`);
    if (ok === 'no') toast(`Don’t start the trip. Message ${job.rider.name}, or wait for them.`);
    if (ok !== 'yes') return;
  } else if (job.kind !== 'ride' && (to === 'started' || to === 'completed')) {
    const r = await proofSheet(to);
    if (!r) return;
    opts = r;
  }
  btn.disabled = true;
  try {
    const done = { ...job };
    await updateJob(job.id, to, opts);
    if (to === 'completed') {
      job = null;
      closeMap();
      loadEarnings();
      if (online) listen(); // free again: new requests come in
      paintAll();
      summary(done);
    } else {
      job = (await activeJob()) || { ...job, status: to };
      if (to === 'arrived') closeMap(); // waiting at the pickup: back to the job card
      paintAll();
    }
  } catch (err) { toast(err.message || errorMessage(err)); btn.disabled = false; }
}

/* After the job: a small celebration, the money, then two quick answers. For cash, "Done" waits for the cash answer
   (it's the one thing that matters); the rating is optional. */
const STAR = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3.2l2.6 5.5 6 .8-4.4 4.2 1.1 6-5.3-2.9-5.3 2.9 1.1-6L3.4 9.5l6-.8z"/></svg>';
const CASH_ISSUES = [['short', 'Paid less than the fare'], ['unpaid', 'Didn’t pay at all'], ['other_way', 'Says they paid another way'], ['other', 'Something else']];
const STAR_WORD = ['', 'Poor', 'Okay', 'Good', 'Great', 'Excellent'];
async function summary(j) {
  const cash = j.payment === 'cash';
  const who = j.kind === 'ride' ? j.rider.name : contactOf({ ...j, status: 'started' }).name;
  let stars = 0;
  let cashOk = null;
  let issue = null;
  const result = await sheet(`${j.kind === 'ride' ? 'Trip' : 'Delivery'} complete`,
    `<img class="dsum__mascot" src="/assets/images/mascot/14-thumbs-up.svg" alt="" width="932" height="1024">
     <p class="dsum__fare"><b>${peso(j.fare)}</b><span>Added to today. You keep all of it.</span></p>
     <ol class="dsum__route" aria-label="Route">
       <li><span>From</span>${esc(j.pickup.label)}</li>
       <li><span>To</span>${esc(j.dropoff.label)}</li>
     </ol>
     <dl class="dsum__rows"><div><dt>Distance</dt><dd>${j.distanceKm.toFixed(1)} km</dd></div>
       <div><dt>Payment</dt><dd>${cash ? 'Cash' : `${esc(PAY[j.payment] || j.payment)} · paid`}</dd></div></dl>
     ${cash ? `<fieldset class="dsum__q"><legend>Did you collect ${peso(j.fare)} in cash?</legend>
        <div class="dchoice" role="radiogroup" aria-label="Cash collected">
          <button type="button" class="dchoice__opt" role="radio" aria-checked="false" data-cash="yes">${icon('i-check', 'icon--sm')}Yes, collected</button>
          <button type="button" class="dchoice__opt dchoice__opt--warn" role="radio" aria-checked="false" data-cash="no">${icon('i-st-alert', 'icon--sm')}There was a problem</button>
        </div>
        <div class="dwhy" data-why hidden><p class="dwhy__q" id="whyQ">What happened?</p>
          <div class="dwhy__opts" role="radiogroup" aria-labelledby="whyQ">${CASH_ISSUES.map(([v, t]) => `<button type="button" class="dchoice__opt" role="radio" aria-checked="false" data-issue="${v}">${esc(t)}</button>`).join('')}</div>
        </div></fieldset>` : ''}
     <fieldset class="dsum__q"><legend>How was ${esc(who)}? <span class="dsum__opt">Optional</span></legend>
       <div class="dstars2" role="radiogroup" aria-label="Rate ${esc(who)}">${[1, 2, 3, 4, 5].map((n) => `<button type="button" role="radio" aria-checked="false" aria-label="${n} star${n > 1 ? 's' : ''}, ${STAR_WORD[n]}" data-star="${n}">${STAR}</button>`).join('')}
         <span class="dstars2__word" data-star-word aria-hidden="true"></span></div></fieldset>
     <div class="dsum__done"><button type="button" class="button" data-finish${cash ? ' disabled' : ''}>Done · back to requests</button>
       ${cash ? '<p class="dsum__hint" data-hint>Answer the cash question to finish.</p>' : ''}</div>`,
    (dlg, done) => {
      dlg.classList.add('dsum');
      dlg.addEventListener('click', (e) => {
        const s1 = e.target.closest('[data-star]');
        if (s1) {
          stars = Number(s1.dataset.star);
          $$('[data-star]', dlg).forEach((b) => { const n = Number(b.dataset.star); b.classList.toggle('is-on', n <= stars); b.setAttribute('aria-checked', String(n === stars)); });
          $('[data-star-word]', dlg).textContent = STAR_WORD[stars];
        }
        const c = e.target.closest('[data-cash]');
        if (c) {
          cashOk = c.dataset.cash === 'yes';
          if (cashOk) issue = null;
          $$('[data-cash]', dlg).forEach((b) => b.setAttribute('aria-checked', String(b === c)));
          $('[data-why]', dlg).hidden = cashOk;
        }
        const w = e.target.closest('[data-issue]');
        if (w) {
          issue = w.dataset.issue;
          $$('[data-issue]', dlg).forEach((b) => b.setAttribute('aria-checked', String(b === w)));
        }
        if (c || w) {
          // a problem needs its reason before "Done"
          const ready = cashOk === true || (cashOk === false && !!issue);
          $('[data-finish]', dlg).disabled = !ready;
          $('[data-hint]', dlg).textContent = cashOk ? '' : issue ? 'Noted. The mysabak team will contact you.' : 'Pick what happened to finish.';
        }
        if (e.target.closest('[data-finish]')) done('done');
      });
    });
  try { await closeJob(j.id, { stars: stars || null, cashCollected: cash ? cashOk : null, cashIssue: issue }); } catch (_) { /* the rating is optional */ }
  if (cash && cashOk === false) toast('Noted. The mysabak team will contact you about the payment.');
  else if (result) toast(`${peso(j.fare)} added. Nice work!`);
}

/* Ending a job early: why, in a sheet (not a browser pop-up) */
async function endEarly(kind) {
  if (!job || !needNet()) return;
  const reasons = kind === 'fail' ? FAIL_REASONS : CANCEL_REASONS;
  const reason = await sheet(kind === 'fail' ? 'Can’t deliver?' : 'Cancel this job?',
    `<p class="sheet__sub">${kind === 'fail' ? 'Tell us why. Keep the item safe: the mysabak team will arrange the return.' : 'It goes back to the next driver. Cancelling often lowers the requests you get.'}</p>
     <div class="dreasons">${reasons.map(([v, t]) => `<button type="button" class="dreasons__row" data-done="${v}">${esc(t)}${icon('i-chevron', 'icon--sm')}</button>`).join('')}</div>
     <div class="sheet__actions"><button type="button" class="button button--ghost" data-done="">Keep the job</button></div>`);
  if (!reason) return;
  try {
    await cancelJob(job.id, { reason });
    toast(kind === 'fail' ? 'Delivery marked as failed. We’ll arrange the return.' : 'Job cancelled.');
    job = null; closeMap(); if (online) listen(); paintAll();
  } catch (err) { toast(err.message || errorMessage(err)); }
}
async function noShow() {
  if (!job || !needNet()) return;
  const name = contactOf(job).name;
  const ok = await sheet(`${esc(name)} didn’t show up?`,
    `<p class="sheet__sub">You waited ${mmss(Date.now() - (job.arrivedAt || Date.now()))} at the pickup. The job ends and ${esc(name)} is told.</p>
     <div class="sheet__actions"><button type="button" class="button button--ghost" data-done="">Keep waiting</button><button type="button" class="button" data-done="yes">End the job</button></div>`);
  if (ok !== 'yes') return;
  try { await cancelJob(job.id, { reason: 'no_show' }); toast('Job ended as a no-show.'); job = null; if (online) listen(); paintAll(); } catch (err) { toast(err.message || errorMessage(err)); }
}

/* Safety: one tap from every step of a job. Calling for help is the one big red button; the rest say what happens. */
function safety() {
  if (!job) return;
  const c = contactOf(job);
  const text = `I’m on a mysabak ${KIND[job.kind].name.toLowerCase()}: ${job.pickup.label} → ${job.dropoff.label}, with ${c.name}.`;
  sheet('Safety',
    `<p class="sheet__sub">${esc(KIND[job.kind].name)} with ${esc(c.name)} · ${esc(job.pickup.label)} → ${esc(job.dropoff.label)}</p>
     <a class="dsos911" href="tel:911">${icon('i-phone')}<span><b>Call 911</b><small>Police, fire and ambulance. If you’re in danger, call first.</small></span></a>
     <div class="dsafe">
       <button type="button" class="dsafe__row" data-share>${icon('i-share')}<span><b>Share this trip</b><small>Send where you are and who you’re with</small></span>${icon('i-chevron', 'icon--sm dsafe__chev')}</button>
       <button type="button" class="dsafe__row" data-report>${icon('i-st-alert')}<span><b>Report a problem</b><small>The mysabak safety team calls you back</small></span>${icon('i-chevron', 'icon--sm dsafe__chev')}</button>
     </div>
     <button type="button" class="dsheet__close" data-done="">Close</button>`,
    (dlg) => {
      $('[data-share]', dlg).addEventListener('click', async () => {
        try {
          if (navigator.share) await navigator.share({ title: 'My mysabak trip', text });
          else { await navigator.clipboard.writeText(text); toast('Trip details copied. Paste them in a message.'); }
        } catch (_) { /* closed the share menu */ }
      });
      $('[data-report]', dlg).addEventListener('click', () => toast('In the live app this connects you to the mysabak safety team.'));
    });
}

/* Messages: quick replies in English and Tagalog, or your own words */
function messageSheet() {
  if (!job) return;
  const c = contactOf(job);
  const list = () => (messages.get(job.id) || []).map((m) => `<li><span>${esc(m.text)}</span><small>Sent ${new Date(m.at).toLocaleTimeString('en-PH', { hour: 'numeric', minute: '2-digit' })}</small></li>`).join('');
  sheet(`Message ${esc(c.name)}`,
    `<ul class="dchat" data-list>${list()}</ul>
     <div class="dquick">${QUICK.map((q) => `<button type="button" class="dquick__chip" data-q>${esc(q)}</button>`).join('')}</div>
     <form class="dsay" data-say><input class="input" name="say" maxlength="160" autocomplete="off" placeholder="Write a message" aria-label="Your message"><button type="submit" class="button">Send</button></form>
     <p class="demo-note">Demo: messages stay on this device. In the live app ${esc(c.name)} gets them right away.</p>
     <div class="sheet__actions"><button type="button" class="button button--ghost" data-done="">Close</button></div>`,
    (dlg) => {
      const send = (text) => {
        if (!text.trim() || !needNet()) return;
        messages.set(job.id, [...(messages.get(job.id) || []), { text: text.trim(), at: Date.now() }]);
        $('[data-list]', dlg).innerHTML = list();
        renderActive();
      };
      dlg.addEventListener('click', (e) => { const q = e.target.closest('[data-q]'); if (q) send(q.textContent); });
      $('[data-say]', dlg).addEventListener('submit', (e) => { e.preventDefault(); const i = e.target.say; send(i.value); i.value = ''; });
    });
}

/* "Complete" is held for a moment (no accidental taps on a bumpy road); with a keyboard it asks instead */
const HOLD_MS = 900;
let holdTimer = 0;
function holdStart(btn) {
  btn.classList.add('is-holding');
  holdTimer = setTimeout(() => { btn.classList.remove('is-holding'); advance(btn); }, HOLD_MS);
}
function holdStop(btn) { clearTimeout(holdTimer); btn.classList.remove('is-holding'); }

/* ---------- Events ---------- */
$('#jobList').addEventListener('click', (e) => {
  const card = e.target.closest('.rq');
  if (!card || gone.has(card.dataset.id)) return;
  const id = card.dataset.id;
  if (e.target.closest('[data-pick]')) {
    picked = id;
    renderJobs();
    $('.rq.is-open')?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    $('.rq.is-open [data-accept]')?.focus({ preventScroll: true });
    return;
  }
  if (accepting) return;
  if (e.target.closest('[data-skip]')) {
    skipped.add(id);
    jobs = jobs.filter((j) => j.id !== id);
    picked = null;
    renderJobs();
  } else if (e.target.closest('[data-accept]')) accept(id);
  else if (e.target.closest('[data-route]')) { picked = id; openMap('preview'); }
});

const box = $('#activeJob');
box.addEventListener('click', (e) => {
  if (!job) return;
  if (e.target.closest('[data-nav]')) { openMap('nav'); return; }
  if (e.target.closest('[data-sos]')) { safety(); return; }
  if (e.target.closest('[data-msg]')) { messageSheet(); return; }
  if (e.target.closest('[data-call]')) { toast('Calling works in the live app (your number stays private). For now, send a message.'); return; }
  if (e.target.closest('[data-cancel-job]')) { endEarly('cancel'); return; }
  if (e.target.closest('[data-fail]')) { endEarly('fail'); return; }
  if (e.target.closest('[data-noshow]')) { noShow(); return; }
  const next = e.target.closest('[data-next]');
  if (!next) return;
  if (next.classList.contains('activejob__hold')) {
    if (e.detail === 0) { // keyboard: confirm in words instead of holding
      sheet('Finish this job?', `<p class="sheet__sub">${esc(jobWords(job).next)}.</p><div class="sheet__actions"><button type="button" class="button button--ghost" data-done="">Not yet</button><button type="button" class="button" data-done="yes">Yes, finish</button></div>`)
        .then((ok) => { if (ok === 'yes') advance(next); });
    } else if (job.kind !== 'ride') advance(next); // Express and Shop confirm in the photo sheet
    return;
  }
  advance(next);
});
box.addEventListener('pointerdown', (e) => {
  const b = e.target.closest('.activejob__hold');
  if (b && job && job.kind === 'ride') holdStart(b);
});
['pointerup', 'pointerleave', 'pointercancel'].forEach((t) => box.addEventListener(t, (e) => {
  const b = e.target.closest('.activejob__hold');
  if (b && b.classList.contains('is-holding')) { holdStop(b); toast('Keep holding to complete.'); }
}));

$('#mapSheet').addEventListener('click', (e) => {
  if (e.target.closest('[data-close]')) closeMap();
  else if (e.target.closest('[data-nav]')) openMap('nav');
  else if (e.target.closest('[data-next]')) advance(e.target.closest('[data-next]'));
  else if (e.target.closest('[data-accept]')) accept(e.target.closest('[data-accept]').dataset.accept);
});
document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && mapMode && !document.querySelector('dialog[open]')) closeMap(); });
$('#mapBtn').addEventListener('click', () => openMap(job ? 'nav' : 'all'));

$('#locateBtn').addEventListener('click', async () => {
  if (await checkGps()) { if (mapMode === 'nav') { routeKey = ''; paintMap(); } else fitAll(); }
  else toast('Couldn’t get your location. Requests are sorted from Cebu City centre.');
});

async function toggleOnline() {
  if (!online && !needNet()) return;
  try {
    const res = await setOnline(!online);
    online = res.online;
    trackOnline(online);
    if (online) await checkGps(); // requests are sorted from where you are, so ask for location first
    listen();
    paintAll();
    const today = new Date().toDateString();
    try { if (online && localStorage.getItem('mysabak.onlineDay') !== today) { localStorage.setItem('mysabak.onlineDay', today); edgeGlow('reward', $('#onlineBtn')); } } catch (_) { /* storage off */ }
  } catch (err) {
    if (err.status === 401) { location.replace('/pages/drive.html'); return; }
    toast(err.status === 403 ? 'You can go online once your application is approved.' : errorMessage(err));
  }
}
function listen() {
  stopJobs();
  stopJobs = online ? onJobRequest(addJob, { near: me, onGone: goneJob }) : () => {};
  if (!online) { jobs = []; picked = null; gone.clear(); }
}

// Every second: request countdowns, the pickup wait timer, and when a no-show is allowed
function tick() {
  $$('[data-expires]').forEach((n) => {
    const left = Number(n.dataset.expires) - Date.now();
    n.textContent = mmss(left);
    n.closest('.rq__left')?.classList.toggle('is-low', left < 15000);
  });
  $$('[data-wait]').forEach((n) => { n.textContent = mmss(Date.now() - Number(n.dataset.wait)); });
  const ns = $('[data-noshow]');
  if (ns && job) {
    const left = NO_SHOW_MS - (Date.now() - (job.arrivedAt || Date.now()));
    ns.disabled = left > 0;
    $('[data-noshow-left]', ns).textContent = left > 0 ? ` · in ${mmss(left)}` : '';
  }
}
setInterval(() => { tick(); jobs.filter((j) => j.until <= Date.now() - 1000).forEach((j) => goneJob(j.id, 'expired')); }, 1000);

// Today in one line (the rest is on Earnings); the amount rolls like the analytics numbers
async function loadEarnings() {
  const e = await driverEarnings();
  const was = $('[data-bind="today"]').dataset.value ?? null;
  bindAll('today', peso(e.today));
  rollNumber($('[data-bind="today"]'), was);
  const midnight = new Date().setHours(0, 0, 0, 0);
  const n = e.trips.filter((t) => t.at >= midnight).length;
  bindAll('todayTrips', String(n));
}

/* Time online today: counted on this device while the switch is on (the live app counts it on the server) */
const ONLINE_KEY = 'mysabak.driverOnlineTime';
const today = () => new Date().toDateString();
function onlineLog() {
  let o = null;
  try { o = JSON.parse(localStorage.getItem(ONLINE_KEY)); } catch (_) { /* none yet */ }
  if (!o || o.day !== today()) o = { day: today(), ms: 0, since: o && o.since && online ? Date.now() : null };
  return o;
}
function saveOnline(o) { try { localStorage.setItem(ONLINE_KEY, JSON.stringify(o)); } catch (_) { /* this visit only */ } }
function trackOnline(on) {
  const o = onlineLog();
  if (on && !o.since) o.since = Date.now();
  if (!on && o.since) { o.ms += Date.now() - o.since; o.since = null; }
  saveOnline(o);
  paintOnlineTime();
}
function paintOnlineTime() {
  const o = onlineLog();
  const m = Math.floor((o.ms + (o.since ? Date.now() - o.since : 0)) / 60000);
  bindAll('onlineTime', m >= 60 ? `${Math.floor(m / 60)}h ${m % 60}m` : `${m}m`);
}
setInterval(paintOnlineTime, 30000);

/* ---------- Start ---------- */
async function start() {
  const d = await driverStatus();
  if (!d.signedIn) { location.replace('/pages/drive.html'); return; } // sign in first
  $('#driverHome').hidden = false;
  // The map was made while the page was hidden: size it to its box now, and whenever the box changes
  if ('ResizeObserver' in window) new ResizeObserver(() => { map.resize(); if (!mapMode) { routeKey = ''; inlineKey = ''; paintInline(); } }).observe($('#mapSlot'));
  approved = d.status === 'approved';
  online = approved && d.online;
  trackOnline(online);
  bindAll('rating', d.rating ? `★ ${Number(d.rating).toFixed(1)}` : 'New');
  // Desktop: a greeting beside the logo, like a dashboard
  const brand = $('.topbar .brand');
  if (brand && !$('.dhello')) brand.insertAdjacentHTML('afterend', `<span class="dhello"><b>Kumusta, ${esc((d.name || 'driver').split(' ')[0])}</b><small>Your driver dashboard</small></span>`);
  job = approved ? await activeJob() : null;
  const here = await knownLocation();
  if (here) { me = here; gps = true; }
  map.setUser(me);
  if (online && !job) listen();
  paintAlerts();
  paintAll();
  loadEarnings();
  $('#onlineBtn').addEventListener('click', toggleOnline);
}

start();
