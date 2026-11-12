/* Wallet (pages/wallet.html): payment methods and the customer's tips. */
import { CONFIG } from '../config.js';
import { myTips, myTrips, myOrders, currentUser } from '../api.js';
import { isNum } from '../money.js';
import { $, $$, mountChrome, esc, when, peso, icon, emptyRows } from '../ui.js';

mountChrome({ roles: ['client'] });

const KIND = { ride: 'Ride', express: 'Express', shop: 'Shop order', direct: 'Without a ride' };
const METHOD = Object.fromEntries([...CONFIG.ridePayments, ...CONFIG.tips.methods].map((m) => [m.id, m.name])); // how a tip was paid, by name

$('#payList').innerHTML = CONFIG.ridePayments.map((m) => `<li class="wpay">
  <span class="wpay__icon">${icon(m.icon)}</span>
  <span class="wpay__text"><span class="wpay__name">${esc(m.name)}</span><span class="wpay__hint">${esc(m.hint)}</span></span></li>`).join('');

myTips().then((tips) => {
  $('#tipsTotal').textContent = peso(tips.reduce((sum, t) => sum + t.amount, 0));
  $('#tipList').innerHTML = tips.length
    ? tips.map((t) => `<li class="row"><div class="row__main"><span class="row__title">${esc(KIND[t.orderType] || t.orderType)}</span>
        <span class="row__sub">${esc(when(t.at))} · ${esc(METHOD[t.method] || t.method)}</span></div><span class="row__end">${peso(t.amount)}</span></li>`).join('')
    : '<li class="empty">No tips yet. You can tip after a ride, an Express delivery or a shop order.</li>';
});

/* ---------- Recent payments: rides and shop orders, newest first, five at a time; a filter for each kind ---------- */
const names = (list) => Object.fromEntries(list.map((m) => [m.id, m.name]));
const RIDE_PAY = names(CONFIG.ridePayments); // rides and shop orders name cash differently ("Cash", "Cash on delivery")
const SHOP_PAY = names(CONFIG.shopPaymentMethods);
let recent = [];
let show = 'all';
function drawRecent() {
  const list = recent.filter((r) => show === 'all' || r.kind === show).slice(0, 5);
  $('#recentList').classList.remove('skel-rows');
  $('#recentList').innerHTML = list.length
    ? list.map((r) => `<li><a class="wrecent__row" href="${r.href}">${icon(r.icon)}
        <span class="wrecent__text"><b>${esc(r.title)}</b><span>${esc(when(r.at))} · ${esc(r.how)}</span></span>
        ${r.end ? `<span class="wrecent__end">${r.end}</span>` : ''}${icon('i-chevron', 'wrecent__chev')}</a></li>`).join('')
    : emptyRows('No payments yet', show === 'shop' ? 'Your shop orders show up here.' : 'Your rides and shop orders show up here.');
}
$$('.wfilter').forEach((b) => b.addEventListener('click', () => {
  show = b.dataset.show;
  $$('.wfilter').forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
  drawRecent();
}));
Promise.all([myTrips(), myOrders()]).then(([trips, orders]) => {
  recent = [
    ...trips.map((t) => ({
      kind: 'rides', at: t.at, icon: t.kind === 'express' ? 'i-box' : 'i-car', href: '/pages/trips.html',
      title: `${t.kind === 'express' ? 'Parcel' : 'Ride'} to ${t.dropoff && t.dropoff.label ? t.dropoff.label : 'your drop-off'}`,
      how: RIDE_PAY[t.payment] || t.payment || 'Cash',
      end: t.price && isNum(t.price.total) ? peso(t.price.total) : '', // the fare shows once fares are set
    })),
    ...orders.filter((o) => o.status !== 'cancelled').map((o) => ({
      kind: 'shop', at: o.placedAt, icon: 'i-bag', href: `/pages/order.html?id=${encodeURIComponent(o.id)}`,
      title: o.shop.name, how: SHOP_PAY[o.payment] || o.payment || 'Cash',
      end: isNum(o.deliveryFee) ? peso(o.subtotal + o.deliveryFee) : `${peso(o.subtotal)} + delivery`,
    })),
  ].sort((a, b) => b.at - a.at);
  drawRecent();
});

// The card carries your name
currentUser().then((me) => { if (me && me.name) $('#cardName').textContent = `${me.name} · `; });
