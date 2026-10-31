/* Merchant dashboard (pages/merchant-home.html): open / close, orders, menu availability. No POS (Stage 2). */
import {
  merchantHome, setShopOpen, setItemAvailable, updateMerchantOrder, MERCHANT_ACTIONS, ORDER_STEPS, errorMessage,
} from '../api.js';
import { itemPicture } from '../placeholders.js';
import { $, mountChrome, esc, peso, when, toast } from '../ui.js';

mountChrome({ roles: ['merchant'] });

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

const ago = (ts) => {
  const min = Math.round((Date.now() - ts) / 60000);
  if (min < 1) return 'Just now';
  if (min < 60) return `${min} min ago`;
  return when(ts);
};
const initials = (name) => String(name || '?').trim().slice(0, 1).toUpperCase();
const reduceMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/** Numbers count up to their value (micro-animation); `format` turns the number into text. */
function countUp(el, to, format = String) {
  const from = Number(el.dataset.value || 0);
  el.dataset.value = String(to);
  if (reduceMotion() || from === to) { el.textContent = format(to); return; }
  const start = performance.now();
  const step = (now) => {
    const t = Math.min(1, (now - start) / 700);
    const eased = 1 - (1 - t) ** 3;
    el.textContent = format(Math.round(from + (to - from) * eased));
    if (t < 1) requestAnimationFrame(step);
    else el.textContent = format(to);
  };
  requestAnimationFrame(step);
}

function renderOrders() {
  $('#orderTabs').innerHTML = TABS.map((t) => {
    const n = home.orders.filter((o) => t.statuses.includes(o.status)).length;
    return `<button type="button" class="seg__btn" role="tab" data-tab="${t.id}" aria-selected="${t.id === tab}">${t.label}${n && t.id !== 'done' ? ` <b>${n}</b>` : ''}</button>`;
  }).join('');
  const list = home.orders.filter((o) => TABS.find((t) => t.id === tab).statuses.includes(o.status));
  $('#orderList').innerHTML = list.length
    ? list.map((o, i) => `<li class="ocard ocard--${esc(o.status)}" style="--i:${i}">
        <div class="ocard__head">
          <span class="ocard__ava" aria-hidden="true">${esc(initials(o.customer))}</span>
          <div class="ocard__who"><span class="row__title">${esc(o.customer || 'Customer')} <span class="ocard__id">${esc(o.id)}</span></span>
            <span class="row__sub">${esc(ago(o.placedAt))} · ${o.lines.reduce((n, l) => n + l.qty, 0)} items${o.demo ? ' · <span class="tag-demo">Sample</span>' : ''}</span></div>
          <span class="ocard__total">${peso(o.subtotal)}</span>
        </div>
        <div class="ocard__status"><span class="badge${o.status === 'placed' ? ' badge--new' : ''}">${esc(stepName(o.status))}</span></div>
        <ul class="morder__lines">${o.lines.map((l) => `<li>${l.qty} × ${esc(l.name)}${(l.options || []).length ? ` <span>(${esc(l.options.join(', '))})</span>` : ''}${l.note ? ` <span>“${esc(l.note)}”</span>` : ''}</li>`).join('')}</ul>
        ${o.notes ? `<p class="ocard__note">“${esc(o.notes)}”</p>` : ''}
        ${(MERCHANT_ACTIONS[o.status] || []).length ? `<div class="morder__actions">${MERCHANT_ACTIONS[o.status].map((a) =>
    `<button type="button" class="button${a.id === 'decline' ? ' button--ghost' : ''}" data-order="${esc(o.id)}" data-action="${a.id}">${esc(a.label)}</button>`).join('')}</div>` : ''}
      </li>`).join('')
    : `<li class="empty">${EMPTY[tab]}</li>`;
}

function renderOpen() {
  $('#openSwitch').setAttribute('aria-checked', String(home.open));
  $('#openHint').textContent = home.open ? 'Accepting orders' : 'Not taking orders';
  $('#openLabel').textContent = home.open ? 'Open' : 'Closed';
  $('#openBadge').classList.toggle('is-closed', !home.open);
}

function renderStats() {
  const waiting = home.orders.filter((o) => o.status === 'placed').length;
  countUp($('#todayOrders'), home.today.orders);
  countUp($('#todaySales'), home.today.sales, peso);
  countUp($('#waitingOrders'), waiting);
  countUp($('#avgOrder'), home.today.orders ? Math.round(home.today.sales / home.today.orders) : 0, peso);
  $('#waitingOrders').parentElement.classList.toggle('kpi--hot', waiting > 0);
}

