// Tests for the demo data layer (js/api.js): the rules the backend must keep too.
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
  api = await import('../js/api.js');
  // The shop tests use their own two made-up shops in place of the demo's sample shops.
  const { SHOPS } = await import('../js/demo-data.js');
  const { TEST_SHOP, TEST_SHOP_2 } = await import('./fixtures.mjs');
  SHOPS.splice(0, SHOPS.length, TEST_SHOP, TEST_SHOP_2);
});

test('routeBetween: turn-by-turn steps only when asked, read from TomTom guidance', async () => {
  const urls = [];
  const realFetch = globalThis.fetch;
  globalThis.fetch = async (url) => {
    urls.push(String(url));
    return {
      ok: true,
      json: async () => ({ routes: [{
        summary: { lengthInMeters: 2200, travelTimeInSeconds: 420 },
        legs: [{ points: [{ latitude: 10.31, longitude: 123.89 }, { latitude: 10.32, longitude: 123.9 }] }],
        guidance: { instructions: [
          { routeOffsetInMeters: 0, maneuver: 'DEPART', message: 'Leave from Osmeña Boulevard' },
          { routeOffsetInMeters: 1110, maneuver: 'TURN_RIGHT', message: 'Turn right onto Gorordo Avenue', street: 'Gorordo Avenue' },
          { routeOffsetInMeters: 2200, maneuver: 'ARRIVE', message: 'You have arrived' },
        ] },
      }] }),
    };
  };
  try {
    const from = { lng: 123.89, lat: 10.31 };
    const to = { lng: 123.9, lat: 10.32 };
    const plain = await api.routeBetween(from, to);
    assert.deepEqual(plain.steps, []);
    assert.equal(urls[0].includes('instructionsType'), false, 'no directions asked for unless needed');
    const nav = await api.routeBetween(from, to, { steps: true });
    assert.ok(urls[1].includes('instructionsType=text'));
    assert.equal(nav.minutes, 7);
    assert.deepEqual(nav.steps[1], { text: 'Turn right onto Gorordo Avenue', maneuver: 'TURN_RIGHT', street: 'Gorordo Avenue', atM: 1110 });
    assert.deepEqual(api.straightLine(from, to).steps, []);
  } finally {
    globalThis.fetch = realFetch;
  }
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

test('driver jobs: demo requests are tagged, can be accepted, moved along in order, and pay into earnings', async () => {
  const jobs = [];
  const stop = api.onJobRequest((j) => jobs.push(j), { near: { lng: 123.8854, lat: 10.3157 } });
  await new Promise((r) => setTimeout(r, 1700));
  stop();
  assert.equal(jobs.length, 1);
  const [job] = jobs;
  assert.equal(job.demo, true);
  assert.ok(['ride', 'express', 'shop'].includes(job.kind));
  assert.ok(job.fare > 0 && job.distanceKm > 0 && job.pickup.label && job.dropoff.label);
  await assert.rejects(api.acceptJob('JOB-nope'), { status: 410 });
  const before = (await api.driverEarnings()).today;
  const { job: active } = await api.acceptJob(job.id);
  assert.equal(active.status, 'to_pickup');
  assert.deepEqual(await api.activeJob(), active);
  await assert.rejects(api.updateJob(job.id, 'completed'), { status: 409 });
  for (const step of ['arrived', 'started', 'completed']) assert.equal((await api.updateJob(job.id, step)).status, step);
  assert.equal(await api.activeJob(), null);
  const e = await api.driverEarnings();
  assert.equal(e.today, before + job.fare);
  assert.equal(e.trips[0].id, job.id);
});

test('shop: list, order with delivery fee unknown until rates are set, order stays "placed"', async () => {
  const { shops: all } = await api.listShops({ near: { lng: 123.8854, lat: 10.3157 }, category: 'food' });
  const shops = all.filter((s) => !s.brand); // the demo merchant's shop has its own test
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

test('a live trip: kept from booking, its status read from the clock, gone when ended or cancelled', async () => {
  const book = () => api.bookRide({
    kind: 'express', vehicle: 'motor', pickup: { lng: 123.88, lat: 10.31, label: 'A' }, dropoff: { lng: 123.89, lat: 10.32, label: 'B' },
    trip: { coords: [[123.88, 10.31], [123.89, 10.32]], minutes: 12 }, payment: 'cash', price: { fare: 90, tip: 10, total: 100 },
  });
  const left = await api.myActiveTrip(); // the test above leaves its ride live
  if (left) await api.endTrip(left.id);
  assert.equal(await api.myActiveTrip(), null);
  const { id } = await book();
  let t = await api.myActiveTrip(); // live as soon as it's booked
  assert.deepEqual([t.id, t.status, t.driver], [id, 'searching', null]);
  await api.findDriver(id);
  t = await api.myActiveTrip();
  assert.equal(t.id, id);
  assert.equal(t.kind, 'express');
  assert.equal(t.status, 'arriving');
  assert.equal(t.booking.price.total, 100);
  // 10 s of a 10 s approach + 2.5 s wait + 14 s trip, half of which was a traffic stop: arriving, 1 min left of 3
  const key = 'mysabak.demo.activeTrip';
  const saved = JSON.parse(localStorage.getItem(key));
  const plan = [{ status: 'arriving', ms: 10000, eta: 3 }, { status: 'arrived', ms: 2500, eta: 0 },
    { status: 'on_trip', ms: 14000, eta: 12 }, { status: 'completed', ms: 0, eta: 0 }];
  localStorage.setItem(key, JSON.stringify({ ...saved, plan, acceptedAt: Date.now() - 12000, pausedMs: 4000 }));
  t = await api.myActiveTrip();
  assert.deepEqual([t.status, t.etaMinutes], ['arriving', 1]);
  localStorage.setItem(key, JSON.stringify({ ...saved, plan, acceptedAt: Date.now() - 18500, pausedMs: 0 }));
  t = await api.myActiveTrip(); // 6 s into the 14 s trip
  assert.deepEqual([t.status, t.etaMinutes], ['on_trip', 7]);
  localStorage.setItem(key, JSON.stringify({ ...saved, plan, acceptedAt: Date.now() - 60000, pausedMs: 0 }));
  assert.equal((await api.myActiveTrip()).status, 'completed'); // stays until the ride screen ends it
  await api.endTrip('RIDE-other');
  assert.ok(await api.myActiveTrip(), 'another booking id leaves it alone');
  await api.endTrip(id);
  assert.equal(await api.myActiveTrip(), null);
  const second = await book();
  await api.findDriver(second.id);
  await api.cancelRide(second.id);
  assert.equal(await api.myActiveTrip(), null);
});

test('demo shop orders move along by themselves; the merchant can move theirs ahead, never back', async () => {
  const { TEST_SHOP } = await import('./fixtures.mjs'); // a sample shop here (see before())
  const { DEMO_ACCOUNTS } = await import('../js/demo-data.js');
  const MINE = DEMO_ACCOUNTS.merchant.shop.id; // the demo merchant's main branch
  const key = 'mysabak.demo.orders';
  const before = localStorage.getItem(key);
  const order = (id, shopId, ago) => ({ id, shop: { id: shopId, name: 'Shop' }, lines: [], subtotal: 100, status: 'placed', placedAt: Date.now() - ago });
  localStorage.setItem(key, JSON.stringify([
    order('S-new', TEST_SHOP.id, 5e3), order('S-cooking', TEST_SHOP.id, 50e3), order('S-old', TEST_SHOP.id, 400e3),
    order('M-old', MINE, 400e3), { ...order('M-ready', MINE, 50e3), status: 'ready' },
    { ...order('M-declined', MINE, 400e3), status: 'cancelled' }, order('X-gone', 'no-such-shop', 400e3),
  ]));
  const statuses = Object.fromEntries((await api.myOrders()).map((o) => [o.id, o.status]));
  assert.deepEqual(statuses, {
    'S-new': 'placed', 'S-cooking': 'preparing', 'S-old': 'delivered',
    'M-old': 'delivered', 'M-ready': 'ready', 'M-declined': 'cancelled', 'X-gone': 'placed',
  });
  assert.equal((await api.orderStatus('S-cooking')).status, 'preparing');
  // Halfway between picked up (3 min) and delivered (6 min): the rider is halfway from the shop to the address
  const home = { lng: TEST_SHOP.lng + 0.02, lat: TEST_SHOP.lat + 0.01, label: 'Home' };
  localStorage.setItem(key, JSON.stringify([{ ...order('S-riding', TEST_SHOP.id, 270e3), address: home }]));
  const riding = await api.orderStatus('S-riding');
  assert.equal(riding.status, 'picked_up');
  assert.ok(Math.abs(riding.rider.lng - (TEST_SHOP.lng + 0.01)) < 1e-4 && Math.abs(riding.rider.lat - (TEST_SHOP.lat + 0.005)) < 1e-4);
  // With a road route saved (orderRoute): halfway along the roads. North 0.01°, then east as far: halfway is the corner.
  const east = 0.01 / Math.cos(((TEST_SHOP.lat + 0.01) * Math.PI) / 180);
  const corner = [TEST_SHOP.lng, TEST_SHOP.lat + 0.01];
  localStorage.setItem('mysabak.demo.orderRoutes', JSON.stringify({ 'S-riding': [[TEST_SHOP.lng, TEST_SHOP.lat], corner, [TEST_SHOP.lng + east, TEST_SHOP.lat + 0.01]] }));
  const onRoads = (await api.orderStatus('S-riding')).rider;
  assert.ok(Math.abs(onRoads.lng - corner[0]) < 1e-4 && Math.abs(onRoads.lat - corner[1]) < 1e-4);
  localStorage.removeItem('mysabak.demo.orderRoutes');
  if (before === null) localStorage.removeItem(key); else localStorage.setItem(key, before);
});

test('demo driver account: signs in with its password only, is approved and can go online', async () => {
  const { DEMO_ACCOUNTS } = await import('../js/demo-data.js');
  const acc = DEMO_ACCOUNTS.driver;
  await assert.rejects(api.driverSignIn({ login: acc.email, password: 'wrong-password' }), { status: 401 });
  assert.deepEqual(await api.driverSignIn({ login: acc.phone, password: acc.password }), { status: 'approved' });
  const d = await api.driverStatus();
  assert.equal(d.signedIn, true);
  assert.deepEqual(await api.setOnline(true), { online: true });
  assert.equal(localStorage.getItem('mysabak.demo.driver').includes(acc.password), false, 'password not stored');
  await api.driverSignOut();
});

test('demo merchant account: sign in, open/close, sold out items, sign out', async () => {
  const { DEMO_ACCOUNTS } = await import('../js/demo-data.js');
  const acc = DEMO_ACCOUNTS.merchant;
  await assert.rejects(api.merchantHome(), { status: 401 });
  await assert.rejects(api.merchantSignIn({ login: acc.email, password: 'nope-nope' }), { status: 401 });
  await api.merchantSignIn({ login: 'Merchant@mysabak.demo', password: acc.password });
  let home = await api.merchantHome();
  assert.equal(home.shop.id, acc.shop.id);
  assert.equal(home.open, true);
  assert.ok(home.orders.length > 0 && home.orders.every((o) => o.demo), 'only the sample orders');
  assert.equal(home.week.length, 7);
  assert.equal(home.week[6], home.today.sales, 'the last day of the week is today');
  const placed = home.orders.find((o) => o.status === 'placed');
  assert.deepEqual(await api.updateMerchantOrder(placed.id, 'accept'), { status: 'accepted' });
  await assert.rejects(api.updateMerchantOrder(placed.id, 'accept'), { status: 409 });
  await api.setShopOpen(false);
  await api.setItemAvailable('adobo', false);
  home = await api.merchantHome();
  assert.equal(home.open, false);
  assert.equal(home.available.adobo, false);
  assert.equal(home.available.lumpia, true);
  const { shops } = await api.listShops({});
  assert.equal(shops.filter((s) => s.brand === acc.shop.id).length, 1, 'the merchant shop is listed once, as one of its branches');

  // Editing the shop and its items: only the fields given change, bad input is refused
  const photo = 'data:image/jpeg;base64,AAAA';
  const shop = await api.updateShop({ name: '  Lola’s Kitchen ', image: photo });
  assert.equal(shop.name, 'Lola’s Kitchen');
  assert.equal(shop.image, photo);
  assert.equal(shop.area, acc.shop.area, 'untouched fields stay');
  await assert.rejects(api.updateShop({ name: '   ' }), { status: 400 });
  await assert.rejects(api.updateShop({ image: 'javascript:alert(1)' }), { status: 400 });
  await assert.rejects(api.updateShop({ image: '//evil.test/x.png' }), { status: 400 });
  const item = await api.updateItem('adobo', { price: '135', note: 'Now with egg.' });
  assert.equal(item.price, 135);
  assert.equal(item.note, 'Now with egg.');
  assert.equal(item.name, 'Chicken adobo + rice');
  await assert.rejects(api.updateItem('adobo', { price: 0 }), { status: 400 });
  await assert.rejects(api.updateItem('adobo', { price: 12.5 }), { status: 400 });
  await assert.rejects(api.updateItem('nope', { price: 10 }), { status: 404 });
  home = await api.merchantHome();
  assert.equal(home.shop.name, 'Lola’s Kitchen');
  assert.equal(home.shop.menu.find((i) => i.id === 'adobo').price, 135);
  assert.equal(acc.shop.name, 'Demo Kitchen', 'the demo data itself is not changed');

  await api.merchantSignOut();
  await assert.rejects(api.updateShop({ name: 'x' }), { status: 401 });
  await assert.rejects(api.merchantHome(), { status: 401 });
});

test('one account per device: customer, driver and merchant each have their own sign in', async () => {
  const { DEMO_ACCOUNTS } = await import('../js/demo-data.js');
  await api.signOut();
  assert.equal(await api.currentUser(), null);
  await assert.rejects(api.clientSignIn({ login: DEMO_ACCOUNTS.merchant.email, password: 'mysabak-demo' }), { status: 401 });
  await api.clientSignIn({ login: '0917 000 0003'.replace(/\s/g, ''), password: DEMO_ACCOUNTS.client.password });
  assert.equal((await api.currentUser()).role, 'client');
  await api.merchantSignIn({ login: DEMO_ACCOUNTS.merchant.email, password: DEMO_ACCOUNTS.merchant.password });
  assert.equal((await api.currentUser()).role, 'merchant', 'signing in as a merchant signs the customer out');
  await api.driverSignIn({ login: DEMO_ACCOUNTS.driver.email, password: DEMO_ACCOUNTS.driver.password });
  assert.equal((await api.currentUser()).role, 'driver');
  await assert.rejects(api.merchantHome(), { status: 401 });
  await api.signOut();
  assert.equal(await api.currentUser(), null);
  assert.equal((await api.driverStatus()).signedIn, false);
});

test('admins sign in on the customer form; only they can see and decide registrations', async () => {
  const { DEMO_ACCOUNTS } = await import('../js/demo-data.js');
  await api.driverApply({ name: 'Test Driver', phone: '09171234567', email: 'test.driver@example.com', city: 'Cebu City',
    vehicle: 'motor', plate: '123 ABC', model: 'Honda Click', year: 2022, licenseNumber: 'G01-22-000001', password: 'x', agreed: true });
  await api.clientSignIn({ login: DEMO_ACCOUNTS.client.email, password: DEMO_ACCOUNTS.client.password });
  for (const call of [api.adminApplications('drivers'), api.adminOverview(), api.adminAnalytics(),
    api.adminDecide({ kind: 'drivers', id: 'browser-driver', decision: 'approved' })]) {
    await assert.rejects(call, { status: 403 }, 'customers are not admins');
  }

  const res = await api.clientSignIn({ login: DEMO_ACCOUNTS.admin.phone, password: DEMO_ACCOUNTS.admin.password });
  assert.equal(res.role, 'admin');
  assert.equal((await api.currentUser()).role, 'admin');
  const drivers = await api.adminApplications('drivers');
  const mine = drivers.find((a) => a.id === 'browser-driver');
  assert.equal(mine.name, 'Test Driver');
  assert.equal(mine.status, 'review');
  assert.ok(drivers.some((a) => a.sample), 'sample applicants are listed too');
  const before = (await api.adminOverview()).drivers.waiting;

  await assert.rejects(api.adminDecide({ kind: 'drivers', id: 'browser-driver', decision: 'maybe' }), { status: 400 });
  await assert.rejects(api.adminDecide({ kind: 'drivers', id: 'browser-driver', decision: 'fix' }), { status: 400 }, 'a fix needs a reason');
  await api.adminDecide({ kind: 'drivers', id: 'browser-driver', decision: 'fix', reason: 'The license is expired' });
  assert.equal((await api.driverStatus()).status, 'review', 'a fix request keeps the driver in review');
  assert.equal((await api.adminOverview()).drivers.waiting, before - 1);
  await api.adminDecide({ kind: 'drivers', id: 'browser-driver', decision: 'approved' });
  assert.equal((await api.driverStatus()).status, 'approved');
  await assert.rejects(api.adminDecide({ kind: 'drivers', id: 'browser-driver', decision: 'rejected' }), { status: 404 }, 'already decided');

  const shop = (await api.adminApplications('merchants')).find((a) => a.status === 'review');
  await api.adminDecide({ kind: 'merchants', id: shop.id, decision: 'rejected' });
  assert.equal((await api.adminApplications('merchants')).find((a) => a.id === shop.id).status, 'rejected');
  await assert.rejects(api.adminApplications('riders'), { status: 400 });

  await api.signOut();
  await assert.rejects(api.adminApplications('drivers'), { status: 403 });
  localStorage.removeItem('mysabak.demo.driver');
  localStorage.removeItem('mysabak.demo.adminDecisions');
});

test('admins manage accounts: edit details, turn accounts off (they can\'t sign in) and back on', async () => {
  const { DEMO_ACCOUNTS } = await import('../js/demo-data.js');
  await assert.rejects(api.adminUsers(), { status: 403 }, 'signed out');
  await api.clientSignIn({ login: DEMO_ACCOUNTS.admin.email, password: DEMO_ACCOUNTS.admin.password });

  const all = await api.adminUsers();
  assert.ok(all.some((u) => u.role === 'rider') && all.some((u) => u.role === 'driver') && all.some((u) => u.role === 'merchant'));
  assert.ok(all.every((u, i) => i === 0 || all[i - 1].joinedAt >= u.joinedAt), 'newest first');
  const pending = all.find((u) => u.status === 'pending');
  assert.ok(pending && pending.application, 'waiting applicants are listed as pending');
  await assert.rejects(api.adminUpdateUser({ ...pending, name: 'X' }), { status: 409 }, 'review the application first');
  await assert.rejects(api.adminSetUserStatus({ id: pending.id, status: 'deactivated', reason: 'x' }), { status: 409 });

  const driver = all.find((u) => u.id === 'demo-driver');
  await assert.rejects(api.adminUpdateUser({ ...driver, email: 'nope' }), { status: 400, field: 'email' });
  await assert.rejects(api.adminUpdateUser({ ...driver, phone: '1234' }), { status: 400, field: 'phone' });
  await assert.rejects(api.adminUpdateUser({ ...driver, email: DEMO_ACCOUNTS.client.email }), { status: 409 }, 'emails are unique');
  const edited = await api.adminUpdateUser({ ...driver, name: '  Demo Driver Two ', phone: '+63 917 000 0001' });
  assert.equal(edited.name, 'Demo Driver Two');
  assert.equal(edited.phone, '09170000001');

  await assert.rejects(api.adminSetUserStatus({ id: driver.id, status: 'deactivated' }), { status: 400 }, 'needs a reason');
  const off = await api.adminSetUserStatus({ id: driver.id, status: 'deactivated', reason: 'Papers expired' });
  assert.equal(off.status, 'deactivated');
  assert.equal(off.reason, 'Papers expired');
  await assert.rejects(api.adminPasswordReset(driver.id), { status: 409 });
  assert.equal((await api.currentUser()).role, 'admin', 'the admin stays signed in');
  await assert.rejects(api.driverSignIn({ login: DEMO_ACCOUNTS.driver.email, password: DEMO_ACCOUNTS.driver.password }), { status: 403 });

  assert.equal((await api.adminSetUserStatus({ id: driver.id, status: 'active' })).status, 'active');
  assert.deepEqual(await api.adminPasswordReset(driver.id), { sentTo: DEMO_ACCOUNTS.driver.email });
  await api.driverSignIn({ login: DEMO_ACCOUNTS.driver.email, password: DEMO_ACCOUNTS.driver.password });
  await api.signOut();
  localStorage.removeItem('mysabak.demo.adminUsers');
  localStorage.removeItem('mysabak.demo.driver');
});
