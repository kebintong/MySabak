// Tests for the demo data layer (assets/js/api.js): the rules the backend must keep too.
// Run: node --test "tests/*.test.mjs"   (browser globals are stubbed; nothing leaves this process)
import { test, before } from 'node:test';
import assert from 'node:assert/strict';

let api;
before(async () => {
  const store = new Map();
  globalThis.location = { origin: 'https://mysabak.test' };
  globalThis.localStorage = {
    getItem: (k) => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => store.set(k, String(v)),
    removeItem: (k) => store.delete(k),
  };
  api = await import('../assets/js/api.js');
});

test('tips: an amount is required, capped at ₱500, e-wallet or card only', async () => {
  await assert.rejects(api.sendTip({ orderId: 'R1', orderType: 'ride', amount: 0, method: 'gcash' }), { status: 400 });
  await assert.rejects(api.sendTip({ orderId: 'R1', orderType: 'ride', amount: 20, method: 'cash' }), { status: 400 });
  const res = await api.sendTip({ orderId: 'R1', orderType: 'ride', amount: 9999, method: 'maya' });
  assert.equal(res.amount, 500);
  const [latest] = await api.myTips();
  assert.equal(latest.orderId, 'R1');
  assert.equal(latest.amount, 500);
});

test('fares go to the driver: no fare until rates are set', () => {
  const fares = api.faresFor({ distanceKm: 6.8 });
  assert.deepEqual(Object.keys(fares), ['motor', 'sedan', 'suv']);
  assert.ok(Object.values(fares).every((f) => f === null));
});

test('online driver application: goes to review, needs an email, stores no documents or password', async () => {
  assert.deepEqual(await api.driverStatus(), { status: 'none', signedIn: false, online: false });
  await assert.rejects(api.setOnline(true), { status: 401 });
  const base = {
    name: 'Juan Dela Cruz', phone: '09175551234', password: 'secret-pass-123', vehicle: 'sedan', plate: 'GAA 1234',
    files: { license: 'x', orcr: 'y', selfie: 'z' }, agreed: true,
  };
  await assert.rejects(api.driverApply({ ...base, email: '' }), { status: 400 });
  assert.deepEqual(await api.driverApply({ ...base, email: 'juan@example.com' }), { status: 'review', email: 'juan@example.com' });
  const d = await api.driverStatus();
  assert.equal(d.status, 'review');
  assert.equal(d.signedIn, false, 'not signed in automatically');
  const saved = localStorage.getItem('mysabak.demo.driver');
  for (const secret of ['files', 'secret-pass-123', 'password']) assert.equal(saved.includes(secret), false, secret);
});

test('driver sign-in with mobile number or email; under review can’t go online; sign-out', async () => {
  await assert.rejects(api.driverSignIn({ login: '09170000000', password: 'whatever1' }), { status: 401 });
  await assert.rejects(api.driverSignIn({ login: 'someone@else.com', password: 'whatever1' }), { status: 401 });
  await assert.rejects(api.driverSignIn({ login: '09175551234', password: '' }), { status: 400 });
  // email, any capitalisation
  assert.deepEqual(await api.driverSignIn({ login: 'Juan@Example.com', password: 'whatever1' }), { status: 'review' });
  assert.equal((await api.driverStatus()).signedIn, true);
  await assert.rejects(api.setOnline(true), { status: 403 });
  await api.driverSignOut();
  assert.equal((await api.driverStatus()).signedIn, false);
  // the same number written as +63 917 555 1234
  assert.deepEqual(await api.driverSignIn({ login: '+639175551234', password: 'whatever1' }), { status: 'review' });
  assert.equal(JSON.stringify(localStorage.getItem('mysabak.demo.driverSession')).includes('whatever1'), false);
});

test('no fake job requests: onJobRequest never fires in the demo', async () => {
  let calls = 0;
  const stop = api.onJobRequest(() => { calls += 1; });
  await new Promise((r) => setTimeout(r, 300));
  stop();
  assert.equal(calls, 0);
  await assert.rejects(api.acceptJob('J1'), { status: 501 });
});

test('shop: list, order with delivery fee unknown until rates are set, order stays "placed"', async () => {
  const { shops } = await api.listShops({ near: { lng: 123.8854, lat: 10.3157 }, category: 'food' });
  assert.ok(shops.length >= 2 && shops.every((s) => s.category === 'food'));
  assert.ok(shops[0].km <= shops[1].km, 'nearest first');
  const { id } = await api.placeOrder({
    shopId: 'lutong-bahay',
    items: [{ id: 'adobo', qty: 2 }, { id: 'nope', qty: 1 }],
    address: { lng: 123.89, lat: 10.317, label: 'Escario St' },
    notes: '',
    payment: 'cash',
  });
  const order = await api.orderStatus(id);
  assert.equal(order.status, 'placed');
  assert.equal(order.subtotal, 240);
  assert.equal(order.deliveryFee, null);
  await assert.rejects(api.placeOrder({ shopId: 'lutong-bahay', items: [], address: { lng: 0, lat: 0 } }), { status: 400 });
});
