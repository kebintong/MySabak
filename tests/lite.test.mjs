// When light mode decides a computer struggles (js/ui.js framesStruggle).
// Run: node --test "tests/*.test.mjs"   (browser globals are stubbed)
import { test, before } from 'node:test';
import assert from 'node:assert/strict';

let framesStruggle;
before(async () => {
  globalThis.location = { origin: 'https://mysabak.test' };
  globalThis.window = { addEventListener() {}, matchMedia: () => ({ matches: false }) };
  ({ framesStruggle } = await import('../js/ui.js'));
});

const many = (n, ms) => Array(n).fill(ms);

test('a smooth 60 or 120 Hz screen never struggles', () => {
  assert.equal(framesStruggle(many(120, 16.7)), false);
  assert.equal(framesStruggle(many(240, 8.3)), false);
});

test('a few slow frames (a busy moment) are not enough', () => {
  assert.equal(framesStruggle([...many(100, 16.7), ...many(10, 60)]), false);
});

test('slow on average with many long frames struggles', () => {
  assert.equal(framesStruggle([...many(30, 16.7), ...many(30, 45)]), true);
});

test('too few frames to judge', () => {
  assert.equal(framesStruggle(many(10, 50)), false);
});
