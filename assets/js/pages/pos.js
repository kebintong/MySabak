/* POS (pages/pos.html), for merchants. Four tabs:
   Counter: walk-in sales. Tap a product to add it, change the size in the sale, pick how they pay, Charge.
            Each sale uses up ingredients by recipe.
   Stock:   what you have (All / Needs restock / Out), − and + for small fixes, Restock · Used · Waste · Count,
            stock count, shopping list, add ingredient.
   Recipes: what one order of each product uses, food cost, how many you can still make.
   History: every stock change, exportable as CSV. */
import {
  merchantInventory, saveIngredient, deleteIngredient, adjustStock, saveCount, saveRecipe, recordSale, itemVariants, errorMessage,
} from '../api.js';
import { $, $$, mountChrome, esc, peso, when, toast, icon, params } from '../ui.js';
import {
  productPic, slidePill, flash, qty, stockState, stockFill, wireSheet, reduceMotion,
} from '../merchant-ui.js';

mountChrome({ roles: ['merchant'] });

const TAB_IDS = ['counter', 'stock', 'recipes', 'history'];
const hashTab = () => { const h = location.hash.slice(1); return h === 'sell' ? 'counter' : TAB_IDS.includes(h) ? h : 'counter'; };
const UNITS = ['kg', 'g', 'L', 'ml', 'pc', 'pack', 'can', 'bundle', 'bottle'];
const KIND = {
  restock: { label: 'Restocked', mark: '+', ask: 'How much did you buy?', save: 'Add to stock' },
  use: { label: 'Used', mark: '−', ask: 'How much was used?', save: 'Take out of stock' },
  waste: { label: 'Wasted', mark: '−', ask: 'How much spoiled or was thrown away?', save: 'Record waste' },
  count: { label: 'Counted', mark: '✓', ask: 'How much do you have right now?', save: 'Save count' },
  sale: { label: 'Counter sale', mark: '₱' },
  order: { label: 'Online order', mark: '#' },
  new: { label: 'Added', mark: '+' },
};
const LOG_FILTERS = [
  { id: 'all', label: 'All' }, { id: 'sale', label: 'Sales', kinds: ['sale', 'order'] }, { id: 'restock', label: 'Restocks', kinds: ['restock', 'new'] },
  { id: 'waste', label: 'Waste & use', kinds: ['waste', 'use'] }, { id: 'count', label: 'Counts', kinds: ['count'] },
];
const PAY = [['cash', 'Cash'], ['gcash', 'GCash'], ['maya', 'Maya'], ['card', 'Card']];

let data = null;
let tab = hashTab();
// Counter
let sellSection = 'All';
let sellSearch = '';
let cart = []; // [{ id, variant, qty }]
let orderType = 'dine-in';
let pay = 'cash';
let paid = null; // cash received, or null
let senior = false;
let done = null; // the last finished sale, shown until "New sale"
let saleNo = 1;
// Stock
let invFilter = 'need';
let invSearch = '';
let counting = false;
let counts = {};
// History
let logFilter = 'all';

const pesoC = (n) => `₱${(Math.round(n * 100) / 100).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const ing = (id) => data.ingredients.find((i) => i.id === id);
const item = (id) => data.shop.menu.find((i) => i.id === id);
const num = (v) => Number(String(v).replace(/[₱,\s]/g, ''));
const go = (el, block = 'center') => el && el.scrollIntoView({ behavior: reduceMotion() ? 'auto' : 'smooth', block });
const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;

/* ---------- Tabs ---------- */

function setTab(id, { push = true } = {}) {
  tab = id;
  $$('#posTabs [data-tab]').forEach((b) => b.setAttribute('aria-selected', String(b.dataset.tab === id)));
  $$('[data-panel]').forEach((p) => {
    const on = p.dataset.panel === id;
    if (on && p.hidden) { p.hidden = false; flash(p, 'is-in'); } else p.hidden = !on;
  });
  if (push) history.replaceState(null, '', `${location.pathname}#${id}`);
  requestAnimationFrame(() => { slidePill($('#posTabs')); renderCartBar(); });
}

/* =========================================================
   COUNTER
   ========================================================= */

const variantsOf = (it) => itemVariants(it);
function linePrice(l) {
  const it = item(l.id);
  if (!it) return 0;
  const v = variantsOf(it).find((x) => x.name === l.variant);
  return v ? v.price : it.price;
}
const liveLines = () => cart.filter((l) => item(l.id));
const subtotal = () => liveLines().reduce((n, l) => n + linePrice(l) * l.qty, 0);
const discount = () => (senior ? Math.round(subtotal() * 0.2) : 0);
const total = () => subtotal() - discount();

function renderCounter() {
  const menu = data.shop.menu;
  const sections = [...new Set(menu.map((i) => i.section).filter(Boolean))];
  if (sellSection !== 'All' && !sections.includes(sellSection)) sellSection = 'All';
  $('#sellFilter').innerHTML = ['All', ...sections].map((s) => `<button type="button" class="fchip2" data-sell-section="${esc(s)}" aria-pressed="${s === sellSection}">${esc(s)}</button>`).join('');
  const text = sellSearch.trim().toLowerCase();
  const shown = menu.filter((i) => (sellSection === 'All' || i.section === sellSection) && (!text || i.name.toLowerCase().includes(text)));
  $('#sellTiles').innerHTML = shown.length ? shown.map((i, n) => {
    const off = data.available[i.id] === false;
    const can = data.canMake[i.id];
    const out = !off && can === 0;
    const inCart = cart.filter((l) => l.id === i.id).reduce((s, l) => s + l.qty, 0);
    const vs = variantsOf(i);
    const tone = can === null ? '' : can <= 0 ? 'bad' : can <= 5 ? 'warn' : 'ok';
    return `<li style="--i:${n}"><button type="button" class="ctile${inCart ? ' is-in' : ''}${off || out ? ' is-off' : ''}" data-sell="${esc(i.id)}" aria-label="Add ${esc(i.name)}"${off || out ? ' aria-disabled="true"' : ''}>
      <span class="ctile__pic">${productPic(i, data.shop.color)}${inCart ? `<span class="ctile__n">${inCart}</span>` : ''}${off || out ? `<span class="ctile__off">${off ? 'Sold out' : 'Out of ingredients'}</span>` : ''}</span>
      <span class="ctile__body"><b>${esc(i.name)}</b>
        <span class="ctile__row"><b class="ctile__price">${vs.length > 1 ? '<small>from</small> ' : ''}${peso(i.price)}</b>${can === null ? '' : `<span class="ctile__can is-${tone}">${can <= 0 ? 'Out' : `${can} left`}</span>`}</span></span>
    </button></li>`;
  }).join('') : `<li class="fempty">${icon('i-search', 'icon--xl')}<b>No product matches</b></li>`;
  renderCart();
}

