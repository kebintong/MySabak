/* One shop (pages/shop.html?id=…): route map and shop card, menu sections, an options sheet
   for each item, and "Your order" (side column on wide screens, a sheet on phones).
   One shop per cart. Prices always come from the menu (money.js → cartTotals). */
import { shopMenu, routeBetween, straightLine, errorMessage } from '../api.js';
import { cartTotals } from '../money.js';
import { visibleGroups, defaultPicks, cleanPicks, unitPrice, openState } from '../menu.js';
import { getCart, addToCart, setLineQty, hasOtherShop } from '../cart.js';
import { itemPicture, storefront } from '../placeholders.js';
import { shopMap, knownLocation } from '../shop-map.js';
import { $, $$, mountChrome, esc, peso, pesoOr, params, icon, toast } from '../ui.js';

mountChrome({ roles: ['client'] });

const WIDE = window.matchMedia('(min-width: 1200px)'); // "Your order" becomes a column
let shop = null;

const pic = (item) => (item.image ? `<img src="${esc(item.image)}" alt="">` : itemPicture(item, shop && shop.color));
const slug = (t) => String(t).toLowerCase().replace(/[^a-z0-9]+/g, '-');

/* ---------- Shop card + map ---------- */
function renderInfo() {
  document.title = `${shop.name} · mysabak`;
  $('#shopName').textContent = shop.name;
  $('#shopAddr').textContent = shop.address || shop.area;
  $('#shopAva').innerHTML = shop.image ? `<img src="${esc(shop.image)}" alt="">` : storefront(shop);
  const o = openState(shop);
  $('#shopFacts').innerHTML = [
    shop.rating ? `<span>★ ${shop.rating.toFixed(1)}</span>` : '',
    `<span>${esc(shop.hours)}</span>`,
    o ? `<span class="${o.open ? 'is-open' : 'is-closed'}">${o.open ? 'Open now' : 'Closed now'}</span>` : '',
    '<span id="shopKm" hidden></span>',
  ].join('');
  $('#directions').href = `https://www.google.com/maps/search/?api=1&query=${shop.lat},${shop.lng}`;
  const phone = $('#phone');
  if (shop.phone) { phone.href = `tel:${shop.phone.replace(/[^\d+]/g, '')}`; phone.lastChild.textContent = shop.phone; } else phone.hidden = true;
  $('#shopAbout').textContent = shop.about || '';
  $('#shopAbout').hidden = !shop.about;
}

async function startMap() {
  const hero = shopMap($('#heroMap'), { interactive: false, padding: () => ({ top: 70, bottom: 60, left: 50, right: 50 }) });
  hero.setShops([shop]);
  hero.setActive(shop.id);
  hero.fit([[shop.lng, shop.lat]], { maxZoom: 15 });
  const me = await knownLocation();
  if (!me) return;
  hero.setUser(me);
  let trip;
  try { trip = await routeBetween(me, shop); } catch (_) { trip = straightLine(me, shop); }
  hero.setRoute(trip.coords);
  hero.fit(trip.coords.concat([[me.lng, me.lat], [shop.lng, shop.lat]]), { maxZoom: 15.5 });
  const kmEl = $('#shopKm');
  kmEl.textContent = `${trip.distanceKm.toFixed(1)} km`;
  kmEl.hidden = false;
  if (trip.minutes) {
    $('#eta').textContent = `~${trip.minutes} min ride to you`;
    $('#eta').hidden = false;
  }
}

/* ---------- Menu ---------- */
function sections() {
  const out = [];
  shop.menu.forEach((m) => {
    let sec = out.find((s) => s.name === m.section);
    if (!sec) { sec = { id: `sec-${slug(m.section || 'menu')}`, name: m.section || 'Menu', items: [] }; out.push(sec); }
    sec.items.push(m);
  });
  return out;
}

