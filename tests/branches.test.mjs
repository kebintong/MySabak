// Branches: the owner adds branches, each run by its own branch account; customers order from the nearest one.
// Run: node --test "tests/*.test.mjs"   (browser globals are stubbed; nothing leaves this process)
import { test, before, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

let api;
let moodFor;
let DEMO_ACCOUNTS;
const store = new Map();
const OWNER = () => ({ login: DEMO_ACCOUNTS.merchant.email, password: DEMO_ACCOUNTS.merchant.password });
const TALISAY = 'demo-kitchen-talisay';
const NEAR_TALISAY = { lng: 123.85, lat: 10.263 };
const NEAR_CAPITOL = { lng: 123.893, lat: 10.318 };
const ADDRESS = { lng: 123.851, lat: 10.262, label: 'Tabunok' };

before(async () => {
  globalThis.location = { origin: 'https://mysabak.test' };
  globalThis.localStorage = {
    getItem: (k) => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => store.set(k, String(v)),
    removeItem: (k) => store.delete(k),
  };
  api = await import('../js/api.js');
  ({ moodFor } = await import('../js/mood.js'));
  ({ DEMO_ACCOUNTS } = await import('../js/demo-data.js'));
});
beforeEach(() => store.clear());

const newBranch = {
  name: 'Mandaue', areaId: 'mandaue', street: '12 A.C. Cortes Ave', opensAt: '09:00', closesAt: '21:00',
  phone: '0917 555 0101', managerName: 'Rico Tan', managerLogin: 'rico@example.com',
};

test('mood: compares today with the usual day, scaled to the hours passed', () => {
  const at = (h) => new Date(2026, 10, 5, h, 0);
  const day = { open: true, orders: 30, opensAt: '09:00', closesAt: '21:00', usual: 2400 };
  assert.equal(moodFor({ ...day, sales: 1500, now: at(15) }).kind, 'busy'); // expected 1200 by 3 PM
  assert.equal(moodFor({ ...day, sales: 1200, now: at(15) }).kind, 'steady');
  assert.equal(moodFor({ ...day, sales: 800, now: at(15) }).kind, 'slow');
  assert.equal(moodFor({ ...day, sales: 0, now: at(9) }).kind, 'early');
  assert.equal(moodFor({ ...day, sales: 0, now: at(22) }).kind, 'after');
  assert.equal(moodFor({ ...day, open: false, sales: 5000, now: at(15) }).kind, 'closed');
  assert.equal(moodFor({ ...day, usual: 0, sales: 100, now: at(15) }).kind, 'new');
  assert.match(moodFor({ ...day, sales: 1500, now: at(15) }).title, /\S/);
});

test('owner adds a branch; its manager signs in with the login the owner entered and sees only that branch', async () => {
  await api.merchantSignIn(OWNER());
  await assert.rejects(api.addBranch({ ...newBranch, managerLogin: DEMO_ACCOUNTS.client.email }), { status: 409 });
  await assert.rejects(api.addBranch({ ...newBranch, closesAt: '08:00' }), { status: 400 });
  const { branch } = await api.addBranch(newBranch);
  assert.equal(branch.account.status, 'active');
  let home = await api.merchantHome();
  assert.equal(home.role, 'owner');
  assert.equal(home.branches.length, 3, 'main, the sample Talisay branch and the new one');

  await api.merchantSignOut();
  await assert.rejects(api.merchantSignIn({ login: 'someone@example.com', password: 'longenough' }), { status: 401 });
  await api.merchantSignIn({ login: 'Rico@example.com', password: 'longenough' });
  home = await api.merchantHome();
  assert.equal(home.role, 'branch');
  assert.equal(home.branch.id, branch.id);
  assert.equal(home.branches, null, 'a branch account doesn’t see the other branches');
  assert.equal(home.orders.length, 0);
  assert.equal((await api.currentUser()).branch, 'Mandaue');
  await assert.rejects(api.addBranch({ ...newBranch, name: 'Other' }), { status: 403 });
  await assert.rejects(api.updateShop({ name: 'Mine now' }), { status: 403 });
  await api.setShopOpen(false);
  assert.equal((await api.merchantHome()).open, false);
  const sales = await api.merchantSales({ range: 'week', branchId: 'all' });
  assert.equal(sales.branchId, branch.id, 'a branch account only gets its own numbers');
  assert.equal(sales.total, 0, 'a new branch has no history');

  // The owner turns the account off: it is signed out and can't sign back in
  await api.merchantSignIn(OWNER());
  await api.setBranchAccount(branch.id, 'disabled');
  await assert.rejects(api.merchantSignIn({ login: 'rico@example.com', password: 'longenough' }), { status: 403 });
  await assert.rejects(api.shopMenu(branch.id), { status: 404 });
  // A new manager signs in with their own login; the old manager's no longer works
  await api.changeBranchManager(branch.id, { managerName: 'Joy Lim', managerLogin: '0917 555 0199' });
  await api.setBranchAccount(branch.id, 'active');
  await api.merchantSignOut();
  await assert.rejects(api.merchantSignIn({ login: 'rico@example.com', password: 'longenough' }), { status: 401 });
  await api.merchantSignIn({ login: '09175550199', password: 'longenough' });
  assert.equal((await api.merchantHome()).name, 'Joy Lim');
});

test('the owner views another branch read-only until they take it over', async () => {
  await api.merchantSignIn(OWNER());
  assert.equal((await api.merchantHome()).canAct, true, 'the main branch is the owner’s own');
  await api.viewBranch(TALISAY);
  let home = await api.merchantHome();
  assert.equal(home.branch.id, TALISAY);
  assert.equal(home.canAct, false);
  const placed = home.orders.find((o) => o.status === 'placed');
  await assert.rejects(api.updateMerchantOrder(placed.id, 'accept'), { status: 403 });
  await assert.rejects(api.setShopOpen(false), { status: 403 });
  await api.takeOverBranch(true);
  home = await api.merchantHome();
  assert.equal(home.canAct, true);
  assert.equal(home.takeover, true);
  assert.deepEqual(await api.updateMerchantOrder(placed.id, 'accept'), { status: 'accepted' });
  await api.viewBranch(null);
  home = await api.merchantHome();
  assert.equal(home.branch.main, true);
  await assert.rejects(api.updateMerchantOrder(placed.id, 'accept'), { status: 404 }, 'orders belong to their own branch');
});

test('customers get the nearest branch that takes orders; the order goes to that branch only', async () => {
  let { shops } = await api.listShops({ near: NEAR_TALISAY });
  let kitchen = shops.filter((s) => s.brand);
  assert.equal(kitchen.length, 1, 'one card for the whole shop');
  assert.equal(kitchen[0].id, TALISAY);
  assert.equal((await api.listShops({ near: NEAR_CAPITOL })).shops.find((s) => s.brand).id, 'demo-kitchen');

  const menu = await api.shopMenu(TALISAY);
  assert.deepEqual(menu.branches.map((b) => b.name), ['Capitol Site', 'Talisay']);
  const { id } = await api.placeOrder({ shopId: TALISAY, items: [{ id: 'adobo', qty: 1 }], address: ADDRESS, notes: '', payment: 'cash' });

  await api.merchantSignIn({ login: 'talisay@mysabak.demo', password: 'mysabak-demo' });
  let home = await api.merchantHome();
  assert.ok(home.orders.some((o) => o.id === id), 'the Talisay branch gets it');
  await api.setItemAvailable('adobo', false);
  await assert.rejects(api.placeOrder({ shopId: TALISAY, items: [{ id: 'adobo', qty: 1 }], address: ADDRESS, payment: 'cash' }), { status: 409 });
  await api.setShopOpen(false);
  ({ shops } = await api.listShops({ near: NEAR_TALISAY }));
  kitchen = shops.find((s) => s.brand);
  assert.equal(kitchen.id, 'demo-kitchen', 'a closed branch sends customers to the next nearest');
  await assert.rejects(api.placeOrder({ shopId: TALISAY, items: [{ id: 'rice', qty: 1 }], address: ADDRESS, payment: 'cash' }), { status: 409 });

  await api.merchantSignIn(OWNER());
  home = await api.merchantHome();
  assert.equal(home.orders.some((o) => o.id === id), false, 'the main branch doesn’t');
  const t = home.branches.find((b) => b.id === TALISAY);
  assert.equal(t.open, false);
  assert.ok(t.todayOrders >= 1);
  const all = await api.merchantSales({ range: 'day', branchId: 'all' });
  const main = await api.merchantSales({ range: 'day', branchId: 'demo-kitchen' });
  assert.ok(all.total > main.total, 'all branches add up');
  assert.equal(all.branches.length, 2);
  assert.equal((await api.merchantSales({ range: 'month' })).series.length, new Date().getDate());
});

test('POS: a counter sale is priced from the menu, needs enough cash, and counts in sales but not in online orders', async () => {
  await assert.rejects(api.posSale({ items: [{ id: 'rice', qty: 1 }], payment: 'cash', cash: 100 }), { status: 401 });
  await api.merchantSignIn(OWNER());
  const before = await api.merchantHome();
  await assert.rejects(api.posSale({ items: [], payment: 'cash', cash: 100 }), { status: 400 });
  await assert.rejects(api.posSale({ items: [{ id: 'rice', qty: 2 }], payment: 'cash', cash: 10 }), { status: 400 });
  await assert.rejects(api.posSale({ items: [{ id: 'rice', qty: 1 }], payment: 'card' }), { status: 400 });
  const sale = await api.posSale({ items: [{ id: 'rice', qty: 2, picks: { [DEMO_ACCOUNTS.merchant.shop.menu[3].options[0].id]: 'Garlic' }, price: 1 }, { id: 'icedtea', qty: 1 }], payment: 'cash', cash: 200 });
  assert.equal(sale.subtotal, 2 * 30 + 35, 'garlic rice ₱30 × 2 + iced tea ₱35; the browser’s price is ignored');
  assert.equal(sale.change, 200 - 95);
  const gcash = await api.posSale({ items: [{ id: 'leche', qty: 1 }], payment: 'gcash' });
  assert.equal(gcash.change, null);
  const home = await api.merchantHome();
  assert.equal(home.orders.some((o) => o.id === sale.id), false, 'not in the online order columns');
  assert.equal(home.counter.length, 2);
  assert.equal(home.today.sales, before.today.sales + 95 + 60);
  assert.equal((await api.merchantSales({ range: 'day', branchId: 'demo-kitchen' })).channels.counter, 155);
  await api.setItemAvailable('leche', false);
  await assert.rejects(api.posSale({ items: [{ id: 'leche', qty: 1 }], payment: 'gcash' }), { status: 409 });
  await api.viewBranch(TALISAY);
  await assert.rejects(api.posSale({ items: [{ id: 'rice', qty: 1 }], payment: 'gcash' }), { status: 403 }, 'view only');
});

test('sales: the period before comes as a running total beside the chart, and month means the same days of last month', async () => {
  await api.merchantSignIn(OWNER());
  for (const range of ['day', 'week', 'month']) {
    const s = await api.merchantSales({ range, branchId: 'demo-kitchen' });
    assert.equal(s.compare.length, s.series.length, range);
    assert.ok(s.compare.every((v, i) => i === 0 || v >= s.compare[i - 1]), `${range}: a running total only goes up`);
  }
  const week = await api.merchantSales({ range: 'week', branchId: 'demo-kitchen' });
  assert.equal(week.compare[week.compare.length - 1], week.previous, 'the line ends on last week’s total');
  const month = await api.merchantSales({ range: 'month', branchId: 'demo-kitchen' });
  assert.equal(month.compare[month.compare.length - 1], month.previous);
});
