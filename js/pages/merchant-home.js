/* Merchant dashboard (pages/merchant-home.html): open / close, orders, menu availability, editing the shop and its
   products (photo, name, description, price). No POS (Stage 2). */
import {
  merchantHome, setShopOpen, setItemAvailable, updateMerchantOrder, updateShop, updateItem, MERCHANT_ACTIONS, ORDER_STEPS,
  errorMessage,
} from '../api.js';
import { itemPicture, storefront } from '../placeholders.js';
import { $, mountChrome, esc, peso, when, toast, edgeGlow } from '../ui.js';

mountChrome({ roles: ['merchant'] });

/* Three live columns (tabs on phones); finished orders fold away under "Done today" */
const COLS = [
  { id: 'new', label: 'New', statuses: ['placed'], empty: 'No new orders. They’ll show up here as soon as a customer orders.' },
  { id: 'cooking', label: 'Preparing', statuses: ['accepted', 'preparing'], empty: 'Nothing being prepared right now.' },
  { id: 'ready', label: 'Ready', statuses: ['ready'], empty: 'Nothing waiting for a rider.' },
];
const DONE = ['picked_up', 'delivered', 'cancelled'];
let tab = 'new';
let home = null;

const stepName = (id) => (ORDER_STEPS.find((s) => s.id === id) || { name: id }).name;

const ago = (ts) => {
  const min = Math.round((Date.now() - ts) / 60000);
  if (min < 1) return 'Just now';
  if (min < 60) return `${min} min ago`;
  return when(ts);
};
const reduceMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const shopPicture = (shop) => (shop.image ? `<img src="${esc(shop.image)}" alt="">` : storefront({ ...shop, sign: '' }));
const itemPic = (i) => (i.image ? `<img src="${esc(i.image)}" alt="" loading="lazy">` : itemPicture(i, '#6a2fb0'));

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

const orderCard = (o, i) => `<li class="ocard ocard--${esc(o.status)}" style="--i:${i}">
    <div class="ocard__head"><span class="ocard__who">${esc(o.customer || 'Customer')} <span class="ocard__id">· ${esc(o.id)}</span></span>
      <span>${esc(ago(o.placedAt))}${o.demo ? ' <span class="tag-demo">Sample</span>' : ''}</span></div>
    <ul class="morder__lines">${o.lines.map((l) => `<li>${l.qty} × ${esc(l.name)}${(l.options || []).length ? ` <span>· ${esc(l.options.join(', '))}</span>` : ''}${l.note ? ` <span>“${esc(l.note)}”</span>` : ''}</li>`).join('')}</ul>
    ${o.notes ? `<p class="ocard__note">“${esc(o.notes)}”</p>` : ''}
    <div class="ocard__foot"><span class="ocard__total">${peso(o.subtotal)}</span>
      ${(MERCHANT_ACTIONS[o.status] || []).length ? `<div class="morder__actions">${MERCHANT_ACTIONS[o.status].map((a) =>
    `<button type="button" class="button${a.id === 'decline' ? ' button--ghost' : ''}" data-order="${esc(o.id)}" data-action="${a.id}">${esc(a.label)}</button>`).join('')}</div>`
    : `<span class="badge">${esc(stepName(o.status))}</span>`}</div>
  </li>`;