function renderMenu() {
  const secs = sections();
  $('#menuTabs').innerHTML = secs.map((s, i) => `<a class="menu-tab${i === 0 ? ' is-active' : ''}" href="#${s.id}" data-sec="${s.id}">${esc(s.name)}</a>`).join('');
  $('#menu').innerHTML = secs.map((s) => `<section class="msec" id="${s.id}" aria-labelledby="${s.id}-h">
      <h2 class="msec__title" id="${s.id}-h">${esc(s.name)}<span>${s.items.length} ${s.items.length === 1 ? 'item' : 'items'}</span></h2>
      <div class="msec__row${s.items[0].bundle ? ' msec__row--bundles' : ''}">
      ${s.items.map((m) => (m.bundle
    ? `<article class="bund"><span class="bund__img">${pic(m)}</span>
          <div class="bund__body"><h3>${esc(m.name)}</h3><p>${esc(m.note || '')}</p>
          <div class="bund__foot"><b>${peso(m.price)}</b><button type="button" class="bund__add" data-add="${esc(m.id)}" aria-label="Add ${esc(m.name)}">Add</button></div></div></article>`
    : `<button type="button" class="mcard" data-item="${esc(m.id)}">
          <span class="mcard__img">${pic(m)}</span>${m.tag ? `<em class="mcard__tag">${esc(m.tag)}</em>` : ''}
          <span class="mcard__name">${esc(m.name)}</span>${m.note ? `<span class="mcard__note">${esc(m.note)}</span>` : ''}
          <span class="mcard__foot"><span>${peso(m.price)}</span><i aria-hidden="true">${icon('i-plus', 'icon--sm icon--white')}</i></span>
          <span class="sr-only">Choose options</span></button>`)).join('')}
      </div></section>`).join('');
  watchSections();
}

// Light up the tab of the section you're looking at
let observer;
function watchSections() {
  if (observer) observer.disconnect();
  if (!('IntersectionObserver' in window)) return;
  observer = new IntersectionObserver((entries) => {
    const seen = entries.filter((e) => e.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)[0];
    if (!seen) return;
    $$('.menu-tab').forEach((t) => t.classList.toggle('is-active', t.dataset.sec === seen.target.id));
    const tab = $(`.menu-tab[data-sec="${seen.target.id}"]`);
    if (tab) tab.parentElement.scrollTo({ left: tab.offsetLeft - 12, behavior: 'smooth' });
  }, { root: $('#content'), rootMargin: '-30% 0px -60% 0px' });
  $$('.msec').forEach((s) => observer.observe(s));
}

$('#menuTabs').addEventListener('click', (e) => {
  const a = e.target.closest('[data-sec]');
  if (!a) return;
  e.preventDefault();
  $(`#${a.dataset.sec}`).scrollIntoView({ behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'start' });
});

$('#menu').addEventListener('click', (e) => {
  const add = e.target.closest('[data-add]');
  if (add) { addItem(shop.menu.find((m) => m.id === add.dataset.add), { qty: 1, picks: {}, note: '' }); return; }
  const card = e.target.closest('[data-item]');
  if (card) openItem(shop.menu.find((m) => m.id === card.dataset.item), card);
});

/* ---------- Adding to the order ---------- */
function addItem(item, { qty, picks, note }) {
  if (hasOtherShop(shop.id)) {
    // eslint-disable-next-line no-alert
    if (!window.confirm('Start a new order? Your order from another shop will be cleared.')) return false;
  }
  addToCart(shop.id, { id: item.id, qty, picks: cleanPicks(item, picks), note });
  toast(`Added ${qty > 1 ? `${qty} × ` : ''}${item.name}`);
  renderCart();
  return true;
}

