/* Your order (pages/order.html?id=…): a live map of the delivery (shop, drop-off, the rider gliding along), then the
   order as a receipt ticket (status, progress, lines, delivery) and a tip for mysabak. */
import { CONFIG } from '../config.js';
import { orderStatus, myTips, shopMenu, straightLine, ORDER_STEPS } from '../api.js';
import { $, $$, mountChrome, esc, peso, pesoOr, params, when, openTipSheet, pop, calm } from '../ui.js';
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
// The ticket's four segments: Placed, Preparing, On the way, Delivered (4 = all done)
const SEG = { placed: 0, accepted: 0, preparing: 1, ready: 1, picked_up: 2, delivered: 4 };
const ENDED = ['delivered', 'cancelled'];

let shownStatus = null;
async function render(order) {
  const tips = (await myTips()).filter((t) => t.orderId === order.id);
  const tipTotal = tips.reduce((n, t) => n + t.amount, 0);
  const method = CONFIG.shopPaymentMethods.find((m) => m.id === order.payment);

  // The stamp: the exact status, blinking while it's live; a new status gives it a small bounce
  const step = ORDER_STEPS.find((s) => s.id === order.status);
  $('#stampText').textContent = order.status === 'cancelled' ? 'Cancelled' : step ? step.name : order.status;
  $('#stamp').className = `stamp${ENDED.includes(order.status) ? ` is-${order.status}` : ''}`;
  if (shownStatus && shownStatus !== order.status) pop($('#stamp'), 1.12);
  shownStatus = order.status;

  $('#shopName').textContent = order.shop.name;
  $('#orderMeta').textContent = [when(order.placedAt), method ? method.name : order.payment].filter(Boolean).join(' · ');
  $('#nowSub').textContent = NOW[order.status] || '';
  $('#orderId').textContent = order.id;

  // Progress: done segments fill purple, the current one half gold (cancelled: none)
  const at = order.status === 'cancelled' ? -1 : SEG[order.status] ?? 0;
  $$('#segs span').forEach((s, i) => { s.className = i < at ? 'is-done' : i === at ? 'is-now' : ''; });
  $$('#steps span').forEach((s, i) => s.classList.toggle('is-on', i === Math.min(at, 3)));

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
// a frame at a time, so it moves smoothly between refreshes instead of jumping.
const GLIDE = 2000;
let map = null;
let mapping = null;
let rider = null; // where the rider is drawn now
let glide = 0;
async function drawMap(order) {
  if (!mapping) mapping = setUpMap(order);
  if (!(await mapping)) return;
  const next = order.rider || null;
  cancelAnimationFrame(glide);
  if (!next || !rider || calm()) { rider = next; map.setRider(next); return; }
  const from = rider;
  const t0 = performance.now();
  const frame = (now) => {
    const f = Math.min(1, (now - t0) / GLIDE);
    rider = { lng: from.lng + (next.lng - from.lng) * f, lat: from.lat + (next.lat - from.lat) * f };
    map.setRider(rider);
    if (f < 1) glide = requestAnimationFrame(frame);
  };
  glide = requestAnimationFrame(frame);
}
async function setUpMap(order) {
  const to = order.address && typeof order.address.lng === 'number' ? order.address : null;
  const shop = await shopMenu(order.shop.id).catch(() => null);
  if (!shop && !to) { $('#mapBox').hidden = true; return false; }
  map = shopMap($('#orderMap'), { cooperative: true, padding: () => ({ top: 56, bottom: 36, left: 44, right: 44 }) });
  if (shop) { map.setShops([shop]); map.setActive(shop.id); }
  if (to) map.setDest(to, 'You');
  if (shop && to) {
    const coords = straightLine(shop, to).coords;
    map.setRoute(coords);
    map.fit(coords);
  } else map.fit([[(shop || to).lng, (shop || to).lat]]);
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
