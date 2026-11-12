/* POS (/pos?tab=new|cooking|ready#online, file pos.html): sell at the branch on screen.
   Counter sale: tap menu items into the ticket (sizes picked on the card), take cash (change shown) or GCash,
   Charge → posSale() → receipt. Online orders: New / Preparing / Ready columns (tabs on phones) with Accept,
   Start preparing and Ready for pickup; finished ones fold away under "Done today". */
import { posSale, updateMerchantOrder, MERCHANT_ACTIONS, ORDER_STEPS } from '../api.js';
import { unitPrice, pickLabels, defaultPicks } from '../menu.js';
import { itemPicture } from '../placeholders.js';
import { $, $$, mountChrome, esc, peso, when, toast, edgeGlow } from '../ui.js';
import { failed, loadHome, mountHead } from './merchant-common.js';

mountChrome({ roles: ['merchant'] });

const params = new URLSearchParams(location.search);
let home = null;
let posTab = location.hash === '#online' ? 'online' : 'counter';
let orderTab = ['new', 'cooking', 'ready'].includes(params.get('tab')) ? params.get('tab') : 'new';
let section = 'all';
let picking = null; // the item whose sizes are showing on its card
let ticket = []; // { key, id, picks, name, options, price, qty }

const itemPic = (i) => (i.image ? `<img src="${esc(i.image)}" alt="" loading="lazy">` : itemPicture(i, '#6a2fb0'));
/** The first required single choice (size, pieces…): picked on the card. */
const sizesOf = (item) => (item.options || []).find((o) => o.type === 'one' && o.required && o.choices.length > 1);

/* ---------- Counter: menu ---------- */
function renderGrid() {
  const menu = home.shop.menu;
  const sections = [...new Set(menu.map((i) => i.section).filter(Boolean))];
  if (section !== 'all' && !sections.includes(section)) section = 'all';
  $('#posFilter').innerHTML = ['all', ...sections].map((sec) =>
    `<button type="button" class="fchip" data-section="${esc(sec)}" aria-pressed="${sec === section}">${sec === 'all' ? 'All' : esc(sec)}</button>`).join('');
  $('#posGrid').innerHTML = menu.filter((i) => section === 'all' || i.section === section).map((i, n) => {
    const off = !home.available[i.id];
    const sizes = sizesOf(i);
    const open = picking === i.id && sizes;
    return `<li class="positem${off ? ' is-off' : ''}${open ? ' is-picking' : ''}" style="--i:${n}">
      <button type="button" class="positem__btn" data-add="${esc(i.id)}"${off || !home.canAct ? ' disabled' : ''} aria-expanded="${sizes ? String(Boolean(open)) : 'false'}">
        <span class="positem__img">${itemPic(i)}</span>
        <span class="positem__name">${esc(i.name)}</span>
        <span class="positem__price">${off ? 'Sold out' : `${sizes ? '<small>from</small> ' : ''}${peso(i.price)}`}</span>
      </button>
      ${open ? `<div class="positem__sizes" role="group" aria-label="${esc(sizes.name)}">${sizes.choices.map((c) =>
    `<button type="button" class="fchip" data-size="${esc(c.name)}" data-item="${esc(i.id)}">${esc(c.name)} · ${peso(i.price + (c.price || 0))}</button>`).join('')}</div>` : ''}
    </li>`;
  }).join('');
}

function addToTicket(item, size) {
  const picks = defaultPicks(item);
  const sizes = sizesOf(item);
  if (sizes && size) picks[sizes.id] = size;
  const key = `${item.id}|${JSON.stringify(picks)}`;
  const line = ticket.find((l) => l.key === key);
  if (line) line.qty = Math.min(line.qty + 1, 99);
  else ticket.push({ key, id: item.id, picks, name: item.name, options: pickLabels(item, picks), price: unitPrice(item, picks), qty: 1 });
  renderTicket(key);
}

/* ---------- Counter: ticket and payment ---------- */
const total = () => ticket.reduce((n, l) => n + l.price * l.qty, 0);
const cashInput = () => $('#payForm').elements.cash;
const method = () => $('#payForm').elements.payment.value;

