// The round button's page loop: which step a page is, and the order a swipe right goes (js/ui.js).
// Run: node --test "tests/*.test.mjs"   (browser globals are stubbed)
import { test, before } from 'node:test';
import assert from 'node:assert/strict';

let LOOP;
let loopStep;
before(async () => {
  globalThis.location = { origin: 'https://mysabak.test' };
  globalThis.window = { addEventListener() {}, matchMedia: () => ({ matches: false }) };
  ({ LOOP, loopStep } = await import('../js/ui.js'));
});

test('a swipe right goes Home → Ride → Food → Parcel, then back to Home', () => {
  assert.deepEqual(LOOP.map((s) => s.label), ['Home', 'Ride', 'Food', 'Parcel']);
  assert.equal(LOOP[(3 + 1) % LOOP.length].label, 'Home');
});

test('each step is recognised from its own page', () => {
  for (const [i, s] of LOOP.entries()) {
    const url = new URL(s.href, 'https://mysabak.test');
    const tab = url.pathname.startsWith('/pages/shops') ? 'food' : 'home';
    assert.equal(loopStep(url.pathname, url.hash, tab), i, s.label);
  }
});

test('Moto and the other ride links count as Ride; other pages show the mascot', () => {
  assert.equal(loopStep('/', '#moto', undefined), 1);
  assert.equal(loopStep('/index.html', '#where', undefined), 1);
  assert.equal(loopStep('/pages/checkout.html', '', 'food'), 2);
  assert.equal(loopStep('/pages/wallet.html', '#parcel', 'wallet'), 0);
});
