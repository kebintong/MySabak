/* Checkout (pages/checkout.html): items, address, payment, summary → placeOrder(). */
import { CONFIG } from '../config.js';
import { shopMenu, deliveryQuote, placeOrder, addressFor, errorMessage } from '../api.js';
import { cartTotals } from '../money.js';
import { getCart, setLineQty, clearCart } from '../cart.js';
import { $, $$, mountChrome, esc, peso, pesoOr, icon, placeSearch, toast, calm, pop } from '../ui.js';

mountChrome({ roles: ['client'] });

let shop = null;
let address = null; // { label, lng, lat }
let quote = null;   // { km, fee }

/* ---------- Steps: one open at a time ---------- */
let settling;
function openStep(name) {
  clearTimeout(settling);
  $$('.step').forEach((s) => {
    const on = s.dataset.panel === name;
    s.classList.toggle('is-open', on);
    s.classList.remove('is-settled');
    $('.step__head', s).setAttribute('aria-expanded', on);
  });
  // Once it has finished growing: address suggestions may overflow it, and it should be in view
  settling = setTimeout(() => {
    const open = $('.step.is-open');
    if (!open) return;
    open.classList.add('is-settled');
    open.scrollIntoView({ block: 'nearest', behavior: calm() ? 'auto' : 'smooth' });
  }, 280);
}

// What a closed step shows; a new value slides in
function setPeek(id, text) {
  const el = $(id);
  if (el.textContent === text) return;
  const first = !el.textContent;
  el.textContent = text;
  if (!first && !calm()) el.animate([{ opacity: 0, transform: 'translateY(6px)' }, { opacity: 1, transform: 'none' }], { duration: 200, easing: 'cubic-bezier(.2, .8, .2, 1)' });
}

function renderLines() {
  const t = cartTotals(getCart(), shop.menu);
  if (!t.count) { showEmpty(); return t; }
  $('#lines').innerHTML = t.lines.map((l) => `<li class="row">
      <div class="row__main"><span class="row__title">${esc(l.name)}</span>
        ${l.options.length ? `<span class="row__sub">${esc(l.options.join(', '))}</span>` : ''}
        ${l.note ? `<span class="row__sub">“${esc(l.note)}”</span>` : ''}
        <span class="row__sub">${peso(l.price)} each</span></div>
      <div class="stepper" role="group" aria-label="${esc(l.name)} quantity">
        <button type="button" data-step="-1" data-line="${esc(l.key)}" aria-label="One less">${icon('i-minus', 'icon--sm')}</button>
        <span>${l.qty}</span>
        <button type="button" data-step="1" data-line="${esc(l.key)}" aria-label="One more">${icon('i-plus', 'icon--sm')}</button>
      </div><span class="row__end">${peso(l.total)}</span></li>`).join('');
  return t;
}

function renderSummary() {
  const t = cartTotals(getCart(), shop.menu);
  const fee = quote ? quote.fee : null;
  const deliveryText = !address ? 'Add an address' : pesoOr(fee);
  const total = typeof fee === 'number' ? peso(t.subtotal + fee) : `${peso(t.subtotal)} + delivery`;
  const was = $$('#summary dd').map((d) => d.textContent);
  $('#summary').innerHTML = `
    <div class="receipt__row"><dt>Items<span>to ${esc(shop.name)}</span></dt><dd>${peso(t.subtotal)}</dd></div>
    <div class="receipt__row"><dt>Delivery fee<span>100% to your rider${quote ? ` · ${quote.km.toFixed(1)} km` : ''}</span></dt><dd>${deliveryText}</dd></div>
    <div class="receipt__row receipt__row--total"><dt>Total</dt><dd>${total}</dd></div>`;
  $$('#summary dd').forEach((d, i) => { if (was.length && was[i] !== d.textContent) pop(d, 1.08); });
  const btn = $('#placeBtn');
  const ready = Boolean(address && t.count);
  if (ready && btn.disabled) pop(btn, 0.96);
  btn.disabled = !ready;
  setPeek('#peekOrder', `${t.count} item${t.count === 1 ? '' : 's'} · ${peso(t.subtotal)}`);
  setPeek('#peekDeliver', address ? address.label : 'Add an address');
}

