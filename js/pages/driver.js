/* Driver home (pages/driver.html), draft Q: Home's night sky with today's earnings and the online pill, the
   nearest request as the big lilac card (the others below; tap one to swap it in), then shortcuts and the week.
   The map opens full screen: every request as a pin, a route preview before accepting, or in-app navigation
   to the next stop (turn by turn from TomTom, following the phone's location). Google Maps stays as a backup.
   Accept one and follow it: to pickup → arrived → on the trip → completed.
   Job requests come from onJobRequest(); the demo sends SAMPLE ones (tagged "Demo"). */
import { CONFIG } from '../config.js';
import {
  driverStatus, setOnline, onJobRequest, acceptJob, activeJob, updateJob, cancelJob, driverEarnings,
  routeBetween, straightLine, errorMessage,
} from '../api.js';
import { haversineKm } from '../money.js';
import { routeProgress, nextStep } from '../nav.js';
import { shopMap, knownLocation, askLocation } from '../shop-map.js';
import { $, $$, mountChrome, toast, peso, esc, icon, edgeGlow, ava } from '../ui.js';
import { tripsByDay } from '../trip-list.js';

mountChrome({ roles: ['driver'] });

const KIND = {
  ride: { name: 'Ride', icon: 'i-car', color: '#5630d8', ink: '#5b2596', tone: 'lilac', art: '/assets/images/3d/car.svg' },
  express: { name: 'Express', icon: 'i-box', color: '#E0782F', ink: '#8a4b0f', tone: 'peach', art: '/assets/images/3d/parcel.svg' },
  shop: { name: 'Shop delivery', icon: 'i-bag', color: '#1E7A44', ink: '#1f6b3a', tone: 'lilac', art: '/assets/images/3d/food.svg' },
};
const PAY = { cash: 'Cash', gcash: 'GCash', bank: 'Online banking' };

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

const bindAll = (name, text) => $$(`[data-bind="${name}"]`).forEach((n) => { n.textContent = text; });
const kmAway = (p) => haversineKm(me, p);
const mmss = (ms) => { const s = Math.max(0, Math.round(ms / 1000)); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; };
const dirUrl = (p) => `https://www.google.com/maps/dir/?api=1&destination=${p.lat},${p.lng}`;
const metres = (m) => (m >= 950 ? `${(m / 1000).toFixed(1)} km` : `${Math.max(10, Math.round(m / 10) * 10)} m`);
const targetOf = (j) => (j.status === 'started' ? j.dropoff : j.pickup);

/* ---------- Map (full screen, drawn only while open) ---------- */
const map = shopMap($('#mapCanvas'), {
  onPin: (id) => { if (!job) { picked = id; renderJobs(); openMap('preview'); } },
  padding: () => ({ top: mapMode === 'nav' ? 170 : 70, bottom: ($('#mapSheet').offsetHeight || 220) + 30, left: 40, right: 40 }),
});
const pinOf = (j) => ({ id: j.id, name: `${peso(j.fare)} · ${KIND[j.kind].name}`, area: j.pickup.label, color: KIND[j.kind].color, lng: j.pickup.lng, lat: j.pickup.lat });
const fitAll = () => map.fit([[me.lng, me.lat]].concat(visibleJobs().map((j) => [j.pickup.lng, j.pickup.lat])), { animate: true, maxZoom: 15 });

let routeToken = 0;
let routeKey = '';
async function showRoute(from, to, { steps = false } = {}) {
  const key = `${from.lng},${from.lat}>${to.lng},${to.lat}${steps ? '+steps' : ''}`;
  if (key === routeKey) return;
  routeKey = key;
  const token = ++routeToken;
  let t;
  try { t = await routeBetween(from, to, { steps }); } catch (_) { t = straightLine(from, to); }
  if (token !== routeToken) return;
  trip = t;
  map.setRoute(t.coords);
  map.fit(t.coords.concat([[from.lng, from.lat], [to.lng, to.lat]]), { animate: true });
  paintNav();
}
function clearRoute() { routeToken++; routeKey = ''; trip = null; map.setRoute(null); map.setDest(null); }