function renderCart() {
  const box = $('#cart');
  if (done) {
    box.innerHTML = `<div class="saledone2">
      <svg class="saledone2__check" viewBox="0 0 52 52" aria-hidden="true"><circle cx="26" cy="26" r="24"/><path d="M15 27l7 7 15-16"/></svg>
      <b class="saledone2__title">${esc(done.id)} done</b>
      <span class="saledone2__sub">${peso(done.total)} · ${esc(done.payLabel)}${done.discount ? ` · Senior/PWD −${peso(done.discount)}` : ''}</span>
      ${done.change !== null && done.change !== undefined ? `<div class="saledone2__change"><span>Give change</span><b>${peso(done.change)}</b></div>` : ''}
      <span class="saledone2__note">Stock updated by recipe.</span>
      <button type="button" class="fbtn fbtn--primary fbtn--block fbtn--lg" id="newSale">New sale</button>
    </div>`;
    renderCartBar();
    return;
  }
  const lines = liveLines();
  const t = total();
  const quick = [t, ...[100, 200, 500, 1000].filter((n) => n > t)].filter((n, i, a) => a.indexOf(n) === i).slice(0, 4);
  const short = paid !== null && paid < t;
  box.innerHTML = `
    <div class="cart2__head"><b>Sale #${saleNo}</b>
      <div class="fseg fseg--sm" role="tablist" aria-label="Order type" id="typeSeg">
        <button type="button" class="fseg__btn" role="tab" data-type="dine-in" aria-selected="${orderType === 'dine-in'}">Dine-in</button>
        <button type="button" class="fseg__btn" role="tab" data-type="take-out" aria-selected="${orderType === 'take-out'}">Take-out</button>
      </div>
    </div>
    ${lines.length ? `<ul class="cart2__lines">${lines.map((l) => {
    const it = item(l.id);
    const vs = variantsOf(it);
    const key = `${l.id}|${l.variant || ''}`;
    return `<li class="cline2" data-key="${esc(key)}">
        <div class="cline2__top"><span class="cline2__pic">${productPic(it, data.shop.color)}</span>
          <span class="cline2__name"><b>${esc(it.name)}</b><small>${l.variant ? `${esc(l.variant)} · ` : ''}${peso(linePrice(l))} each</small></span>
          <b class="cline2__sum">${peso(linePrice(l) * l.qty)}</b></div>
        <div class="cline2__bottom">
          ${vs.length > 1 ? `<span class="sizepills" role="group" aria-label="Size">${vs.map((v) => `<button type="button" class="sizepill" data-size="${esc(v.name)}" aria-pressed="${v.name === l.variant}">${esc(v.name)}</button>`).join('')}</span>` : '<span></span>'}
          <span class="stepper2"><button type="button" data-dec aria-label="One less">−</button><b>${l.qty}</b><button type="button" data-inc aria-label="One more">+</button></span>
        </div></li>`;
  }).join('')}</ul>
    <button type="button" class="senior${senior ? ' is-on' : ''}" id="seniorBtn" aria-pressed="${senior}"><span>Senior / PWD 20% off</span><b>${senior ? `−${peso(discount())}` : 'Off'}</b></button>
    <div class="cart2__total"><span>Total</span><b>${peso(t)}</b></div>
    <div class="paygrid" role="radiogroup" aria-label="Payment">${PAY.map(([id, label]) => `<button type="button" class="payopt" role="radio" data-pay="${id}" aria-checked="${pay === id}">${label}</button>`).join('')}</div>
    ${pay === 'cash' ? `<div class="cashbox">
      <span class="cashbox__label">Cash received</span>
      <div class="cashgrid">${quick.map((n) => `<button type="button" class="cashopt" data-cash="${n}" aria-pressed="${paid === n}">${n === t ? 'Exact' : peso(n)}</button>`).join('')}</div>
      <label class="cashbox__other"><span>Other amount</span><span class="money-input"><span>₱</span><input class="input" id="cashIn" inputmode="decimal" placeholder="0" value="${paid !== null && !quick.includes(paid) ? paid : ''}"></span></label>
      ${paid !== null ? `<div class="change2${short ? ' is-short' : ''}"><span>${short ? 'Still needed' : 'Give change'}</span><b>${peso(Math.abs(paid - t))}</b></div>` : ''}
    </div>` : `<p class="paynote">${pay === 'card' ? 'Tap or insert the card on your terminal, then press Charge.' : `Show your ${pay === 'gcash' ? 'GCash' : 'Maya'} QR. Press Charge after you see their payment.`}</p>`}
    <button type="button" class="fbtn fbtn--primary fbtn--block fbtn--lg charge2" id="chargeBtn"${short ? ' disabled' : ''}>Charge ${peso(t)}</button>
    <button type="button" class="fbtn fbtn--quiet fbtn--block" id="cartClear">Clear sale</button>`
    : `<div class="fempty fempty--cart">${icon('i-register', 'icon--xl')}<b>Tap a product to start</b><span>Sizes and payment come after.</span></div>`}`;
  requestAnimationFrame(() => slidePill($('#typeSeg')));
  renderCartBar();
}

