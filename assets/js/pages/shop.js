/* One shop (pages/shop.html?id=…): menu with + / − and a cart bar. One shop per cart. */
import { shopMenu, errorMessage } from '../api.js';
import { cartTotals } from '../money.js';
import { getCart, setQty } from '../cart.js';
import { $, mountChrome, esc, peso, params, icon, toast } from '../ui.js';

mountChrome();

let shop = null;

function qtyOf(itemId) {
  const cart = getCart();
  return cart.shopId === shop.id ? cart.items[itemId] || 0 : 0;
}

function control(item) {
  const q = qtyOf(item.id);
  return q
    ? `<div class="stepper" role="group" aria-label="${esc(item.name)} quantity">
        <button type="button" data-step="-1" data-id="${item.id}" aria-label="One less">${icon('i-minus', 'icon--sm')}</button>
        <span aria-live="polite">${q}</span>
        <button type="button" data-step="1" data-id="${item.id}" aria-label="One more">${icon('i-plus', 'icon--sm')}</button></div>`
    : `<button type="button" class="button button--ghost add-btn" data-step="1" data-id="${item.id}">Add</button>`;
}

function render() {
  $('#menu').innerHTML = shop.menu.map((m) => `<li class="row">
      <div class="row__main"><span class="row__title">${esc(m.name)}</span>${m.note ? `<span class="row__sub">${esc(m.note)}</span>` : ''}
      <span class="row__price">${peso(m.price)}</span></div>
      <div data-control="${m.id}">${control(m)}</div></li>`).join('');
  const cart = getCart();
  const t = cart.shopId === shop.id ? cartTotals(cart, shop.menu) : { count: 0, subtotal: 0 };
  $('#cartBar').hidden = !t.count;
  $('#cartCount').textContent = `${t.count} item${t.count === 1 ? '' : 's'}`;
  $('#cartTotal').textContent = peso(t.subtotal);
  document.body.classList.toggle('has-cartbar', Boolean(t.count));
}

$('#menu').addEventListener('click', (e) => {
  const b = e.target.closest('[data-step]');
  if (!b) return;
  const cart = getCart();
  if (cart.shopId && cart.shopId !== shop.id && Object.keys(cart.items).length) {
    // eslint-disable-next-line no-alert
    if (!window.confirm('Start a new cart? Your cart from another shop will be cleared.')) return;
  }
  setQty(shop.id, b.dataset.id, qtyOf(b.dataset.id) + Number(b.dataset.step));
  render();
});

async function start() {
  try {
    shop = await shopMenu(params().get('id'));
  } catch (err) {
    $('#shopName').textContent = 'Shop not found';
    toast(err.status === 404 ? 'That shop isn’t available.' : errorMessage(err));
    return;
  }
  document.title = `${shop.name} · mysabak`;
  $('#shopName').textContent = shop.name;
  $('#shopMeta').textContent = `${shop.area} · ${shop.hours}`;
  const t = $('#shopTile');
  t.textContent = shop.name[0];
  t.style.setProperty('--tile', shop.color);
  render();
}

start();