function paintMap() {
  if (!mapMode) return;
  if (job) {
    map.setShops([pinOf(job)]);
    map.setActive(job.id);
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

function openMap(mode) {
  if (mode === 'nav' && !job) return;
  mapMode = mode;
  $('#mapView').hidden = false;
  document.body.classList.add('is-map-open');
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
  mapMode = null;
  stopWatch();
  $('#mapView').hidden = true;
  document.body.classList.remove('is-map-open');
}

/* What the sheet at the bottom of the map says */
function paintSheet() {
  const sheet = $('#mapSheet');
  if (mapMode === 'nav' && job) {
    const to = targetOf(job);
    const w = jobWords(job);
    sheet.innerHTML = `<div class="dsheet__big"><b data-left>…</b><span>to ${esc(to.label)}</span></div>
      <span class="dsheet__who">${esc(KIND[job.kind].name)} · ${esc(job.rider.name)} · ${peso(job.fare)} ${esc(PAY[job.payment] || job.payment)}</span>
      <div class="dsheet__actions"><button type="button" class="button button--ghost" data-close>Back</button>
        <button type="button" class="button" data-next>${esc(w.next)}</button></div>
      <a class="dsheet__alt" href="${dirUrl(to)}" target="_blank" rel="noopener">Open in Google Maps instead</a>`;
    return;
  }
  const p = mapMode === 'preview' && !job && visibleJobs().find((j) => j.id === picked);
  if (p) {
    sheet.innerHTML = `<h2>${esc(KIND[p.kind].name)} · ${peso(p.fare)}</h2>
      <p>${esc(p.pickup.label)} → ${esc(p.dropoff.label)} · ${p.distanceKm.toFixed(1)} km trip · ${kmAway(p.pickup).toFixed(1)} km from you</p>
      <div class="dsheet__actions"><button type="button" class="button button--ghost" data-close>Close</button>
        <button type="button" class="button" data-accept="${esc(p.id)}">Accept ${peso(p.fare)}</button></div>`;
    return;
  }
  const n = visibleJobs().length;
  sheet.innerHTML = job
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
    const mins = trip.minutes ? Math.max(1, Math.round((trip.minutes * leftM) / Math.max(p.totalM, 1))) : null;
    left.textContent = mins ? `${mins} min · ${metres(leftM)}` : metres(leftM);
  }
}

/* Follow the phone while navigating; off the route by 60 m or more → a new route */
function watchMe() {
  if (watchId !== null || !navigator.geolocation) return;
  watchId = navigator.geolocation.watchPosition((pos) => {
    me = { lng: pos.coords.longitude, lat: pos.coords.latitude };
    map.setUser(me);
    if (trip && !trip.approx && routeProgress(trip.coords, me).offM >= 60) { routeKey = ''; paintMap(); } else paintNav();
  }, () => {}, { enableHighAccuracy: true, maximumAge: 5000 });
}
function stopWatch() {
  if (watchId !== null && navigator.geolocation) navigator.geolocation.clearWatch(watchId);
  watchId = null;
}

/* ---------- Online pill ---------- */
function paintOnline() {
  const btn = $('#onlineBtn');
  btn.setAttribute('aria-pressed', String(online));
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
    bindAll('onlineHint', online ? 'Requests near you show below.' : 'Go online to get Ride, Express and Shop requests.');
    bindAll('onlineAction', online ? 'Go offline' : 'Go online');
  }
  document.body.classList.toggle('is-online', online);
}

/* ---------- Requests: the big card and the rest ---------- */
const visibleJobs = () => jobs
  .filter((j) => j.expiresAt > Date.now())
  .sort((a, b) => kmAway(a.pickup) - kmAway(b.pickup));