function renderCartBar() {
  const n = cart.reduce((s, l) => s + l.qty, 0);
  $('#cartBar').hidden = tab !== 'counter' || !n || Boolean(done);
  $('#cartBarCount').textContent = `${plural(n, 'item')} · ${PAY.find((p) => p[0] === pay)[1]}`;
  $('#cartBarTotal').textContent = peso(total());
  const ids = [...new Set(cart.map((l) => l.id))].slice(0, 3);
  $('#cartBarPics').innerHTML = ids.map((id) => `<span>${item(id) ? productPic(item(id), data.shop.color) : ''}</span>`).join('');
}

function addToCart(id) {
  const it = item(id);
  const vs = variantsOf(it);
  const variant = vs.length ? vs[0].name : null;
  const line = cart.find((l) => l.id === id && l.variant === variant);
  if (line) line.qty = Math.min(99, line.qty + 1); else cart.push({ id, variant, qty: 1 });
  done = null;
  paid = null;
  renderCounter();
  flash($(`.cline2[data-key="${CSS.escape(`${id}|${variant || ''}`)}"]`), 'is-added');
  flash($('#cartBar'), 'is-bump');
}

$('#sellTiles').addEventListener('click', (e) => {
  const b = e.target.closest('[data-sell]');
  if (!b) return;
  if (b.getAttribute('aria-disabled') === 'true') {
    toast(data.available[b.dataset.sell] === false ? 'Sold out. Switch it back on in My shop.' : 'Out of ingredients. Restock it in Stock.');
    return;
  }
  flash(b, 'is-tapped');
  addToCart(b.dataset.sell);
});

$('#cart').addEventListener('click', async (e) => {
  if (e.target.closest('#newSale')) { done = null; renderCounter(); go($('.counter__menu'), 'start'); return; }
  if (e.target.closest('#cartClear')) { cart = []; paid = null; senior = false; renderCounter(); return; }
  if (e.target.closest('#seniorBtn')) { senior = !senior; paid = null; renderCart(); return; }
  const type = e.target.closest('[data-type]');
  if (type) { orderType = type.dataset.type; renderCart(); return; }
  const p = e.target.closest('[data-pay]');
  if (p) { pay = p.dataset.pay; renderCart(); return; }
  const c = e.target.closest('[data-cash]');
  if (c) { paid = Number(c.dataset.cash); renderCart(); flash($('.change2'), 'is-bump'); return; }
  const li = e.target.closest('.cline2');
  if (li) {
    const line = cart.find((l) => `${l.id}|${l.variant || ''}` === li.dataset.key);
    const size = e.target.closest('[data-size]');
    if (size && line) {
      const other = cart.find((l) => l !== line && l.id === line.id && l.variant === size.dataset.size);
      if (other) { other.qty += line.qty; line.qty = 0; } else line.variant = size.dataset.size;
    } else if (e.target.closest('[data-inc]') && line) line.qty = Math.min(99, line.qty + 1);
    else if (e.target.closest('[data-dec]') && line) line.qty -= 1;
    else return;
    cart = cart.filter((l) => l.qty > 0);
    paid = null;
    renderCounter();
    return;
  }
  if (e.target.closest('#chargeBtn')) charge(e.target.closest('#chargeBtn'));
});

$('#cart').addEventListener('input', (e) => {
  if (e.target.id !== 'cashIn') return;
  const v = num(e.target.value);
  paid = e.target.value === '' || !Number.isFinite(v) ? null : v;
  const t = total();
  let box = $('.change2');
  if (paid === null) { if (box) box.remove(); } else {
    if (!box) { e.target.closest('.cashbox').insertAdjacentHTML('beforeend', '<div class="change2"><span></span><b></b></div>'); box = $('.change2'); }
    box.classList.toggle('is-short', paid < t);
    $('span', box).textContent = paid < t ? 'Still needed' : 'Give change';
    $('b', box).textContent = peso(Math.abs(paid - t));
  }
  $$('.cashopt').forEach((b) => b.setAttribute('aria-pressed', 'false'));
  $('#chargeBtn').disabled = paid !== null && paid < t;
});

async function charge(btn) {
  btn.disabled = true;
  try {
    const sale = await recordSale({
      lines: liveLines(), payment: pay, received: pay === 'cash' && paid !== null ? paid : undefined,
      discount: senior ? 'senior' : null, type: orderType,
    });
    done = { ...sale, payLabel: PAY.find((p) => p[0] === pay)[1] };
    cart = []; paid = null; senior = false; saleNo += 1;
    await reload();
    if (window.matchMedia('(max-width: 999.98px)').matches) go($('#cart'));
  } catch (err) { toast(err.status === 400 ? err.message : errorMessage(err)); btn.disabled = false; }
}

$('#cartBar').addEventListener('click', () => go($('#cart'), 'start'));
// Phones: hide the sale bar while the sale itself is on screen
if ('IntersectionObserver' in window) {
  new IntersectionObserver(([en]) => $('#cartBar').classList.toggle('is-away', en.isIntersecting), { threshold: 0.25 }).observe($('#cart'));
}
$('#sellFilter').addEventListener('click', (e) => { const b = e.target.closest('[data-sell-section]'); if (b) { sellSection = b.dataset.sellSection; renderCounter(); } });
$('#sellSearch').addEventListener('input', (e) => { sellSearch = e.target.value; renderCounter(); });

/* =========================================================
   STOCK
   ========================================================= */

