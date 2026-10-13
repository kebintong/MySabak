/* Driver home (pages/driver.html), map first like Shops: every job request is a pin on the map and a
   card in the panel (left on desktop, a pull-up sheet on phones). Accept one and follow it:
   to pickup → arrived → on the trip → completed. Earnings and payouts sit under the list.
   Job requests come from onJobRequest(); the demo sends SAMPLE ones (tagged "Demo"). */
import { CONFIG } from '../config.js';
import {
  driverStatus, setOnline, onJobRequest, acceptJob, activeJob, updateJob, cancelJob, driverEarnings, driverSignOut,
  routeBetween, straightLine, errorMessage,
} from '../api.js';
import { haversineKm } from '../money.js';
import { shopMap, knownLocation, askLocation } from '../shop-map.js';
import { $, $$, mountChrome, toast, peso, esc, when, icon } from '../ui.js';

mountChrome();

const DESKTOP = window.matchMedia('(min-width: 900px)');
const KIND = {
  ride: { name: 'Ride', icon: 'i-car', color: '#5630d8' },
  express: { name: 'Express', icon: 'i-box', color: '#E0782F' },
  shop: { name: 'Shop delivery', icon: 'i-bag', color: '#1E7A44' },
};
const PAY = { cash: 'Cash', gcash: 'GCash', bank: 'Online banking' };
const FILTERS = [{ id: 'all', name: 'All' }, { id: 'ride', name: 'Ride' }, { id: 'express', name: 'Express' }, { id: 'shop', name: 'Shop' }];

let me = { lng: CONFIG.startCenter[0], lat: CONFIG.startCenter[1] };
let online = false;
let approved = false;
let jobs = [];        // waiting requests
let picked = null;    // id of the request shown on the map
let job = null;       // the accepted job
let filter = 'all';
let stopJobs = () => {};

const bindAll = (name, text) => $$(`[data-bind="${name}"]`).forEach((n) => { n.textContent = text; });
const kmAway = (p) => haversineKm(me, p);
const mmss = (ms) => { const s = Math.max(0, Math.round(ms / 1000)); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; };
const dirUrl = (p) => `https://www.google.com/maps/dir/?api=1&destination=${p.lat},${p.lng}`;

/* ---------- Map ---------- */
function mapPadding() {
  const app = $('.app').getBoundingClientRect();
  if (DESKTOP.matches) return { top: 110, bottom: 140, left: $('.finder').getBoundingClientRect().right - app.left + 40, right: 60 };
  const top = $('.finder__top').getBoundingClientRect().bottom - app.top + 40;
  const bottom = app.bottom - $('#sheet').getBoundingClientRect().top + 24;
  return { top, bottom: Math.min(bottom, app.height - top - 80), left: 40, right: 40 };
}
const map = shopMap($('#mapCanvas'), { onPin: (id) => pick(id, { fromMap: true }), padding: mapPadding });
const pinOf = (j) => ({ id: j.id, name: `${peso(j.fare)} · ${KIND[j.kind].name}`, area: j.pickup.label, color: KIND[j.kind].color, lng: j.pickup.lng, lat: j.pickup.lat });

let routeToken = 0;
let routeKey = '';
async function showRoute(from, to) {
  const key = `${from.lng},${from.lat}>${to.lng},${to.lat}`;
  if (key === routeKey) return; // already showing it
  routeKey = key;
  const token = ++routeToken;
  let trip;
  try { trip = await routeBetween(from, to); } catch (_) { trip = straightLine(from, to); }
  if (token !== routeToken) return;
  map.setRoute(trip.coords);
  map.fit(trip.coords.concat([[from.lng, from.lat], [to.lng, to.lat]]), { animate: true });
}

function paintMap() {
  if (job) {
    map.setShops([pinOf(job)]);
    map.setActive(job.id);
    const leg = job.status === 'started' ? [job.pickup, job.dropoff] : [me, job.pickup];
    map.setDest(job.status === 'started' ? job.dropoff : null);
    showRoute(...leg);
    return;
  }
  const shown = visibleJobs();
  map.setShops(shown.map(pinOf));
  map.setActive(picked);
  const p = shown.find((j) => j.id === picked);
  if (p) { map.setDest(p.dropoff, 'Drop-off'); showRoute(p.pickup, p.dropoff); } else { routeToken++; routeKey = ''; map.setDest(null); map.setRoute(null); }
}

/* ---------- Online bar ---------- */
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
    bindAll('onlineHint', online ? 'Requests near you show on the map and below.' : 'Go online to get Ride, Express and Shop requests.');
    bindAll('onlineAction', online ? 'Go offline' : 'Go online');
  }
  document.body.classList.toggle('is-online', online);
}

