/* Your order (pages/order.html?id=…): the order as a receipt ticket (status stamp, steps, lines, order number),
   then Track on map, Call shop and Tip mysabak. */
import { CONFIG } from '../config.js';
import { orderStatus, myTips, shopMenu } from '../api.js';
import { $, mountChrome, esc, peso, pesoOr, params, when, openTipSheet, pop } from '../ui.js';

mountChrome({ roles: ['client'] });

const TIP_WINDOW_MS = 24 * 60 * 60 * 1000; // tip from the receipt for 24 hours

// Back: to the page you came from, named (Trips & Orders, Cart, a shop…). Straight after checkout, or from
// outside the app, it's Trips & Orders: going back to checkout would show an empty cart.
const BACK_TO = [['/pages/trips', 'Trips & Orders'], ['/pages/cart', 'Cart'], ['/pages/shops', 'Shops'], ['/pages/shop', 'Shop'],
  ['/pages/wallet', 'Wallet'], ['/pages/account', 'Account'], ['/index.html', 'Home']];
function backLink() {
  let from = null;
  try { from = new URL(document.referrer); } catch (_) { /* no referrer */ }
  if (!from || from.origin !== location.origin) return;
  const place = from.pathname === '/' ? ['/', 'Home'] : BACK_TO.find(([path]) => from.pathname.startsWith(path));
  if (!place) return;
  const link = $('#backLink');
  link.href = from.pathname + from.search + from.hash;
  $('span', link).textContent = place[1];
  // the real Back, so the page you left comes back as it was (scroll, open card)
  link.addEventListener('click', (e) => { if (history.length > 1) { e.preventDefault(); history.back(); } });
}
backLink();

// The ticket's stamp, and which of its four steps a status is (the same four as the Trips & Orders card)
const STAMP = { placed: 'Order placed', accepted: 'Shop accepted', preparing: 'Preparing', ready: 'Ready for pickup',
  picked_up: 'On the way', delivered: 'Delivered', cancelled: 'Cancelled' };
const STEPS = ['Placed', 'Preparing', 'On the way', 'Delivered'];
const STEP_AT = { placed: 0, accepted: 0, preparing: 1, ready: 1, picked_up: 2, delivered: 4, cancelled: -1 };
const DONE = ['delivered', 'cancelled'];

let shownStatus = null;
async function render(order) {
  const tips = (await myTips()).filter((t) => t.orderId === order.id);
  const tipTotal = tips.reduce((n, t) => n + t.amount, 0);
  const done = DONE.includes(order.status);
  const at = STEP_AT[order.status] ?? 0;

  // Stamp: the status, a live dot while it's on its way; a new status gives it a small bounce
  $('#stamp').classList.toggle('is-done', done);
  $('#stamp').classList.toggle('is-cancelled', order.status === 'cancelled');
  $('#stampText').textContent = STAMP[order.status] || order.status;
  if (shownStatus && shownStatus !== order.status) pop($('#stamp'), 1.12);
  shownStatus = order.status;

  const method = CONFIG.shopPaymentMethods.find((m) => m.id === order.payment);
  $('#shopName').textContent = order.shop.name;
  $('#orderMeta').textContent = `${when(order.placedAt)} · ${method ? method.name : order.payment}`;
  $('#orderTo').textContent = [order.address && `To ${order.address.label}`, order.notes && `“${order.notes}”`].filter(Boolean).join(' · ');
  $('#orderId').textContent = order.id;

  const segs = $('#segs');
  if (!segs.children.length) segs.innerHTML = STEPS.map(() => '<span><i></i></span>').join('');
  [...segs.children].forEach((s, i) => { s.className = i < at ? 'is-done' : i === at ? 'is-now' : ''; });
  $('#steps').innerHTML = STEPS.map((s, i) => `<span${i === at ? ' class="is-now"' : ''}>${esc(s)}</span>`).join('');

  const fee = order.deliveryFee;
  const total = order.subtotal + (typeof fee === 'number' ? fee : 0) + tipTotal;
  const line = (name, sub, amount, cls = '') => `<div class="ticket__line${cls}"><dt>${name}${sub ? `<small>${sub}</small>` : ''}</dt><dd>${amount}</dd></div>`;
  $('#receipt').innerHTML = [
    ...order.lines.map((l) => line(esc(l.name), [...(l.options || []).map(esc), l.note ? `“${esc(l.note)}”` : '', `${l.qty} × ${peso(l.price)}`].filter(Boolean).join(' · '), peso(l.price * l.qty))),
    line('Delivery fee', '100% to your rider', pesoOr(fee)),
    tipTotal ? line('Tip', '100% to mysabak', peso(tipTotal)) : '',
    line('Total', '', typeof fee === 'number' ? peso(total) : `${peso(total)} + delivery`, ' ticket__line--total'),
  ].join('');

  // Actions: track it (its card opens on Trips & Orders) while it's on its way, call the shop, tip mysabak
  $('#trackBtn').hidden = done;
  $('#trackBtn').href = `/pages/trips.html#open=${encodeURIComponent(order.id)}`;
  $('#tipBtn').hidden = Date.now() - order.placedAt >= TIP_WINDOW_MS;
  $('#tipBtn').lastChild.textContent = tipTotal ? 'Tip again' : 'Tip mysabak';
}

// The shop's phone, for Call shop (sample shops have one; the button stays hidden without)
async function showCall(order) {
  const shop = await shopMenu(order.shop.id).catch(() => null);
  const tel = shop && shop.phone && shop.phone.replace(/[^\d+]/g, '');
  if (!tel) return;
  $('#callBtn').href = `tel:${tel}`;
  $('#callBtn').hidden = false;
}

async function start() {
  let order;
  try { order = await orderStatus(params().get('id')); } catch (_) { $('#notFound').hidden = false; return; }
  $('#orderBody').hidden = false;
  await render(order);
  showCall(order);
  // shortcut: re-reads the order every 15 s until it's delivered; a backend could push status changes instead
  const refresh = setInterval(async () => {
    try { order = await orderStatus(order.id); } catch (_) { return; }
    render(order);
    if (['delivered', 'cancelled'].includes(order.status)) clearInterval(refresh);
  }, 15000);
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