function renderStock() {
  const list = data.ingredients;
  const need = list.filter((i) => stockState(i) !== 'ok').length;
  const out = list.filter((i) => stockState(i) === 'out').length;
  $('#stockBadge').textContent = need;
  $('#stockBadge').hidden = !need;
  const F = [
    { id: 'all', name: 'All ingredients', sub: 'Everything you track', n: list.length, tone: 'all' },
    { id: 'need', name: 'Needs restock', sub: 'At or under warning level', n: need, tone: 'warn' },
    { id: 'out', name: 'Out of stock', sub: 'Nothing left', n: out, tone: 'bad' },
  ];
  $('#stockFilters').innerHTML = F.map((f) => `<button type="button" class="sfilter sfilter--${f.tone}" data-inv="${f.id}" aria-pressed="${invFilter === f.id}">
    <span class="sfilter__dot"></span><span class="sfilter__text"><b>${f.name}</b><small>${f.sub}</small></span><b class="sfilter__n">${f.n}</b></button>`).join('');

  const text = invSearch.trim().toLowerCase();
  const rank = { out: 0, low: 1, ok: 2 };
  const shown = list.filter((i) => {
    if (text && !`${i.name} ${i.group}`.toLowerCase().includes(text)) return false;
    if (counting) return true;
    if (invFilter === 'need') return stockState(i) !== 'ok';
    if (invFilter === 'out') return stockState(i) === 'out';
    return true;
  }).sort((a, b) => (counting ? 0 : rank[stockState(a)] - rank[stockState(b)]) || a.group.localeCompare(b.group) || a.name.localeCompare(b.name));

  $('#countBar').hidden = !counting;
  $('#countBtn').disabled = counting;
  updateCountProgress();
  $('#invList').classList.toggle('is-counting', counting);
  if (!shown.length) {
    $('#invList').innerHTML = `<li class="fempty"><span class="fempty__icon">${icon('i-check', 'icon--xl')}</span><b>${list.length ? (invFilter === 'all' ? 'Nothing matches' : 'Nothing to restock') : 'No ingredients yet'}</b><span>${list.length ? (invFilter === 'all' ? 'Try another word.' : 'Everything is above its warning level.') : 'Add the first one to start tracking.'}</span></li>`;
    return;
  }
  $('#invList').innerHTML = shown.map((i, n) => {
    const st = stockState(i);
    const step = ['pc', 'pack', 'can', 'bundle', 'bottle'].includes(i.unit) ? 1 : (['g', 'ml'].includes(i.unit) ? 100 : 0.5);
    return `<li class="strow is-${st}" style="--i:${Math.min(n, 12)};--fill:${stockFill(i)}%" data-ing="${esc(i.id)}">
      <button type="button" class="strow__main" data-open="${esc(i.id)}"><b>${esc(i.name)}</b><small>${esc(i.group)} · ${pesoC(i.cost)}/${esc(i.unit)}</small></button>
      <span class="strow__level"><span class="stockbar"><i></i></span><small>${st === 'out' ? 'Out of stock' : st === 'low' ? `Low · warn at ${qty(i.low)} ${esc(i.unit)}` : 'Good'}</small></span>
      <span class="strow__qty"><b data-stock>${qty(i.stock)}</b> ${esc(i.unit)}</span>
      ${counting
    ? `<span class="strow__count unit-input"><input class="input" data-count="${esc(i.id)}" inputmode="decimal" placeholder="${qty(i.stock)}" value="${counts[i.id] ?? ''}" aria-label="Counted ${esc(i.name)}"><span>${esc(i.unit)}</span></span>`
    : `<span class="strow__act">
          <button type="button" class="sq" data-step="-${step}" data-id="${esc(i.id)}" aria-label="Used ${step} ${esc(i.unit)} of ${esc(i.name)}">−</button>
          <button type="button" class="sq" data-step="${step}" data-id="${esc(i.id)}" aria-label="Added ${step} ${esc(i.unit)} of ${esc(i.name)}">+</button>
          <button type="button" class="fbtn ${st === 'ok' ? 'fbtn--ghost' : 'fbtn--primary'} fbtn--sm" data-restock="${esc(i.id)}">Restock</button>
        </span>`}
    </li>`;
  }).join('');
}

function updateCountProgress() {
  const n = Object.values(counts).filter((v) => v !== '').length;
  $('#countProgress').textContent = n ? `${n} counted` : '';
}

/** Items at or under their warning level, with how much to buy to get back to twice that level. */
function shoppingList() {
  return data.ingredients.filter((i) => stockState(i) !== 'ok').map((i) => {
    const target = Math.max(i.low * 2, i.low + 1);
    const step = ['pc', 'pack', 'can', 'bundle', 'bottle'].includes(i.unit) ? 1 : 0.5;
    const buy = Math.ceil((target - i.stock) / step) * step;
    return { ...i, buy, est: buy * i.cost };
  });
}

/* Stock sheet: Restock · Used · Waste · Count */
const stockSheet = wireSheet($('#stockSheet'));
let stockFor = null;
let stockKind = 'restock';

function quickAmounts(unit) {
  if (unit === 'pc') return [6, 12, 24, 50];
  if (['pack', 'can', 'bundle', 'bottle'].includes(unit)) return [1, 2, 5, 10];
  if (['g', 'ml'].includes(unit)) return [100, 250, 500, 1000];
  return [0.5, 1, 2, 5];
}

function openStock(id, kind = 'restock') {
  stockFor = ing(id);
  if (!stockFor) return;
  $('#stockTitle').textContent = stockFor.name;
  $('#stockSub').textContent = `${stockFor.group} · warn at ${qty(stockFor.low)} ${stockFor.unit}`;
  $('#stockUnit').textContent = stockFor.unit;
  $('#stockQty').value = '';
  $('#stockNote').value = '';
  $('#stockError').hidden = true;
  $('#stockQuick').innerHTML = quickAmounts(stockFor.unit).map((n) => `<button type="button" class="qchip" data-amt="${n}">${qty(n)} ${esc(stockFor.unit)}</button>`).join('');
  const hist = data.log.filter((l) => l.changes.some((c) => c.id === id)).slice(0, 4);
  $('#stockHist').innerHTML = hist.length ? `<p class="field__hint">Recent</p><ul>${hist.map((l) => {
    const c = l.changes.find((x) => x.id === id);
    return `<li><span>${esc((KIND[l.kind] || {}).label || l.kind)}${l.note && !l.ref ? ` · ${esc(l.note)}` : ''}</span><span class="${c.change < 0 ? 'neg' : 'pos'}">${c.change > 0 ? '+' : ''}${qty(c.change)} ${esc(c.unit)}</span><small>${esc(when(l.at))}</small></li>`;
  }).join('')}</ul>` : '';
  setStockKind(kind);
  stockSheet.showModal();
  setTimeout(() => $('#stockQty').focus(), 60);
}

