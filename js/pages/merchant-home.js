/* Merchant dashboard (pages/merchant-home.html): today at a glance for the branch on screen.
   Right now (online orders waiting, being prepared, ready; counter sales), Sales (one chart: Today / Week / Month),
   Mood board and, for the owner, every branch today. Selling is on POS; branches, shop and menu on Management. */
import { merchantSales, errorMessage } from '../api.js';
import { moodFor } from '../mood.js';
import { $, $$, mountChrome, esc, peso, when, icon, rollNumber } from '../ui.js';
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
  const was = $$('#nowCounts b').map((b) => b.dataset.value ?? null); // roll from what was shown
  $('#nowCounts').innerHTML = steps.map(([label, n, tab]) =>
    `<a class="nowcount${n ? ' is-on' : ''}" href="/pos?tab=${tab}#online"><b>${n}</b><span>${label}</span></a>`).join('');
  $$('#nowCounts b').forEach((b, i) => rollNumber(b, was[i] ?? null));
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

// A smooth line through the points that never overshoots them (monotone cubic), as an SVG path
function smoothPath(pts) {
  const d = pts.slice(1).map(([x1, y1], i) => (y1 - pts[i][1]) / (x1 - pts[i][0] || 1));
  const m = pts.map((_, i) => (i === 0 ? d[0] : i === pts.length - 1 ? d[i - 1] : d[i - 1] * d[i] <= 0 ? 0 : (d[i - 1] + d[i]) / 2));
  return pts.reduce((path, [x1, y1], i) => {
    if (!i) return `M${x1.toFixed(1)},${y1.toFixed(1)}`;
    const [x0, y0] = pts[i - 1];
    const h = (x1 - x0) / 3;
    return `${path} C${(x0 + h).toFixed(1)},${(y0 + (m[i - 1] || 0) * h).toFixed(1)} ${(x1 - h).toFixed(1)},${(y1 - (m[i] || 0) * h).toFixed(1)} ${x1.toFixed(1)},${y1.toFixed(1)}`;
  }, '');
}
const STAR = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 0C12.9 7.6 16.4 11.1 24 12C16.4 12.9 12.9 16.4 12 24C11.1 16.4 7.6 12.9 0 12C7.6 11.1 11.1 7.6 12 0Z"/></svg>';

/* Aurora: a glowing line from purple to gold over a soft aurora fill with a few sparkles, the period before as a
   trail of dots, and a gold star at now */
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
  const line = mine.length > 1 ? smoothPath(mine.map((v, i) => [x(i), y(v)])) : `M0,${y(mine[0] || 0)}`;
  const area = `${line} L${x(upTo).toFixed(1)},${H - 4} L0,${H - 4} Z`;
  // Sparkles in the aurora: under a few of the points, halfway down to the base
  const sparkles = mine.map((v, i) => [i, v]).filter(([i, v]) => i > 0 && i < upTo && v > 0 && i % 3 === 1).slice(0, 4)
    .map(([i, v], k) => `<span class="schart2__spark" style="left:${((x(i) / W) * 100).toFixed(2)}%;top:${(((y(v) + H - 4) / 2 / H) * 100).toFixed(2)}%;--k:${k}">${STAR}</span>`).join('');
  // A few labels along the bottom: hours, weekdays, or dates
  const every = s.range === 'day' ? 3 : s.range === 'week' ? 1 : 7;
  const ticks = s.series.map((p, i) => ((i % every === 0 || i === s.series.length - 1)
    ? `<span style="left:${((i / n) * 100).toFixed(2)}%">${esc(s.range === 'day' ? hour12(p.label) : p.label)}</span>` : '')).join('');
  return `<div class="schart2">
    <div class="schart2__plot">
      <svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" role="img" aria-label="Sales so far as a running total, with the period before as a dashed line">
        <defs>
          <linearGradient id="auroraLine" x1="0" x2="1" y1="0" y2="0"><stop offset="0" stop-color="#7b3fbf"/><stop offset=".7" stop-color="#c59af0"/><stop offset="1" stop-color="#f6c46c"/></linearGradient>
          <linearGradient id="auroraFill" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stop-color="#c59af0" stop-opacity=".5"/><stop offset="1" stop-color="#f1eaf8" stop-opacity="0"/></linearGradient>
          <filter id="auroraGlow" x="-10%" y="-50%" width="120%" height="200%"><feGaussianBlur stdDeviation="3.5"/></filter>
        </defs>
        <line x1="0" y1="${H - 4}" x2="${W}" y2="${H - 4}" class="schart2__base"/>
        <polyline points="${pts(s.compare)}" class="schart2__before"/>
        <path d="${area}" class="schart2__area"/>
        <path d="${line}" class="schart2__glow"/>
        <path d="${line}" class="schart2__line"/>
      </svg>${sparkles}
      <span class="schart2__now" style="left:${((upTo / n) * 100).toFixed(2)}%;top:${((y(mine[upTo]) / H) * 100).toFixed(2)}%"><i></i>${STAR}<b>Now</b></span>
    </div>
    <div class="schart2__ticks" aria-hidden="true">${ticks}</div>
    <div class="schart2__key"><span><i class="is-mine"></i>${s.range === 'day' ? 'Today' : s.range === 'week' ? 'This week' : 'This month'}</span><span><i class="is-before"></i>${s.range === 'day' ? 'Yesterday' : s.range === 'week' ? 'Last week' : 'Last month'}</span></div>
  </div>`;
}

async function renderSales() {
  const id = home.branch.id;
  $$('#salesRange [data-range]').forEach((b) => b.setAttribute('aria-selected', String(b.dataset.range === range)));
  const was = $('.sales__value') ? $('.sales__value').dataset.value ?? null : null; // switching period: roll from it
  try {
    const s = await merchantSales({ range, branchId: id });
    const r = RANGES[range];
    const change = s.previous ? Math.round(((s.total - s.previous) / s.previous) * 100) : null;
    const delta = change === null ? `<span class="sales__delta">${r.none}</span>`
      : `<span class="sales__delta ${change < 0 ? 'is-down' : 'is-up'}">${icon(change < 0 ? 'i-trend-down' : 'i-trend-up')}${Math.abs(change)}% ${change < 0 ? 'below' : 'above'} ${r.vs}</span>`;
    $('#sales').innerHTML = `<div class="sales__head"><b class="sales__value">${peso(s.total)}</b>${delta}</div>
      ${salesChart(s)}
      <a class="quietlink" href="/pages/merchant-analytics.html?range=${range}&amp;branch=${encodeURIComponent(id)}">See all sales${icon('i-chevron')}</a>`;
    rollNumber($('.sales__value'), was);
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
