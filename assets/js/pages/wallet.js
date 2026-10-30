/* Wallet (pages/wallet.html): payment methods and the customer's tips. */
import { CONFIG } from '../config.js';
import { myTips } from '../api.js';
import { $, mountChrome, esc, when, peso, icon } from '../ui.js';

mountChrome({ roles: ['client'] });

const KIND = { ride: 'Ride', express: 'Express', shop: 'Shop order', direct: 'Without a ride' };

$('#payList').innerHTML = CONFIG.ridePayments.map((m) => `<li class="row">
  <span class="file__icon">${icon(m.icon)}</span>
  <div class="row__main"><span class="row__title">${esc(m.name)}</span><span class="row__sub">${esc(m.hint)}</span></div></li>`).join('');

myTips().then((tips) => {
  $('#tipsTotal').textContent = peso(tips.reduce((sum, t) => sum + t.amount, 0));
  $('#tipList').innerHTML = tips.length
    ? tips.map((t) => `<li class="row"><div class="row__main"><span class="row__title">${esc(KIND[t.orderType] || t.orderType)}</span>
        <span class="row__sub">${esc(when(t.at))} · ${esc(t.method.toUpperCase())}</span></div><span class="row__end">${peso(t.amount)}</span></li>`).join('')
    : '<li class="empty">No tips yet. You can tip after a ride, an Express delivery or a shop order.</li>';
});