function setStockKind(kind) {
  stockKind = kind;
  $$('#stockKind [data-kind]').forEach((b) => b.setAttribute('aria-selected', String(b.dataset.kind === kind)));
  $('#stockQtyLabel').textContent = KIND[kind].ask;
  $('#stockSave').textContent = KIND[kind].save;
  requestAnimationFrame(() => slidePill($('#stockKind')));
  previewStock();
}

function previewStock() {
  const i = stockFor;
  const n = num($('#stockQty').value);
  const valid = $('#stockQty').value !== '' && Number.isFinite(n) && n >= 0;
  const after = !valid ? i.stock : stockKind === 'restock' ? i.stock + n : stockKind === 'count' ? n : Math.max(0, i.stock - n);
  const fake = { ...i, stock: after };
  $('#stockNow').className = `stocknow is-${stockState(fake)}`;
  $('#stockNow').style.setProperty('--fill', `${stockFill(fake)}%`);
  $('#stockNow').innerHTML = `<div class="stocknow__nums"><span><small>Now</small><b>${qty(i.stock)}</b></span>
    <span class="stocknow__arrow${valid ? ' is-on' : ''}">${icon('i-arrow')}</span>
    <span><small>After</small><b class="${valid ? 'is-changed' : ''}">${qty(Math.round(after * 1000) / 1000)}</b></span><em>${esc(i.unit)}</em></div>
    <span class="stockbar"><i></i></span>`;
  $('#stockAfter').textContent = valid && i.cost && stockKind === 'restock' ? `About ${pesoC(n * i.cost)} worth at ${pesoC(i.cost)}/${i.unit}.`
    : valid && stockKind === 'waste' && i.cost ? `That’s about ${pesoC(Math.min(n, i.stock) * i.cost)} lost.` : '';
}

$('#stockKind').addEventListener('click', (e) => { const b = e.target.closest('[data-kind]'); if (b) setStockKind(b.dataset.kind); });
$('#stockQty').addEventListener('input', previewStock);
$('#stockQuick').addEventListener('click', (e) => {
  const b = e.target.closest('[data-amt]');
  if (!b) return;
  const cur = num($('#stockQty').value) || 0;
  $('#stockQty').value = qty(stockKind === 'count' ? Number(b.dataset.amt) : cur + Number(b.dataset.amt));
  flash($('#stockQty'), 'is-bump');
  previewStock();
});
$('#stockEdit').addEventListener('click', () => { stockSheet.close(); openIng(stockFor); });
$('#stockForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const id = stockFor.id;
  try {
    await adjustStock(id, { kind: stockKind, qty: num($('#stockQty').value), note: $('#stockNote').value });
    stockSheet.close();
    toast(`${stockFor.name}: ${KIND[stockKind].label.toLowerCase()}.`);
    await reload();
    flash($(`.strow[data-ing="${CSS.escape(id)}"]`), 'is-flash');
  } catch (err) {
    $('#stockError').textContent = err.status === 400 ? err.message : errorMessage(err);
    $('#stockError').hidden = false;
    flash($('#stockError'), 'is-shake');
  }
});

/* Ingredient sheet */
const ingSheet = wireSheet($('#ingSheet'));
const ingForm = $('#ingForm');
let ingEditing = null;

