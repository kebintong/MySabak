/* =========================================================
   mysabak · money and distance helpers (pure functions, no browser APIs)
   Used by the screens and by api.js. Tested in tests/money.test.mjs.
   ========================================================= */
import { unitPrice, pickLabels } from './menu.js';

export const isNum = (n) => typeof n === 'number' && Number.isFinite(n);

/** ₱1,234 (whole pesos). */
// Formatters built once: toLocaleString() makes a new one on every call, which was slow in long lists and charts
const PH_NUM = new Intl.NumberFormat('en-PH');
export const peso = (n, currency = '₱') => `${currency}${PH_NUM.format(Math.round(n))}`;

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

/**
 * A driver's earnings from trips at `from` (ms) or later: fares, platform fees, what's left after fees, cash vs
 * digital, and by service. Whole pesos. Each trip: { at, fare, fee, payment, kind }.
 */
export function earningsSince(trips, from) {
  const list = trips.filter((t) => t.at >= from);
  const sum = (l, k = 'fare') => l.reduce((n, t) => n + (t[k] || 0), 0);
  const fares = sum(list);
  const fees = sum(list, 'fee');
  const cash = sum(list.filter((t) => t.payment === 'cash'));
  const byKind = {};
  list.forEach((t) => { const k = byKind[t.kind] || (byKind[t.kind] = { fares: 0, count: 0 }); k.fares += t.fare; k.count += 1; });
  return { trips: list, count: list.length, fares, fees, net: fares - fees, cash, digital: fares - cash, byKind };
}

/** Centavos as pesos: ₱1,234 when whole, ₱1,234.50 otherwise. */
const PH_CENTS = new Intl.NumberFormat('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
export const pesoCents = (c, currency = '₱') => (c % 100 === 0 ? peso(c / 100, currency) : `${currency}${PH_CENTS.format(c / 100)}`);

/** A Cargo vehicle's space, "2.1 × 1.2 × 1.2 m". */
export const cargoSize = (v) => [v.lengthCm, v.widthCm, v.heightCm].map((cm) => String(Math.round(cm) / 100)).join(' × ') + ' m';

/**
 * Does the cargo fit the vehicle? Weight, the biggest item's size (turned any way round), and every piece's volume.
 * shortcut: counts every piece as big as the biggest one; good enough to pick a vehicle, the driver checks at pickup.
 * @param {{name, maxKg, lengthCm, widthCm, heightCm}} v
 * @param {{weightKg, lengthCm, widthCm, heightCm, pieces}} c
 * @returns {{ok:true} | {ok:false, reason:string}}
 */
export function cargoFit(v, c) {
  if (Number(c.weightKg) > v.maxKg) return { ok: false, reason: `Too heavy for a ${v.name}: it carries up to ${PH_NUM.format(v.maxKg)} kg.` };
  const item = [c.lengthCm, c.widthCm, c.heightCm].map((n) => Number(n) || 0).sort((a, b) => b - a);
  const space = [v.lengthCm, v.widthCm, v.heightCm].sort((a, b) => b - a);
  if (item.some((n, i) => n > space[i])) return { ok: false, reason: `Too big for a ${v.name}: its space is ${cargoSize(v)}.` };
  const pieces = Math.max(1, Math.round(Number(c.pieces) || 1));
  if (pieces * item[0] * item[1] * item[2] > space[0] * space[1] * space[2]) return { ok: false, reason: `${pieces} pieces won’t all fit in a ${v.name}.` };
  return { ok: true };
}

/** The smallest vehicle (in list order) that fits, or null. */
export const cargoBestFit = (vehicles, c) => vehicles.find((v) => cargoFit(v, c).ok) || null;

/**
 * A Cargo fare, line by line, in centavos: base + km × rate (whole pesos) + fragile handling + helpers.
 * The server works this out; the screens only show it.
 * @returns {null | {lines: Array<{id, label, amount}>, fare:number}}  null when the vehicle or distance is unknown
 */
export function cargoPrice(rules, { km, vehicleId, fragile = false, helpers = 0 }) {
  const v = rules.vehicles.find((x) => x.id === vehicleId);
  if (!v || !isNum(km)) return null;
  const n = rules.helpers.available ? Math.min(rules.helpers.max, Math.max(0, Math.round(Number(helpers) || 0))) : 0;
  const lines = [
    { id: 'base', label: 'Base fare', amount: v.base },
    { id: 'distance', label: `Distance · ${km.toFixed(1)} km`, amount: Math.round((v.perKm * km) / 100) * 100 },
    ...(fragile ? [{ id: 'fragile', label: 'Fragile handling', amount: rules.fragileFee }] : []),
    ...(n ? [{ id: 'helpers', label: `${n} helper${n > 1 ? 's' : ''} for loading`, amount: n * rules.helpers.fee }] : []),
  ];
  return { lines, fare: lines.reduce((s, l) => s + l.amount, 0) };
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
