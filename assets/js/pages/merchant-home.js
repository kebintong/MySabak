/* My shop (pages/merchant-home.html), for merchants. Four blocks, top to bottom:
   1. shop + Open/Closed + the two main jobs (Add product, New counter sale)
   2. Needs you now: at most three cards, one button each
   3. Today in one line
   4. Online orders (New · Cooking · Ready · Done) beside Products (photo, price, stock, Available switch)
   The POS (counter sales, stock, recipes, history) is pages/pos.html. */
import {
  merchantHome, setShopOpen, setItemAvailable, updateMerchantOrder, saveMerchantItem, deleteMerchantItem, itemVariants,
  MERCHANT_ACTIONS, errorMessage,
} from '../api.js';
import { $, $$, mountChrome, esc, peso, when, toast, icon } from '../ui.js';
import {
  productPic, isOwnPhoto, photoFromFile, countUp, slidePill, flash, wireSheet, reduceMotion,
} from '../merchant-ui.js';

mountChrome({ roles: ['merchant'] });

const TABS = [
  { id: 'new', label: 'New', statuses: ['placed'] },
  { id: 'cooking', label: 'Cooking', statuses: ['accepted', 'preparing'] },
  { id: 'ready', label: 'Ready', statuses: ['ready'] },
  { id: 'done', label: 'Done', statuses: ['picked_up', 'delivered', 'cancelled'] },
];
const EMPTY = {
  new: ['No new orders', 'They show up here as soon as a customer orders.'],
  cooking: ['Nothing cooking', 'Accepted orders move here.'],
  ready: ['Nothing waiting', 'Ready orders wait here for the rider.'],
  done: ['No finished orders yet', 'Orders handed to riders show here.'],
};
const ACTION_LABEL = { accept: 'Accept', decline: 'Decline', preparing: 'Start cooking', ready: 'Mark ready' };
const DONE_MSG = { accept: 'accepted', decline: 'declined', preparing: 'is cooking', ready: 'is ready for the rider' };
let tab = 'new';
let home = null;

const minutesAgo = (ts) => Math.max(0, Math.round((Date.now() - ts) / 60000));
const ago = (ts) => {
  const m = minutesAgo(ts);
  if (m < 1) return 'Just now';
  if (m < 60) return `${m} min`;
  return when(ts);
};
const menuItem = (line) => home.shop.menu.find((i) => i.id === line.id) || home.shop.menu.find((i) => i.name === line.name);
const go = (el) => el && el.scrollIntoView({ behavior: reduceMotion() ? 'auto' : 'smooth', block: 'start' });
const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;

/* ---------- 1. Shop ---------- */

function renderShop() {
  const hour = new Date().getHours();
  const first = String(home.name || '').split(/\s+/)[0];
  $('#greeting').textContent = `${hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening'}${first ? `, ${first}` : ''}`;
  $('#shopName').textContent = home.shop.name;
  $('#shopArea').textContent = home.shop.area;
  $('#shopHours').textContent = home.shop.hours || '';
  $('#shopAva').innerHTML = home.shop.image ? `<img src="${esc(home.shop.image)}" alt="">`
    : esc(home.shop.name.split(/\s+/).slice(0, 2).map((w) => w[0]).join('').toUpperCase());
  renderOpen();
}

function renderOpen() {
  const b = $('#openSwitch');
  b.setAttribute('aria-checked', String(home.open));
  b.classList.toggle('is-closed', !home.open);
  $('#openTitle').textContent = home.open ? 'Open' : 'Closed';
  $('#openSub').textContent = home.open ? 'Taking orders' : 'Not taking orders';
  b.setAttribute('aria-label', home.open ? 'Open, taking orders. Tap to close.' : 'Closed. Tap to open.');
}

/* ---------- 2. Needs you now ---------- */