function renderTicket(bumped) {
  const t = total();
  const count = ticket.reduce((n, l) => n + l.qty, 0);
  $('#ticketLines').innerHTML = ticket.length ? ticket.map((l) => `<li class="tline${l.key === bumped ? ' is-bumped' : ''}">
      <span class="tline__name">${esc(l.name)}${l.options.length ? `<small>${esc(l.options.join(', '))}</small>` : ''}</span>
      <span class="tline__qty"><button type="button" class="qbtn" data-dec="${esc(l.key)}" aria-label="One less ${esc(l.name)}">−</button><b>${l.qty}</b>
      <button type="button" class="qbtn" data-inc="${esc(l.key)}" aria-label="One more ${esc(l.name)}">+</button></span>
      <b class="tline__sum">${peso(l.price * l.qty)}</b></li>`).join('')
    : '<li class="empty">Tap items on the menu to add them.</li>';
  $('#ticketTotal').textContent = peso(t);
  $('#ticketBarText').textContent = count ? `${count} item${count === 1 ? '' : 's'}` : 'No items yet';
  $('#ticketBarTotal').textContent = peso(t);
  $('#ticketClear').hidden = !ticket.length;
  // Quick cash: exact, then the next round amounts above the total
  const quick = t ? [t, ...[50, 100, 500, 1000].map((step) => Math.ceil((t + 1) / step) * step)].filter((v, i, a) => a.indexOf(v) === i).slice(0, 4) : [];
  $('#quickCash').innerHTML = quick.map((v, i) => `<button type="button" class="fchip" data-cash="${v}">${i === 0 ? 'Exact' : peso(v)}</button>`).join('');
  renderChange();
}

function renderChange() {
  const t = total();
  const cash = method() === 'cash';
  $('#cashBox').hidden = !cash;
  const given = Number(cashInput().value);
  const change = $('#change');
  if (!cash || !cashInput().value) change.textContent = '';
  else if (given < t) change.innerHTML = `<span class="is-short">Short by ${peso(t - given)}</span>`;
  else change.innerHTML = `Change <b>${peso(given - t)}</b>`;
  const btn = $('#chargeBtn');
  btn.disabled = !home.canAct || !ticket.length || (cash && !(given >= t));
  btn.textContent = !home.canAct ? 'View only: take over to sell' : `Charge ${peso(t)}${cash ? '' : ' by GCash'}`;
}

function showReceipt(sale) {
  const dlg = document.createElement('dialog');
  dlg.className = 'sheet receipt';
  dlg.setAttribute('aria-labelledby', 'receiptTitle');
  dlg.innerHTML = `<div class="sheet__body">
      <span class="sheet__handle" aria-hidden="true"></span>
      <h2 class="sheet__title" id="receiptTitle">Sale complete</h2>
      <p class="sheet__sub">${esc(sale.id)} · ${esc(when(sale.placedAt))} · ${esc(home.branch.name)} branch</p>
      <ul class="slist">${sale.lines.map((l) => `<li><span>${l.qty} × ${esc(l.name)}${l.options.length ? ` <small>· ${esc(l.options.join(', '))}</small>` : ''}</span><b>${peso(l.price * l.qty)}</b></li>`).join('')}</ul>
      <div class="receipt__sum"><span>Total</span><b>${peso(sale.subtotal)}</b></div>
      <div class="receipt__sum"><span>${sale.payment === 'cash' ? 'Cash received' : 'Paid by GCash'}</span><b>${peso(sale.cash ?? sale.subtotal)}</b></div>
      ${sale.payment === 'cash' ? `<div class="receipt__change"><span>Change</span><b>${peso(sale.change)}</b></div>` : ''}
      <div class="sheet__actions"><button type="button" class="button" value="close">New sale</button></div>
    </div>`;
  document.body.appendChild(dlg);
  $('[value="close"]', dlg).addEventListener('click', () => dlg.close());
  dlg.addEventListener('close', () => dlg.remove());
  if (typeof dlg.showModal === 'function') dlg.showModal(); else dlg.setAttribute('open', '');
}