function setUnit(u) {
  $$('[data-unit]', ingForm).forEach((s) => { s.textContent = u || 'unit'; });
  $$('[data-pick-unit]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.pickUnit === u)));
}
function markGroup() { $$('[data-pick-group]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.pickGroup === ingForm.elements.group.value.trim()))); }
function openIng(i = null) {
  ingEditing = i;
  ingForm.reset();
  $('#ingError').hidden = true;
  $('#ingTitle').textContent = i ? 'Edit ingredient' : 'Add ingredient';
  $('#ingSave').textContent = i ? 'Save changes' : 'Add ingredient';
  $('#ingDelete').hidden = !i;
  $('#ingStockField').hidden = Boolean(i);
  const groups = [...new Set(data.ingredients.map((x) => x.group))].sort();
  $('#groupList').innerHTML = groups.map((g) => `<option value="${esc(g)}">`).join('');
  $('#groupChips').innerHTML = groups.map((g) => `<button type="button" class="qchip" data-pick-group="${esc(g)}">${esc(g)}</button>`).join('');
  $('#unitChips').innerHTML = UNITS.map((u) => `<button type="button" class="qchip" data-pick-unit="${u}">${u}</button>`).join('');
  ingForm.elements.name.value = i ? i.name : '';
  ingForm.elements.group.value = i ? i.group : '';
  ingForm.elements.unit.value = i ? i.unit : 'kg';
  ingForm.elements.low.value = i ? qty(i.low) : '';
  ingForm.elements.cost.value = i ? String(i.cost) : '';
  setUnit(ingForm.elements.unit.value);
  markGroup();
  ingSheet.showModal();
  if (!i) ingForm.elements.name.focus();
}
$('#groupChips').addEventListener('click', (e) => { const b = e.target.closest('[data-pick-group]'); if (b) { ingForm.elements.group.value = b.dataset.pickGroup; markGroup(); } });
$('#unitChips').addEventListener('click', (e) => { const b = e.target.closest('[data-pick-unit]'); if (b) { ingForm.elements.unit.value = b.dataset.pickUnit; setUnit(b.dataset.pickUnit); } });
ingForm.elements.unit.addEventListener('input', () => setUnit(ingForm.elements.unit.value.trim()));
ingForm.elements.group.addEventListener('input', markGroup);
ingForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  const f = ingForm.elements;
  try {
    const { ingredient } = await saveIngredient({
      id: ingEditing ? ingEditing.id : undefined, name: f.name.value, group: f.group.value, unit: f.unit.value,
      low: num(f.low.value || 0), cost: num(f.cost.value || 0), stock: num(f.stock.value || 0),
    });
    ingSheet.close();
    toast(ingEditing ? 'Ingredient saved.' : `${ingredient.name} added.`);
    invFilter = 'all';
    await reload();
    const row = $(`.strow[data-ing="${CSS.escape(ingredient.id)}"]`);
    go(row); flash(row, 'is-flash');
  } catch (err) {
    $('#ingError').textContent = [400, 409].includes(err.status) ? err.message : errorMessage(err);
    $('#ingError').hidden = false;
    flash($('#ingError'), 'is-shake');
  }
});
$('#ingDelete').addEventListener('click', async () => {
  const used = Object.entries(data.recipes).filter(([, r]) => r.lines.some((l) => l.id === ingEditing.id)).map(([id]) => (item(id) || {}).name).filter(Boolean);
  if (!window.confirm(`Delete “${ingEditing.name}”?${used.length ? ` It will be taken out of: ${used.join(', ')}.` : ''}`)) return;
  try { await deleteIngredient(ingEditing.id); ingSheet.close(); toast(`${ingEditing.name} deleted.`); await reload(); } catch (err) { toast(errorMessage(err)); }
});

/* Stock count + shopping list */
$('#countBtn').addEventListener('click', () => { counting = true; counts = {}; renderStock(); const first = $('[data-count]'); if (first) first.focus(); });
$('#countCancel').addEventListener('click', () => { counting = false; counts = {}; renderStock(); });
$('#countSave').addEventListener('click', async () => {
  const filled = Object.fromEntries(Object.entries(counts).filter(([, v]) => v !== '' && Number.isFinite(num(v))).map(([k, v]) => [k, num(v)]));
  if (!Object.keys(filled).length) { toast('Type at least one amount, or press Cancel.'); return; }
  try {
    const { changed } = await saveCount(filled);
    counting = false; counts = {};
    toast(changed ? `Count saved. ${plural(changed, 'amount')} corrected.` : 'Count saved. Everything matched.');
    await reload();
  } catch (err) { toast(errorMessage(err)); }
});
$('#invList').addEventListener('input', (e) => {
  const inp = e.target.closest('[data-count]');
  if (!inp) return;
  counts[inp.dataset.count] = inp.value;
  inp.closest('.strow').classList.toggle('is-counted', inp.value !== '');
  updateCountProgress();
});
$('#invList').addEventListener('keydown', (e) => {
  const inp = e.target.closest('[data-count]');
  if (!inp || e.key !== 'Enter') return;
  e.preventDefault();
  const all = $$('[data-count]');
  const next = all[all.indexOf(inp) + 1];
  if (next) next.focus(); else $('#countSave').focus();
});

const shopSheet = wireSheet($('#shopSheet'));
$('#shopListBtn').addEventListener('click', () => {
  const list = shoppingList();
  $('#shopList').innerHTML = list.length ? list.map((i, n) => `<li style="--i:${n}"><span><b>${esc(i.name)}</b><small>Have ${qty(i.stock)} ${esc(i.unit)} · ${esc(i.group)}</small></span>
      <span class="shoplist__buy">Buy ${qty(i.buy)} ${esc(i.unit)}<small>${i.cost ? `≈ ${peso(i.est)}` : ''}</small></span></li>`).join('')
    + `<li class="shoplist__total"><span>Estimated total</span><b>${peso(list.reduce((n, i) => n + i.est, 0))}</b></li>`
    : `<li class="fempty">${icon('i-check', 'icon--xl')}<b>Nothing to buy</b><span>Everything is above its warning level.</span></li>`;
  $('#shopCopy').disabled = $('#shopDone').disabled = !list.length;
  shopSheet.showModal();
});
$('#shopCopy').addEventListener('click', async () => {
  const text = `${data.shop.name} shopping list\n${shoppingList().map((i) => `- ${i.name}: ${qty(i.buy)} ${i.unit}`).join('\n')}`;
  try { await navigator.clipboard.writeText(text); toast('Shopping list copied.'); } catch (_) { toast('Couldn’t copy. Select the list and copy it.'); }
});
$('#shopDone').addEventListener('click', async () => {
  if (!window.confirm('Add everything on the list to your stock (as bought)?')) return;
  try {
    for (const i of shoppingList()) await adjustStock(i.id, { kind: 'restock', qty: i.buy, note: 'Shopping list' }); // eslint-disable-line no-await-in-loop
    shopSheet.close();
    toast('Restocked from the shopping list.');
    await reload();
  } catch (err) { toast(errorMessage(err)); }
});

$('#stockFilters').addEventListener('click', (e) => { const b = e.target.closest('[data-inv]'); if (b) { invFilter = b.dataset.inv; renderStock(); } });
$('#invSearch').addEventListener('input', (e) => { invSearch = e.target.value; renderStock(); });
$('#addIngBtn').addEventListener('click', () => openIng());
$('#invList').addEventListener('click', async (e) => {
  const open = e.target.closest('[data-open]');
  if (open && !counting) { openStock(open.dataset.open, 'restock'); return; }
  const r = e.target.closest('[data-restock]');
  if (r) { openStock(r.dataset.restock, 'restock'); return; }
  const s = e.target.closest('[data-step]');
  if (!s) return;
  const i = ing(s.dataset.id);
  const step = Number(s.dataset.step);
  if (step < 0 && i.stock <= 0) { toast(`${i.name} is already out.`); return; }
  try {
    await adjustStock(i.id, { kind: step > 0 ? 'restock' : 'use', qty: step > 0 ? step : Math.min(-step, i.stock), note: 'Quick change' });
    data = await merchantInventory();
    renderStock();
    const row = $(`.strow[data-ing="${CSS.escape(i.id)}"]`);
    flash(row, step > 0 ? 'is-up' : 'is-down');
    if (row) flash($('[data-stock]', row), 'is-bump');
    renderCounter(); renderRecipes(); renderHistory();
  } catch (err) { toast(errorMessage(err)); }
});

/* =========================================================
   RECIPES
   ========================================================= */

function recipeCost(recipe) {
  if (!recipe) return 0;
  return recipe.lines.reduce((n, l) => { const i = ing(l.id); return n + (i ? i.cost * l.qty : 0); }, 0);
}

function renderRecipes() {
  $('#recList').innerHTML = data.shop.menu.map((it, n) => {
    const r = data.recipes[it.id];
    const lines = r ? r.lines.filter((l) => ing(l.id)) : [];
    const cost = recipeCost(r);
    const pct = it.price ? Math.round((cost / it.price) * 100) : 0;
    const tone = pct > 50 ? 'bad' : pct > 35 ? 'warn' : 'ok';
    const can = data.canMake[it.id];
    const vs = variantsOf(it);
    return `<li class="rcard${lines.length ? '' : ' is-empty'}" style="--i:${n}" data-rec="${esc(it.id)}">
      <div class="rcard__top"><span class="rcard__pic">${productPic(it, data.shop.color)}</span>
        <span class="rcard__name"><b>${esc(it.name)}</b><small>${vs.length ? `${esc(vs[0].name)} · ` : ''}${peso(it.price)}</small></span>
        ${lines.length ? `<span class="rpct is-${tone}">${pct}% cost</span>` : ''}</div>
      ${lines.length ? `<ul class="rchips">${lines.slice(0, 4).map((l) => { const i = ing(l.id); return `<li class="is-${stockState(i)}">${esc(i.name)} ${qty(l.qty)} ${esc(i.unit)}</li>`; }).join('')}${lines.length > 4 ? `<li>+${lines.length - 4} more</li>` : ''}</ul>`
    : '<p class="rcard__none">No ingredients yet. Add them so sales update your stock.</p>'}
      <div class="rcard__foot">
        <span>${lines.length ? `Keep <b class="is-ok">${pesoC(it.price - cost)}</b> · can make <b>${can ?? '–'}</b>` : 'Not tracked yet'}</span>
        <button type="button" class="fbtn ${lines.length ? 'fbtn--ghost' : 'fbtn--primary'} fbtn--sm" data-edit-rec="${esc(it.id)}">${lines.length ? 'Edit' : 'Add ingredients'}</button>
      </div>
    </li>`;
  }).join('');
}

const recSheet = wireSheet($('#recSheet'));
let recFor = null;

function recLineHtml(l = { id: '', qty: '' }) {
  const opts = [...data.ingredients].sort((a, b) => a.name.localeCompare(b.name));
  const i = ing(l.id);
  return `<li class="recline">
    <select class="select input--sm" data-rec-ing aria-label="Ingredient"><option value="">Choose…</option>${opts.map((o) => `<option value="${esc(o.id)}"${o.id === l.id ? ' selected' : ''}>${esc(o.name)}</option>`).join('')}</select>
    <span class="unit-input"><input class="input input--sm" data-rec-qty inputmode="decimal" placeholder="0" value="${l.qty === '' ? '' : qty(l.qty)}" aria-label="Amount"><span data-rec-unit>${i ? esc(i.unit) : ''}</span></span>
    <span class="recline__cost" data-rec-cost></span>
    <button type="button" class="iconbtn" data-rec-remove aria-label="Remove">${icon('i-close', 'icon--sm')}</button></li>`;
}
function readRecipe() {
  return {
    lines: $$('#recLines .recline').map((li) => ({ id: $('[data-rec-ing]', li).value, qty: num($('[data-rec-qty]', li).value) })).filter((l) => l.id && l.qty > 0),
    scale: Object.fromEntries($$('[data-scale]').map((inp) => [inp.dataset.scale, num(inp.value) || 1])),
  };
}
function updateRecCost() {
  $$('#recLines .recline').forEach((li) => {
    const i = ing($('[data-rec-ing]', li).value);
    $('[data-rec-unit]', li).textContent = i ? i.unit : '';
    const q = num($('[data-rec-qty]', li).value);
    $('[data-rec-cost]', li).textContent = i && q > 0 ? pesoC(i.cost * q) : '';
  });
  const r = readRecipe();
  const cost = recipeCost(r);
  const pct = recFor.price ? Math.round((cost / recFor.price) * 100) : 0;
  $('#recCost').innerHTML = r.lines.length ? `<div><small>Food cost per order</small><b>${pesoC(cost)}</b></div>
    <div><small>Of the price (${peso(recFor.price)})</small><b class="${pct > 50 ? 'is-high' : pct > 35 ? 'is-mid' : 'is-good'}">${pct}%</b></div>
    <div><small>You keep</small><b>${pesoC(recFor.price - cost)}</b></div>
    <span class="reccost__bar" style="--p:${Math.min(100, pct)}%"><i></i></span>` : '';
}
function openRecipe(id) {
  recFor = item(id);
  if (!recFor) return;
  const r = data.recipes[id] || { lines: [], scale: {} };
  $('#recPic').innerHTML = productPic(recFor, data.shop.color);
  $('#recTitle').textContent = recFor.name;
  const vs = variantsOf(recFor);
  $('#recSub').textContent = `${peso(recFor.price)}${vs.length ? ` · ${vs[0].name}` : ''}`;
  $('#recHint').textContent = vs.length ? `What one ${vs[0].name.toLowerCase()} order uses` : 'What one order uses';
  $('#recLines').innerHTML = (r.lines.length ? r.lines : [{ id: '', qty: '' }]).map(recLineHtml).join('');
  $('#recScale').innerHTML = vs.length > 1 ? `<p class="field__hint">Bigger sizes use more</p><div class="recscale__grid">${vs.slice(1).map((v) => `<label><span>${esc(v.name)}</span><span class="unit-input"><input class="input input--sm" data-scale="${esc(v.name)}" inputmode="decimal" value="${qty((r.scale || {})[v.name] || 1)}"><span>×</span></span></label>`).join('')}</div>` : '';
  updateRecCost();
  recSheet.showModal();
}
$('#recLines').addEventListener('input', updateRecCost);
$('#recLines').addEventListener('change', updateRecCost);
$('#recLines').addEventListener('click', (e) => {
  const b = e.target.closest('[data-rec-remove]');
  if (!b) return;
  const li = b.closest('li');
  li.classList.add('is-leaving');
  setTimeout(() => { li.remove(); updateRecCost(); }, reduceMotion() ? 0 : 160);
});
$('#recAdd').addEventListener('click', () => {
  $('#recLines').insertAdjacentHTML('beforeend', recLineHtml());
  $('#recLines .recline:last-child select').focus();
});
$('#recForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  try {
    await saveRecipe(recFor.id, readRecipe());
    recSheet.close();
    toast(`Recipe for ${recFor.name} saved.`);
    await reload();
    flash($(`.rcard[data-rec="${CSS.escape(recFor.id)}"]`), 'is-flash');
  } catch (err) { toast(errorMessage(err)); }
});
$('#recList').addEventListener('click', (e) => { const b = e.target.closest('[data-edit-rec]'); if (b) openRecipe(b.dataset.editRec); });

