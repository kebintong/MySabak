/* =========================================================
   mysabak · money and distance helpers (pure functions, no browser APIs)
   Used by the screens and by api.js. Tested in tests/money.test.mjs.
   ========================================================= */

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

/** base + perKm × km, or null when the rates or distance aren't known yet. */
export function rateFor({ base, perKm }, km) {
  return isNum(base) && isNum(perKm) && isNum(km) ? base + perKm * km : null;
}

/**
 * Cart lines and totals for one shop.
 * @param {{items: Object<string, number>}} cart   item id → quantity
 * @param {Array<{id:string, name:string, price:number}>} menu
 * @returns {{lines: Array<{id, name, price, qty, total}>, count:number, subtotal:number}}
 */
export function cartTotals(cart, menu) {
  const byId = new Map(menu.map((m) => [m.id, m]));
  const lines = Object.entries((cart && cart.items) || {})
    .filter(([id, qty]) => byId.has(id) && qty > 0)
    .map(([id, qty]) => {
      const item = byId.get(id);
      return { id, name: item.name, price: item.price, qty, total: item.price * qty };
    });
  return {
    lines,
    count: lines.reduce((n, l) => n + l.qty, 0),
    subtotal: lines.reduce((n, l) => n + l.total, 0),
  };
}
