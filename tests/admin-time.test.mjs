// How long ago, in words, on the admin pages (js/pages/admin-common.js).
// Run: node --test "tests/*.test.mjs"   (browser globals are stubbed)
import { test, before } from 'node:test';
import assert from 'node:assert/strict';

let ago;
let since;
before(async () => {
  globalThis.location = { origin: 'https://mysabak.test' };
  globalThis.window = { addEventListener() {}, matchMedia: () => ({ matches: false }) };
  ({ ago, since } = await import('../js/pages/admin-common.js'));
});

test('ago says secs, mins, hrs and days, singular at 1', () => {
  const back = (ms) => Date.now() - ms;
  assert.equal(ago(back(0)), 'just now');
  assert.equal(ago(back(1000)), '1 sec');
  assert.equal(ago(back(30e3)), '30 secs');
  assert.equal(ago(back(60e3)), '1 min');
  assert.equal(ago(back(4 * 60e3)), '4 mins');
  assert.equal(ago(back(3600e3)), '1 hr');
  assert.equal(ago(back(4 * 3600e3)), '4 hrs');
  assert.equal(ago(back(47 * 3600e3)), '47 hrs');
  assert.equal(ago(back(48 * 3600e3)), '2 days');
});

test('since adds "ago", except for just now', () => {
  assert.equal(since(Date.now() - 4 * 3600e3), '4 hrs ago');
  assert.equal(since(Date.now()), 'just now');
});
