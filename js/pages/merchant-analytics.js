/* Merchant sales (pages/merchant-analytics.html?range=day|week|month&branch=…): totals, a chart, top items and
   cancelled orders for today, the last 7 days or this month. The owner picks a branch or All branches;
   a branch account sees its own branch. The dashboard's Preview analytics tiles open this page. */
import { merchantSales, errorMessage } from '../api.js';
import { $, mountChrome, esc, peso, toast } from '../ui.js';

mountChrome({ roles: ['merchant'] });

const params = new URLSearchParams(location.search);
const RANGES = {
  day: { title: 'Daily sales', sub: 'Today so far', vs: 'vs yesterday by now', chart: 'Sales by hour' },
  week: { title: 'Weekly sales', sub: 'The last 7 days', vs: 'vs the 7 days before', chart: 'Sales by day' },
  month: { title: 'Monthly sales', sub: new Date().toLocaleDateString('en-PH', { month: 'long', year: 'numeric' }), vs: 'vs the same days last month', chart: 'Sales by day' },
};
let range = RANGES[params.get('range')] ? params.get('range') : 'day';
let branch = params.get('branch') || 'all';

const change = (now, before) => {
  if (!before) return '';
  const pct = Math.round(((now - before) / before) * 100);
  return `<i class="${pct < 0 ? 'is-down' : ''}">${pct < 0 ? '▼' : '▲'} ${Math.abs(pct)}% ${RANGES[range].vs}</i>`;
};
const stat = (label, value, extra = '') => `<div class="sstat"><span>${label}</span><b>${value}</b>${extra}</div>`;

function render(s) {
  const r = RANGES[range];
  document.title = `${r.title} · mysabak`;
  $('#salesTitle').textContent = r.title;
  const name = s.branches ? (s.branches.find((b) => b.id === s.branchId) || { name: 'All branches' }).name : '';
  $('#salesSub').textContent = `${r.sub}${s.branches ? ` · ${s.branchId === 'all' ? 'All branches' : `${name} branch`}` : ''}`;
  $('#rangeTabs').querySelectorAll('[data-range]').forEach((b) => b.setAttribute('aria-selected', String(b.dataset.range === range)));

  const wrap = $('#branchWrap');
  wrap.hidden = !s.branches;
  if (s.branches) {
    $('#branchSelect').innerHTML = [{ id: 'all', name: 'All branches' }, ...s.branches]
      .map((b) => `<option value="${esc(b.id)}"${b.id === s.branchId ? ' selected' : ''}>${esc(b.id === 'all' ? b.name : `${b.name} branch`)}</option>`).join('');
  }

  const split = s.channels.online + s.channels.counter ? `<small>Online ${peso(s.channels.online)} · Counter ${peso(s.channels.counter)}</small>` : '';
  $('#stats').innerHTML = stat('Sales', peso(s.total), change(s.total, s.previous) + (range === 'day' ? split : ''))
    + stat('Orders', s.orders.toLocaleString('en-PH'))
    + stat('Average order', peso(s.average))
    + stat('Cancelled', s.cancelled.toLocaleString('en-PH'), s.cancelled ? `<i class="is-down">${peso(s.cancelledAmount)} not earned</i>` : '');

  $('#chartTitle').textContent = r.chart;
  const max = Math.max(...s.series.map((p) => p.value), 1);
  const chart = $('#chart');
  chart.style.setProperty('--n', s.series.length);
  chart.setAttribute('aria-label', `${r.chart}: ${s.series.map((p) => `${p.label} ${peso(p.value)}`).join(', ')}`);
  chart.innerHTML = s.series.map((p, i) => `<div class="schart__col${p.now ? ' is-now' : ''}" style="--h:${Math.max(3, (p.value / max) * 100)}%;--i:${i}" title="${esc(p.label)}: ${peso(p.value)}">
      <span class="schart__plot"><span class="schart__bar"></span></span><span class="schart__label">${range === 'month' && i % 5 && !p.now ? '' : esc(p.label)}</span></div>`).join('');
  $('#sampleNote').hidden = !s.sampleHistory;

  $('#topList').innerHTML = s.top.length
    ? s.top.map((t) => `<li><span>${esc(t.name)} <small>· ${t.qty} sold</small></span><b>${peso(t.sales)}</b></li>`).join('')
    : '<li class="empty">No orders in this period yet.</li>';
  $('#cancelList').innerHTML = s.cancelledList.length
    ? s.cancelledList.map((c) => `<li><span>${esc(c.customer)} <small>· ${esc(c.id)}</small></span><b>${peso(c.amount)}</b></li>`).join('')
    : `<li class="empty">${s.cancelled ? 'Only sample cancellations in this period.' : 'No cancelled orders. Nice!'}</li>`;
}

async function load() {
  try {
    const s = await merchantSales({ range, branchId: branch });
    branch = s.branchId;
    history.replaceState(null, '', `?range=${range}&branch=${encodeURIComponent(branch)}`);
    $('#sales').hidden = false;
    render(s);
  } catch (err) {
    if (err.status === 401) { location.replace('/pages/merchant.html'); return; }
    if (err.status === 404 && branch !== 'all') { branch = 'all'; load(); return; } // that branch is gone
    toast(errorMessage(err));
  }
}

$('#rangeTabs').addEventListener('click', (e) => {
  const b = e.target.closest('[data-range]');
  if (!b || b.dataset.range === range) return;
  range = b.dataset.range;
  load();
});
$('#branchSelect').addEventListener('change', (e) => { branch = e.target.value; load(); });

load();
