/* The driver's trips (pages/driver-trips.html?kind=ride&page=2): filter by type, 10 a page grouped by day,
   numbered pages. The Drive page shows the latest 5 and links here. */
import { driverStatus, driverEarnings } from '../api.js';
import { $, mountChrome, peso, esc } from '../ui.js';
import { tripsByDay, TRIP_KIND } from '../trip-list.js';

mountChrome({ roles: ['driver'] });

const PER_PAGE = 10;
const q = new URLSearchParams(location.search);
let kind = TRIP_KIND[q.get('kind')] ? q.get('kind') : 'all';
let page = Math.max(1, Math.floor(Number(q.get('page'))) || 1);
let all = [];

function render() {
  const list = kind === 'all' ? all : all.filter((t) => t.kind === kind);
  const pages = Math.max(1, Math.ceil(list.length / PER_PAGE));
  page = Math.min(page, pages);
  const query = new URLSearchParams({ ...(kind !== 'all' && { kind }), ...(page > 1 && { page }) }).toString();
  history.replaceState(null, '', query ? `?${query}` : location.pathname);

  const count = (k) => (k === 'all' ? all.length : all.filter((t) => t.kind === k).length);
  $('#tripKinds').innerHTML = ['all', ...Object.keys(TRIP_KIND)].filter((k) => k === 'all' || count(k))
    .map((k) => `<button type="button" class="fchip" data-kind="${k}" aria-pressed="${k === kind}">${k === 'all' ? 'All' : esc(TRIP_KIND[k][0])} <span>${count(k)}</span></button>`).join('');

  const total = list.reduce((s, t) => s + t.fare, 0);
  $('#tripsSum').textContent = list.length ? `${list.length} trip${list.length === 1 ? '' : 's'} · ${peso(total)}` : '';
  const from = (page - 1) * PER_PAGE;
  $('#tripList').innerHTML = list.length
    ? tripsByDay(list.slice(from, from + PER_PAGE), list)
    : '<li class="empty">No trips yet. Go online to start earning.</li>';

  // Numbered pages: ‹ 1 2 3 › (the newest page first)
  // shortcut: every page number is shown (the demo keeps at most 50 trips, so 5 pages); add "…" past ~7 pages
  $('#tripPages').hidden = pages < 2;
  const btn = (to, label, aria, current = false) => `<button type="button" class="tpages__btn" data-page="${to}" aria-label="${aria}"${current ? ' aria-current="page"' : ''}${to < 1 || to > pages ? ' disabled' : ''}>${label}</button>`;
  $('#pageNav').innerHTML = btn(page - 1, '‹', 'Newer trips')
    + Array.from({ length: pages }, (_, i) => btn(i + 1, i + 1, `Page ${i + 1}`, i + 1 === page)).join('')
    + btn(page + 1, '›', 'Older trips');
  $('#pageNote').textContent = list.length ? `Showing ${from + 1}–${Math.min(from + PER_PAGE, list.length)} of ${list.length} trips` : '';
}

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
  all = [...(await driverEarnings()).trips].sort((a, b) => b.at - a.at);
  render();
}

start();