/* ---------- Options sheet ---------- */
function openItem(item, opener) {
  let picks = defaultPicks(item);
  let qty = 1;
  const dlg = document.createElement('dialog');
  dlg.className = 'sheet opt-sheet';
  dlg.setAttribute('aria-labelledby', 'optTitle');
  dlg.innerHTML = `
    <div class="opt-sheet__scroll">
      <div class="opt-sheet__hero">${pic(item)}</div>
      <div class="opt-sheet__body">
        <h2 class="opt-sheet__title" id="optTitle">${esc(item.name)}</h2>
        ${item.note ? `<p class="opt-sheet__note">${esc(item.note)}</p>` : ''}
        <span class="opt-sheet__from">from ${peso(item.price)}</span>
        <div data-groups></div>
        <label class="ogroup ogroup--note"><span class="ogroup__head"><span class="ogroup__name">Notes for the shop</span><span class="ogroup__rule">Optional</span></span>
          <textarea class="textarea" data-note maxlength="200" placeholder="e.g. no onions, sauce on the side"></textarea></label>
      </div>
    </div>
    <div class="opt-sheet__foot">
      <div class="stepper" role="group" aria-label="How many">
        <button type="button" data-qty="-1" aria-label="One less">${icon('i-minus', 'icon--sm')}</button>
        <span data-count aria-live="polite">1</span>
        <button type="button" data-qty="1" aria-label="One more">${icon('i-plus', 'icon--sm')}</button>
      </div>
      <button type="button" class="hot-btn" data-addbtn>Add</button>
    </div>
    <button type="button" class="opt-sheet__x" data-close aria-label="Close">${icon('i-close', 'icon--lg icon--ink')}</button>`;
  document.body.appendChild(dlg);

  const groupsEl = $('[data-groups]', dlg);
  function render() {
    picks = cleanPicks(item, picks);
    groupsEl.innerHTML = visibleGroups(item, picks).map((g) => {
      const many = g.type === 'many';
      const rule = many ? `Up to ${g.max}` : g.required ? 'Required' : 'Optional';
      return `<div class="ogroup" role="group" aria-labelledby="og-${esc(g.id)}"><div class="ogroup__head"><span class="ogroup__name" id="og-${esc(g.id)}">${esc(g.name)}</span><span class="ogroup__rule" data-rule="${esc(g.id)}">${rule}</span></div>
        <div class="ochips">${g.choices.map((c) => {
    const on = many ? picks[g.id].includes(c.name) : picks[g.id] === c.name;
    return `<button type="button" class="ochip" aria-pressed="${on}" data-g="${esc(g.id)}" data-v="${esc(c.name)}">${esc(c.name)}${c.price ? `<small>+${peso(c.price)}</small>` : ''}${c.hint ? `<span class="sr-only">, ${esc(c.hint)}</span>` : ''}</button>`;
  }).join('')}</div>${g.choices.some((c) => c.hint) && !many ? `<p class="ogroup__hint">${esc(g.choices.find((c) => c.name === picks[g.id])?.hint || '')}</p>` : ''}</div>`;
    }).join('');
    $('[data-count]', dlg).textContent = qty;
    $('[data-addbtn]', dlg).textContent = `Add ${qty} · ${peso(unitPrice(item, picks) * qty)}`;
  }
  render();

  const close = () => { dlg.close(); dlg.remove(); if (opener) opener.focus(); };
  groupsEl.addEventListener('click', (e) => {
    const b = e.target.closest('[data-g]');
    if (!b) return;
    const g = item.options.find((x) => x.id === b.dataset.g);
    if (g.type === 'many') {
      const list = picks[g.id];
      if (list.includes(b.dataset.v)) picks[g.id] = list.filter((n) => n !== b.dataset.v);
      else if (list.length >= g.max) {
        const rule = groupsEl.querySelector(`[data-rule="${CSS.escape(g.id)}"]`);
        rule.textContent = `Up to ${g.max} · remove one first`;
        rule.classList.add('is-warn');
        return;
      } else picks[g.id] = [...list, b.dataset.v];
    } else picks[g.id] = b.dataset.v;
    render();
    const again = groupsEl.querySelector(`[data-g="${CSS.escape(b.dataset.g)}"][data-v="${CSS.escape(b.dataset.v)}"]`);
    if (again) again.focus();
  });
  dlg.addEventListener('click', (e) => {
    if (e.target === dlg || e.target.closest('[data-close]')) close();
    const q = e.target.closest('[data-qty]');
    if (q) { qty = Math.min(99, Math.max(1, qty + Number(q.dataset.qty))); render(); }
  });
  $('[data-addbtn]', dlg).addEventListener('click', () => {
    if (addItem(item, { qty, picks, note: $('[data-note]', dlg).value })) close();
  });
  dlg.addEventListener('cancel', (e) => { e.preventDefault(); close(); });
  if (typeof dlg.showModal === 'function') dlg.showModal(); else dlg.setAttribute('open', '');
}