function renderNeeds() {
  const placed = home.orders.filter((o) => o.status === 'placed');
  const oldest = placed.length ? Math.max(...placed.map((o) => minutesAgo(o.placedAt))) : 0;
  const noPhoto = home.shop.menu.filter((i) => !isOwnPhoto(i)).length;
  const cards = [];
  if (placed.length) {
    cards.push({ hot: true, tone: 'brand', icon: 'i-receipt', title: plural(placed.length, 'new order'),
      sub: oldest ? `Oldest is waiting ${oldest} min` : 'Just came in', cta: 'Review', act: 'orders' });
  }
  if (home.stock.low) {
    const out = home.stock.items.find((i) => i.stock <= 0);
    cards.push({ tone: 'warn', icon: 'i-alert', title: `${plural(home.stock.low, 'ingredient')} low`,
      sub: out ? `${out.name} is already out` : 'Restock soon', cta: 'Restock', href: '/pages/pos.html#stock' });
  }
  if (noPhoto) {
    cards.push({ tone: 'soft', icon: 'i-camera', title: `${noPhoto} need a photo`,
      sub: 'Photos help customers decide', cta: 'Add photos', act: 'photos' });
  }
  if (!cards.length) {
    cards.push({ tone: 'ok', icon: 'i-check', title: 'All good', sub: 'No orders waiting and stock is fine.' });
  }
  $('#needs').innerHTML = cards.slice(0, 3).map((c, i) => `<div class="need need--${c.tone}${c.hot ? ' is-hot' : ''}" style="--i:${i}">
      <span class="need__icon">${icon(c.icon, 'icon--xl')}</span>
      <span class="need__text"><b>${esc(c.title)}</b><small>${esc(c.sub)}</small></span>
      ${c.cta ? (c.href ? `<a class="need__btn" href="${c.href}">${esc(c.cta)}</a>`
    : `<button type="button" class="need__btn" data-act="${c.act}">${esc(c.cta)}</button>`) : ''}
    </div>`).join('');
}

/* ---------- 3. Today ---------- */

function renderToday() {
  const week = home.week || [];
  const yesterday = week.length > 1 ? week[week.length - 2] : 0;
  const diff = yesterday ? Math.round(((home.today.sales - yesterday) / yesterday) * 100) : null;
  const online = home.today.orders - (home.today.counter || 0);
  const weekTotal = week.reduce((n, v) => n + v, 0);
  const best = week.indexOf(Math.max(...week, 0));
  const bestDay = best >= 0 && week[best] ? (best === week.length - 1 ? 'today'
    : new Date(Date.now() - (week.length - 1 - best) * 864e5).toLocaleDateString('en-PH', { weekday: 'long' })) : '';
  const stats = [
    { id: 'tSales', label: 'Sales today', value: home.today.sales, fmt: peso,
      sub: yesterday ? `Yesterday: ${peso(yesterday)}` : 'First sales this week', tone: diff !== null && diff > 0 ? 'ok' : '' },
    { id: 'tOrders', label: 'Orders', value: home.today.orders, fmt: String, sub: `${online} online · ${home.today.counter || 0} counter` },
    { id: 'tAvg', label: 'Average order', value: home.today.orders ? Math.round(home.today.sales / home.today.orders) : 0, fmt: peso, sub: 'Per customer' },
    { id: 'tWeek', label: 'This week', value: weekTotal, fmt: peso, sub: bestDay ? `Best day: ${bestDay}` : 'Last 7 days' },
  ];
  if (!$('#tSales')) {
    $('#today').innerHTML = stats.map((s) => `<div class="tstat"><span class="tstat__label">${s.label}</span>
      <b class="tstat__value" id="${s.id}">0</b><span class="tstat__sub" data-sub="${s.id}"></span></div>`).join('');
  }
  stats.forEach((s) => {
    countUp($(`#${s.id}`), s.value, s.fmt);
    const sub = $(`[data-sub="${s.id}"]`);
    sub.textContent = s.sub;
    sub.className = `tstat__sub${s.tone ? ` is-${s.tone}` : ''}`;
  });
}

/* ---------- 4a. Orders ---------- */