/** Last 7 days of sales as small bars (today last, highlighted). Hover or focus a bar for its value. */
function renderWeek() {
  const week = home.week || [];
  const max = Math.max(...week, 1);
  const days = week.map((_, i) => {
    const d = new Date(); d.setDate(d.getDate() - (week.length - 1 - i));
    return i === week.length - 1 ? 'Today' : d.toLocaleDateString('en-PH', { weekday: 'short' });
  });
  const total = week.reduce((n, v) => n + v, 0);
  $('#weekTotal').textContent = peso(total);
  const chart = $('#weekChart');
  chart.setAttribute('aria-label', `Sales per day: ${week.map((v, i) => `${days[i]} ${peso(v)}`).join(', ')}`);
  chart.innerHTML = week.map((v, i) => `<div class="wchart__col${i === week.length - 1 ? ' is-today' : ''}" style="--h:${Math.max(4, (v / max) * 100)}%;--i:${i}" title="${days[i]}: ${peso(v)}">
      <span class="wchart__plot"><span class="wchart__tip">${peso(v)}</span><span class="wchart__bar"></span></span><span class="wchart__day">${days[i]}</span></div>`).join('');
}

let section = 'all';

/** The item's variants with their full price (item price + the variant's price), or [] when it has none. */
const variantsOf = (item) => {
  const g = (item.options || []).find((o) => o.type === 'one' && o.required);
  return g ? g.choices.map((c) => ({ name: c.name, price: item.price + (c.price || 0) })) : [];
};

function renderMenu() {
  renderMenu.count();
  const sections = [...new Set(home.shop.menu.map((i) => i.section).filter(Boolean))];
  $('#menuFilter').innerHTML = ['all', ...sections].map((sec) =>
    `<button type="button" class="fchip" data-section="${esc(sec)}" aria-pressed="${sec === section}">${sec === 'all' ? 'All' : esc(sec)}</button>`).join('');
  const items = home.shop.menu.filter((i) => section === 'all' || i.section === section);
  $('#menuList').innerHTML = items.map((i, n) => {
    const on = home.available[i.id];
    const variants = variantsOf(i);
    return `<li class="pcard${on ? '' : ' is-off'}" style="--i:${n}">
      <div class="pcard__img">${i.image ? `<img src="${esc(i.image)}" alt="" loading="lazy">` : itemPicture(i, '#5630d8')}
        <span class="pcard__section">${esc(i.section || '')}</span><span class="pcard__sold">Sold out</span></div>
      <div class="pcard__body">
        <div class="pcard__top"><h3 class="pcard__name">${esc(i.name)}</h3><span class="pcard__price">${variants.length > 1 ? '<small>from</small> ' : ''}${peso(i.price)}</span></div>
        ${i.note ? `<p class="pcard__desc">${esc(i.note)}</p>` : ''}
        ${variants.length ? `<ul class="pcard__variants" aria-label="Prices">${variants.map((v) => `<li><span>${esc(v.name)}</span><b>${peso(v.price)}</b></li>`).join('')}</ul>` : ''}
        <div class="pcard__foot"><span class="pcard__state">${on ? 'Available' : 'Sold out'}</span>
          <button type="button" class="switch" role="switch" aria-checked="${on}" aria-label="${esc(i.name)} available" data-item="${esc(i.id)}"><span></span></button></div>
      </div></li>`;
  }).join('');
}

renderMenu.count = () => {
  const off = home.shop.menu.filter((i) => !home.available[i.id]).length;
  $('#menuCount').textContent = off ? `${off} sold out` : 'All available';
};

function render() {
  const hour = new Date().getHours();
  const first = String(home.name || '').split(/\s+/)[0];
  $('#greeting').textContent = `${hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening'}${first ? `, ${first}` : ''}`;
  $('#shopName').textContent = home.shop.name;
  $('#shopArea').textContent = home.shop.area;
  $('#shopHours').textContent = home.shop.hours || '';
  $('#shopAva').innerHTML = home.shop.image ? `<img src="${esc(home.shop.image)}" alt="">`
    : esc(home.shop.name.split(/\s+/).slice(0, 2).map((w) => w[0]).join('').toUpperCase());
  renderOpen();
  renderStats();
  renderOrders();
  renderWeek();
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
    await $('#menuFilter').addEventListener('click', (e) => {
  const b = e.target.closest('[data-section]');
  if (!b) return;
  section = b.dataset.section;
  renderMenu();
});

reload();
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
    b.setAttribute('aria-checked', String(next)); // switch slides; the card dims and shows "Sold out"
    renderMenu.count();
    const card = b.closest('.pcard');
    card.classList.toggle('is-off', !next);
    $('.pcard__state', card).textContent = next ? 'Available' : 'Sold out';
  } catch (err) { toast(errorMessage(err)); }
});

$('#menuFilter').addEventListener('click', (e) => {
  const b = e.target.closest('[data-section]');
  if (!b) return;
  section = b.dataset.section;
  renderMenu();
});

reload();