const payLine = (j) => `${esc(PAY[j.payment] || j.payment)}${j.rider ? ` · ${esc(j.rider.name)}` : ''}${j.parcel ? ` · ${esc(j.parcel.item)}` : ''}`;

function heroCard(j) {
  const k = KIND[j.kind];
  return `<article class="dhero dtone--${k.tone}" style="--kind:${k.ink}" data-id="${esc(j.id)}">
      <span class="dhero__kind">${esc(k.name)} · ${kmAway(j.pickup).toFixed(1)} km away · <span data-expires="${j.expiresAt}">${mmss(j.expiresAt - Date.now())}</span> left${j.demo ? ' · Demo' : ''}</span>
      <h3 class="dhero__from">${esc(j.pickup.label)}</h3>
      <p class="dhero__to">to ${esc(j.dropoff.label)} · ${j.distanceKm.toFixed(1)} km trip · ${payLine(j)}</p>
      <p class="dhero__fare">${peso(j.fare)}</p>
      <img class="dhero__art" src="${k.art}" alt="">
      <div class="dhero__actions">
        <button type="button" class="button" data-accept>Accept ${peso(j.fare)}</button>
        <button type="button" class="button button--ghost" data-skip>Skip</button>
        <button type="button" class="button button--ghost dhero__route" data-route>${icon('i-pin')}See route</button>
      </div>
    </article>`;
}
function miniCard(j) {
  const k = KIND[j.kind];
  return `<button type="button" class="dmini dtone--${k.tone}" style="--kind:${k.ink}" data-pick="${esc(j.id)}" aria-label="${esc(`${k.name}, ${peso(j.fare)}, from ${j.pickup.label}. Show it`)}">
      <span class="dmini__kind">${esc(k.name)} · ${kmAway(j.pickup).toFixed(1)} km</span>
      <span class="dmini__from">${esc(j.pickup.label)}</span>
      <span class="dmini__fare">${peso(j.fare)}</span>
      <img class="dmini__art" src="${k.art}" alt="">
    </button>`;
}

function renderJobs() {
  const shown = visibleJobs();
  if (!shown.some((j) => j.id === picked)) picked = null;
  const hero = shown.find((j) => j.id === picked) || shown[0];
  $('#reqCount').textContent = online && shown.length ? `${shown.length} request${shown.length === 1 ? '' : 's'} near you` : 'Requests';
  let html;
  if (job) html = '';
  else if (!approved) html = '<div class="dempty dtone--lilac"><h3>Application under review</h3><p>We’ll email you when you’re approved. Then you can go online here.</p></div>';
  else if (!online) html = `<div class="dempty dempty--quiet"><span class="dempty__ic">${icon('i-receipt')}</span><p>They show up here while you’re online.</p></div>`; // the sky above already says you're offline
  else if (!shown.length) html = '<div class="dempty dtone--lilac"><p class="jobs-wait"><span class="online__pulse" aria-hidden="true"></span>Waiting for requests nearby…</p><p>They show here, nearest first.</p></div>';
  else {
    const rest = shown.filter((j) => j !== hero);
    html = heroCard(hero) + (rest.length ? `<div class="dminis">${rest.slice(0, 4).map(miniCard).join('')}</div>` : '');
  }
  $('#jobList').innerHTML = html;
  if (mapMode && mapMode !== 'nav') { paintSheet(); paintMap(); }
}

function addJob(j) {
  if (jobs.some((x) => x.id === j.id)) return;
  jobs.push(j);
  renderJobs();
}