/* ---------- Requests ---------- */
const visibleJobs = () => jobs
  .filter((j) => j.expiresAt > Date.now() && (filter === 'all' || j.kind === filter))
  .sort((a, b) => kmAway(a.pickup) - kmAway(b.pickup));

function renderFilters() {
  $('#kinds').innerHTML = FILTERS.map((f) => {
    const n = f.id === 'all' ? jobs.length : jobs.filter((j) => j.kind === f.id).length;
    return `<button type="button" class="fchip" data-kind="${f.id}" aria-pressed="${f.id === filter}">${esc(f.name)}${online && n ? ` <b>${n}</b>` : ''}</button>`;
  }).join('');
}

function jobCard(j) {
  const k = KIND[j.kind];
  return `<li><article class="jobcard${j.id === picked ? ' is-picked' : ''}" data-id="${esc(j.id)}" style="--kind:${k.color}" tabindex="0" aria-label="${esc(`${k.name}, ${peso(j.fare)}, from ${j.pickup.label} to ${j.dropoff.label}`)}">
      <div class="jobcard__top">
        <span class="jobcard__kind">${icon(k.icon, 'icon--sm')}${esc(k.name)}</span>
        ${j.demo ? '<span class="badge badge--wait">Demo</span>' : ''}
        <b class="jobcard__fare">${peso(j.fare)}</b>
      </div>
      <ol class="jobcard__route">
        <li><span>Pickup · ${kmAway(j.pickup).toFixed(1)} km from you</span>${esc(j.pickup.label)}</li>
        <li><span>Drop-off · ${j.distanceKm.toFixed(1)} km trip</span>${esc(j.dropoff.label)}</li>
      </ol>
      <div class="jobcard__meta">${esc(PAY[j.payment] || j.payment)} · ${esc(j.rider ? j.rider.name : '')}${j.parcel ? ` · ${esc(j.parcel.item)}` : ''} · <span data-expires="${j.expiresAt}">${mmss(j.expiresAt - Date.now())}</span> left</div>
      <div class="jobcard__actions">
        <button type="button" class="button button--ghost" data-skip>Skip</button>
        <button type="button" class="button" data-accept>Accept · ${peso(j.fare)}</button>
      </div>
    </article></li>`;
}

function renderJobs() {
  renderFilters();
  const shown = visibleJobs();
  $('#reqHead').hidden = Boolean(job) || !approved;
  $('#jobList').hidden = Boolean(job);
  $('#reqCount').textContent = online ? `${shown.length} request${shown.length === 1 ? '' : 's'} near you` : 'Requests';
  let html;
  if (!approved) html = '<li class="shops-empty"><h3>Application under review</h3><p>We’ll email you when you’re approved. Then you can go online here.</p></li>';
  else if (!online) html = `<li class="shops-empty">${icon('i-power', 'icon--xl')}<h3>You’re offline</h3><p>Go online to see Ride, Express and Shop delivery requests near you.</p></li>`;
  else if (!shown.length) html = '<li class="jobs-wait"><span class="online__pulse" aria-hidden="true"></span>Waiting for requests nearby…</li>';
  else html = shown.map(jobCard).join('');
  $('#jobList').innerHTML = html;
  if (!shown.some((j) => j.id === picked)) picked = null;
}

function pick(id, { fromMap = false } = {}) {
  if (job) return;
  picked = id;
  $$('.jobcard').forEach((c) => c.classList.toggle('is-picked', c.dataset.id === id));
  paintMap();
  if (fromMap) {
    const card = $(`.jobcard[data-id="${CSS.escape(id)}"]`);
    if (card) card.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }
}

function addJob(j) {
  if (jobs.some((x) => x.id === j.id)) return;
  jobs.push(j);
  renderJobs();
  paintMap();
  if (!picked && !job) map.fit([[me.lng, me.lat]].concat(visibleJobs().map((x) => [x.pickup.lng, x.pickup.lat])), { animate: true, maxZoom: 15 });
}

