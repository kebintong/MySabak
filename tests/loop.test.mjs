// The round button's page loop: which step a page is, and the order a swipe right goes (js/ui.js).
// Run: node --test "tests/*.test.mjs"   (browser globals are stubbed)
import { test, before } from 'node:test';
import assert from 'node:assert/strict';

let LOOP;
let loopStep;
let turnDelta;
before(async () => {
  globalThis.location = { origin: 'https://mysabak.test' };
  globalThis.window = { addEventListener() {}, matchMedia: () => ({ matches: false }) };
  ({ LOOP, loopStep, turnDelta } = await import('../js/ui.js'));
});

test('a turn clockwise goes Cart → Ride → Food → Parcel, then back to Cart', () => {
  assert.deepEqual(LOOP.map((s) => s.label), ['Cart', 'Ride', 'Food', 'Parcel']);
  assert.equal(LOOP[(3 + 1) % LOOP.length].label, 'Cart');
});

test('each step is recognised from its own page', () => {
  for (const [i, s] of LOOP.entries()) {
    const url = new URL(s.href, 'https://mysabak.test');
    const tab = url.pathname.startsWith('/pages/shops') ? 'food' : 'home';
    assert.equal(loopStep(url.pathname, url.hash, tab), i, s.label);
  }
});

test('Moto and the other ride links count as Ride; cart, checkout and pages outside the loop show the Cart', () => {
  assert.equal(loopStep('/', '#moto', undefined), 1);
  assert.equal(loopStep('/index.html', '#where', undefined), 1);
  assert.equal(loopStep('/pages/cart', '', 'food'), 0); // their tab bars say 'food'
  assert.equal(loopStep('/pages/checkout.html', '', 'food'), 0);
  assert.equal(loopStep('/pages/shop.html', '', 'food'), 2);
  assert.equal(loopStep('/pages/wallet.html', '#parcel', 'wallet'), 0);
  assert.equal(loopStep('/', '', undefined), 0);
});

test('the turn between two angles goes the short way, even across the ±180° seam', () => {
  assert.equal(turnDelta(10, 100), 90);
  assert.equal(turnDelta(100, 10), -90);
  assert.equal(turnDelta(170, -170), 20);
  assert.equal(turnDelta(-170, 170), -20);
  assert.equal(turnDelta(0, 0), 0);
});
