// Tests for the pure money helpers (assets/js/money.js). Run: node --test "tests/*.test.mjs"
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cleanTip, rateFor, cartTotals, haversineKm, peso } from '../assets/js/money.js';

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