/* ---------- Accepted job ---------- */
const STEPS = ['to_pickup', 'arrived', 'started', 'completed'];
function jobWords(j) {
  const who = j.kind === 'shop' ? (j.shop ? j.shop.name : 'the shop') : j.rider.name;
  return {
    to_pickup: { title: 'Go to pickup', sub: j.pickup.label, next: 'I’ve arrived' },
    arrived: {
      title: j.kind === 'ride' ? `Waiting for ${who}` : j.kind === 'express' ? 'Pick up the parcel' : `Collect the order at ${who}`,
      sub: j.pickup.label,
      next: j.kind === 'ride' ? 'Start trip' : j.kind === 'express' ? 'Parcel picked up' : 'Order picked up',
    },
    started: {
      title: 'Drive to drop-off', sub: j.dropoff.label,
      next: j.kind === 'ride' ? 'Complete trip' : j.kind === 'express' ? 'Parcel delivered' : 'Order delivered',
    },
  }[j.status];
}

function renderActive() {
  const box = $('#activeJob');
  document.body.classList.toggle('has-job', Boolean(job));
  if (!job) { box.innerHTML = ''; return; }
  if (!DESKTOP.matches) setExpanded(true); // room for the job card
  $('#sheetScroll').scrollTop = 0;
  const k = KIND[job.kind];
  const w = jobWords(job);
  const at = STEPS.indexOf(job.status);
  const target = job.status === 'started' ? job.dropoff : job.pickup;
  box.innerHTML = `<article class="activejob" style="--kind:${k.color}">
      <div class="jobcard__top">
        <span class="jobcard__kind">${icon(k.icon, 'icon--sm')}${esc(k.name)}</span>
        ${job.demo ? '<span class="badge badge--wait">Demo</span>' : ''}
        <b class="jobcard__fare">${peso(job.fare)}</b>
      </div>
      <h2 class="activejob__title">${esc(w.title)}</h2>
      <p class="activejob__sub">${esc(w.sub)}</p>
      <ol class="trip__steps" aria-label="Job progress">
        ${['To pickup', 'At pickup', 'On the way', 'Done'].map((t, i) => `<li class="${i < at ? 'is-done' : i === at ? 'is-current' : ''}"><span>${t}</span></li>`).join('')}
      </ol>
      <div class="driver">
        <span class="driver__ava" aria-hidden="true">${esc((job.rider.name || '?')[0])}</span>
        <div class="driver__main"><span class="driver__name">${esc(job.rider.name)}</span>
          <span class="driver__meta">${job.payment === 'cash' ? `Collect ${peso(job.fare)} in cash` : `Paid by ${esc(PAY[job.payment] || job.payment)} · ${peso(job.fare)}`}</span></div>
        <button type="button" class="btn-soft" data-call>${icon('i-phone', 'icon--sm icon--deep')}Call</button>
      </div>
      <ol class="jobcard__route">
        <li><span>Pickup</span>${esc(job.pickup.label)}</li>
        <li><span>Drop-off · ${job.distanceKm.toFixed(1)} km</span>${esc(job.dropoff.label)}</li>
      </ol>
      <div class="activejob__actions">
        <a class="button button--ghost" href="${dirUrl(target)}" target="_blank" rel="noopener">${icon('i-arrow', 'icon--sm icon--deep')}Navigate</a>
        <button type="button" class="button" data-next>${esc(w.next)}</button>
      </div>
      ${job.status === 'to_pickup' ? '<button type="button" class="trip__cancel" data-cancel-job>Cancel job</button>' : ''}
    </article>`;
}

function paintAll() {
  paintOnline();
  renderActive();
  renderJobs();
  paintMap();
}

/* ---------- Events ---------- */
$('#kinds').addEventListener('click', (e) => {
  const b = e.target.closest('[data-kind]');
  if (!b) return;
  filter = b.dataset.kind;
  renderJobs();
  paintMap();
});

$('#jobList').addEventListener('click', async (e) => {
  const card = e.target.closest('.jobcard');
  if (!card) return;
  const id = card.dataset.id;
  if (e.target.closest('[data-skip]')) {
    jobs = jobs.filter((j) => j.id !== id);
    if (picked === id) picked = null;
    renderJobs();
    paintMap();
    return;
  }
  if (e.target.closest('[data-accept]')) {
    const btn = e.target.closest('[data-accept]');
    btn.disabled = true;
    try {
      ({ job } = await acceptJob(id));
      jobs = jobs.filter((j) => j.id !== id);
      picked = null;
      toast(`Accepted. Head to ${job.pickup.label}.`);
      paintAll();
    } catch (err) {
      toast(err.status === 410 || err.status === 409 ? err.message : errorMessage(err));
      if (err.status === 410) { jobs = jobs.filter((j) => j.id !== id); renderJobs(); paintMap(); }
      btn.disabled = false;
    }
    return;
  }
  pick(id);
});
$('#jobList').addEventListener('keydown', (e) => {
  const card = e.target.closest('.jobcard');
  if (card && e.target === card && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); pick(card.dataset.id); }
});
$('#jobList').addEventListener('mouseover', (e) => {
  const card = e.target.closest('.jobcard');
  if (card && DESKTOP.matches && !job) map.setActive(card.dataset.id);
});
$('#jobList').addEventListener('mouseleave', () => { if (!job) map.setActive(picked); });

