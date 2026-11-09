/* Merchant dashboard (pages/merchant-home.html): today at a glance for the branch on screen.
   Right now (online orders waiting, being prepared, ready; counter sales), Sales (one chart: Today / Week / Month),
   Mood board and, for the owner, every branch today. Selling is on POS; branches, shop and menu on Management. */
import { merchantSales, errorMessage } from '../api.js';
import { moodFor } from '../mood.js';
import { $, $$, mountChrome, esc, peso, when, icon } from '../ui.js';
import { loadHome, mountHead } from './merchant-common.js';

mountChrome({ roles: ['merchant'] });

let home = null;

const ago = (ts) => {
  const min = Math.round((Date.now() - ts) / 60000);
  if (min < 1) return 'Just now';
  if (min < 60) return `${min} min ago`;
  return when(ts);
};

/* ---------- Right now: online orders by step, the newest waiting ones ---------- */
function renderNow() {
  const count = (statuses) => home.orders.filter((o) => statuses.includes(o.status)).length;
  const steps = [['New', count(['placed']), 'new'], ['Preparing', count(['accepted', 'preparing']), 'cooking'], ['Ready', count(['ready']), 'ready']];
  $('#nowCounts').innerHTML = steps.map(([label, n, tab]) =>
    `<a class="nowcount${n ? ' is-on' : ''}" href="/pos?tab=${tab}#online"><b>${n}</b><span>${label}</span></a>`).join('');
  const waiting = home.orders.filter((o) => o.status === 'placed').slice(0, 3);
  const counter = home.counter.reduce((n, o) => n + o.subtotal, 0);
  $('#nowList').innerHTML = (waiting.length
    ? waiting.map((o) => `<li><span><b>${esc(o.customer || 'Customer')}</b> · ${o.lines.reduce((n, l) => n + l.qty, 0)} items · ${esc(ago(o.placedAt))}</span><b>${peso(o.subtotal)}</b></li>`).join('')
    : '<li class="empty">No orders waiting for you.</li>')
    + `<li class="nowlist__counter"><span>Counter sales today</span><b>${home.counter.length} · ${peso(counter)}</b></li>`;
}

/* ---------- Sales: one chart, Today / Week / Month ---------- */
// The chart is a running total, so its last point is the big number above it; the dashed line is the period before
const RANGES = {
  day: { vs: 'yesterday at this hour', none: 'No sales yesterday to compare' },
  week: { vs: 'last week', none: 'No sales last week to compare' },
  month: { vs: 'the same days last month', none: 'No sales last month to compare' },
};
let range = 'day';
const hour12 = (label) => label.replace(/(\d+)([ap])$/, (_, h, ap) => `${h} ${ap === 'a' ? 'AM' : 'PM'}`);