function renderRecent() {
  $('#recentTitle').textContent = `Counter sales today (${home.counter.length}) · ${peso(home.counter.reduce((n, o) => n + o.subtotal, 0))}`;
  $('#recentList').innerHTML = home.counter.length
    ? home.counter.map((o) => `<li><span>${esc(when(o.placedAt))} <small>· ${o.lines.reduce((n, l) => n + l.qty, 0)} items · ${o.payment === 'cash' ? 'Cash' : 'GCash'}</small></span><b>${peso(o.subtotal)}</b></li>`).join('')
    : '<li class="empty">No counter sales yet today.</li>';
}

/* ---------- Online orders ---------- */
const COLS = [
  { id: 'new', label: 'New', statuses: ['placed'], empty: 'No new orders. They’ll show up here as soon as a customer orders.' },
  { id: 'cooking', label: 'Preparing', statuses: ['accepted', 'preparing'], empty: 'Nothing being prepared right now.' },
  { id: 'ready', label: 'Ready', statuses: ['ready'], empty: 'Nothing waiting for a rider.' },
];
const DONE = ['picked_up', 'delivered', 'cancelled'];
const stepName = (id) => (ORDER_STEPS.find((s) => s.id === id) || { name: id }).name;
const ago = (ts) => {
  const min = Math.round((Date.now() - ts) / 60000);
  if (min < 1) return 'Just now';
  if (min < 60) return `${min} min ago`;
  return when(ts);
};
const orderCard = (o, i) => `<li class="ocard ocard--${esc(o.status)}" style="--i:${i}">
    <div class="ocard__head"><span class="ocard__who">${esc(o.customer || 'Customer')} <span class="ocard__id">· ${esc(o.id)}</span></span>
      <span>${esc(ago(o.placedAt))}</span></div>
    <ul class="morder__lines">${o.lines.map((l) => `<li>${l.qty} × ${esc(l.name)}${(l.options || []).length ? ` <span>· ${esc(l.options.join(', '))}</span>` : ''}${l.note ? ` <span>“${esc(l.note)}”</span>` : ''}</li>`).join('')}</ul>
    ${o.notes ? `<p class="ocard__note">“${esc(o.notes)}”</p>` : ''}
    <div class="ocard__foot"><span class="ocard__total">${peso(o.subtotal)}</span>
      ${home.canAct && (MERCHANT_ACTIONS[o.status] || []).length ? `<div class="morder__actions">${MERCHANT_ACTIONS[o.status].map((a) =>
    `<button type="button" class="button${a.id === 'decline' ? ' button--ghost' : ''}" data-order="${esc(o.id)}" data-action="${a.id}">${esc(a.label)}</button>`).join('')}</div>`
    : `<span class="badge">${esc(stepName(o.status))}</span>`}</div>
  </li>`;

function renderOrders() {
  const of = (statuses) => home.orders.filter((o) => statuses.includes(o.status));
  const waiting = of(['placed']).length;
  $('#tabOnline').textContent = `Online orders${waiting ? ` · ${waiting}` : ''}`;
  $('#orderTabs').innerHTML = COLS.map((c) => {
    const n = of(c.statuses).length;
    return `<button type="button" class="seg__btn" role="tab" data-tab="${c.id}" aria-selected="${c.id === orderTab}">${c.label}${n ? ` · ${n}` : ''}</button>`;
  }).join('');
  $('#orderCols').innerHTML = COLS.map((c) => {
    const list = of(c.statuses);
    return `<section class="ocol${c.id === orderTab ? ' is-active' : ''}" aria-label="${c.label} orders">
      <h3 class="ocol__head">${c.label}${list.length ? ` <b>${list.length}</b>` : ''}</h3>
      <ul class="mlist">${list.length ? list.map(orderCard).join('') : `<li class="empty">${c.empty}</li>`}</ul></section>`;
  }).join('');
  const done = of(DONE);
  $('#doneTitle').textContent = `Done today (${done.length})`;
  $('#doneList').innerHTML = done.length ? done.map(orderCard).join('') : '<li class="empty">No finished orders yet today.</li>';
}