$('#activeJob').addEventListener('click', async (e) => {
  if (!job) return;
  if (e.target.closest('[data-call]')) { toast('Calling works in the live app.'); return; }
  if (e.target.closest('[data-cancel-job]')) {
    // eslint-disable-next-line no-alert
    if (!window.confirm('Cancel this job? It goes to another driver.')) return;
    try { await cancelJob(job.id); job = null; toast('Job cancelled.'); paintAll(); } catch (err) { toast(err.message || errorMessage(err)); }
    return;
  }
  const next = e.target.closest('[data-next]');
  if (!next) return;
  next.disabled = true;
  const to = STEPS[STEPS.indexOf(job.status) + 1];
  try {
    await updateJob(job.id, to);
    if (to === 'completed') {
      toast(`Done! ${peso(job.fare)} added. You keep 100% of the fare.`);
      job = null;
      loadEarnings();
    } else {
      job = { ...job, status: to };
    }
    paintAll();
  } catch (err) { toast(err.message || errorMessage(err)); next.disabled = false; }
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
  if (expired) { jobs = jobs.filter((j) => j.expiresAt > Date.now()); renderJobs(); paintMap(); }
}, 1000);

async function loadEarnings() {
  const e = await driverEarnings();
  bindAll('today', peso(e.today));
  bindAll('week', peso(e.week));
  bindAll('payout', e.payout.method || 'Not set up yet');
  $('#trips').innerHTML = e.trips.length
    ? e.trips.slice(0, 5).map((t) => `<li class="row"><div class="row__main"><span class="row__title">${esc(KIND[t.kind] ? KIND[t.kind].name : t.kind)}${t.demo ? ' <span class="badge badge--wait">Demo</span>' : ''}</span>
        <span class="row__sub">${esc(when(t.at))} · ${t.distanceKm.toFixed(1)} km</span></div><span class="row__end">${peso(t.fare)}</span></li>`).join('')
    : '<li class="empty">No trips yet. Go online to start earning.</li>';
}

/* Phones: pull the sheet up over the map, or back down (same as Shops) */
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
$('#sheetScroll').addEventListener('touchmove', () => { if (!DESKTOP.matches) setExpanded(true); }, { passive: true });
DESKTOP.addEventListener('change', () => { setExpanded(false); map.resize(); });

$('#locateBtn').addEventListener('click', async () => {
  try {
    me = await askLocation();
    map.setUser(me);
    map.fit([[me.lng, me.lat]].concat(visibleJobs().map((j) => [j.pickup.lng, j.pickup.lat])), { animate: true, maxZoom: 15 });
  } catch (_) { toast('Couldn’t get your location. Requests are sorted from Cebu City centre.'); }
});

/* ---------- Start ---------- */
async function start() {
  const d = await driverStatus();
  if (!d.signedIn) { location.replace('/pages/drive.html'); return; } // sign in first
  $('#driverHome').hidden = false;
  const vehicle = CONFIG.vehicles.find((v) => v.id === d.vehicle);
  bindAll('firstName', (d.name || 'driver').split(' ')[0]);
  bindAll('vehicle', [vehicle ? vehicle.name : d.vehicle, d.plate].filter(Boolean).join(' · '));
  $$('[data-bind="status"]').forEach((s) => {
    s.textContent = d.status === 'approved' ? 'Approved' : 'Under review';
    s.classList.add(d.status === 'approved' ? 'badge--ok' : 'badge--wait');
  });
  approved = d.status === 'approved';
  online = approved && d.online;
  job = approved ? await activeJob() : null;
  const here = await knownLocation();
  if (here) me = here;
  map.setUser(me);
  map.fit([[me.lng, me.lat]], { maxZoom: 14.5 });
  if (online && !job) listen();
  paintAll();
  loadEarnings();
  $('#onlineBtn').addEventListener('click', toggleOnline);
  $('#payoutBtn').addEventListener('click', () => toast('Payout setup (GCash or bank) is coming soon.'));
  $$('[data-signout]').forEach((b) => b.addEventListener('click', async () => {
    stopJobs();
    await driverSignOut();
    location.href = '/pages/drive.html';
  }));
}

start();
