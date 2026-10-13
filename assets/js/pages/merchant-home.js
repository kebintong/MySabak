/* Merchant dashboard (pages/merchant-home.html): open / close, orders, menu availability. No POS (Stage 2). */
import {
  merchantHome, merchantSignOut, setShopOpen, setItemAvailable, updateMerchantOrder, MERCHANT_ACTIONS, ORDER_STEPS, errorMessage,
} from '../api.js';
import { storefront } from '../placeholders.js';
import { $, mountChrome, esc, peso, when, toast } from '../ui.js';

mountChrome();

const TABS = [
  { id: 'new', label: 'New', statuses: ['placed'] },
  { id: 'cooking', label: 'Preparing', statuses: ['accepted', 'preparing'] },
  { id: 'ready', label: 'Ready', statuses: ['ready'] },
  { id: 'done', label: 'Done', statuses: ['picked_up', 'delivered', 'cancelled'] },
];
const EMPTY = {
  new: 'No new orders. They’ll show up here as soon as a customer orders.',
  cooking: 'Nothing being prepared right now.',
  ready: 'Nothing waiting for a rider.',
  done: 'No finished orders yet today.',
};
let tab = 'new';
let home = null;

const stepName = (id) => (ORDER_STEPS.find((s) => s.id === id) || { name: id }).name;

function renderOrders() {
  $('#orderTabs').innerHTML = TABS.map((t) => {
    const n = home.orders.filter((o) => t.statuses.includes(o.status)).length;
    return `<button type="button" class="seg__btn" role="tab" data-tab="${t.id}" aria-selected="${t.id === tab}">${t.label}${n ? ` <b>${n}</b>` : ''}</button>`;
  }).join('');
  const list = home.orders.filter((o) => TABS.find((t) => t.id === tab).statuses.includes(o.status));
  $('#orderList').innerHTML = list.length
    ? list.map((o) => `<li class="morder">
        <div class="morder__head"><span class="row__title">${esc(o.id)}</span><span class="badge">${esc(stepName(o.status))}</span></div>
        <span class="row__sub">${esc(when(o.placedAt))} · ${o.lines.reduce((n, l) => n + l.qty, 0)} items · ${peso(o.subtotal)}</span>
        <ul class="morder__lines">${o.lines.map((l) => `<li>${l.qty} × ${esc(l.name)}${(l.options || []).length ? ` <span>(${esc(l.options.join(', '))})</span>` : ''}${l.note ? ` <span>“${esc(l.note)}”</span>` : ''}</li>`).join('')}</ul>
        ${o.notes ? `<p class="row__sub">Note: ${esc(o.notes)}</p>` : ''}
        <div class="morder__actions">${(MERCHANT_ACTIONS[o.status] || []).map((a) =>
    `<button type="button" class="button${a.id === 'decline' ? ' button--ghost' : ''}" data-order="${esc(o.id)}" data-action="${a.id}">${esc(a.label)}</button>`).join('')}</div>
      </li>`).join('')
    : `<li class="empty">${EMPTY[tab]}</li>`;
}

function renderOpen() {
  $('#openSwitch').setAttribute('aria-checked', String(home.open));
  $('#openHint').textContent = home.open ? 'Customers can order now.' : 'Your shop shows as closed. Customers can’t order.';
  const badge = $('#openBadge');
  badge.textContent = home.open ? 'Open' : 'Closed';
  badge.className = `badge ${home.open ? 'badge--ok' : 'badge--wait'}`;
}

function renderMenu() {
  $('#menuList').innerHTML = home.shop.menu.map((i) => `<li class="row">
      <div class="row__main"><span class="row__title">${esc(i.name)}</span><span class="row__sub">${esc(i.section || '')} · ${peso(i.price)}</span></div>
      <button type="button" class="switch" role="switch" aria-checked="${home.available[i.id]}" aria-label="${esc(i.name)} available" data-item="${esc(i.id)}"><span></span></button></li>`).join('');
}

function render() {
  $('#shopName').textContent = home.shop.name;
  $('#shopArea').textContent = home.shop.area;
  $('#shopAva').innerHTML = home.shop.image ? `<img src="${esc(home.shop.image)}" alt="">` : storefront(home.shop);
  $('#todayOrders').textContent = home.today.orders;
  $('#todaySales').textContent = peso(home.today.sales);
  renderOpen();
  renderOrders();
  renderMenu();
}

async function reload() {
  try { home = await merchantHome(); } catch (err) {
    if (err.status === 401) { location.replace('/pages/merchant.html'); return; }
    toast(errorMessage(err));
    return;
  }
  $('#merchantHome').hidden = false;
  render();
}

$('#orderTabs').addEventListener('click', (e) => {
  const b = e.target.closest('[data-tab]');
  if (!b) return;
  tab = b.dataset.tab;
  renderOrders();
});

$('#orderList').addEventListener('click', async (e) => {
  const b = e.target.closest('[data-action]');
  if (!b) return;
  b.disabled = true;
  try {
    await updateMerchantOrder(b.dataset.order, b.dataset.action);
    await reload();
  } catch (err) { toast(err.status === 409 ? err.message : errorMessage(err)); b.disabled = false; }
});

$('#openSwitch').addEventListener('click', async () => {
  const next = !home.open;
  try {
    await setShopOpen(next);
    home.open = next;
    renderOpen();
    toast(next ? 'You’re open. Customers can order.' : 'You’re closed. Customers can’t order for now.');
  } catch (err) { toast(errorMessage(err)); }
});

$('#menuList').addEventListener('click', async (e) => {
  const b = e.target.closest('[data-item]');
  if (!b) return;
  const id = b.dataset.item;
  const next = !home.available[id];
  try {
    await setItemAvailable(id, next);
    home.available[id] = next;
    b.setAttribute('aria-checked', String(next));
  } catch (err) { toast(errorMessage(err)); }
});

$('#signOutBtn').addEventListener('click', async () => {
  await merchantSignOut();
  location.href = '/pages/merchant.html';
});

reload();
