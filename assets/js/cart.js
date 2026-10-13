/* =========================================================
   mysabak · Shop cart (this browser only; one shop per cart)
   A line is one item with its picked options and note:
     { key, id, qty, picks: { groupId: choice | [choices] }, note }
   Prices are never stored here; they come from the menu (money.js → cartTotals).
   ========================================================= */
import { lineKey } from './menu.js';

const KEY = 'mysabak.cart';
const empty = () => ({ shopId: null, lines: [] });

/** @returns {{shopId:string|null, lines:Array<{key, id, qty, picks, note}>}} */
export function getCart() {
  try {
    const cart = JSON.parse(localStorage.getItem(KEY));
    if (!cart || !cart.shopId) return empty();
    if (!Array.isArray(cart.lines)) { // older carts: { items: { itemId: qty } }
      cart.lines = Object.entries(cart.items || {}).map(([id, qty]) => ({ key: lineKey(id), id, qty, picks: {}, note: '' }));
      delete cart.items;
    }
    return cart;
  } catch (_) { return empty(); }
}

function save(cart) {
  try { localStorage.setItem(KEY, JSON.stringify(cart.lines.length ? cart : empty())); } catch (_) { /* storage off */ }
  return cart.lines.length ? cart : empty();
}

/** Is there a cart for a different shop? (Adding here would replace it.) */
export function hasOtherShop(shopId) {
  const cart = getCart();
  return Boolean(cart.shopId && cart.shopId !== shopId && cart.lines.length);
}

/** Add an item with its picks. The same item, picks and note add up on one line. Another shop's cart is replaced. */
export function addToCart(shopId, { id, qty = 1, picks = {}, note = '' }) {
  let cart = getCart();
  if (cart.shopId !== shopId) cart = { shopId, lines: [] };
  const key = lineKey(id, picks, note);
  const line = cart.lines.find((l) => l.key === key);
  if (line) line.qty = Math.min(line.qty + qty, 99);
  else cart.lines.push({ key, id, qty: Math.min(qty, 99), picks, note: String(note).trim() });
  return save(cart);
}

/** Change a line's quantity (0 removes it). */
export function setLineQty(key, qty) {
  const cart = getCart();
  const line = cart.lines.find((l) => l.key === key);
  if (line) line.qty = Math.min(Math.max(0, qty), 99);
  cart.lines = cart.lines.filter((l) => l.qty > 0);
  return save(cart);
}

export function clearCart() { save(empty()); }
