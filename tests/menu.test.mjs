// Tests for menu item options and shop hours (assets/js/menu.js). The server must price orders the same way.
// Run: node --test "tests/*.test.mjs"
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { visibleGroups, defaultPicks, cleanPicks, unitPrice, pickLabels, lineKey, openState } from '../assets/js/menu.js';
import { TEST_SHOP } from './fixtures.mjs';

const adobo = TEST_SHOP.menu.find((m) => m.id === 'adobo');

test('defaults cost nothing extra; the drink only shows with a meal', () => {
  const picks = defaultPicks(adobo);
  assert.equal(unitPrice(adobo, picks), 120);
  assert.deepEqual(pickLabels(adobo, picks), []);
  assert.equal(visibleGroups(adobo, picks).some((g) => g.id === 'drink'), false);
  assert.equal(visibleGroups(adobo, { ...picks, meal: 'Meal' }).some((g) => g.id === 'drink'), true);
});

test('options add up: size + meal + drink + add-ons', () => {
  const picks = { size: 'Sharing', meal: 'Meal', drink: 'Fresh buko juice', rice: 'Garlic rice', add: ['Fried egg', 'Atchara'] };
  assert.equal(unitPrice(adobo, picks), 120 + 110 + 45 + 30 + 15 + 20 + 15);
  assert.deepEqual(pickLabels(adobo, picks), ['Sharing', 'Meal', 'Fresh buko juice', 'Garlic rice', 'Fried egg', 'Atchara']);
});

test('bad picks are cleaned: unknown names, too many add-ons, a drink without a meal', () => {
  const clean = cleanPicks(adobo, { size: 'Huge', add: ['Fried egg', 'Gold flakes', 'Extra sauce', 'Atchara', 'Chicharon', 'Fried egg'], drink: 'Cola' });
  assert.equal(clean.size, 'Solo');
  assert.deepEqual(clean.add, ['Fried egg', 'Extra sauce', 'Atchara']); // max 3, no repeats, known only
  assert.equal('drink' in clean, false);
  assert.equal(unitPrice({ id: 'x', price: 50 }, { anything: 'goes' }), 50);
});

test('the same item, picks and note make the same cart line', () => {
  assert.equal(lineKey('a', { x: ['2', '1'], y: 'b' }, ' hi '), lineKey('a', { y: 'b', x: ['1', '2'] }, 'hi'));
  assert.notEqual(lineKey('a', { y: 'b' }), lineKey('a', { y: 'c' }));
});

test('open now uses Cebu time, including hours past midnight', () => {
  const shop = { opensAt: '09:00', closesAt: '21:00' };
  const at = (hhmm) => new Date(`2026-10-13T${hhmm}:00+08:00`);
  assert.deepEqual(openState(shop, at('08:59')), { open: false, text: 'Closed · opens 9 AM' });
  assert.deepEqual(openState(shop, at('20:30')), { open: true, text: 'Open · closes 9 PM' });
  assert.equal(openState({ opensAt: '18:00', closesAt: '02:30' }, at('01:00')).open, true);
  assert.equal(openState({ opensAt: '18:00', closesAt: '02:30' }, at('03:00')).text, 'Closed · opens 6 PM');
  assert.equal(openState({}, at('10:00')), null);
});