function renderOrders() {
  $('#orderTabs').innerHTML = TABS.map((t) => {
    const n = home.orders.filter((o) => t.statuses.includes(o.status)).length;
    return `<button type="button" class="fseg__btn" role="tab" data-tab="${t.id}" aria-selected="${t.id === tab}">${t.label}${n && t.id !== 'done' ? `<span class="fseg__n${t.id === 'new' ? ' is-hot' : ''}">${n}</span>` : ''}</button>`;
  }).join('');
  requestAnimationFrame(() => slidePill($('#orderTabs')));
  const list = home.orders.filter((o) => TABS.find((t) => t.id === tab).statuses.includes(o.status));
  if (!list.length) {
    const [title, sub] = EMPTY[tab];
    $('#orderList').innerHTML = `<li class="fempty"><span class="fempty__icon">${icon('i-check', 'icon--xl')}</span><b>${title}</b><span>${sub}</span></li>`;
    return;
  }
  $('#orderList').innerHTML = list.map((o, i) => {
    const late = o.status === 'placed' && minutesAgo(o.placedAt) >= 5;
    const items = o.lines.reduce((n, l) => n + l.qty, 0);
    const actions = [...(MERCHANT_ACTIONS[o.status] || [])].sort((a, b) => (a.id === 'decline' ? -1 : b.id === 'decline' ? 1 : 0));
    const status = o.status === 'cancelled' ? 'Declined' : o.status === 'delivered' ? 'Delivered' : o.status === 'picked_up' ? 'With the rider' : '';
    return `<li class="ocard2${o.status === 'placed' ? ' is-new' : ''}" style="--i:${i}" data-card="${esc(o.id)}">
      <div class="ocard2__head">
        <span class="ocard2__ava" aria-hidden="true">${esc(String(o.customer || '?').charAt(0).toUpperCase())}</span>
        <span class="ocard2__who"><b>${esc(o.customer || 'Customer')} <span>· ${esc(o.id)}</span></b>
          <small>${plural(items, 'item')}${o.payment ? ` · ${esc(o.payment === 'cash' ? 'Cash' : o.payment)}` : ''}${o.demo ? ' · <span class="tag-demo">Sample</span>' : ''}</small></span>
        <span class="ocard2__age${late ? ' is-late' : ''}">${status || esc(ago(o.placedAt))}</span>
      </div>
      <ul class="ocard2__lines">${o.lines.map((l) => {
    const it = menuItem(l);
    return `<li><span class="ocard2__pic">${it ? productPic(it, home.shop.color) : ''}</span><span><b>${l.qty}×</b> ${esc(l.name)}${(l.options || []).length ? ` <span class="muted">${esc(l.options.join(', '))}</span>` : ''}</span></li>`;
  }).join('')}</ul>
      ${o.notes ? `<p class="ocard2__note">“${esc(o.notes)}”</p>` : ''}
      <div class="ocard2__foot">
        <b class="ocard2__total">${peso(o.subtotal)}</b>
        ${actions.map((a) => `<button type="button" class="${a.id === 'decline' ? 'fbtn fbtn--quiet' : 'fbtn fbtn--primary'}" data-order="${esc(o.id)}" data-action="${a.id}">${esc(ACTION_LABEL[a.id] || a.label)}</button>`).join('')}
      </div>
    </li>`;
  }).join('');
}

/* ---------- 4b. Products ---------- */

function stockText(id, on) {
  const n = home.canMake[id];
  if (!on) return ['Sold out', 'muted'];
  if (n === null || n === undefined) return ['No recipe yet', 'muted'];
  if (n <= 0) return ['Out of ingredients', 'bad'];
  if (n <= 5) return [`Only ${n} left`, 'warn'];
  return [`Can make ${n}`, 'ok'];
}

function renderProducts() {
  const menu = home.shop.menu;
  const off = menu.filter((i) => !home.available[i.id]).length;
  $('#menuCount').textContent = `${plural(menu.length, 'product')} · ${off ? `${off} sold out` : 'all available'} · tap a switch to mark sold out`;
  $('#menuList').innerHTML = menu.length ? menu.map((i, n) => {
    const on = home.available[i.id] !== false;
    const vs = itemVariants(i);
    const [st, tone] = stockText(i.id, on);
    return `<li class="prow${on ? '' : ' is-off'}" style="--i:${n}" data-id="${esc(i.id)}">
      <button type="button" class="prow__main" data-edit="${esc(i.id)}" aria-label="Edit ${esc(i.name)}">
        <span class="prow__pic">${productPic(i, home.shop.color)}${isOwnPhoto(i) ? '' : `<span class="prow__nophoto">${icon('i-camera', 'icon--sm')}</span>`}</span>
        <span class="prow__text"><b>${esc(i.name)}</b><small>${vs.length > 1 ? 'from ' : ''}${peso(i.price)} · <span class="is-${tone}">${st}</span></small></span>
      </button>
      <button type="button" class="fswitch" role="switch" aria-checked="${on}" aria-label="${esc(i.name)} available" data-item="${esc(i.id)}"><span></span></button>
    </li>`;
  }).join('') : `<li class="fempty"><span class="fempty__icon">${icon('i-plus', 'icon--xl')}</span><b>No products yet</b><span>Add your first product with a photo.</span></li>`;
}

