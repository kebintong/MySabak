/* =========================================================
   mysabak · money and distance helpers (pure functions, no browser APIs)
   Used by the screens and by api.js. Tested in tests/money.test.mjs.
   ========================================================= */
import { unitPrice, pickLabels } from './menu.js';

export const isNum = (n) => typeof n === 'number' && Number.isFinite(n);

/** ₱1,234 (whole pesos). */
export const peso = (n, currency = '₱') => `${currency}${Math.round(n).toLocaleString('en-PH')}`;

/**
 * A tip the customer typed or picked: whole pesos, 0 to max. Anything else is 0 (no tip).
 * @returns {number}
 */
export function cleanTip(value, max) {
  const n = Math.round(Number(value));
  if (!isNum(n) || n <= 0) return 0;
  return Math.min(n, max);
}

/** As-the-crow-flies distance in km between two {lng, lat} points. */
export function haversineKm(a, b) {
  const R = 6371;
  const toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

/**
 * Ride price with an optional tip on top: "Your price" = fare + tip.
 * The fare goes 100% to the driver; anything the customer adds on top is a tip, 100% to mysabak.
 * Give `price` (what the customer typed as their price) when the fare is known, or `tip` when it isn't.
 * The tip is whole pesos, 0 to max; a price below the fare means no tip.
 * @returns {{fare:number|null, tip:number, total:number|null}}  total null while the fare is unknown
 */
export function splitPrice({ fare = null, price = null, tip = 0, max }) {
  const known = isNum(fare);
  const extra = known && price !== null && price !== '' ? Math.round(Number(price)) - fare : tip;
  const cleanExtra = cleanTip(extra, max);
  return { fare: known ? fare : null, tip: cleanExtra, total: known ? fare + cleanExtra : null };
}

/** base + perKm × km, or null when the rates or distance aren't known yet. */
export function rateFor({ base, perKm }, km) {
  return isNum(base) && isNum(perKm) && isNum(km) ? base + perKm * km : null;
}

/**
 * Cart lines and totals for one shop. Prices come from the menu, never from the cart.
 * @param {{lines: Array<{key, id, qty, picks, note}>}} cart
 * @param {Array<{id:string, name:string, price:number, options?:Array}>} menu
 * @returns {{lines: Array<{key, id, name, price, qty, total, options:string[], note}>, count:number, subtotal:number}}
 *   price: one item with its options. options: short words for the picks ("Garlic rice", "Large").
 */
export function cartTotals(cart, menu) {
  const byId = new Map(menu.map((m) => [m.id, m]));
  const lines = ((cart && cart.lines) || [])
    .filter((l) => byId.has(l.id) && l.qty > 0)
    .map((l) => {
      const item = byId.get(l.id);
      const price = unitPrice(item, l.picks);
      return { key: l.key, id: l.id, name: item.name, price, qty: l.qty, total: price * l.qty, options: pickLabels(item, l.picks), note: l.note || '' };
    });
  return {
    lines,
    count: lines.reduce((n, l) => n + l.qty, 0),
    subtotal: lines.reduce((n, l) => n + l.total, 0),
  };
}
