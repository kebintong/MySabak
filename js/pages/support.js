/* Support page (pages/support.html): how money moves, tip totals, give without a ride, your tips. */
import { supportStats, myTips, sendTip, errorMessage } from '../api.js';
import { $, mountChrome, tipPicker, toast, peso, esc, when, edgeGlow, icon, tag, emptyRows } from '../ui.js';

mountChrome();

const KIND = { ride: 'Ride', express: 'Express', shop: 'Shop order', direct: 'Without a ride' };
const bind = (name, text) => { $(`[data-bind="${name}"]`).textContent = text; };

// What tips pay for: a plain icon each; the share once there are real tips to split, "Soon" until then
const PAYS_ICON = ['i-layers', 'i-chat', 'i-star', 'i-shield'];
async function loadStats() {
  const s = await supportStats();
  const live = typeof s.tipsTotal === 'number' || typeof s.ordersFeeFree === 'number';
  $('[data-bind="period"]').outerHTML = live ? `<span class="badge" data-bind="period">${esc(s.period)}</span>` : tag('review', 'After launch');
  const fact = (name, text) => { const b = $(`[data-bind="${name}"]`); b.textContent = text ?? '—'; b.classList.toggle('is-none', text == null); };
  fact('tipsTotal', typeof s.tipsTotal === 'number' ? peso(s.tipsTotal) : null);
  fact('ordersFeeFree', typeof s.ordersFeeFree === 'number' ? s.ordersFeeFree.toLocaleString('en-PH') : null);
  $('#statsNote').hidden = live;
  $('#bars').innerHTML = s.breakdown.map((b, i) => `<li class="pct__row"><span class="pct__ic">${icon(PAYS_ICON[i] || 'i-heart')}</span>
    <span class="pct__who"><b>${esc(b.label)}</b></span>${typeof b.share === 'number' ? `<b class="pct__n">${b.share}<small>%</small></b>` : tag('review', 'Soon')}</li>`).join('');
  $('#barsNote').hidden = s.breakdown.every((b) => typeof b.share === 'number');
}

async function loadMine() {
  const tips = await myTips();
  $('#myTips').innerHTML = tips.length
    ? tips.map((t) => `<li class="row"><div class="row__main"><span class="row__title">${esc(KIND[t.orderType] || t.orderType)}</span>
        <span class="row__sub">${esc(when(t.at))} · ${esc(t.method.toUpperCase())}</span></div><span class="row__end">${peso(t.amount)}</span></li>`).join('')
    : emptyRows('No tips yet', 'Tip after a ride, a parcel or a shop order.');
}

const give = $('#giveBtn');
const picker = tipPicker($('#givePicker'), {
  onChange: (n) => { give.disabled = !n; give.textContent = n ? `Tip ${peso(n)}` : 'Choose an amount'; },
});
give.addEventListener('click', async () => {
  const amount = picker.amount();
  if (!amount) return;
  give.disabled = true;
  give.textContent = 'Sending…';
  try {
    await sendTip({ orderId: null, orderType: 'direct', amount, method: picker.method() });
    edgeGlow('reward', give);
    toast(`Thank you! ${peso(amount)} keeps mysabak fee-free for drivers.`);
    picker.reset();
    loadMine();
  } catch (err) {
    toast(err.status === 400 ? err.message : errorMessage(err));
    give.disabled = false;
    give.textContent = `Tip ${peso(amount)}`;
  }
});

loadStats();
loadMine();