function render() {
  renderShop();
  renderNeeds();
  renderToday();
  renderOrders();
  renderProducts();
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

/* ---------- Add / edit product sheet ---------- */

const sheet = wireSheet($('#productSheet'));
const form = $('#productForm');
let editing = null;
let photo = null;
let available = true;

function setPhoto(src) {
  photo = src || null;
  const img = $('#photoPreview');
  img.hidden = !photo;
  if (photo) { img.src = photo; flash($('#photoDrop'), 'is-new'); } else img.removeAttribute('src');
  $('#photoEmpty').hidden = Boolean(photo);
  $('#photoActions').hidden = !photo;
  $('#photoBox').classList.toggle('has-photo', Boolean(photo));
}

function setMode(mode) {
  $$('#priceMode [data-mode]').forEach((b) => b.setAttribute('aria-selected', String(b.dataset.mode === mode)));
  $('#priceOne').hidden = mode !== 'one';
  $('#priceSizes').hidden = mode !== 'sizes';
  if (mode === 'sizes' && !$('#sizeRows').children.length) { addSizeRow(); addSizeRow(); }
  requestAnimationFrame(() => slidePill($('#priceMode')));
}

function addSizeRow(v = { name: '', price: '' }, focus = false) {
  const li = document.createElement('li');
  li.className = 'sizes__row';
  li.innerHTML = `<input class="input" data-size-name maxlength="30" placeholder="e.g. Solo" value="${esc(v.name)}" aria-label="Size name">
    <span class="money-input"><span>₱</span><input class="input" data-size-price inputmode="decimal" placeholder="0" value="${esc(v.price)}" aria-label="Price"></span>
    <button type="button" class="iconbtn" data-remove-size aria-label="Remove this size">${icon('i-close', 'icon--sm')}</button>`;
  $('#sizeRows').append(li);
  if (focus) $('[data-size-name]', li).focus();
}

function markSections() {
  $$('[data-pick-section]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.pickSection === form.elements.section.value.trim())));
}

function openProduct(item = null) {
  editing = item;
  form.reset();
  $('#productError').hidden = true;
  $('#productSheetTitle').textContent = item ? 'Edit product' : 'Add product';
  $('#productSave').textContent = item ? 'Save changes' : 'Add product';
  $('#productDelete').hidden = !item;
  const sections = [...new Set(home.shop.menu.map((i) => i.section).filter(Boolean))];
  $('#sectionList').innerHTML = sections.map((s) => `<option value="${esc(s)}">`).join('');
  $('#sectionChips').innerHTML = sections.map((s) => `<button type="button" class="qchip" data-pick-section="${esc(s)}">${esc(s)}</button>`).join('');
  $('#sizeRows').innerHTML = '';
  const variants = item ? itemVariants(item) : [];
  form.elements.name.value = item ? item.name : '';
  form.elements.section.value = item ? item.section || '' : '';
  form.elements.note.value = item ? item.note || '' : '';
  form.elements.price.value = item ? String(item.price) : '';
  const group = item && (item.options || []).find((o) => o.type === 'one' && o.required);
  form.elements.variantLabel.value = group ? group.name : 'Size';
  variants.forEach((v) => addSizeRow({ name: v.name, price: String(v.price) }));
  available = item ? home.available[item.id] !== false : true;
  $('#pAvailable').setAttribute('aria-checked', String(available));
  $('#noteCount').textContent = `${form.elements.note.value.length}/140`;
  markSections();
  setPhoto(item ? item.image : null);
  sheet.showModal();
  setMode(variants.length ? 'sizes' : 'one');
  if (!item) form.elements.name.focus();
}

async function pickPhoto(file) {
  if (!file) return;
  $('#photoDrop').classList.add('is-busy');
  try { setPhoto(await photoFromFile(file)); } catch (err) { toast(err.message); } finally { $('#photoDrop').classList.remove('is-busy'); }
}

$('#pPhoto').addEventListener('change', (e) => { pickPhoto(e.target.files[0]); e.target.value = ''; });
$('#photoRemove').addEventListener('click', () => setPhoto(null));
['dragenter', 'dragover'].forEach((t) => $('#photoDrop').addEventListener(t, (e) => { e.preventDefault(); $('#photoDrop').classList.add('is-over'); }));
['dragleave', 'drop'].forEach((t) => $('#photoDrop').addEventListener(t, () => $('#photoDrop').classList.remove('is-over')));
$('#photoDrop').addEventListener('drop', (e) => { e.preventDefault(); pickPhoto(e.dataTransfer.files[0]); });
$('#priceMode').addEventListener('click', (e) => { const b = e.target.closest('[data-mode]'); if (b) setMode(b.dataset.mode); });
$('#addSize').addEventListener('click', () => addSizeRow(undefined, true));
$('#sizeRows').addEventListener('click', (e) => {
  const b = e.target.closest('[data-remove-size]');
  if (!b) return;
  const li = b.closest('li');
  li.classList.add('is-leaving');
  setTimeout(() => li.remove(), reduceMotion() ? 0 : 160);
});
$('#sectionChips').addEventListener('click', (e) => {
  const b = e.target.closest('[data-pick-section]');
  if (!b) return;
  form.elements.section.value = b.dataset.pickSection;
  markSections();
});
form.elements.section.addEventListener('input', markSections);
form.elements.note.addEventListener('input', () => { $('#noteCount').textContent = `${form.elements.note.value.length}/140`; });
$('#pAvailable').addEventListener('click', () => { available = !available; $('#pAvailable').setAttribute('aria-checked', String(available)); });

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  const sizes = !$('#priceSizes').hidden;
  const variants = sizes ? $$('#sizeRows li').map((li) => ({
    name: $('[data-size-name]', li).value, price: $('[data-size-price]', li).value.replace(/[₱,\s]/g, ''),
  })).filter((v) => v.name.trim() || v.price) : [];
  const error = (msg) => { $('#productError').textContent = msg; $('#productError').hidden = false; flash($('#productError'), 'is-shake'); };
  if (sizes && variants.length < 2) { error('Add at least two sizes, or switch to “One price”.'); return; }
  if (sizes && variants.some((v) => !v.name.trim() || v.price === '' || Number.isNaN(Number(v.price)))) { error('Every size needs a name and a price.'); return; }
  const btn = $('#productSave');
  btn.disabled = true;
  try {
    const { item } = await saveMerchantItem({
      id: editing ? editing.id : undefined,
      name: form.elements.name.value,
      section: form.elements.section.value,
      note: form.elements.note.value,
      price: String(form.elements.price.value).replace(/[₱,\s]/g, ''),
      variants,
      variantLabel: form.elements.variantLabel.value,
      image: photo,
    });
    if (!editing || (home.available[item.id] !== false) !== available) await setItemAvailable(item.id, available);
    sheet.close();
    toast(editing ? 'Product saved.' : `${item.name} added.`);
    await reload();
    const row = $(`.prow[data-id="${CSS.escape(item.id)}"]`);
    if (row) { flash(row, 'is-saved'); if (!editing) row.scrollIntoView({ behavior: reduceMotion() ? 'auto' : 'smooth', block: 'center' }); }
  } catch (err) { error(err.status === 400 || err.status === 507 ? err.message : errorMessage(err)); } finally { btn.disabled = false; }
});

