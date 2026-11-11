// Which page numbers the pager shows (js/ui.js pageList).
// Run: node --test "tests/*.test.mjs"   (browser globals are stubbed)
import { test, before } from 'node:test';
import assert from 'node:assert/strict';

let pageList;
before(async () => {
  globalThis.location = { origin: 'https://mysabak.test' };
  globalThis.window = { addEventListener() {}, matchMedia: () => ({ matches: false }) };
  ({ pageList } = await import('../js/ui.js'));
});

test('up to 7 pages: every number', () => {
  assert.deepEqual(pageList(1, 1), [1]);
  assert.deepEqual(pageList(3, 7), [1, 2, 3, 4, 5, 6, 7]);
});

test('more pages: first, last, the neighbours, and gaps (0)', () => {
  assert.deepEqual(pageList(1, 10), [1, 2, 0, 10]);
  assert.deepEqual(pageList(5, 10), [1, 0, 4, 5, 6, 0, 10]);
  assert.deepEqual(pageList(10, 10), [1, 0, 9, 10]);
  assert.deepEqual(pageList(3, 10), [1, 2, 3, 4, 0, 10]);
});
