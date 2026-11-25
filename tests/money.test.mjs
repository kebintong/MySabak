// Tests for the pure money helpers (js/money.js). Run: node --test "tests/*.test.mjs"
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cleanTip, rateFor, cartTotals, haversineKm, peso, splitPrice, earningsSince } from '../js/money.js';

test('tips: whole pesos, capped, anything else means no tip', () => {
  assert.equal(cleanTip(20, 500), 20);
  assert.equal(cleanTip('35', 500), 35);
  assert.equal(cleanTip(12.6, 500), 13);
  assert.equal(cleanTip(999, 500), 500);
  for (const bad of [0, -5, '', 'abc', null, undefined, NaN]) assert.equal(cleanTip(bad, 500), 0, String(bad));
});

test('fares and delivery fees: base + perKm × km, or null until rates are set', () => {
  assert.equal(rateFor({ base: 40, perKm: 10 }, 6.5), 105);
  assert.equal(rateFor({ base: null, perKm: 10 }, 6.5), null);
  assert.equal(rateFor({ base: 40, perKm: 10 }, null), null);
});

test('cart totals: menu prices plus options; unknown items and zero quantities ignored', () => {
  const menu = [
    { id: 'a', name: 'Adobo', price: 120, options: [{ id: 'rice', name: 'Rice', type: 'one', choices: [{ name: 'Plain', price: 0 }, { name: 'Garlic', price: 15 }] }] },
    { id: 'b', name: 'Lumpia', price: 85 },
  ];
  const line = (id, qty, picks = {}) => ({ key: id + JSON.stringify(picks), id, qty, picks, note: '' });
  const t = cartTotals({ lines: [line('a', 2), line('a', 1, { rice: 'Garlic' }), line('b', 1), line('gone', 3), line('b', 0)] }, menu);
  assert.equal(t.count, 4);
  assert.equal(t.subtotal, 120 * 2 + 135 + 85);
  assert.deepEqual(t.lines.map((l) => [l.id, l.price, l.options]), [['a', 120, []], ['a', 135, ['Garlic']], ['b', 85, []]]);
  assert.deepEqual(cartTotals({ lines: [] }, menu), { lines: [], count: 0, subtotal: 0 });
});

test('distance and peso formatting', () => {
  const km = haversineKm({ lng: 123.8854, lat: 10.3157 }, { lng: 123.9058, lat: 10.3299 });
  assert.ok(km > 2.5 && km < 3, `got ${km}`);
  assert.equal(peso(1234.4), '₱1,234');
});

test('your price: fare + tip; the fare never goes down; the tip is capped', () => {
  assert.deepEqual(splitPrice({ fare: 90, price: 110, max: 500 }), { fare: 90, tip: 20, total: 110 });
  assert.deepEqual(splitPrice({ fare: 90, price: 70, max: 500 }), { fare: 90, tip: 0, total: 90 });
  assert.deepEqual(splitPrice({ fare: 90, price: 2000, max: 500 }), { fare: 90, tip: 500, total: 590 });
  assert.deepEqual(splitPrice({ fare: 90, price: null, tip: 20, max: 500 }), { fare: 90, tip: 20, total: 110 });
  assert.deepEqual(splitPrice({ fare: null, tip: 50, max: 500 }), { fare: null, tip: 50, total: null });
  assert.deepEqual(splitPrice({ fare: null, tip: 'abc', max: 500 }), { fare: null, tip: 0, total: null });
});


test('driver earnings for a period: fares, the flat fee, after fees, cash vs digital, by service', () => {
  const trips = [
    { at: 100, fare: 120, fee: 10, payment: 'cash', kind: 'ride' },
    { at: 200, fare: 80, fee: 10, payment: 'gcash', kind: 'express' },
    { at: 300, fare: 60, fee: 10, payment: 'cash', kind: 'ride' },
    { at: 50, fare: 999, fee: 10, payment: 'cash', kind: 'shop' }, // before the period
  ];
  const e = earningsSince(trips, 100);
  assert.equal(e.count, 3);
  assert.equal(e.fares, 260);
  assert.equal(e.fees, 30);
  assert.equal(e.net, 230);
  assert.equal(e.cash, 180);
  assert.equal(e.digital, 80);
  assert.deepEqual(e.byKind, { ride: { fares: 180, count: 2 }, express: { fares: 80, count: 1 } });
  assert.equal(earningsSince(trips, 1000).net, 0, 'an empty period is all zeros');
});