function renderOrders() {
  const of = (statuses) => home.orders.filter((o) => statuses.includes(o.status));
  $('#orderTabs').innerHTML = COLS.map((c) => {
    const n = of(c.statuses).length;
    return `<button type="button" class="seg__btn" role="tab" data-tab="${c.id}" aria-selected="${c.id === tab}">${c.label}${n ? ` · ${n}` : ''}</button>`;
  }).join('');
  $('#orderCols').innerHTML = COLS.map((c) => {
    const list = of(c.statuses);
    return `<section class="ocol${c.id === tab ? ' is-active' : ''}" aria-label="${c.label} orders">
      <h3 class="ocol__head">${c.label}${list.length ? ` <b>${list.length}</b>` : ''}</h3>
      <ul class="mlist">${list.length ? list.map(orderCard).join('') : `<li class="empty">${c.empty}</li>`}</ul></section>`;
  }).join('');
  const done = of(DONE);
  $('#doneTitle').textContent = `Done today (${done.length})`;
  $('#doneList').innerHTML = done.length ? done.map(orderCard).join('') : '<li class="empty">No finished orders yet today.</li>';
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
  if (section !== 'all' && !sections.includes(section)) section = 'all';
  $('#menuFilter').innerHTML = ['all', ...sections].map((sec) =>
    `<button type="button" class="fchip" data-section="${esc(sec)}" aria-pressed="${sec === section}">${sec === 'all' ? 'All' : esc(sec)}</button>`).join('');
  const items = home.shop.menu.filter((i) => section === 'all' || i.section === section);
  $('#menuList').innerHTML = items.map((i, n) => {
    const on = home.available[i.id];
    const variants = variantsOf(i);
    return `<li class="pcard${on ? '' : ' is-off'}" style="--i:${n}">
      <div class="pcard__img">${itemPic(i)}
        <span class="pcard__section">${esc(i.section || '')}</span><span class="pcard__sold">Sold out</span></div>
      <div class="pcard__body">
        <div class="pcard__top"><h3 class="pcard__name">${esc(i.name)}</h3><span class="pcard__price">${variants.length > 1 ? '<small>from</small> ' : ''}${peso(i.price)}</span></div>
        ${i.note ? `<p class="pcard__desc">${esc(i.note)}</p>` : ''}
        ${variants.length ? `<ul class="pcard__variants" aria-label="Prices">${variants.map((v) => `<li><span>${esc(v.name)}</span><b>${peso(v.price)}</b></li>`).join('')}</ul>` : ''}
        <div class="pcard__foot"><span class="pcard__state">${on ? 'Available' : 'Sold out'}</span>
          <button type="button" class="button button--ghost pcard__edit" data-edit="${esc(i.id)}" aria-label="Edit ${esc(i.name)}">Edit</button>
          <button type="button" class="switch" role="switch" aria-checked="${on}" aria-label="${esc(i.name)} available" data-item="${esc(i.id)}"><span></span></button></div>
      </div></li>`;
  }).join('');
}

renderMenu.count = () => {
  const off = home.shop.menu.filter((i) => !home.available[i.id]).length;
  $('#menuCount').textContent = off ? `${off} sold out` : 'All available';
};

function renderShop() {
  const { shop } = home;
  $('#shopName').textContent = shop.name;
  $('#shopArea').textContent = shop.area;
  $('#shopHours').textContent = shop.hours || '';
  $('#shopAva').innerHTML = shop.image ? `<img src="${esc(shop.image)}" alt="">`
    : esc(shop.name.split(/\s+/).slice(0, 2).map((w) => w[0]).join('').toUpperCase());
  $('#shopPhoto').innerHTML = shopPicture(shop);
  $('#shopCardName').textContent = shop.name;
  $('#shopAbout').textContent = shop.about || 'Add a short description so customers know what you’re known for.';
}

