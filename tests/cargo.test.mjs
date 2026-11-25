// Cargo: the fit check, the fare lines and the quote → book rules (the backend must keep these too).
// Run: node --test "tests/*.test.mjs"   (browser globals are stubbed; nothing leaves this process)
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { cargoFit, cargoBestFit, cargoPrice, pesoCents, cargoSize } from '../js/money.js';
import { CONFIG } from '../js/config.js';

let api;
before(async () => {
  const store = new Map();
  globalThis.location = { origin: 'https://mysabak.test' };
  globalThis.localStorage = {
    getItem: (k) => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => store.set(k, String(v)),
    removeItem: (k) => store.delete(k),
  };
  api = await import('../js/api.js');
});

const R = {
  vehicles: [
    { id: 'small', name: 'Sedan', maxKg: 200, lengthCm: 100, widthCm: 60, heightCm: 50, base: 10000, perKm: 1500 },
    { id: 'big', name: 'Van', maxKg: 600, lengthCm: 210, widthCm: 120, heightCm: 120, base: 25000, perKm: 2200 },
  ],
  fragileFee: 5000,
  helpers: { available: true, max: 2, fee: 15000 },
};
const box = { weightKg: 30, lengthCm: 50, widthCm: 40, heightCm: 40, pieces: 1 };

test('cargoFit: weight, size turned any way round, and the pieces together', () => {
  assert.deepEqual(cargoFit(R.vehicles[0], box), { ok: true });
  assert.match(cargoFit(R.vehicles[0], { ...box, weightKg: 201 }).reason, /Too heavy for a Sedan: it carries up to 200 kg/);
  // 55 × 95 × 45 doesn't fit as typed, but fits turned round (95 × 55 × 45 in 100 × 60 × 50)
  assert.equal(cargoFit(R.vehicles[0], { ...box, lengthCm: 55, widthCm: 95, heightCm: 45 }).ok, true);
  assert.match(cargoFit(R.vehicles[0], { ...box, lengthCm: 120 }).reason, /Too big for a Sedan: its space is 1 × 0.6 × 0.5 m/);
  assert.match(cargoFit(R.vehicles[0], { ...box, pieces: 4 }).reason, /4 pieces won’t all fit in a Sedan/);
  assert.equal(cargoBestFit(R.vehicles, { ...box, weightKg: 300 }).id, 'big');
  assert.equal(cargoBestFit(R.vehicles, { ...box, weightKg: 5000 }), null);
  assert.equal(cargoSize(R.vehicles[1]), '2.1 × 1.2 × 1.2 m');
});

test('cargoPrice: base + km in whole pesos + fragile + helpers, in centavos', () => {
  const p = cargoPrice(R, { km: 3.34, vehicleId: 'big', fragile: true, helpers: 2 });
  assert.deepEqual(p.lines.map((l) => [l.id, l.amount]), [['base', 25000], ['distance', 7300], ['fragile', 5000], ['helpers', 30000]]);
  assert.equal(p.fare, 67300);
  assert.equal(p.lines[1].label, 'Distance · 3.3 km');
  assert.equal(cargoPrice(R, { km: 2, vehicleId: 'big', helpers: 9 }).fare, 25000 + 4400 + 30000, 'helpers capped at the max');
  assert.equal(cargoPrice({ ...R, helpers: { ...R.helpers, available: false } }, { km: 2, vehicleId: 'big', helpers: 2 }).lines.length, 2, 'no helpers when none are available');
  assert.equal(cargoPrice(R, { km: null, vehicleId: 'big' }), null);
  assert.equal(cargoPrice(R, { km: 2, vehicleId: 'nope' }), null);
  assert.equal(pesoCents(67300), '₱673');
  assert.equal(pesoCents(123450), '₱1,234.50');
});

const at = (lng, lat, label) => ({ lng, lat, label });
const req = (over = {}) => ({
  pickup: at(123.8854, 10.3157, 'Capitol'), dropoff: at(123.9, 10.33, 'Mabolo'), trip: { distanceKm: 4, coords: null },
  vehicle: 'van', cargo: { type: 'Furniture', description: 'Sofa', weightKg: 80, lengthCm: 190, widthCm: 85, heightCm: 80, pieces: 1, fragile: false },
  helpers: 1, ...over,
});

test('cargoQuote: priced from the rules, not the screen; checks details, fit and the area', async () => {
  const q = await api.cargoQuote(req());
  const v = CONFIG.cargo.vehicles.find((x) => x.id === 'van');
  assert.equal(q.fare, v.base + Math.round((v.perKm * 4) / 100) * 100 + CONFIG.cargo.helpers.fee);
  assert.equal(q.ruleVersion, CONFIG.cargo.ruleVersion);
  assert.ok(q.expiresAt > Date.now());
  await assert.rejects(api.cargoQuote(req({ vehicle: 'sedan' })), (e) => e.status === 409 && e.suggest === 'van');
  await assert.rejects(api.cargoQuote(req({ cargo: { ...req().cargo, weightKg: 99999 } })), { status: 400 });
  await assert.rejects(api.cargoQuote(req({ cargo: { ...req().cargo, type: 'Gold' } })), { status: 400 });
  await assert.rejects(api.cargoQuote(req({ dropoff: at(121.0, 14.6, 'Manila') })), { status: 422 });
  await assert.rejects(api.cargoQuote(req({ vehicle: 'rocket' })), { status: 400 });
});

test('cargoBook: the fare comes from the quote, a retry with the same key books once, expired quotes are refused', async () => {
  const q = await api.cargoQuote(req());
  const body = { quoteId: q.quoteId, payment: 'cash', tip: 20, recipient: { name: 'Ana', phone: '0917 555 0101' }, key: 'k-1', fare: 1 };
  const a = await api.cargoBook(body);
  const b = await api.cargoBook(body);
  assert.deepEqual(a, b, 'same key, same booking');
  assert.match(a.deliveryCode, /^\d{4}$/);
  const [trip] = await api.myTrips();
  assert.equal(trip.id, a.id);
  assert.equal(trip.kind, 'cargo');
  assert.equal(trip.price.fare, q.fare / 100, 'the fare from the quote, not the screen');
  assert.equal(trip.price.total, q.fare / 100 + 20);
  assert.equal(trip.cargo.deliveryCode, a.deliveryCode);
  await assert.rejects(api.cargoBook({ ...body, key: 'k-2', recipient: { name: 'Ana', phone: '12' } }), { status: 400 });
  await assert.rejects(api.cargoBook({ ...body, key: 'k-3', quoteId: 'CQ-nope' }), { status: 410 });
  const quotes = JSON.parse(localStorage.getItem('mysabak.demo.cargoQuotes'));
  quotes[0].expiresAt = Date.now() - 1;
  localStorage.setItem('mysabak.demo.cargoQuotes', JSON.stringify(quotes));
  await assert.rejects(api.cargoBook({ ...body, key: 'k-4', quoteId: quotes[0].quoteId }), { status: 410 });
  await api.cancelRide(a.id);
});

test('cargoFares: a "from" fare per vehicle for the list, like faresFor', () => {
  const f = api.cargoFares({ distanceKm: 2 });
  assert.deepEqual(Object.keys(f), CONFIG.cargo.vehicles.map((v) => v.id));
  assert.equal(f.van.total, (25000 + 4400) / 100);
  assert.equal(api.cargoFares({ distanceKm: null }).van, null);
});