/* ---------- Accepted job ---------- */
const STEPS = ['to_pickup', 'arrived', 'started', 'completed'];
function jobWords(j) {
  const who = j.kind === 'shop' ? (j.shop ? j.shop.name : 'the shop') : j.rider.name;
  return {
    to_pickup: { title: `Head to ${j.pickup.label}`, sub: `${who} is waiting · ${kmAway(j.pickup).toFixed(1)} km away`, next: 'I’ve arrived' },
    arrived: {
      title: j.kind === 'ride' ? `Waiting for ${who}` : j.kind === 'express' ? 'Pick up the parcel' : `Collect the order at ${who}`,
      sub: j.pickup.label,
      next: j.kind === 'ride' ? 'Start trip' : j.kind === 'express' ? 'Parcel picked up' : 'Order picked up',
    },
    started: {
      title: `Drive to ${j.dropoff.label}`, sub: `${j.distanceKm.toFixed(1)} km trip`,
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
  box.innerHTML = `<article class="activejob dtone--${k.tone}" style="--kind:${k.ink}">
      <div class="activejob__top">${icon(k.icon, 'icon--sm')}${esc(k.name)}${job.demo ? ' · Demo' : ''}<b>${peso(job.fare)}</b></div>
      <h2 class="activejob__title">${esc(w.title)}</h2>
      <p class="activejob__sub">${esc(w.sub)}</p>
      <ol class="trip__steps" aria-label="Job progress">
        ${['To pickup', 'At pickup', 'On the way', 'Done'].map((t, i) => `<li class="${i < at ? 'is-done' : i === at ? 'is-current' : ''}"><span>${t}</span></li>`).join('')}
      </ol>
      <div class="driver">
        ${ava(job.rider.name, 'driver__ava')}
        <div class="driver__main"><span class="driver__name">${esc(job.rider.name)}</span>
          <span class="driver__meta">${job.payment === 'cash' ? `Collect ${peso(job.fare)} in cash` : `Paid by ${esc(PAY[job.payment] || job.payment)} · ${peso(job.fare)}`}</span></div>
        <button type="button" class="btn-soft" data-call>${icon('i-phone', 'icon--sm icon--deep')}Call</button>
      </div>
      <div class="activejob__actions">
        ${job.status === 'arrived' ? '' : `<button type="button" class="button activejob__nav" data-nav>${icon('i-arrow', 'icon--sm icon--white')}Navigate to ${esc(targetOf(job).label)}</button>`}
        <button type="button" class="button ${job.status === 'arrived' ? '' : 'button--ghost '}activejob__next" data-next>${esc(w.next)}</button>
        <a class="button button--ghost activejob__gmaps" href="${dirUrl(targetOf(job))}" target="_blank" rel="noopener">Google Maps</a>
      </div>
      ${job.status === 'to_pickup' ? '<button type="button" class="trip__cancel" data-cancel-job>Cancel job</button>' : ''}
    </article>`;
}

function paintAll() {
  paintOnline();
  renderActive();
  renderJobs();
  if (mapMode) { paintSheet(); paintMap(); }
}

async function accept(id, btn) {
  btn.disabled = true;
  try {
    ({ job } = await acceptJob(id));
    jobs = jobs.filter((j) => j.id !== id);
    picked = null;
    toast(`Accepted. Head to ${job.pickup.label}.`);
    edgeGlow('reward', btn);
    paintAll();
    if (mapMode) openMap('nav');
  } catch (err) {
    toast(err.status === 410 || err.status === 409 ? err.message : errorMessage(err));
    if (err.status === 410) { jobs = jobs.filter((j) => j.id !== id); renderJobs(); }
    btn.disabled = false;
  }
}

async function advance(btn) {
  if (!job) return;
  btn.disabled = true;
  const to = STEPS[STEPS.indexOf(job.status) + 1];
  try {
    await updateJob(job.id, to);
    if (to === 'completed') {
      toast(`Done! ${peso(job.fare)} added. You keep 100% of the fare.`);
      job = null;
      closeMap();
      loadEarnings();
      if (online) listen(); // free again: new requests come in
    } else {
      job = { ...job, status: to };
      if (to === 'arrived') closeMap(); // waiting at the pickup: back to the job card
    }
    paintAll();
  } catch (err) { toast(err.message || errorMessage(err)); btn.disabled = false; }
}

/* ---------- Events ---------- */
$('#jobList').addEventListener('click', (e) => {
  const mini = e.target.closest('[data-pick]');
  if (mini) { picked = mini.dataset.pick; renderJobs(); return; }
  const card = e.target.closest('.dhero');
  if (!card) return;
  const id = card.dataset.id;
  if (e.target.closest('[data-skip]')) {
    jobs = jobs.filter((j) => j.id !== id);
    picked = null;
    renderJobs();
  } else if (e.target.closest('[data-accept]')) accept(id, e.target.closest('[data-accept]'));
  else if (e.target.closest('[data-route]')) { picked = id; openMap('preview'); }
});

$('#activeJob').addEventListener('click', async (e) => {
  if (!job) return;
  if (e.target.closest('[data-nav]')) { openMap('nav'); return; }
  if (e.target.closest('[data-call]')) { toast('Calling works in the live app.'); return; }
  if (e.target.closest('[data-cancel-job]')) {
    // eslint-disable-next-line no-alert
    if (!window.confirm('Cancel this job? It goes to another driver.')) return;
    try { await cancelJob(job.id); job = null; closeMap(); if (online) listen(); toast('Job cancelled.'); paintAll(); } catch (err) { toast(err.message || errorMessage(err)); }
    return;
  }
  const next = e.target.closest('[data-next]');
  if (next) advance(next);
});

$('#mapSheet').addEventListener('click', (e) => {
  if (e.target.closest('[data-close]')) closeMap();
  else if (e.target.closest('[data-nav]')) openMap('nav');
  else if (e.target.closest('[data-next]')) advance(e.target.closest('[data-next]'));
  else if (e.target.closest('[data-accept]')) { const b = e.target.closest('[data-accept]'); accept(b.dataset.accept, b); }
});
document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && mapMode) closeMap(); });
$('#mapBtn').addEventListener('click', () => openMap(job ? 'nav' : 'all'));
$$('[data-payout]').forEach((b) => b.addEventListener('click', () => toast('Payout setup (GCash or bank) is coming soon.')));

