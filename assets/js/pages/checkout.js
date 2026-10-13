/* Checkout (pages/checkout.html): items, address, payment, summary → placeOrder(). */
import { CONFIG } from '../config.js';
import { shopMenu, deliveryQuote, placeOrder, addressFor, errorMessage } from '../api.js';
import { cartTotals } from '../money.js';
import { getCart, setLineQty, clearCart } from '../cart.js';
import { $, mountChrome, esc, peso, pesoOr, icon, placeSearch, toast } from '../ui.js';

mountChrome();

let shop = null;
let address = null; // { label, lng, lat }
let quote = null;   // { km, fee }

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
  $('#summary').innerHTML = `
    <div class="receipt__row"><dt>Items<span>to ${esc(shop.name)}</span></dt><dd>${peso(t.subtotal)}</dd></div>
    <div class="receipt__row"><dt>Delivery fee<span>100% to your rider${quote ? ` · ${quote.km.toFixed(1)} km` : ''}</span></dt><dd>${deliveryText}</dd></div>
    <div class="receipt__row receipt__row--total"><dt>Total</dt><dd>${total}</dd></div>`;
  $('#placeBtn').disabled = !address || !t.count;
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
    if (renderLines().count) renderSummary();
  });

  $('#checkoutForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!address) { toast('Add a delivery address first.'); $('#address').focus(); return; }
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
