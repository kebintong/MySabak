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

test('a turn clockwise goes Food → Ride → Parcel → Cart, then back to Food', () => {
  assert.deepEqual(LOOP.map((s) => s.label), ['Food', 'Ride', 'Parcel', 'Cart']);
  assert.equal(LOOP[(3 + 1) % LOOP.length].label, 'Food');
});

test('each step is recognised from its own page', () => {
  for (const [i, s] of LOOP.entries()) {
    const url = new URL(s.href, 'https://mysabak.test');
    const tab = url.pathname.startsWith('/pages/shops') ? 'food' : 'home';
    assert.equal(loopStep(url.pathname, url.hash, tab), i, s.label);
  }
});

test('Moto and the other ride links count as Ride; cart and checkout show the Cart; every other page shows Food', () => {
  assert.equal(loopStep('/app', '#moto', undefined), 1);
  assert.equal(loopStep('/app.html', '#where', undefined), 1);
  assert.equal(loopStep('/pages/cart', '', 'food'), 3); // their tab bars say 'food'
  assert.equal(loopStep('/pages/checkout.html', '', 'food'), 3);
  assert.equal(loopStep('/pages/shop.html', '', 'food'), 0);
  assert.equal(loopStep('/pages/wallet.html', '#parcel', 'wallet'), 0);
  assert.equal(loopStep('/pages/trips.html', '', 'trips'), 0);
  assert.equal(loopStep('/pages/account.html', '', 'account'), 0);
  assert.equal(loopStep('/app', '', undefined), 0);
  assert.equal(loopStep('/', '#ride', undefined), 0); // / is the landing page now
});

test('the turn between two angles goes the short way, even across the ±180° seam', () => {
  assert.equal(turnDelta(10, 100), 90);
  assert.equal(turnDelta(100, 10), -90);
  assert.equal(turnDelta(170, -170), 20);
  assert.equal(turnDelta(-170, 170), -20);
  assert.equal(turnDelta(0, 0), 0);
});

test('a live trip shows what was booked: Cargo is a delivery (never the fork and knife), the vehicle on the button', async () => {
  const { tripIcon } = await import('../js/ui.js');
  assert.equal(loopStep('/app', '#cargo', undefined), 2);
  assert.equal(loopStep('/app', '#rebook-cargo', undefined), 2);
  assert.equal(tripIcon({ kind: 'cargo', vehicle: 'van' }), 'i-truck');
  assert.equal(tripIcon({ kind: 'cargo', vehicle: 'mpv' }), 'i-suv');
  assert.equal(tripIcon({ kind: 'ride', vehicle: 'motor' }), 'i-motor');
  assert.equal(tripIcon({ kind: 'ride', vehicle: 'sedan' }), 'i-car');
  assert.equal(tripIcon({ kind: 'express', vehicle: 'suv' }), 'i-box');
});
