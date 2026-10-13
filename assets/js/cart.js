/* =========================================================
   mysabak · Shop cart (this browser only; one shop per cart)
   ========================================================= */
const KEY = 'mysabak.cart';
const empty = () => ({ shopId: null, items: {} });

/** @returns {{shopId:string|null, items:Object<string, number>}} item id → quantity */
export function getCart() {
  try { return JSON.parse(localStorage.getItem(KEY)) || empty(); } catch (_) { return empty(); }
}

function save(cart) {
  try { localStorage.setItem(KEY, JSON.stringify(cart)); } catch (_) { /* storage off */ }
}

/** Set an item's quantity (0 removes it). Starting a cart for another shop clears the old one. */
export function setQty(shopId, itemId, qty) {
  let cart = getCart();
  if (cart.shopId && cart.shopId !== shopId) cart = empty();
  cart.shopId = shopId;
  if (qty > 0) cart.items[itemId] = Math.min(qty, 99); else delete cart.items[itemId];
  if (!Object.keys(cart.items).length) cart = empty();
  save(cart);
  return cart;
}

export function clearCart() { save(empty()); }
