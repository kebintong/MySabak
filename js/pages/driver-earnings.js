/* Earnings (pages/driver-earnings.html): today and the last 7 days, the week as bars (the analytics' hover and
   rolling digits), the week in numbers, and the payout method. */
import { driverStatus, driverEarnings } from '../api.js';
import { $, $$, mountChrome, toast, peso, esc, icon, rollNumber } from '../ui.js';

mountChrome({ roles: ['driver'] });

const bindAll = (name, text) => $$(`[data-bind="${name}"]`).forEach((n) => { n.textContent = text; });
const DAY = 24 * 60 * 60 * 1000;

// The last 7 days, a bar a day (today in gold), and the change from the 7 days before (in words, no badge)
function paintWeek(trips) {
  const start = (daysAgo) => { const d = new Date(); d.setHours(0, 0, 0, 0); d.setDate(d.getDate() - daysAgo); return d.getTime(); };
  const dayTotal = (daysAgo) => trips.filter((t) => t.at >= start(daysAgo) && t.at < start(daysAgo - 1)).reduce((s, t) => s + t.fare, 0);
  const days = [6, 5, 4, 3, 2, 1, 0].map((ago) => ({ ago, total: dayTotal(ago), day: new Date(start(ago)).toLocaleDateString('en-PH', { weekday: 'short' }) }));
  const before = [13, 12, 11, 10, 9, 8, 7].reduce((s, ago) => s + dayTotal(ago), 0);
  const now = days.reduce((s, d) => s + d.total, 0);
  const max = Math.max(...days.map((d) => d.total), 1);
  const when = (d) => (d.ago ? new Date(start(d.ago)).toLocaleDateString('en-PH', { weekday: 'short', month: 'short', day: 'numeric' }) : 'Today');
  $('#weekBars').classList.remove('skel-block');
  $('#weekBars').innerHTML = days.map((d, i) => `<button type="button" class="dweek__col${d.ago ? '' : ' is-now'}${d.total ? '' : ' is-zero'}" style="--bh:${Math.max(6, Math.round((d.total / max) * 60))}px;--i:${i}" aria-label="${esc(when(d))}: ${peso(d.total)}">
    <span class="dweek__plot"><i></i><span class="dweek__tip" aria-hidden="true"><b>${peso(d.total)}</b><span>${esc(when(d))}</span></span></span>
    <span class="dweek__day" aria-hidden="true">${d.ago ? esc(d.day.slice(0, 1)) : 'Today'}</span></button>`).join('');
  const delta = $('#weekDelta');
  delta.hidden = !before;
  if (before) {
    const pct = Math.round(((now - before) / before) * 100);
    delta.className = `dweek__delta${pct < 0 ? ' is-down' : ''}`;
    delta.innerHTML = `${icon(pct < 0 ? 'i-trend-down' : 'i-trend-up')}${Math.abs(pct)}% vs last week`;
  }
}
// A tap on a bar keeps its amount showing (phones have no hover); a second tap, or another bar, moves it
$('#weekBars').addEventListener('click', (e) => {
  const col = e.target.closest('.dweek__col');
  if (!col) return;
  const pick = !col.classList.contains('is-pick');
  $$('.dweek__col', $('#weekBars')).forEach((c) => c.classList.toggle('is-pick', pick && c === col));
});
$$('[data-payout]').forEach((b) => b.addEventListener('click', () => toast('Payout setup (GCash or bank) is coming soon.')));

async function start() {
  const d = await driverStatus();
  if (!d.signedIn) { location.replace('/pages/drive.html'); return; }
  const e = await driverEarnings();
  const midnight = new Date().setHours(0, 0, 0, 0);
  const week = e.trips.filter((t) => t.at >= Date.now() - 7 * DAY);
  const n = e.trips.filter((t) => t.at >= midnight).length;
  bindAll('today', peso(e.today));
  bindAll('week', peso(e.week));
  bindAll('todayCount', String(n));
  bindAll('todayLabel', n === 1 ? 'trip today' : 'trips today');
  bindAll('weekCount', String(week.length));
  bindAll('weekAvg', peso(week.length ? Math.round(e.week / week.length) : 0));
  bindAll('payout', e.payout.method || 'Add GCash or a bank to get paid.');
  bindAll('payoutAction', e.payout.method ? 'Change' : 'Set up');
  $$('[data-bind="today"], [data-bind="week"], [data-bind="weekCount"], [data-bind="weekAvg"]').forEach((b) => rollNumber(b));
  paintWeek(e.trips);
}
start();
