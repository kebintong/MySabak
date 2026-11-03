// Tests for the driver's in-app navigation helpers (js/nav.js).
// Run: node --test "tests/*.test.mjs"
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { routeProgress, nextStep } from '../js/nav.js';

// An L-shaped route in Cebu: ~1.1 km north along one street, then ~1.1 km east.
const A = [123.8900, 10.3100];
const B = [123.8900, 10.3200];
const C = [123.9000, 10.3200];

test('routeProgress: start, the corner, a point beside the line', () => {
  const start = routeProgress([A, B, C], { lng: A[0], lat: A[1] });
  assert.ok(start.alongM < 1 && start.offM < 1);
  assert.ok(Math.abs(start.totalM - 2200) < 120, `route length ${start.totalM}`);

  const corner = routeProgress([A, B, C], { lng: B[0], lat: B[1] });
  assert.ok(Math.abs(corner.alongM - 1110) < 20, `at the corner ${corner.alongM}`);

  // 100 m east of the first street, half-way up it
  const beside = routeProgress([A, B, C], { lng: 123.89091, lat: 10.3150 });
  assert.ok(Math.abs(beside.alongM - 555) < 20, `half-way ${beside.alongM}`);
  assert.ok(Math.abs(beside.offM - 100) < 10, `off the line ${beside.offM}`);
});

test('routeProgress: a one-point route does not break', () => {
  assert.deepEqual(routeProgress([A], { lng: A[0], lat: A[1] }), { alongM: 0, offM: 0, totalM: 0 });
});

test('nextStep: skips steps already passed (and the one under the driver), null after the last', () => {
  const steps = [
    { text: 'Leave', atM: 0 },
    { text: 'Turn right', atM: 1110 },
    { text: 'Arrive', atM: 2200 },
  ];
  assert.deepEqual(nextStep(steps, 0), { step: steps[1], after: steps[2], inM: 1110 });
  assert.equal(nextStep(steps, 1105).step.text, 'Arrive', 'within 10 m of a turn counts as at it');
  assert.equal(nextStep(steps, 1500).inM, 700);
  assert.equal(nextStep(steps, 2195), null);
  assert.equal(nextStep([], 0), null);
});