function showTab(id) {
  posTab = id;
  $$('[data-postab]').forEach((b) => b.setAttribute('aria-selected', String(b.dataset.postab === id)));
  $('#counter').hidden = id !== 'counter';
  $('#online').hidden = id !== 'online';
  history.replaceState(null, '', id === 'online' ? '#online' : location.pathname);
}

/* ---------- Load ---------- */
const head = mountHead({ kicker: 'Point of sale', onChange: reload });

async function reload() {
  home = await loadHome();
  if (!home) return;
  $('#pos').hidden = false;
  head(home);
  // Drop ticket lines that became sold out (e.g. after switching branch)
  const before = ticket.length;
  ticket = ticket.filter((l) => home.available[l.id]);
  if (ticket.length < before) toast('Sold-out items were taken off the sale.');
  renderGrid();
  renderTicket();
  renderRecent();
  renderOrders();
  showTab(posTab);
}

/* ---------- Events ---------- */
$('.pos__tabs').addEventListener('click', (e) => { const b = e.target.closest('[data-postab]'); if (b) showTab(b.dataset.postab); });

$('#posFilter').addEventListener('click', (e) => {
  const b = e.target.closest('[data-section]');
  if (!b) return;
  section = b.dataset.section;
  picking = null;
  renderGrid();
});

$('#posGrid').addEventListener('click', (e) => {
  const size = e.target.closest('[data-size]');
  const item = (id) => home.shop.menu.find((m) => m.id === id);
  if (size) { addToTicket(item(size.dataset.item), size.dataset.size); picking = null; renderGrid(); return; }
  const add = e.target.closest('[data-add]');
  if (!add) return;
  const it = item(add.dataset.add);
  if (sizesOf(it)) { picking = picking === it.id ? null : it.id; renderGrid(); return; }
  addToTicket(it);
});

$('#ticketLines').addEventListener('click', (e) => {
  const b = e.target.closest('[data-inc], [data-dec]');
  if (!b) return;
  const line = ticket.find((l) => l.key === (b.dataset.inc || b.dataset.dec));
  line.qty += b.dataset.inc ? 1 : -1;
  if (line.qty > 99) line.qty = 99;
  ticket = ticket.filter((l) => l.qty > 0);
  renderTicket();
});
$('#ticketClear').addEventListener('click', () => { ticket = []; cashInput().value = ''; renderTicket(); });

// Phones: the bar at the bottom opens and closes the ticket
$('#ticketBar').addEventListener('click', () => {
  const open = !$('#ticket').classList.contains('is-open');
  $('#ticket').classList.toggle('is-open', open);
  $('#ticketBar').setAttribute('aria-expanded', String(open));
});

$('#payForm').addEventListener('input', renderChange);
$('#quickCash').addEventListener('click', (e) => {
  const b = e.target.closest('[data-cash]');
  if (!b) return;
  cashInput().value = b.dataset.cash;
  renderChange();
});
$('#payForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const error = $('.field__error', e.currentTarget);
  const btn = $('#chargeBtn');
  btn.disabled = true;
  error.hidden = true;
  try {
    const sale = await posSale({
      items: ticket.map((l) => ({ id: l.id, qty: l.qty, picks: l.picks })),
      payment: method(), cash: method() === 'cash' ? Number(cashInput().value) : undefined,
    });
    edgeGlow('reward', btn);
    ticket = [];
    cashInput().value = '';
    $('#ticket').classList.remove('is-open');
    showReceipt(sale);
    await reload();
  } catch (err) {
    if (err.status === 401) { failed(err); return; }
    error.textContent = [400, 403, 409].includes(err.status) ? err.message : 'Couldn’t finish the sale. Try again.';
    error.hidden = false;
    renderChange();
  }
});

$('#orderTabs').addEventListener('click', (e) => {
  const b = e.target.closest('[data-tab]');
  if (!b) return;
  orderTab = b.dataset.tab;
  renderOrders();
});
$('#online').addEventListener('click', async (e) => {
  const b = e.target.closest('[data-action]');
  if (!b) return;
  b.disabled = true;
  try {
    await updateMerchantOrder(b.dataset.order, b.dataset.action);
    if (b.dataset.action === 'accept') edgeGlow('reward', b);
    await reload();
  } catch (err) { failed(err); b.disabled = false; }
});

reload();