/* =========================================================
   HISTORY
   ========================================================= */

function renderHistory() {
  $('#logFilter').innerHTML = LOG_FILTERS.map((f) => `<button type="button" class="fchip2" data-log="${f.id}" aria-pressed="${f.id === logFilter}">${f.label}</button>`).join('');
  const f = LOG_FILTERS.find((x) => x.id === logFilter);
  const list = data.log.filter((l) => !f.kinds || f.kinds.includes(l.kind));
  const midnight = new Date(); midnight.setHours(0, 0, 0, 0);
  const today = data.sales.filter((s) => s.at >= midnight.getTime());
  const wasted = data.log.filter((l) => l.kind === 'waste' && l.at >= midnight.getTime())
    .reduce((n, l) => n + l.changes.reduce((m, c) => { const i = ing(c.id); return m + (i ? -c.change * i.cost : 0); }, 0), 0);
  $('#logSum').innerHTML = `Today: <b>${plural(today.length, 'counter sale')}</b> · <b>${peso(today.reduce((n, s) => n + s.total, 0))}</b>${wasted ? ` · waste ≈ <b>${peso(wasted)}</b>` : ''}`;
  $('#logList').innerHTML = list.length ? list.slice(0, 120).map((l, n) => {
    const k = KIND[l.kind] || { label: l.kind, mark: '•' };
    const shown = l.changes.slice(0, 6);
    return `<li class="hrow hrow--${esc(l.kind)}" style="--i:${Math.min(n, 10)}">
      <span class="hrow__icon">${k.mark}</span>
      <div class="hrow__main"><div class="hrow__top"><b>${esc(k.label)}${l.ref ? ` · ${esc(l.ref)}` : ''}</b><small>${esc(when(l.at))}</small></div>
        ${l.note && !l.ref ? `<p class="hrow__note">${esc(l.note)}</p>` : ''}
        <p class="hrow__changes">${shown.map((c) => `${esc(c.name)} <b class="${c.change < 0 ? 'neg' : c.change > 0 ? 'pos' : ''}">${l.kind === 'count' && c.change === 0 ? 'matched' : `${c.change > 0 ? '+' : ''}${qty(c.change)} ${esc(c.unit)}`}</b>`).join(' · ')}${l.changes.length > shown.length ? ` · +${l.changes.length - shown.length} more` : ''}</p>
      </div></li>`;
  }).join('') : `<li class="fempty">${icon('i-history', 'icon--xl')}<b>No changes yet</b><span>Sales, restocks, waste and counts show up here.</span></li>`;
}
$('#logFilter').addEventListener('click', (e) => { const b = e.target.closest('[data-log]'); if (b) { logFilter = b.dataset.log; renderHistory(); } });
$('#exportBtn').addEventListener('click', () => {
  const rows = [['Date', 'What', 'Reference', 'Note', 'Ingredient', 'Change', 'Unit', 'Stock after']];
  data.log.forEach((l) => l.changes.forEach((c) => rows.push([new Date(l.at).toISOString(), (KIND[l.kind] || {}).label || l.kind, l.ref || '', l.note || '', c.name, c.change, c.unit, c.stock])));
  const csv = rows.map((r) => r.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(',')).join('\n');
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
  a.download = `${data.shop.name.replace(/\s+/g, '-').toLowerCase()}-stock-history.csv`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
});

