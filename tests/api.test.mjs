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
  // The demo ships with no shops; give the shop tests two made-up ones.
  const { SHOPS } = await import('../assets/js/demo-data.js');
  const { TEST_SHOP, TEST_SHOP_2 } = await import('./fixtures.mjs');
  SHOPS.push(TEST_SHOP, TEST_SHOP_2);
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
  assert.equal(shops.length, 2);
  assert.ok(shops.every((s) => s.category === 'food'));
  assert.ok(shops[0].km <= shops[1].km, 'nearest first');
  const { id } = await api.placeOrder({
    shopId: 'test-kitchen',
    items: [{ id: 'adobo', qty: 2 }, { id: 'nope', qty: 1 }],
    address: { lng: 123.89, lat: 10.317, label: 'Escario St' },
    notes: '',
    payment: 'cash',
  });
  const order = await api.orderStatus(id);
  assert.equal(order.status, 'placed');
  assert.equal(order.subtotal, 240);
  assert.equal(order.deliveryFee, null);
  await assert.rejects(api.placeOrder({ shopId: 'test-kitchen', items: [], address: { lng: 0, lat: 0 } }), { status: 400 });
});

test('shop: the order is priced from the menu, options included; made-up prices and picks are ignored', async () => {
  const { id } = await api.placeOrder({
    shopId: 'test-kitchen',
    items: [
      { id: 'adobo', qty: 1, price: 1, picks: { size: 'Family', meal: 'Meal', drink: 'Cola', add: ['Fried egg', 'Gold leaf'] }, note: ' no onions ' },
      { id: 'combo', qty: 2, picks: { anything: 'x' } },
    ],
    address: { lng: 123.89, lat: 10.317, label: 'Escario St' },
    payment: 'gcash',
  });
  const order = await api.orderStatus(id);
  const [adobo, bundle] = order.lines;
  assert.equal(adobo.price, 120 + 260 + 45 + 20);
  assert.deepEqual(adobo.options, ['Family', 'Meal', 'Cola', 'Fried egg']);
  assert.equal(adobo.note, 'no onions');
  assert.equal(bundle.price, 520);
  assert.equal(order.subtotal, 445 + 1040);
});


test('ride booking: payment must be cash, GCash or online banking; the tip on top is capped and goes to mysabak', async () => {
  const base = {
    kind: 'ride', vehicle: 'sedan', pickup: { lng: 123.88, lat: 10.31, label: 'A' }, dropoff: { lng: 123.89, lat: 10.32, label: 'B' },
    trip: { coords: [[123.88, 10.31], [123.89, 10.32]], minutes: 12 },
  };
  await assert.rejects(api.bookRide({ ...base, payment: 'crypto', price: { fare: 90, tip: 0, total: 90 } }), { status: 400 });
  const { id } = await api.bookRide({ ...base, payment: 'cash', price: { fare: 90, tip: 9999, total: 10089 } });
  const [tip] = await api.myTips();
  assert.equal(tip.orderId, id);
  assert.equal(tip.amount, 500);
  assert.equal(tip.method, 'cash');
});

test('ride booking: a demo driver accepts, the trip reports where the driver is, and the ride can be rated', async () => {
  const { id } = await api.bookRide({
    kind: 'ride', vehicle: 'motor', pickup: { lng: 123.88, lat: 10.31, label: 'A' }, dropoff: { lng: 123.89, lat: 10.32, label: 'B' },
    trip: { coords: [[123.88, 10.31], [123.89, 10.32]], minutes: 12 }, payment: 'gcash', price: { fare: null, tip: 0, total: null },
  });
  const driver = await api.findDriver(id);
  assert.equal(driver.vehicle.type, 'motor');
  assert.ok(driver.name && driver.vehicle.plate);
  const updates = [];
  const stop = api.onTripUpdate(id, (u) => updates.push(u));
  await new Promise((r) => setTimeout(r, 300));
  stop();
  assert.equal(updates[0].status, 'arriving');
  assert.ok(Number.isFinite(updates[0].driver.lng) && Number.isFinite(updates[0].driver.lat));
  await assert.rejects(api.rateRide(id, 0), { status: 400 });
  assert.deepEqual(await api.rateRide(id, 5), { ok: true });
  await assert.rejects(api.findDriver('RIDE-nope'), { status: 404 });
});
