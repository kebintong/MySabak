/* Merchant dashboard (pages/merchant-home.html): today at a glance for the branch on screen.
   Right now (online orders waiting, being prepared, ready; counter sales), Preview analytics (opens Analytics),
   Mood board and, for the owner, every branch today. Selling is on POS; branches, shop and menu on Management. */
import { merchantSales, errorMessage } from '../api.js';
import { moodFor } from '../mood.js';
import { $, mountChrome, esc, peso, when } from '../ui.js';
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
    `<a class="nowcount${n ? ' is-on' : ''}" href="/pages/merchant-pos.html?tab=${tab}#online"><b>${n}</b><span>${label}</span></a>`).join('');
  const waiting = home.orders.filter((o) => o.status === 'placed').slice(0, 3);
  const counter = home.counter.reduce((n, o) => n + o.subtotal, 0);
  $('#nowList').innerHTML = (waiting.length
    ? waiting.map((o) => `<li><span><b>${esc(o.customer || 'Customer')}</b> · ${o.lines.reduce((n, l) => n + l.qty, 0)} items · ${esc(ago(o.placedAt))}</span><b>${peso(o.subtotal)}</b></li>`).join('')
    : '<li class="empty">No orders waiting for you.</li>')
    + `<li class="nowlist__counter"><span>Counter sales today · ${home.counter.length}</span><b>${peso(counter)}</b></li>`;
}

/* ---------- Preview analytics: today, this week, this month ---------- */
const RANGES = [
  { id: 'day', label: 'Daily sales', vs: 'vs yesterday by now', go: 'See today' },
  { id: 'week', label: 'Weekly sales', vs: 'vs last week', go: 'See this week' },
  { id: 'month', label: 'Monthly sales', vs: 'vs last month', go: 'See this month' },
];
function spark(series) {
  const v = series.map((p) => p.value);
  const max = Math.max(...v, 1);
  const pts = v.map((n, i) => `${v.length > 1 ? Math.round((i / (v.length - 1)) * 70) + 1 : 36},${Math.round(31 - (n / max) * 28)}`).join(' ');
  return `<svg class="ptile__spark" viewBox="0 0 72 34" aria-hidden="true"><polyline points="${pts}"/></svg>`;
}
async function renderPreview() {
  const id = home.branch.id;
  try {
    const all = await Promise.all(RANGES.map((r) => merchantSales({ range: r.id, branchId: id })));
    $('#previewTiles').innerHTML = all.map((s, i) => {
      const r = RANGES[i];
      const change = s.previous ? Math.round(((s.total - s.previous) / s.previous) * 100) : null;
      return `<a class="ptile" href="/pages/merchant-analytics.html?range=${r.id}&amp;branch=${encodeURIComponent(id)}">
        <span class="ptile__text"><span class="ptile__label">${r.label}</span><span class="ptile__value">${peso(s.total)}</span>
        ${change === null ? '<span class="ptile__delta">No earlier sales yet</span>'
    : `<span class="ptile__delta${change < 0 ? ' is-down' : ''}">${change < 0 ? '▼' : '▲'} ${Math.abs(change)}% ${r.vs}</span>`}
        <span class="ptile__go">${r.go} →</span></span>${spark(s.series)}</a>`;
    }).join('');
  } catch (err) { $('#previewTiles').innerHTML = `<p class="empty">${esc(errorMessage(err))}</p>`; }
}

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

/* ---------- Owner: every branch today ---------- */
function renderBranches() {
  const card = $('#branchesToday');
  card.hidden = home.role !== 'owner';
  if (card.hidden) return;
  const state = (b) => (b.account.status === 'invited' ? ['Setup', ' is-off'] : b.account.status === 'disabled' ? ['Off', ' is-off'] : b.open ? ['Open', ''] : ['Closed', ' is-off']);
  $('#branchGlance').innerHTML = home.branches.map((b) => {
    const [label, off] = state(b);
    const onScreen = b.id === home.branch.id;
    return `<li class="bglance__row${onScreen ? ' is-on' : ''}">
      <span class="bglance__name"><b>${esc(b.name)}</b>${b.main ? ' <small>Main</small>' : ''}<span>${esc(b.area)}</span></span>
      <span class="branch__state${off}">${label}</span>
      <span class="bglance__num"><b>${peso(b.todaySales)}</b><span>${b.todayOrders} order${b.todayOrders === 1 ? '' : 's'}</span></span>
      ${onScreen ? '<span class="badge">On screen</span>' : `<button type="button" class="button button--ghost mbtn" data-view="${b.main ? '' : esc(b.id)}">View</button>`}
    </li>`;
  }).join('');
}

const head = mountHead({ onChange: reload });

async function reload() {
  home = await loadHome();
  if (!home) return;
  $('#dashboard').hidden = false;
  head(home);
  renderNow();
  renderPreview();
  renderMood();
  renderBranches();
}

reload();
