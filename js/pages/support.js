/* Support page (pages/support.html): how money moves, tip totals, give without a ride, your tips. */
import { supportStats, myTips, sendTip, errorMessage } from '../api.js';
import { $, mountChrome, tipPicker, toast, peso, pesoOr, esc, when } from '../ui.js';

mountChrome();

const KIND = { ride: 'Ride', express: 'Express', shop: 'Shop order', direct: 'Without a ride' };
const bind = (name, text) => { $(`[data-bind="${name}"]`).textContent = text; };

async function loadStats() {
  const s = await supportStats();
  bind('period', s.period);
  bind('tipsTotal', pesoOr(s.tipsTotal));
  bind('ordersFeeFree', typeof s.ordersFeeFree === 'number' ? s.ordersFeeFree.toLocaleString('en-PH') : '[NUMBER]');
  $('#bars').innerHTML = s.breakdown.map((b) => {
    const known = typeof b.share === 'number';
    return `<div class="bar${known ? '' : ' bar--unknown'}">
      <div class="bar__top"><span>${esc(b.label)}</span><span>${known ? `${b.share}%` : '[—%]'}</span></div>
      <div class="bar__track"><div class="bar__fill" style="--w:${known ? b.share : 0}%"></div></div>
    </div>`;
  }).join('');
}

async function loadMine() {
  const tips = await myTips();
  $('#myTips').innerHTML = tips.length
    ? tips.map((t) => `<li class="row"><div class="row__main"><span class="row__title">${esc(KIND[t.orderType] || t.orderType)}</span>
        <span class="row__sub">${esc(when(t.at))} · ${esc(t.method.toUpperCase())}</span></div><span class="row__end">${peso(t.amount)}</span></li>`).join('')
    : '<li class="empty">No tips yet. You can tip after a ride, an Express delivery or a shop order.</li>';
}

const give = $('#giveBtn');
const picker = tipPicker($('#givePicker'), {
  onChange: (n) => { give.disabled = !n; give.textContent = n ? `Support with ${peso(n)}` : 'Support mysabak'; },
});
give.addEventListener('click', async () => {
  const amount = picker.amount();
  if (!amount) return;
  give.disabled = true;
  give.textContent = 'Sending…';
  try {
    await sendTip({ orderId: null, orderType: 'direct', amount, method: picker.method() });
    toast(`Thank you! ${peso(amount)} keeps mysabak fee-free for drivers.`);
    picker.reset();
    loadMine();
  } catch (err) {
    toast(err.status === 400 ? err.message : errorMessage(err));
    give.disabled = false;
  }
});

loadStats();
loadMine();