$('#locateBtn').addEventListener('click', async () => {
  try {
    me = await askLocation();
    map.setUser(me);
    if (mapMode === 'nav') { routeKey = ''; paintMap(); } else fitAll();
  } catch (_) { toast('Couldn’t get your location. Requests are sorted from Cebu City centre.'); }
});

async function toggleOnline() {
  try {
    const res = await setOnline(!online);
    online = res.online;
    listen();
    paintAll();
  } catch (err) {
    if (err.status === 401) { location.replace('/pages/drive.html'); return; }
    toast(err.status === 403 ? 'You can go online once your application is approved.' : errorMessage(err));
  }
}
function listen() {
  stopJobs();
  stopJobs = online ? onJobRequest(addJob, { near: me }) : () => {};
  if (!online) { jobs = []; picked = null; }
}

// Countdown on each request; expired ones drop off
setInterval(() => {
  let expired = false;
  $$('[data-expires]').forEach((n) => {
    const left = Number(n.dataset.expires) - Date.now();
    n.textContent = mmss(left);
    if (left <= 0) expired = true;
  });
  if (expired) { jobs = jobs.filter((j) => j.expiresAt > Date.now()); renderJobs(); }
}, 1000);

async function loadEarnings() {
  const e = await driverEarnings();
  bindAll('today', peso(e.today));
  bindAll('week', peso(e.week));
  bindAll('payout', e.payout.method || 'Add GCash or a bank to get paid');
  bindAll('payoutAction', e.payout.method ? 'Change' : 'Set up');
  $$('.dround [data-payout]').forEach((b) => b.toggleAttribute('data-needs', !e.payout.method)); // a dot: still to do
  const midnight = new Date().setHours(0, 0, 0, 0);
  const n = e.trips.filter((t) => t.at >= midnight).length;
  bindAll('todayCount', String(n));
  bindAll('todayLabel', n === 1 ? 'trip today' : 'trips today');
  paintWeek(e.trips);
  // The latest 5, by day; the rest on the Trips page
  const trips = [...e.trips].sort((a, b) => b.at - a.at);
  $('#trips').innerHTML = trips.length ? tripsByDay(trips.slice(0, 5), trips) : '<li class="empty">No trips yet. Go online to start earning.</li>';
  $('#tripsNote').hidden = !trips.some((t) => t.demo);
  $('#allTrips').hidden = trips.length <= 5;
  $('#allTrips span').textContent = `See all ${trips.length} trips`;
}

