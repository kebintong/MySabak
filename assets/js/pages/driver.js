/* Driver home (pages/driver.html): online switch, job requests, earnings, payouts.
   Job requests come only from the backend through onJobRequest(); the demo sends none. */
import { CONFIG } from '../config.js';
import { driverStatus, setOnline, onJobRequest, acceptJob, driverEarnings, driverSignOut, errorMessage } from '../api.js';
import { $, mountChrome, toast, peso, esc, when } from '../ui.js';

mountChrome();

const bind = (name, text) => { const n = $(`[data-bind="${name}"]`); if (n) n.textContent = text; };
const KIND = { ride: 'Ride', express: 'Express', shop: 'Shop delivery' };
let stopJobs = () => {};
let online = false;

function paintOnline() {
  const btn = $('#onlineBtn');
  btn.setAttribute('aria-pressed', String(online));
  $('span', btn).textContent = online ? 'Go offline' : 'Go online';
  bind('onlineTitle', online ? 'You’re online' : 'You’re offline');
  bind('onlineHint', online
    ? 'Requests near you will appear below. Keep the app open.'
    : 'Go online to get Ride, Express and Shop delivery requests near you.');
  $('#waiting').hidden = !online;
  document.body.classList.toggle('is-online', online);
}

/** A job request from the backend: show it with Accept. */
function showJob(job) {
  const card = document.createElement('div');
  card.className = 'job';
  card.innerHTML = `
    <div class="job__head"><span class="badge">${esc(KIND[job.kind] || job.kind)}</span><strong>${peso(job.fare)}</strong></div>
    <div class="row__sub">${esc(job.pickup.label)} → ${esc(job.dropoff.label)} · ${job.distanceKm.toFixed(1)} km</div>
    <div class="sheet__actions"><button type="button" class="button button--ghost" data-decline>Decline</button><button type="button" class="button" data-accept>Accept</button></div>`;
  $('[data-decline]', card).addEventListener('click', () => card.remove());
  $('[data-accept]', card).addEventListener('click', async () => {
    try { await acceptJob(job.id); toast('Job accepted.'); card.remove(); } catch (err) { toast(err.message || errorMessage(err)); }
  });
  $('#jobs').prepend(card);
}

async function toggleOnline() {
  try {
    const res = await setOnline(!online);
    online = res.online;
    stopJobs();
    stopJobs = online ? onJobRequest(showJob) : () => {};
    paintOnline();
  } catch (err) {
    if (err.status === 401) { location.replace('/pages/drive.html'); return; }
    toast(err.status === 403 ? 'You can go online once your application is approved.' : errorMessage(err));
  }
}

async function loadEarnings() {
  const e = await driverEarnings();
  bind('today', peso(e.today));
  bind('week', peso(e.week));
  bind('payout', e.payout.method || 'Not set up yet');
  $('#trips').innerHTML = e.trips.length
    ? e.trips.map((t) => `<li class="row"><div class="row__main"><span class="row__title">${esc(KIND[t.kind] || t.kind)}</span>
        <span class="row__sub">${esc(when(t.at))} · ${t.distanceKm.toFixed(1)} km</span></div><span class="row__end">${peso(t.fare)}</span></li>`).join('')
    : '<li class="empty">No trips yet. Go online to start earning.</li>';
}

async function start() {
  const d = await driverStatus();
  if (!d.signedIn) { location.replace('/pages/drive.html'); return; } // sign in first
  $('#driverHome').hidden = false;
  const vehicle = CONFIG.vehicles.find((v) => v.id === d.vehicle);
  bind('firstName', (d.name || 'driver').split(' ')[0]);
  bind('vehicle', [vehicle ? vehicle.name : d.vehicle, d.plate].filter(Boolean).join(' · '));
  const status = $('[data-bind="status"]');
  status.textContent = d.status === 'approved' ? 'Approved' : 'Under review';
  status.classList.add(d.status === 'approved' ? 'badge--ok' : 'badge--wait');
  if (d.status === 'approved') {
    online = d.online;
    if (online) stopJobs = onJobRequest(showJob);
    paintOnline();
  } else {
    // Application still being checked: updates go to the driver's email
    bind('onlineTitle', 'Application under review');
    bind('onlineHint', d.email
      ? `We’ll email ${d.email} when you’re approved. Then you can go online here.`
      : 'We’ll let you know when you’re approved. Then you can go online here.');
    const btn = $('#onlineBtn');
    btn.disabled = true;
    $('span', btn).textContent = 'Not yet';
  }
  loadEarnings();
  $('#onlineBtn').addEventListener('click', toggleOnline);
  $('#payoutBtn').addEventListener('click', () => toast('Payout setup (GCash or bank) is coming soon.'));
  $('#signOutBtn').addEventListener('click', async () => {
    stopJobs();
    await driverSignOut();
    location.href = '/pages/drive.html';
  });
}

start();
