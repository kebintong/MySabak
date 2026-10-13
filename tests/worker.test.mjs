// Tests for worker/index.js (the TomTom proxy). Run: npm test
// TomTom is faked, so these run offline and never use a real key.
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import worker from '../worker/index.js';

const KEY = 'TEST_KEY_123';
const SITE = 'https://mysabak.example.workers.dev';
const env = { TOMTOM_KEY: KEY, ASSETS: { fetch: (r) => new Response(`asset:${new URL(r.url).pathname}`) } };

let calls;
beforeEach(() => {
  calls = [];
  globalThis.fetch = async (url, init) => {
    calls.push({ url: new URL(url), init });
    if (String(url).includes('/styles/')) {
      const style = { sources: { v: { tiles: [`https://api.tomtom.com/maps/orbis/tile/{z}/{x}/{y}.pbf?key=${KEY}&apiVersion=1`] } } };
      return Response.json(style);
    }
    return new Response(new Uint8Array([1, 2, 3]), { headers: { 'content-type': 'application/vnd.mapbox-vector-tile' } });
  };
});

const call = (path, init = {}, e = env) => worker.fetch(new Request(SITE + path, init), e);
const sameSite = { 'sec-fetch-site': 'same-origin' };

test('app files are served from the assets', async () => {
  const res = await call('/html/');
  assert.equal(await res.text(), 'asset:/html/');
  assert.equal(calls.length, 0);
});

test('adds the key on the way to TomTom', async () => {
  const res = await call('/api/tomtom/maps/orbis/assets/styles/0.*/style?apiVersion=1&map=basic_street-light', { headers: sameSite });
  assert.equal(res.status, 200);
  const { url } = calls[0];
  assert.equal(url.origin + url.pathname, 'https://api.tomtom.com/maps/orbis/assets/styles/0.*/style');
  assert.equal(url.searchParams.get('key'), KEY);
  assert.equal(url.searchParams.get('map'), 'basic_street-light');
});

test('never sends the key back to the browser', async () => {
  const res = await call('/api/tomtom/maps/orbis/assets/styles/0.*/style?apiVersion=1', { headers: sameSite });
  const body = await res.text();
  assert.ok(!body.includes(KEY));
  assert.ok(body.includes('key=&apiVersion=1'));
});

test('binary tiles pass through and a key from the browser is replaced', async () => {
  const res = await call('/api/tomtom/maps/orbis/tile/1/2/3.pbf?apiVersion=1&key=someone-else');
  assert.equal(res.status, 200);
  assert.equal((await res.arrayBuffer()).byteLength, 3);
  assert.deepEqual(calls[0].url.searchParams.getAll('key'), [KEY]);
});

test('POST to Places Search forwards the body and TomTom headers, not cookies', async () => {
  const res = await call('/api/tomtom/maps/orbis/places/suggest', {
    method: 'POST',
    body: '{"query":"sm"}',
    headers: { ...sameSite, 'content-type': 'application/json', 'tomtom-api-version': '3', attributes: 'results', cookie: 'session=1' },
  });
  assert.equal(res.status, 200);
  const { init } = calls[0];
  assert.equal(init.method, 'POST');
  assert.equal(init.headers.get('tomtom-api-version'), '3');
  assert.equal(init.headers.get('attributes'), 'results');
  assert.equal(init.headers.get('tomtom-api-key'), KEY);
  assert.equal(init.headers.get('cookie'), null);
});

test('requests from other websites are refused', async () => {
  const crossSite = await call('/api/tomtom/search/2/reverseGeocode/10,123.json', { headers: { 'sec-fetch-site': 'cross-site' } });
  assert.equal(crossSite.status, 403);
  const otherOrigin = await call('/api/tomtom/routing/1/calculateRoute/1,2:3,4/json', { headers: { origin: 'https://example.com' } });
  assert.equal(otherOrigin.status, 403);
  assert.equal(calls.length, 0);
});

test('TomTom APIs the app does not use are blocked', async () => {
  const res = await call('/api/tomtom/traffic/services/4/flowSegmentData/absolute/10/json');
  assert.equal(res.status, 404);
  assert.equal(calls.length, 0);
});

test('only GET, HEAD and POST are allowed', async () => {
  const res = await call('/api/tomtom/search/2/reverseGeocode/10,123.json', { method: 'DELETE' });
  assert.equal(res.status, 405);
});

test('a missing TOMTOM_KEY secret gives a clear 503', async () => {
  const res = await call('/api/tomtom/search/2/reverseGeocode/10,123.json', {}, { ...env, TOMTOM_KEY: '' });
  assert.equal(res.status, 503);
  assert.match((await res.json()).error, /TOMTOM_KEY/);
});
