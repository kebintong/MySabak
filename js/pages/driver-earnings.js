/* Earnings (pages/driver-earnings.html?period=7d): one period at a time (Today, 7 days, 30 days). The fares on the
   sky with what's left after the platform fee; each day as bars (or today's trips); the breakdown (fees, how you
   were paid, by service); the payout method. */
import { driverStatus, driverEarnings } from '../api.js';
import { $, $$, mountChrome, toast, peso, esc, icon, rollNumber } from '../ui.js';
import { earningsSince } from '../money.js';
import { tripsByDay, TRIP_KIND } from '../trip-list.js';

mountChrome({ roles: ['driver'] });

const PERIODS = { today: { days: 1, label: 'Fares today', before: 'yesterday' }, '7d': { days: 7, label: 'Fares, last 7 days', before: 'the 7 days before' }, '30d': { days: 30, label: 'Fares, last 30 days', before: 'the 30 days before' } };
const DATE = new Intl.DateTimeFormat('en-PH', { weekday: 'short', month: 'short', day: 'numeric' });
const WEEKDAY = new Intl.DateTimeFormat('en-PH', { weekday: 'short' });
const MONTH_DAY = new Intl.DateTimeFormat('en-PH', { month: 'short', day: 'numeric' });
const dayStart = (daysAgo) => { const d = new Date(); d.setHours(0, 0, 0, 0); d.setDate(d.getDate() - daysAgo); return d.getTime(); };
const bind = (name, text) => $$(`[data-bind="${name}"]`).forEach((n) => { n.textContent = text; });
const roll = (name, text) => $$(`[data-bind="${name}"]`).forEach((n) => { const was = n.dataset.value ?? null; n.textContent = text; rollNumber(n, was); });

let trips = [];
let period = PERIODS[new URLSearchParams(location.search).get('period')] ? new URLSearchParams(location.search).get('period') : 'today';

// One bar a day, today in gold. 7 days: the amount above each bar and the weekday under it. 30 days: thin bars, the
// first and last dates only; a tap (or hover) shows the day's amount.
function paintBars(days) {
  const cols = Array.from({ length: days }, (_, i) => {
    const ago = days - 1 - i;
    const total = trips.filter((t) => t.at >= dayStart(ago) && t.at < dayStart(ago - 1)).reduce((s, t) => s + t.fare, 0);
    return { ago, total, at: dayStart(ago) };
  });
  const max = Math.max(...cols.map((c) => c.total), 1);
  const when = (c) => (c.ago ? DATE.format(c.at) : 'Today');
  const label = (c, i) => (days === 7 ? (c.ago ? WEEKDAY.format(c.at) : 'Today') : i === 0 ? MONTH_DAY.format(c.at) : !c.ago ? 'Today' : '');
  const bars = $('#bars');
  bars.classList.remove('skel-block');
  bars.classList.toggle('dweek__bars--thin', days > 7);
  bars.style.setProperty('--n', days);
  bars.innerHTML = cols.map((c, i) => `<button type="button" class="dweek__col${c.ago ? '' : ' is-now'}${c.total ? '' : ' is-zero'}" style="--bh:${Math.max(6, Math.round((c.total / max) * 60))}px;--i:${days > 7 ? 0 : i}" aria-label="${esc(when(c))}: ${peso(c.total)}">
    ${days === 7 ? `<span class="dweek__val" aria-hidden="true">${c.total ? peso(c.total) : ''}</span>` : ''}
    <span class="dweek__plot"><i></i><span class="dweek__tip" aria-hidden="true"><b>${peso(c.total)}</b><span>${esc(when(c))}</span></span></span>
    <span class="dweek__day" aria-hidden="true">${esc(label(c, i)) || '&nbsp;'}</span></button>`).join('');
}

function render() {
  const p = PERIODS[period];
  history.replaceState(null, '', period === 'today' ? location.pathname : `?period=${period}`);
  $$('#period [data-period]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.period === period)));
  const from = dayStart(p.days - 1);
  const e = earningsSince(trips, from);
  const before = earningsSince(trips, dayStart(2 * p.days - 1)).fares - e.fares;

  bind('periodLabel', p.label);
  roll('fares', peso(e.fares));
  bind('sub', e.count
    ? `${peso(e.net)} after ${peso(e.fees)} in platform fees · ${e.count} trip${e.count === 1 ? '' : 's'}`
    : period === 'today' ? 'No trips yet today. Go online on the Drive tab to start earning.' : 'No trips in this period.');
  bind('fees', e.fees ? `−${peso(e.fees)}` : peso(0));
  roll('net', peso(e.net));
  bind('cash', peso(e.cash));
  bind('digital', peso(e.digital));
  const kinds = Object.keys(TRIP_KIND).filter((k) => e.byKind[k]);
  $('#byKind').innerHTML = kinds.length
    ? kinds.map((k) => `<div><dt>${icon(TRIP_KIND[k][1], 'icon--sm')}${esc(TRIP_KIND[k][0])}<span>${e.byKind[k].count} trip${e.byKind[k].count === 1 ? '' : 's'}</span></dt><dd>${peso(e.byKind[k].fares)}</dd></div>`).join('')
    : '<div><dt>No trips yet</dt><dd></dd></div>';

  // Today: the trips themselves. 7 and 30 days: a bar a day, and the change from the period before, in words
  $('#todayCard').hidden = period !== 'today';
  $('#chartCard').hidden = period === 'today';
  if (period === 'today') {
    $('#todaySum').textContent = e.count ? `${e.count} trip${e.count === 1 ? '' : 's'}` : '';
    $('#todayList').classList.remove('skel-rows');
    $('#todayList').innerHTML = e.count ? tripsByDay(e.trips, e.trips) : '<li class="empty">No trips yet today. Go online to start earning.</li>';
  } else {
    paintBars(p.days);
    const delta = $('#delta');
    delta.hidden = !before;
    if (before) {
      const pct = Math.round(((e.fares - before) / before) * 100);
      delta.className = `dweek__delta${pct < 0 ? ' is-down' : ''}`;
      delta.innerHTML = `${icon(pct < 0 ? 'i-trend-down' : 'i-trend-up')}${Math.abs(pct)}% ${pct < 0 ? 'less' : 'more'} than ${p.before}`;
    }
  }
}

$('#period').addEventListener('click', (e) => {
  const b = e.target.closest('[data-period]');
  if (!b || b.dataset.period === period) return;
  period = b.dataset.period;
  render();
});
// A tap on a bar keeps its amount showing (phones have no hover); a second tap, or another bar, moves it
$('#bars').addEventListener('click', (e) => {
  const col = e.target.closest('.dweek__col');
  if (!col) return;
  const pick = !col.classList.contains('is-pick');
  $$('.dweek__col', $('#bars')).forEach((c) => c.classList.toggle('is-pick', pick && c === col));
});
$$('[data-payout]').forEach((b) => b.addEventListener('click', () => toast('Payout setup (GCash or bank) is coming soon.')));

async function start() {
  const d = await driverStatus();
  if (!d.signedIn) { location.replace('/pages/drive.html'); return; }
  const e = await driverEarnings();
  trips = e.trips;
  bind('feeRule', `${peso(e.feePerTrip)} for each completed trip`);
  bind('payout', e.payout.method || 'Add GCash or a bank to get paid.');
  bind('payoutAction', e.payout.method ? 'Change' : 'Set up');
  render();
}
start();