$('#productDelete').addEventListener('click', async () => {
  if (!editing || !window.confirm(`Delete “${editing.name}”? Customers won’t see it any more.`)) return;
  try {
    await deleteMerchantItem(editing.id);
    sheet.close();
    toast(`${editing.name} deleted.`);
    await reload();
  } catch (err) { toast(errorMessage(err)); }
});

/* ---------- Events ---------- */

document.addEventListener('click', (e) => {
  if (e.target.closest('[data-add-product]')) { openProduct(); return; }
  const act = e.target.closest('[data-act]');
  if (!act) return;
  if (act.dataset.act === 'orders') { tab = 'new'; renderOrders(); go($('#ordersCard')); }
  if (act.dataset.act === 'photos') {
    const first = home.shop.menu.find((i) => !isOwnPhoto(i));
    if (first) openProduct(first); else go($('#products'));
  }
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

$('#orderTabs').addEventListener('click', (e) => {
  const b = e.target.closest('[data-tab]');
  if (!b) return;
  tab = b.dataset.tab;
  renderOrders();
});

$('#orderList').addEventListener('click', async (e) => {
  const b = e.target.closest('[data-action]');
  if (!b) return;
  const card = b.closest('.ocard2');
  $$('button', card).forEach((x) => { x.disabled = true; });
  try {
    await updateMerchantOrder(b.dataset.order, b.dataset.action);
    card.classList.add('is-leaving');
    await new Promise((r) => setTimeout(r, reduceMotion() ? 0 : 220));
    toast(`Order ${b.dataset.order} ${DONE_MSG[b.dataset.action] || 'updated'}.`);
    await reload();
  } catch (err) {
    toast(err.status === 409 ? err.message : errorMessage(err));
    $$('button', card).forEach((x) => { x.disabled = false; });
  }
});

$('#menuList').addEventListener('click', async (e) => {
  const edit = e.target.closest('[data-edit]');
  if (edit) { openProduct(home.shop.menu.find((i) => i.id === edit.dataset.edit)); return; }
  const b = e.target.closest('[data-item]');
  if (!b) return;
  const id = b.dataset.item;
  const next = home.available[id] === false;
  try {
    await setItemAvailable(id, next);
    home.available[id] = next;
    renderProducts();
    flash($(`.prow[data-id="${CSS.escape(id)}"]`), next ? 'is-on' : 'is-offing');
  } catch (err) { toast(errorMessage(err)); }
});

addEventListener('resize', () => slidePill($('#orderTabs')));

reload();
