/* Order tracking (pages/order.html?id=…): status, receipt, tip, delivery details. */
import { CONFIG } from '../config.js';
import { orderStatus, myTips, ORDER_STEPS } from '../api.js';
import { $, mountChrome, esc, peso, pesoOr, params, when, openTipSheet } from '../ui.js';

mountChrome();

const TIP_WINDOW_MS = 24 * 60 * 60 * 1000; // tip from the receipt for 24 hours

async function render(order) {
  const tips = (await myTips()).filter((t) => t.orderId === order.id);
  const tipTotal = tips.reduce((n, t) => n + t.amount, 0);
  const at = ORDER_STEPS.findIndex((s) => s.id === order.status);
  $('#orderTitle').textContent = order.shop.name;
  $('#orderMeta').textContent = `Order ${order.id} · ${when(order.placedAt)}`;
  $('#timeline').innerHTML = ORDER_STEPS.map((s, i) =>
    `<li class="${i < at ? 'is-done' : i === at ? 'is-current' : ''}"><span>${esc(s.name)}</span></li>`).join('');

  const fee = order.deliveryFee;
  const total = order.subtotal + (typeof fee === 'number' ? fee : 0) + tipTotal;
  $('#receipt').innerHTML = `
    ${order.lines.map((l) => `<div class="receipt__row"><dt>${esc(l.name)}<span>${l.qty} × ${peso(l.price)}</span></dt><dd>${peso(l.price * l.qty)}</dd></div>`).join('')}
    <div class="receipt__row"><dt>Items subtotal<span>to ${esc(order.shop.name)}</span></dt><dd>${peso(order.subtotal)}</dd></div>
    <div class="receipt__row"><dt>Delivery fee<span>100% to your rider</span></dt><dd>${pesoOr(fee)}</dd></div>
    ${tipTotal ? `<div class="receipt__row"><dt>Tip<span>100% to mysabak</span></dt><dd>${peso(tipTotal)}</dd></div>` : ''}
    <div class="receipt__row receipt__row--total"><dt>Total</dt><dd>${typeof fee === 'number' ? peso(total) : `${peso(total)} + delivery`}</dd></div>`;

  const canTip = Date.now() - order.placedAt < TIP_WINDOW_MS;
  $('#tipBtn').hidden = !canTip;
  $('#tipBtn').lastChild.textContent = tipTotal ? 'Tip mysabak again' : 'Tip mysabak';

  const method = CONFIG.shopPaymentMethods.find((m) => m.id === order.payment);
  $('#details').innerHTML = [
    ['Address', order.address.label],
    ['Pay with', method ? method.name : order.payment],
    order.notes ? ['Notes', order.notes] : null,
  ].filter(Boolean).map(([k, v]) => `<li class="row"><div class="row__main"><span class="row__sub">${esc(k)}</span><span class="row__title">${esc(v)}</span></div></li>`).join('');
}

async function start() {
  let order;
  try { order = await orderStatus(params().get('id')); } catch (_) { $('#notFound').hidden = false; return; }
  $('#orderBody').hidden = false;
  await render(order);
  $('#tipBtn').addEventListener('click', async () => {
    const res = await openTipSheet({
      orderId: order.id,
      orderType: 'shop',
      title: 'Tip mysabak',
      subtitle: `${order.shop.name} · order ${order.id}`,
    });
    if (res) render(order);
  });
}

start();
