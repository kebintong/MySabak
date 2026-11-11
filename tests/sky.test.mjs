// How full the night sky is (js/ui.js skyPlan): stars follow the area, big stars grow a little on wide screens.
// Run: node --test "tests/*.test.mjs"   (browser globals are stubbed)
import { test, before } from 'node:test';
import assert from 'node:assert/strict';

let skyPlan;
before(async () => {
  globalThis.location = { origin: 'https://mysabak.test' };
  globalThis.window = { addEventListener() {}, matchMedia: () => ({ matches: false }) };
  ({ skyPlan } = await import('../js/ui.js'));
});

test('a desktop sky gets more stars than a phone sky, about as dense', () => {
  const phone = skyPlan(390, 262);
  const desk = skyPlan(1440, 360);
  assert.ok(desk.far > phone.far * 3 && desk.mid > phone.mid * 3);
  assert.ok(Math.abs(desk.far / (1440 * 360) - phone.far / (390 * 262)) < 0.0001);
});

test('four-point stars: at least 3, never more than 14, and bigger only on wide screens', () => {
  assert.equal(skyPlan(200, 120).near, 3);
  assert.equal(skyPlan(3000, 400).near, 14);
  assert.equal(skyPlan(390, 262).grow, 1);
  assert.equal(skyPlan(2560, 400).grow, 1.45);
});

test('a huge screen stays light', () => {
  const p = skyPlan(5000, 2000);
  assert.ok(p.far <= 260 && p.mid <= 70);
});
