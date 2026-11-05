/* Cart (pages/cart.html): what's in the cart now (change amounts, then checkout) and past shop orders.
   One shop per cart (js/cart.js). Prices always come from the menu (money.js → cartTotals). */
import { shopMenu, myOrders, ORDER_STEPS } from '../api.js';
import { cartTotals } from '../money.js';
import { getCart, setLineQty, clearCart } from '../cart.js';
import { $, mountChrome, esc, when, peso, pesoOr, pop, cartRows, showOrder } from '../ui.js';

mountChrome({ roles: ['client'] });

const stepName = (id) => (ORDER_STEPS.find((s) => s.id === id) || { name: id }).name;
let shop = null;

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

  const orders = await myOrders();
  $('#orderList').innerHTML = orders.length
    ? orders.map((o) => `<li><a class="row row--link" href="/pages/order.html?id=${encodeURIComponent(o.id)}">
        <div class="row__main"><span class="row__title">${esc(o.shop.name)}</span><span class="row__sub">${esc(when(o.placedAt))} · ${esc(stepName(o.status))}</span></div>
        <span class="row__end">${pesoOr(o.subtotal)}</span></a></li>`).join('')
    : '<li class="empty">No shop orders yet. Your orders show up here.</li>';
}

start();
