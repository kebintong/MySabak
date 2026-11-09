/* Your order (pages/order.html?id=…): a live map of the delivery (shop, drop-off, the rider gliding along), then the
   order as a receipt ticket (status, progress, lines, delivery) and a tip for mysabak. */
import { CONFIG } from '../config.js';
import { orderStatus, myTips, shopMenu, orderRoute } from '../api.js';
import { $, $$, mountChrome, esc, peso, pesoOr, params, when, openTipSheet, pop } from '../ui.js';
import { shopMap } from '../shop-map.js';

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

// What happens next, in words, for each status
const NOW = {
  placed: 'Waiting for the shop to accept it.',
  accepted: 'The shop accepted it and will start shortly.',
  preparing: 'The shop is making it now. A rider picks it up when it’s ready.',
  ready: 'Ready for pickup. A rider is on the way to the shop.',
  picked_up: 'Your rider has your order and is on the way to you.',
  delivered: 'Delivered. Enjoy!',
  cancelled: 'This order was cancelled.',
};
// The ticket's four steps: Placed, Preparing, On the way, Delivered (4 = all done)
const SEG = { placed: 0, accepted: 0, preparing: 1, ready: 1, picked_up: 2, delivered: 4 };
const ENDED = ['delivered', 'cancelled'];

let shownStatus = null;
async function render(order) {
  const tips = (await myTips()).filter((t) => t.orderId === order.id);
  const tipTotal = tips.reduce((n, t) => n + t.amount, 0);
  const method = CONFIG.shopPaymentMethods.find((m) => m.id === order.payment);

  $('#shopName').textContent = order.shop.name;
  const paid = order.payment === 'cash' ? 'cash on delivery' : `paid with ${method ? method.name : order.payment}`;
  $('#orderMeta').textContent = `Ordered ${when(order.placedAt)}, ${paid}`;
  $('#nowSub').textContent = NOW[order.status] || '';
  $('#orderId').textContent = order.id;

  // Progress: done steps fill purple, the current one is ringed gold (cancelled: none); a new step gives a small bounce
  const at = order.status === 'cancelled' ? -1 : SEG[order.status] ?? 0;
  $$('#steps li').forEach((s, i) => {
    s.className = i < at ? 'is-done' : i === at ? 'is-now' : '';
    if (i === at) s.setAttribute('aria-current', 'step'); else s.removeAttribute('aria-current');
  });
  $('#steps').style.setProperty('--done', Math.max(0, Math.min(at, 3)) / 3);
  if (shownStatus && shownStatus !== order.status && at >= 0 && at < 4) pop($$('#steps i')[at], 1.12);
  shownStatus = order.status;

  const fee = order.deliveryFee;
  const total = order.subtotal + (typeof fee === 'number' ? fee : 0) + tipTotal;
  const line = (name, sub, amount, cls = '') => `<div class="orc__line${cls}"><dt>${name}${sub ? `<small>${sub}</small>` : ''}</dt><dd>${amount}</dd></div>`;
  $('#receipt').innerHTML = [
    ...order.lines.map((l) => line(esc(l.name), [...(l.options || []).map(esc), l.note ? `“${esc(l.note)}”` : '', `${l.qty} × ${peso(l.price)}`].filter(Boolean).join(' · '), peso(l.price * l.qty))),
    line('Delivery fee', '100% to your rider', pesoOr(fee)),
    tipTotal ? line('Tip', '100% to mysabak', peso(tipTotal)) : '',
    line('Total', '', typeof fee === 'number' ? peso(total) : `${peso(total)} + delivery`, ' orc__line--total'),
  ].join('');

  $('#details').innerHTML = [['Deliver to', order.address && order.address.label], ['Note', order.notes]]
    .filter(([, v]) => v).map(([k, v]) => `<li><span>${k}</span><b>${esc(v)}</b></li>`).join('');

  $('#tipBtn').hidden = Date.now() - order.placedAt >= TIP_WINDOW_MS;
  $('#tipBtn').lastChild.textContent = tipTotal ? 'Tip mysabak again' : 'Tip mysabak';
  drawMap(order);
}

// The map: drawn once (shop pin, drop-off, the line between). The rider glides to each new position over GLIDE ms,
// so it moves smoothly between refreshes instead of jumping.
const GLIDE = 2000;
let map = null;
let mapping = null;
async function drawMap(order) {
  if (!mapping) mapping = setUpMap(order);
  if (await mapping) map.moveRider(order.rider || null, GLIDE);
}
async function setUpMap(order) {
  const to = order.address && typeof order.address.lng === 'number' ? order.address : null;
  const shop = await shopMenu(order.shop.id).catch(() => null);
  if (!shop && !to) { $('#mapBox').hidden = true; return false; }
  map = shopMap($('#orderMap'), { cooperative: true, padding: () => ({ top: 56, bottom: 36, left: 44, right: 44 }) });
  if (shop) { map.setShops([shop]); map.setActive(shop.id); }
  if (to) map.setDest(to, 'You');
  if (!(shop && to)) { map.fit([[(shop || to).lng, (shop || to).lat]]); return true; }
  map.fit([[shop.lng, shop.lat], [to.lng, to.lat]]);
  // The roads between them (a straight line if routing fails); the rider rides these too
  const coords = await orderRoute(order).catch(() => [[shop.lng, shop.lat], [to.lng, to.lat]]);
  map.setRoute(coords);
  map.fit(coords, { animate: true });
  return true;
}

async function start() {
  let order;
  try { order = await orderStatus(params().get('id')); } catch (_) { $('#notFound').hidden = false; return; }
  $('#orderBody').hidden = false;
  await render(order);
  // shortcut: re-reads the order (every GLIDE ms while the rider is on the way, else 15 s) until it's delivered;
  // a backend could push status and rider positions instead
  const later = () => { if (!ENDED.includes(order.status)) setTimeout(refresh, order.status === 'picked_up' ? GLIDE : 15000); };
  const refresh = async () => {
    try { order = await orderStatus(order.id); await render(order); } catch (_) { /* try again next time */ }
    later();
  };
  later();
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
