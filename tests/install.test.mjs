// Install instructions: every device/browser gets a way to add mysabak to the Home Screen / Dock.
// Run: node --test "tests/*.test.mjs"   (browser globals are stubbed)
import { test, before } from 'node:test';
import assert from 'node:assert/strict';

let installPlatform;
before(async () => {
  globalThis.location = { origin: 'https://mysabak.test' };
  globalThis.window = { addEventListener() {}, matchMedia: () => ({ matches: false }) };
  ({ installPlatform } = await import('../js/ui.js'));
});

const UA = {
  iphoneSafari: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1',
  iphoneChrome: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/130.0 Mobile/15E148 Safari/604.1',
  ipad: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15',
  macSafari: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15',
  macChrome: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36',
  androidChrome: 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Mobile Safari/537.36',
  samsung: 'Mozilla/5.0 (Linux; Android 14; SM-S918B) AppleWebKit/537.36 (KHTML, like Gecko) SamsungBrowser/26.0 Chrome/122.0 Mobile Safari/537.36',
  androidFirefox: 'Mozilla/5.0 (Android 14; Mobile; rv:131.0) Gecko/131.0 Firefox/131.0',
  winFirefox: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:131.0) Gecko/20100101 Firefox/131.0',
  winBrave: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36',
};

test('iPhone and iPad (Safari or Chrome) get "Share → Add to Home Screen"', () => {
  assert.equal(installPlatform(UA.iphoneSafari, 5), 'ios');
  assert.equal(installPlatform(UA.iphoneChrome, 5), 'ios');
  assert.equal(installPlatform(UA.ipad, 5), 'ios', 'iPadOS reports itself as a Mac but has touch');
});

test('Mac: Safari gets "File → Add to Dock"; Chrome on Mac uses the browser prompt', () => {
  assert.equal(installPlatform(UA.macSafari, 0), 'mac-safari');
  assert.equal(installPlatform(UA.macChrome, 0), 'desktop');
});

test('Android browsers and desktop browsers', () => {
  assert.equal(installPlatform(UA.androidChrome, 5), 'android');
  assert.equal(installPlatform(UA.samsung, 5), 'samsung');
  assert.equal(installPlatform(UA.androidFirefox, 5), 'android-firefox');
  assert.equal(installPlatform(UA.winFirefox, 0), 'desktop-firefox');
  assert.equal(installPlatform(UA.winBrave, 0), 'desktop');
});