function showEmpty() {
  $('#checkoutForm').hidden = true;
  $('#emptyCart').hidden = false;
}

async function setAddress(place) {
  address = place;
  $('#address').value = place.label;
  quote = await deliveryQuote(shop.id, place);
  renderSummary();
}

async function start() {
  const cart = getCart();
  if (!cart.shopId) { showEmpty(); return; }
  try { shop = await shopMenu(cart.shopId); } catch (_) { clearCart(); showEmpty(); return; }
  $('#backToShop').href = `/pages/shop.html?id=${encodeURIComponent(shop.id)}`;
  $('#shopName').textContent = shop.name;
  $('#checkoutForm').hidden = false;
  $('#payMethods').insertAdjacentHTML('beforeend', CONFIG.shopPaymentMethods.map((m, i) =>
    `<label class="pill-radio"><input type="radio" name="payment" value="${m.id}"${i === 0 ? ' checked' : ''}><span>${esc(m.name)}</span></label>`).join(''));
  renderLines();
  renderSummary();
  const payName = () => $('#payMethods input:checked + span').textContent;
  setPeek('#peekPay', payName());
  $('#payMethods').addEventListener('change', (e) => {
    setPeek('#peekPay', payName());
    pop(e.target.nextElementSibling, 0.92);
  });
  $('.steps').addEventListener('click', (e) => {
    const head = e.target.closest('.step__head');
    if (!head) return;
    const step = head.closest('.step');
    openStep(step.classList.contains('is-open') ? null : step.dataset.panel);
  });

  placeSearch({
    input: $('#address'),
    list: $('#addressList'),
    near: () => ({ lng: shop.lng, lat: shop.lat }),
    onPick: setAddress,
  });
  $('#address').addEventListener('input', () => { if (address && $('#address').value !== address.label) { address = null; quote = null; renderSummary(); } });

  $('#useLocation').addEventListener('click', () => {
    if (!('geolocation' in navigator)) { toast('Location isn’t available in this browser.'); return; }
    navigator.geolocation.getCurrentPosition(async (pos) => {
      const point = { lng: pos.coords.longitude, lat: pos.coords.latitude };
      let label = 'My location';
      try { label = (await addressFor(point)) || label; } catch (_) { /* keep "My location" */ }
      setAddress({ ...point, label });
    }, () => toast('Couldn’t get your location. Search for the address instead.'), { enableHighAccuracy: true, timeout: 10000 });
  });

  $('#lines').addEventListener('click', (e) => {
    const b = e.target.closest('[data-step]');
    if (!b) return;
    const line = getCart().lines.find((l) => l.key === b.dataset.line);
    if (line) setLineQty(line.key, line.qty + Number(b.dataset.step));
    if (!renderLines().count) return;
    renderSummary();
    const same = $(`[data-line="${CSS.escape(b.dataset.line)}"]`, $('#lines'));
    if (same) pop(same.parentElement.querySelector('span'));
  });

  $('#checkoutForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!address) { toast('Add a delivery address first.'); openStep('deliver'); $('#address').focus(); return; }
    const data = new FormData(e.target);
    const btn = $('#placeBtn');
    btn.disabled = true;
    btn.textContent = 'Placing order…';
    try {
      const items = getCart().lines.map(({ id, qty, picks, note }) => ({ id, qty, picks, note }));
      const { id } = await placeOrder({ shopId: shop.id, items, address, notes: (data.get('notes') || '').trim(), payment: data.get('payment') });
      clearCart();
      location.href = `/pages/order.html?id=${encodeURIComponent(id)}`;
    } catch (err) {
      toast(err.status === 400 ? err.message : errorMessage(err));
      btn.disabled = false;
      btn.textContent = 'Place order';
    }
  });
}

start();