// The last 7 days, a bar a day (today in gold), and the change from the 7 days before
function paintWeek(trips) {
  const start = (daysAgo) => { const d = new Date(); d.setHours(0, 0, 0, 0); d.setDate(d.getDate() - daysAgo); return d.getTime(); };
  const dayTotal = (daysAgo) => trips.filter((t) => t.at >= start(daysAgo) && t.at < start(daysAgo - 1)).reduce((s, t) => s + t.fare, 0);
  const days = [6, 5, 4, 3, 2, 1, 0].map((ago) => ({ ago, total: dayTotal(ago), day: new Date(start(ago)).toLocaleDateString('en-PH', { weekday: 'short' }) }));
  const before = [13, 12, 11, 10, 9, 8, 7].reduce((s, ago) => s + dayTotal(ago), 0);
  const now = days.reduce((s, d) => s + d.total, 0);
  const max = Math.max(...days.map((d) => d.total), 1);
  $('#weekBars').innerHTML = days.map((d) => `<span class="dweek__col${d.ago ? '' : ' is-now'}${d.total ? '' : ' is-zero'}" style="--h:${Math.round((d.total / max) * 100)}%"><i></i><span>${d.ago ? esc(d.day.slice(0, 1)) : 'Today'}</span></span>`).join('');
  $('#weekBars').setAttribute('aria-label', `Earnings each day: ${days.map((d) => `${d.day} ${peso(d.total)}`).join(', ')}`);
  const delta = $('#weekDelta');
  delta.hidden = !before;
  if (before) {
    const pct = Math.round(((now - before) / before) * 100);
    delta.className = `dweek__delta${pct < 0 ? ' is-down' : ''}`;
    delta.innerHTML = `${icon(pct < 0 ? 'i-trend-down' : 'i-trend-up')}${Math.abs(pct)}% vs the 7 days before`;
  }
}

/* ---------- Start ---------- */
async function start() {
  const d = await driverStatus();
  if (!d.signedIn) { location.replace('/pages/drive.html'); return; } // sign in first
  $('#driverHome').hidden = false;
  const vehicle = CONFIG.vehicles.find((v) => v.id === d.vehicle);
  bindAll('firstName', (d.name || 'driver').split(' ')[0]);
  $('.dwho__ava').outerHTML = ava(d.name || 'Driver', 'dwho__ava');
  bindAll('vehicle', [vehicle ? vehicle.name : d.vehicle, d.plate].filter(Boolean).join(' · '));
  // Approved: a small gold check by the name. Anything else says so in words
  $$('[data-bind="status"]').forEach((s) => {
    if (d.status === 'approved') {
      s.className = 'dwho__ok';
      s.setAttribute('role', 'img');
      s.setAttribute('aria-label', 'Approved driver');
      s.innerHTML = icon('i-check');
    } else {
      s.className = 'tag tag--review';
      s.innerHTML = `${icon('i-st-wait')}Under review`;
    }
  });
  approved = d.status === 'approved';
  online = approved && d.online;
  job = approved ? await activeJob() : null;
  const here = await knownLocation();
  if (here) me = here;
  map.setUser(me);
  if (online && !job) listen();
  paintAll();
  loadEarnings();
  $('#onlineBtn').addEventListener('click', toggleOnline);
}

start();