/* ---------- Your order ---------- */
function renderCart() {
  const cart = getCart();
  const t = cart.shopId === shop.id ? cartTotals(cart, shop.menu) : { lines: [], count: 0, subtotal: 0 };
  $('#cartBody').innerHTML = t.count
    ? `<ul class="cline-list">${t.lines.map((l) => `<li class="cline">
          <div class="cline__main"><span class="cline__name">${esc(l.name)}</span>
            ${l.options.length ? `<span class="cline__opts">${esc(l.options.join(', '))}</span>` : ''}
            ${l.note ? `<span class="cline__opts">“${esc(l.note)}”</span>` : ''}
            <span class="cline__price">${peso(l.total)}</span></div>
          <div class="stepper" role="group" aria-label="${esc(l.name)} quantity">
            <button type="button" data-line="${esc(l.key)}" data-step="-1" aria-label="One less">${icon(l.qty === 1 ? 'i-close' : 'i-minus', 'icon--sm')}</button>
            <span>${l.qty}</span>
            <button type="button" data-line="${esc(l.key)}" data-step="1" aria-label="One more">${icon('i-plus', 'icon--sm')}</button></div></li>`).join('')}</ul>
        <dl class="receipt">
          <div class="receipt__row"><dt>Items<span>to ${esc(shop.name)}</span></dt><dd>${peso(t.subtotal)}</dd></div>
          <div class="receipt__row"><dt>Delivery fee<span>100% to your rider · set at checkout</span></dt><dd>${pesoOr(null)}</dd></div>
        </dl>
        <a class="hot-btn hot-btn--block" href="/pages/checkout.html">Checkout · ${peso(t.subtotal)}</a>
        <p class="cart-panel__foot">No service fee. You can tip mysabak after delivery if you like.</p>`
    : `<div class="cart-empty">${icon('i-bag', 'icon--xl')}<p>Your order is empty.</p><span>Tap an item to choose options and add it.</span></div>`;
  $('#cartCount').textContent = `${t.count} item${t.count === 1 ? '' : 's'}`;
  $('#cartPillTotal').textContent = `View order · ${peso(t.subtotal)}`;
  $('#cartPill').hidden = !t.count;
  document.body.classList.toggle('has-cart', Boolean(t.count));
  if (!t.count && !WIDE.matches) setCartOpen(false);
}

$('#cartBody').addEventListener('click', (e) => {
  const b = e.target.closest('[data-line]');
  if (!b) return;
  const line = getCart().lines.find((l) => l.key === b.dataset.line);
  if (line) setLineQty(line.key, line.qty + Number(b.dataset.step));
  renderCart();
});

// Wide screens: "Your order" is always open as a column. Narrower: a sheet the pill opens.
const panel = $('#cartPanel');
function layoutCart() {
  if (panel.open) panel.close();
  if (WIDE.matches) panel.show();
  $('#cartPill').setAttribute('aria-expanded', 'false');
}
function setCartOpen(open) {
  if (WIDE.matches) return;
  if (open && !panel.open) { panel.showModal(); $('#cartPill').setAttribute('aria-expanded', 'true'); }
  if (!open && panel.open) { panel.close(); }
}
panel.addEventListener('close', () => {
  $('#cartPill').setAttribute('aria-expanded', 'false');
  if (!WIDE.matches && !$('#cartPill').hidden) $('#cartPill').focus();
});
panel.addEventListener('click', (e) => { if (e.target === panel && !WIDE.matches) setCartOpen(false); }); // tap outside
$('#cartPill').addEventListener('click', () => setCartOpen(true));
$('#cartClose').addEventListener('click', () => setCartOpen(false));
WIDE.addEventListener('change', layoutCart);
layoutCart();

/* ---------- Start ---------- */
async function start() {
  try {
    shop = await shopMenu(params().get('id'));
  } catch (err) {
    $('#shopName').textContent = 'Shop not found';
    $('#shopAddr').textContent = 'This shop isn’t available. Go back to see shops near you.';
    document.body.classList.add('is-missing');
    toast(err.status === 404 ? 'That shop isn’t available.' : errorMessage(err));
    return;
  }
  renderInfo();
  renderMenu();
  renderCart();
  startMap();
}

start();
