/* Cart (pages/cart.html): what's in the cart now (change amounts, then checkout) and past shop orders.
   One shop per cart (js/cart.js). Prices always come from the menu (money.js → cartTotals). */
import { shopMenu, myOrders, ORDER_STEPS } from '../api.js';
import { cartTotals } from '../money.js';
import { getCart, setLineQty, clearCart } from '../cart.js';
import { $, mountChrome, esc, when, peso, pesoOr, pop, cartRows, showOrder, icon, pager, emptyRows } from '../ui.js';

mountChrome({ roles: ['client'] });

const stepName = (id) => (ORDER_STEPS.find((s) => s.id === id) || { name: id }).name;
let shop = null;
let orders = [];
let page = 1;
const PER = 6; // orders on a page

function renderCart() {
  const t = shop ? cartTotals(getCart(), shop.menu) : { lines: [], count: 0, subtotal: 0 };
  $('#cartFull').hidden = !t.count;
  $('#cartEmpty').hidden = Boolean(t.count);
  $('#cartShop').hidden = !t.count;
  showOrder(t.count, peso(t.subtotal));
  if (!t.count) return t;
  $('#lines').innerHTML = cartRows(t.lines);
  $('#subtotal').textContent = peso(t.subtotal);
  $('#checkoutBtn').textContent = `Checkout · ${peso(t.subtotal)}`;
  return t;
}

$('#lines').addEventListener('click', (e) => {
  const b = e.target.closest('[data-step]');
  if (!b) return;
  const line = getCart().lines.find((l) => l.key === b.dataset.line);
  if (line) setLineQty(line.key, line.qty + Number(b.dataset.step));
  if (!renderCart().count) return;
  pop($('#subtotal'), 1.08);
  const same = $(`[data-line="${CSS.escape(b.dataset.line)}"]`, $('#lines'));
  if (same) pop(same.parentElement.querySelector('span'));
});

async function start() {
  const cart = getCart();
  if (cart.shopId) {
    try { shop = await shopMenu(cart.shopId); } catch (_) { clearCart(); } // the shop is gone: so is its cart
  }
  if (shop) {
    $('#cartShop').textContent = shop.name;
    $('#cartShop').href = `/pages/shop.html?id=${encodeURIComponent(shop.id)}`;
  }
  renderCart();

  orders = await myOrders();
  renderOrders();
  // An empty cart offers the last shop again
  const last = orders.find((o) => o.status === 'delivered') || orders.find((o) => o.status !== 'cancelled');
  if (last) {
    $('#cartAgain').hidden = false;
    $('#cartAgain').href = `/pages/shop.html?id=${encodeURIComponent(last.shop.id)}`;
    $('#cartAgain').innerHTML = `${icon('i-rebook')}<span><b>Order again from ${esc(last.shop.name)}</b><span>${last.lines && last.lines[0] ? esc(last.lines[0].name) : 'Your last order'}</span></span>${icon('i-chevron', 'cempty__chev')}`;
  }
}

/** One page of past orders, newest first, with numbered pages when there are more than 6. */
function renderOrders() {
  page = Math.min(page, Math.max(1, Math.ceil(orders.length / PER)));
  $('#orderList').innerHTML = orders.length
    ? orders.slice((page - 1) * PER, page * PER).map((o) => `<li><a class="row row--link" href="/pages/order.html?id=${encodeURIComponent(o.id)}">
        <div class="row__main"><span class="row__title">${esc(o.shop.name)}</span><span class="row__sub">${esc(when(o.placedAt))} · ${esc(stepName(o.status))}</span></div>
        <span class="row__end">${pesoOr(o.subtotal)}</span></a></li>`).join('')
    : emptyRows('No shop orders yet', 'Your orders show up here.');
  $('#orderPages').innerHTML = pager(page, orders.length, PER, 'orders');
}
$('#orderPages').addEventListener('click', (e) => {
  const b = e.target.closest('[data-page]');
  if (!b || b.disabled) return;
  page = Number(b.dataset.page);
  renderOrders();
  $('#ordersTitle').scrollIntoView({ behavior: 'smooth', block: 'start' });
  $('#orderPages [aria-current="page"]').focus({ preventScroll: true });
});

start();