function render() {
  const hour = new Date().getHours();
  const first = String(home.name || '').split(/\s+/)[0];
  $('#greeting').textContent = `${hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening'}${first ? `, ${first}` : ''}`;
  renderShop();
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

/* ---------- Edit sheet: one for the shop, one per product ---------- */

/** A picked photo, shrunk to at most `max` px on its long side, as a JPEG data URL (the backend uploads it). */
async function shrinkPhoto(file, max = 1000) {
  const img = await createImageBitmap(file);
  const scale = Math.min(1, max / Math.max(img.width, img.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(img.width * scale);
  canvas.height = Math.round(img.height * scale);
  canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
  img.close();
  return canvas.toDataURL('image/jpeg', 0.82);
}

/**
 * Open the edit sheet. `fields` is the form's inner HTML (after the photo); `save(form, photo)` sends the change,
 * `photo` being the new data URL or undefined when it wasn't changed.
 */
function openEditor({ title, picture, fields, save }) {
  const dlg = document.createElement('dialog');
  dlg.className = 'sheet medit';
  dlg.setAttribute('aria-labelledby', 'editTitle');
  dlg.innerHTML = `<form class="sheet__body" novalidate>
      <span class="sheet__handle" aria-hidden="true"></span>
      <h2 class="sheet__title" id="editTitle">${esc(title)}</h2>
      <label class="medit__photo"><span class="medit__pic">${picture}</span>
        <input type="file" name="photo" accept="image/jpeg,image/png,image/webp"><span class="medit__change">Change photo</span></label>
      ${fields}
      <p class="field__error" role="alert" hidden></p>
      <div class="sheet__actions"><button type="button" class="button button--ghost" value="cancel">Cancel</button><button type="submit" class="button">Save</button></div>
    </form>`;
  document.body.appendChild(dlg);
  const form = $('form', dlg);
  const error = $('.field__error', form);
  let photo;
  const { photo: picker } = form.elements;
  picker.addEventListener('change', async () => {
    const file = picker.files[0];
    if (!file) return;
    try {
      photo = await shrinkPhoto(file);
      $('.medit__pic', form).innerHTML = `<img src="${esc(photo)}" alt="">`;
      error.hidden = true;
    } catch (_) {
      error.textContent = 'That picture couldn’t be opened. Try a JPEG or PNG photo.';
      error.hidden = false;
    }
  });
  $('[value="cancel"]', form).addEventListener('click', () => dlg.close());
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = $('[type="submit"]', form);
    btn.disabled = true;
    error.hidden = true;
    try {
      await save(form, photo);
      dlg.close();
      toast('Saved.');
      await reload();
    } catch (err) {
      if (err.status === 401) { location.replace('/pages/merchant.html'); return; }
      error.textContent = err.status >= 400 && err.status < 500 ? err.message : errorMessage(err);
      error.hidden = false;
      btn.disabled = false;
    }
  });
  dlg.addEventListener('close', () => dlg.remove());
  if (typeof dlg.showModal === 'function') dlg.showModal(); else dlg.setAttribute('open', '');
}

const field = (label, control, hint = '') => `<label class="field"><span class="field__label">${label}</span>${control}${hint ? `<span class="field__hint">${hint}</span>` : ''}</label>`;

$('#editShop').addEventListener('click', () => {
  const { shop } = home;
  openEditor({
    title: 'Edit your shop',
    picture: shopPicture(shop),
    fields: field('Shop name', `<input class="input" name="name" required maxlength="60" value="${esc(shop.name)}">`)
      + field('About your shop', `<textarea class="textarea" name="about" maxlength="200">${esc(shop.about || '')}</textarea>`, 'Shown to customers on your shop page. Up to 200 characters.'),
    save: ({ elements: f }, image) => updateShop({ name: f.name.value, about: f.about.value, image }),
  });
});

$('#menuList').addEventListener('click', (e) => {
  const b = e.target.closest('[data-edit]');
  if (!b) return;
  const item = home.shop.menu.find((i) => i.id === b.dataset.edit);
  const sections = [...new Set(home.shop.menu.map((i) => i.section).filter(Boolean))];
  openEditor({
    title: `Edit ${item.name}`,
    picture: itemPic(item),
    fields: field('Name', `<input class="input" name="name" required maxlength="60" value="${esc(item.name)}">`)
      + field('Description', `<textarea class="textarea" name="note" maxlength="200">${esc(item.note || '')}</textarea>`)
      + `<div class="medit__row">${field('Price (₱)', `<input class="input" name="price" type="number" inputmode="numeric" min="1" step="1" required value="${item.price}">`,
        variantsOf(item).length > 1 ? 'Sizes add their price on top.' : '')}
        ${field('Section', `<input class="input" name="section" required maxlength="30" list="menuSections" value="${esc(item.section || '')}">`)}</div>
        <datalist id="menuSections">${sections.map((s) => `<option value="${esc(s)}">`).join('')}</datalist>`,
    save: ({ elements: f }, image) => updateItem(item.id, {
      name: f.name.value, note: f.note.value, price: f.price.value, section: f.section.value, image,
    }),
  });
});

/* ---------- Orders, open switch, availability ---------- */

$('#orderTabs').addEventListener('click', (e) => {
  const b = e.target.closest('[data-tab]');
  if (!b) return;
  tab = b.dataset.tab;
  renderOrders();
});

$('#merchantHome').addEventListener('click', async (e) => {
  const b = e.target.closest('[data-action]');
  if (!b) return;
  b.disabled = true;
  try {
    await updateMerchantOrder(b.dataset.order, b.dataset.action);
    if (b.dataset.action === 'accept') edgeGlow('reward', b);
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