/* =========================================================
   Load + tabs
   ========================================================= */

function render() {
  renderCounter();
  renderStock();
  renderRecipes();
  renderHistory();
}

async function reload() {
  try { data = await merchantInventory(); } catch (err) {
    if (err.status === 401) { location.replace('/pages/merchant.html'); return; }
    toast(errorMessage(err));
    return;
  }
  saleNo = Math.max(saleNo, data.sales.length + 1);
  $('#pos').hidden = false;
  render();
}

$('#posTabs').addEventListener('click', (e) => { const b = e.target.closest('[data-tab]'); if (b) setTab(b.dataset.tab); });
$('#posTabs').addEventListener('keydown', (e) => {
  if (!['ArrowLeft', 'ArrowRight'].includes(e.key)) return;
  const i = TAB_IDS.indexOf(tab) + (e.key === 'ArrowRight' ? 1 : -1);
  const next = TAB_IDS[(i + TAB_IDS.length) % TAB_IDS.length];
  setTab(next);
  $(`#posTabs [data-tab="${next}"]`).focus();
});
addEventListener('hashchange', () => setTab(hashTab(), { push: false }));
addEventListener('resize', () => { slidePill($('#posTabs')); slidePill($('#typeSeg')); });

(async () => {
  await reload();
  if (!data) return;
  const p = params();
  setTab(p.get('recipe') ? 'recipes' : p.get('restock') ? 'stock' : tab, { push: false });
  if (p.get('restock') && ing(p.get('restock'))) openStock(p.get('restock'), 'restock');
  if (p.get('recipe') && item(p.get('recipe'))) openRecipe(p.get('recipe'));
  if (p.get('restock') || p.get('recipe')) history.replaceState(null, '', `${location.pathname}#${tab}`);
})();
