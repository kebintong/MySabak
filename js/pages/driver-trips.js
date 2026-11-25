/* The driver's trips (pages/driver-trips.html?kind=ride&page=2): a job in progress first; filter by type; today's
   trips in their own card, past trips below, 10 a page grouped by day, with numbered pages. Completed trips and jobs
   that ended early (cancelled, no-show, not delivered) are listed together; a row opens the trip's details. */
import { driverStatus, driverEarnings, activeJob } from '../api.js';
import { $, mountChrome, peso, esc } from '../ui.js';
import { tripsByDay, tripSheet, TRIP_KIND } from '../trip-list.js';

mountChrome({ roles: ['driver'] });

const PER_PAGE = 10;
const q = new URLSearchParams(location.search);
let kind = TRIP_KIND[q.get('kind')] ? q.get('kind') : 'all';
let page = Math.max(1, Math.floor(Number(q.get('page'))) || 1);
let all = [];

function render() {
  const list = kind === 'all' ? all : all.filter((t) => t.kind === kind);
  const pages = Math.max(1, Math.ceil(list.filter((t) => t.at < new Date().setHours(0, 0, 0, 0)).length / PER_PAGE)); // past trips only
  page = Math.min(page, pages);
  const query = new URLSearchParams({ ...(kind !== 'all' && { kind }), ...(page > 1 && { page }) }).toString();
  history.replaceState(null, '', query ? `?${query}` : location.pathname);

  const count = (k) => (k === 'all' ? all.length : all.filter((t) => t.kind === k).length);
  $('#tripKinds').innerHTML = ['all', ...Object.keys(TRIP_KIND)].filter((k) => k === 'all' || count(k))
    .map((k) => `<button type="button" class="fchip" data-kind="${k}" aria-pressed="${k === kind}">${k === 'all' ? 'All' : esc(TRIP_KIND[k][0])} <span>${count(k)}</span></button>`).join('');

  // "3 trips · ₱291 · 1 ended early": the fare counts completed trips only
  const sum = (l) => {
    const done = l.filter((t) => !t.outcome);
    const ended = l.length - done.length;
    return [done.length ? `${done.length} trip${done.length === 1 ? '' : 's'} · ${peso(done.reduce((s, t) => s + t.fare, 0))}` : '', ended ? `${ended} ended early` : ''].filter(Boolean).join(' · ');
  };
  $('#tripsSum').textContent = sum(list);
  // Today in its own card; the pages are for past trips
  const midnight = new Date().setHours(0, 0, 0, 0);
  const today = list.filter((t) => t.at >= midnight);
  const past = list.filter((t) => t.at < midnight);
  $('#todaySum').textContent = sum(today);
  $('#pastSum').textContent = sum(past);
  $('#todayList').classList.remove('skel-rows');
  $('#todayList').innerHTML = today.length ? tripsByDay(today, today) : '<li class="empty">No trips yet today. Go online to start earning.</li>';
  const from = (page - 1) * PER_PAGE;
  $('#tripList').classList.remove('skel-rows');
  $('#tripList').innerHTML = past.length
    ? tripsByDay(past.slice(from, from + PER_PAGE), past)
    : '<li class="empty">No past trips yet.</li>';

  // Numbered pages: ‹ 1 2 3 › (the newest page first)
  // shortcut: every page number is shown (the demo keeps at most 50 trips, so 5 pages); add "…" past ~7 pages
  $('#tripPages').hidden = pages < 2;
  const btn = (to, label, aria, current = false) => `<button type="button" class="tpages__btn" data-page="${to}" aria-label="${aria}"${current ? ' aria-current="page"' : ''}${to < 1 || to > pages ? ' disabled' : ''}>${label}</button>`;
  $('#pageNav').innerHTML = btn(page - 1, '‹', 'Newer trips')
    + Array.from({ length: pages }, (_, i) => btn(i + 1, i + 1, `Page ${i + 1}`, i + 1 === page)).join('')
    + btn(page + 1, '›', 'Older trips');
  $('#pageNote').textContent = past.length ? `Showing ${from + 1}–${Math.min(from + PER_PAGE, past.length)} of ${past.length} past trips` : '';
}

// A row opens the trip's details
document.addEventListener('click', (e) => {
  const b = e.target.closest('[data-trip]');
  const t = b && all.find((x) => x.id === b.dataset.trip);
  if (t) tripSheet(t).then(() => b.focus());
});
$('#tripKinds').addEventListener('click', (e) => {
  const b = e.target.closest('[data-kind]');
  if (!b || b.dataset.kind === kind) return;
  kind = b.dataset.kind;
  page = 1;
  render();
});
$('#pageNav').addEventListener('click', (e) => {
  const b = e.target.closest('[data-page]');
  if (!b || b.disabled) return;
  page = Number(b.dataset.page);
  render();
  $('#tripKinds').scrollIntoView({ block: 'start', behavior: 'smooth' });
  $('#pageNav [aria-current="page"]').focus({ preventScroll: true }); // keyboard users stay on the pager
});

async function start() {
  const d = await driverStatus();
  if (!d.signedIn) { location.replace('/pages/drive.html'); return; } // sign in first
  const e = await driverEarnings();
  all = [...e.trips, ...e.endedEarly].sort((a, b) => b.at - a.at);
  render();
  const job = await activeJob();
  if (job) {
    $('[data-bind="ongoing"]').textContent = `${(TRIP_KIND[job.kind] || [job.kind])[0]} · ${job.status === 'started' ? `to ${job.dropoff.label}` : `pickup at ${job.pickup.label}`}`;
    $('#ongoing').hidden = false;
  }
}

start();