function salesChart(s) {
  const W = 300;
  const H = 120;
  let run = 0;
  const totals = s.series.map((p) => (run += p.value));
  const nowAt = Math.max(0, s.series.findIndex((p) => p.now));
  const upTo = s.range === 'day' ? (s.series.some((p) => p.now) ? nowAt : totals.length - 1) : totals.length - 1;
  const mine = totals.slice(0, upTo + 1);
  const max = Math.max(...mine, ...s.compare, 1);
  const n = Math.max(1, s.series.length - 1);
  const x = (i) => (i / n) * W;
  const y = (v) => H - 4 - (v / max) * (H - 14);
  const pts = (arr) => arr.map((v, i) => `${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(' ');
  const area = `M0,${H - 4} L${pts(mine).split(' ').join(' L')} L${x(upTo).toFixed(1)},${H - 4} Z`;
  // A few labels along the bottom: hours, weekdays, or dates
  const every = s.range === 'day' ? 3 : s.range === 'week' ? 1 : 7;
  const ticks = s.series.map((p, i) => ((i % every === 0 || i === s.series.length - 1)
    ? `<span style="left:${((i / n) * 100).toFixed(2)}%">${esc(s.range === 'day' ? hour12(p.label) : p.label)}</span>` : '')).join('');
  return `<div class="schart2">
    <div class="schart2__plot">
      <svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" role="img" aria-label="Sales so far as a running total, with the period before as a dashed line">
        <line x1="0" y1="${H - 4}" x2="${W}" y2="${H - 4}" class="schart2__base"/>
        <polyline points="${pts(s.compare)}" class="schart2__before"/>
        <path d="${area}" class="schart2__area"/>
        <polyline points="${pts(mine)}" class="schart2__line"/>
      </svg>
      <span class="schart2__now" style="left:${((upTo / n) * 100).toFixed(2)}%;top:${((y(mine[upTo]) / H) * 100).toFixed(2)}%"><i></i><b>Now</b></span>
    </div>
    <div class="schart2__ticks" aria-hidden="true">${ticks}</div>
    <div class="schart2__key"><span><i class="is-mine"></i>${s.range === 'day' ? 'Today' : s.range === 'week' ? 'This week' : 'This month'}</span><span><i class="is-before"></i>${s.range === 'day' ? 'Yesterday' : s.range === 'week' ? 'Last week' : 'Last month'}</span></div>
  </div>`;
}

async function renderSales() {
  const id = home.branch.id;
  $$('#salesRange [data-range]').forEach((b) => b.setAttribute('aria-selected', String(b.dataset.range === range)));
  try {
    const s = await merchantSales({ range, branchId: id });
    const r = RANGES[range];
    const change = s.previous ? Math.round(((s.total - s.previous) / s.previous) * 100) : null;
    const delta = change === null ? `<span class="sales__delta">${r.none}</span>`
      : `<span class="sales__delta ${change < 0 ? 'is-down' : 'is-up'}">${icon(change < 0 ? 'i-trend-down' : 'i-trend-up')}${Math.abs(change)}% ${change < 0 ? 'below' : 'above'} ${r.vs}</span>`;
    $('#sales').innerHTML = `<div class="sales__head"><b class="sales__value">${peso(s.total)}</b>${delta}</div>
      ${salesChart(s)}
      <a class="quietlink" href="/pages/merchant-analytics.html?range=${range}&amp;branch=${encodeURIComponent(id)}">See all sales${icon('i-chevron')}</a>`;
  } catch (err) { $('#sales').innerHTML = `<p class="empty">${esc(errorMessage(err))}</p>`; }
}
$('#salesRange').addEventListener('click', (e) => {
  const b = e.target.closest('[data-range]');
  if (!b || b.dataset.range === range) return;
  range = b.dataset.range;
  renderSales();
});

function renderMood() {
  const m = moodFor({
    open: home.open, orders: home.today.orders, sales: home.today.sales, usual: home.usual,
    opensAt: home.shop.opensAt, closesAt: home.shop.closesAt,
  });
  $('#mood').className = `mood mood--${m.kind}`;
  $('#mood').innerHTML = `<span class="mood__emoji" aria-hidden="true">${m.emoji}</span>
    <p class="mood__title">${esc(m.title)}</p><p class="mood__text">${esc(m.text)}</p>
    <p class="mood__nums">${home.today.orders} order${home.today.orders === 1 ? '' : 's'} · ${peso(home.today.sales)} today</p>`;
}

/* ---------- Owner: every branch today, a row each; tap a row to view that branch ---------- */
function renderBranches() {
  const card = $('#branchesToday');
  card.hidden = home.role !== 'owner';
  if (card.hidden) return;
  $('#branchCount').textContent = `${home.branches.length} branch${home.branches.length === 1 ? '' : 'es'}`;
  // Its state in words, coloured: open until its closing time, closed, or turned off
  const state = (b) => {
    if (b.account.status === 'disabled') return '<span class="bglance__state">Account off</span>';
    if (!b.open) return '<span class="bglance__state">Closed</span>';
    const until = String(b.hours || '').split('–')[1];
    return `<span class="bglance__state is-open">Open${until ? ` until ${esc(until.trim())}` : ''}</span>`;
  };
  $('#branchGlance').innerHTML = home.branches.map((b) => {
    const onScreen = b.id === home.branch.id;
    const inner = `<span class="bglance__name"><span class="bglance__line"><b>${esc(b.name)}</b>${b.main ? '<small>Main</small>' : ''}${onScreen ? '<em>Viewing</em>' : ''}</span>
        <span class="bglance__where">${b.area !== b.name ? `${esc(b.area)} · ` : ''}${state(b)}</span></span>
      <span class="bglance__num"><b>${peso(b.todaySales)}</b><span>${b.todayOrders} order${b.todayOrders === 1 ? '' : 's'}</span></span>`;
    return `<li>${onScreen ? `<div class="bglance__row is-on">${inner}</div>`
      : `<button type="button" class="bglance__row" data-view="${b.main ? '' : esc(b.id)}" aria-label="View ${esc(b.name)}">${inner}${icon('i-chevron', 'bglance__go')}</button>`}</li>`;
  }).join('');
}

const head = mountHead({ onChange: reload });

async function reload() {
  home = await loadHome();
  if (!home) return;
  $('#dashboard').hidden = false;
  head(home);
  renderNow();
  renderSales();
  renderMood();
  renderBranches();
}

reload();
