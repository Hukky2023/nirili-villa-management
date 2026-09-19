import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
const require = createRequire(import.meta.url), ts = require('typescript');
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
let clock = '2026-09-19T07:00:00Z';
class TestDate extends Date {
  constructor(...args) {super(...(args.length ? args : [clock]));}
  static now() {return Date.parse(clock);}
}
function load(file, mocks = {}) {
  const {outputText, diagnostics} = ts.transpileModule(readFileSync(path.join(root, file), 'utf8'), {
    fileName: file, reportDiagnostics: true,
    compilerOptions: {target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX}
  });
  assert.equal(diagnostics?.filter(d => d.category === ts.DiagnosticCategory.Error).length, 0, file + ' syntax');
  const module = {exports: {}};
  new Function('require', 'module', 'exports', 'Date', outputText)(name => {
    if (!(name in mocks)) throw Error('Unexpected import ' + name + ' in ' + file);
    return mocks[name];
  }, module, module.exports, TestDate);
  return module.exports;
}
const meals = load('lib/meal-access.ts');
const pricing = load('lib/waiter-pricing.ts', {'./meal-access': meals});
const dining = load('lib/dining-room.ts');
const tables = load('lib/restaurant-tables.ts');
const product = {id: 'rice', name: 'Vegetable', category: 'Rice', kind: 'food', cents: 800, fullBoard: true};
const extra = {id: 'juice', name: 'Juice', category: 'Drinks', kind: 'food', cents: 400, fullBoard: false};
const guest = {role: 'guest', userId: 'guest-101', username: '101', displayName: 'Test guest', permissions: []};
const waiter = {role: 'staff', userId: 'waiter-1', username: 'waiter', permissions: ['waiter_pos']};
const cashier = {role: 'staff', userId: 'cashier-1', username: 'cashier', permissions: ['restaurant_pos']};
const kitchen = {role: 'staff', userId: 'kitchen-1', username: 'kitchen', permissions: ['kitchen_pos']};
let current = guest, db, goodOrigin = true, failNextWrite = false, loadBarrier = null;
class D1 {
  constructor() {
    this.raw = new DatabaseSync(':memory:');
    this.raw.exec('CREATE TABLE operation_records(key TEXT PRIMARY KEY,payload TEXT,revision INTEGER,updated_by TEXT);');
  }
  prepare(sql) {
    const self = this;
    return {bind(...args) {return {
      async first() {return self.raw.prepare(sql).get(...args) || null;},
      async all() {return {results: self.raw.prepare(sql).all(...args)};},
      async run() {
        if (failNextWrite) {failNextWrite = false; return {meta: {changes: 0}};}
        const result = self.raw.prepare(sql).run(...args); return {meta: {changes: Number(result.changes)}};
      }
    };}};
  }
}
const auth = {
  authDb: () => db, currentUser: async () => current, sameOrigin: () => goodOrigin,
  hasPermission: (u, p) => !!u && (u.role === 'admin' || u.permissions?.includes(p)),
  limit: async () => true, randomToken: () => 'a'.repeat(64), digest: async () => 'digest'
};
const access = load('lib/pos-access.ts', {'./auth': auth});
const stayKey = 'hotel-stays-v1';
const stays = {stayKey, loadStays: async () => {
  const row = db.raw.prepare('SELECT * FROM operation_records WHERE key=?').get(stayKey);
  const state = JSON.parse(row.payload); meals.restoreHalfBoardSelections(state);
  if (loadBarrier) await loadBarrier();
  return {state, revision: row.revision};
}, folioFor: async s => ({totalCents: 0, paidCents: 0, balanceCents: 0, bills: s.posBills || []})};
const menu = {loadMenu: async () => ({items: [product, extra]}), foodCatalog: async () => [product, extra]};
const shared = {'../../../lib/auth': auth, '../../../lib/stays': stays, '../../../lib/meal-access': meals,
  '../../../lib/pos-access': access, '../../../lib/dining-room': dining, '../../../lib/menu-server': menu,
  '../../../lib/restaurant-tables': tables,
  '../../../lib/walkin-excursion-access': {walkInExcursionProfile: () => null, syncWalkInExcursionAccess: () => []}};
const selections = load('app/api/meal-selection/route.ts', shared);
const pos = load('app/api/pos/route.ts', {...shared,
  '../../../lib/waiter-pricing': pricing, '../../../lib/pos-bill-delete': {}, '../../../lib/pos-discount': {},
  '../../../lib/pos-payment': {}, '../../../lib/restaurant-payment-settings': {loadRestaurantPaymentSettingsWithDailyRates: async () => ({})}});
const restaurant = load('app/api/restaurant-guest/route.ts', {...shared,
  '../../../lib/auth': {...auth, currentUser: async () => guest},
  '../../../lib/tab-session': {sessionCookieName: async name => name}, 'next/headers': {cookies: async () => ({get: () => null})}});
const legacy = load('app/api/guest-services/route.ts', {...shared,
  '../../../lib/excursion-guide-server': {}, '../../../lib/excursion-workflow': {}, '../../../lib/booking-reference': {},
  '../../../lib/stay-login': {saveStayAccess: async (state, revision, actor) => {
    const result = await db.prepare('UPDATE operation_records SET payload=?,revision=revision+1,updated_by=? WHERE key=? AND revision=?')
      .bind(JSON.stringify(state), actor, stayKey, revision).run(); return !!result.meta.changes;
  }}, '../../../lib/credential-store': {}, '../../../lib/account-history': {},
  '../../../lib/guest-catalog': {catalog: [], islandToday: () => meals.mealService().date},
  '../../../lib/excursion-menu': {loadExcursionMenu: async () => []}});
const scheduleApi = load('app/api/meal-schedule/route.ts', {'../../../lib/meal-access': meals});
function newStay(overrides = {}) {
  return {id: 'NV-0001', accountId: guest.userId, room: '101', guest: 'Test guest', meal: 'Half Board',
    status: 'In House', history: [], posBills: [], ...overrides};
}
function reset(overrides = {}) {
  db?.raw.close(); db = new D1(); current = guest; clock = '2026-09-19T07:00:00Z';
  goodOrigin = true; failNextWrite = false; loadBarrier = null;
  const state = {stays: [newStay(overrides), newStay({id: 'NV-0002', accountId: 'guest-102', room: '102'})], posOrders: [], orders: [], requests: []};
  db.raw.prepare('INSERT INTO operation_records VALUES(?,?,1,?)').run(stayKey, JSON.stringify(state), 'seed');
}
function saved() {return JSON.parse(db.raw.prepare('SELECT payload FROM operation_records WHERE key=?').get(stayKey).payload);}
function revision() {return db.raw.prepare('SELECT revision FROM operation_records WHERE key=?').get(stayKey).revision;}
function request(body, mode = '') {return new Request('https://example.test/api/test' + mode, {
  method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify(body)
});}
async function choose(meal, extraBody = {}) {
  const context = meals.mealContext(saved().stays[0]);
  return selections.POST(request({stayId: 'NV-0001', meal, date: context.date, version: context.version, ...extraBody}));
}
function line(included, item = product) {return {id: item.id, quantity: 1, cents: item.cents, included};}
async function guestOrder(included, options = {}) {
  current = guest;
  return restaurant.POST(request({token: crypto.randomUUID(), table: 'Table 1', stayId: 'NV-0001', notes: '', items: [line(included)], ...options}, '?mode=inhouse'));
}
async function waiterOrder(included, options = {}) {
  current = waiter;
  return pos.POST(request({action: 'create', token: crypto.randomUUID(), revision: revision(), table: 'Table 1', customer: '',
    stayId: 'NV-0001', notes: '', items: [line(included)], applyMealPlan: true, ...options}));
}
async function ok(response) {assert.equal(response.status, 200, JSON.stringify(await response.clone().json())); return response.json();}
async function rejects(response, pattern, status = 400) {assert.equal(response.status, status); assert.match((await response.json()).error, pattern);}

for (const day of ['2026-09-19', '2026-09-20', '2026-09-21', '2026-09-22', '2026-09-23', '2026-09-24']) {
  test(day + ' regular meal hours', () => {
    for (const [time, expected] of [['01:59', null], ['02:00', 'breakfast'], ['03:59', 'breakfast'], ['04:00', null],
      ['06:59', null], ['07:00', 'lunch'], ['09:59', 'lunch'], ['10:00', null], ['12:59', null], ['13:00', 'dinner'], ['15:59', 'dinner'], ['16:00', null]]) {
      assert.equal(meals.mealService(new Date(day + 'T' + time + ':00Z')).period, expected, time);
    }
  });
}
test('Friday lunch starts 13:30, while breakfast and dinner hours stay unchanged', () => {
  for (const [time, expected] of [['02:00', 'breakfast'], ['04:00', null], ['07:00', null], ['08:29', null],
    ['08:30', 'lunch'], ['09:59', 'lunch'], ['10:00', null], ['13:00', 'dinner'], ['16:00', null]]) {
    assert.equal(meals.mealService(new Date('2026-09-18T' + time + ':00Z')).period, expected, time);
  }
});
test('Daily allowance rolls over at midnight Maldives, not UTC', () => {
  const stay = newStay({halfBoardMeals: {'2026-09-19': {meal: 'lunch', lockedAt: 'used', version: 2}}});
  assert.equal(meals.mealContext(stay, new Date('2026-09-19T18:59:59Z')).locked, true);
  const next = meals.mealContext(stay, new Date('2026-09-19T19:00:00Z'));
  assert.equal(next.date, '2026-09-20'); assert.equal(next.choice, null); assert.equal(next.locked, false); assert.equal(next.version, 0);
});
test('Half Board fails closed without daily context; Full Board and paid extras are preserved', () => {
  assert.equal(meals.mealItemIncluded('Half Board', product), false);
  assert.equal(meals.mealItemIncluded('Full Board', product), true);
  assert.equal(meals.mealItemIncluded('Full Board', extra), false);
  assert.equal(meals.mealItemIncluded('Bed & Breakfast', product), false);
});
test('Breakfast remains included and does not use the lunch/dinner allowance', async () => {
  reset(); clock = '2026-09-19T02:30:00Z'; await ok(await guestOrder(true));
  assert.equal(saved().posOrders[0].cents, 0); assert.equal(saved().stays[0].halfBoardMeals, undefined);
  assert.equal(meals.mealContext(saved().stays[0]).locked, false);
});
test('Guest-selected free lunch is seen by waiter, locks on waiter order, and guest dinner is charged with matching room bill', async () => {
  reset(); await ok(await choose('lunch'));
  current = waiter; const view = await ok(await pos.GET()); assert.equal(view.rooms[0].mealAccess.choice, 'lunch');
  await ok(await waiterOrder(true, {items: [line(true), line(false, extra)]}));
  let state = saved(); assert.equal(state.stays[0].halfBoardMeals['2026-09-19'].meal, 'lunch');
  assert.ok(state.stays[0].halfBoardMeals['2026-09-19'].lockedAt);
  assert.equal(state.posOrders[0].cents, 400); assert.equal(state.stays[0].posBills[0].totalCents, 400);
  clock = '2026-09-19T13:00:00Z'; await ok(await guestOrder(false)); state = saved();
  assert.equal(state.posOrders[1].cents, 800); assert.equal(state.stays[0].posBills[1].totalCents, 800);
  assert.equal(state.posOrders[1].method, 'Room');
});
test('Waiter-selected free dinner leaves lunch chargeable and guest dinner included', async () => {
  reset(); current = waiter; await ok(await choose('dinner'));
  await ok(await waiterOrder(false)); assert.equal(saved().posOrders[0].cents, 800);
  assert.equal(meals.mealContext(saved().stays[0]).locked, false);
  clock = '2026-09-19T13:00:00Z'; await ok(await guestOrder(true));
  assert.equal(saved().posOrders[1].cents, 0); assert.equal(meals.mealContext(saved().stays[0]).locked, true);
});
test('Selection can change before use but cannot change after included order', async () => {
  reset(); await ok(await choose('lunch')); await ok(await choose('dinner')); await ok(await choose('lunch'));
  await ok(await guestOrder(true)); await rejects(await choose('dinner'), /already been ordered/);
  assert.equal(saved().stays[0].halfBoardMeals['2026-09-19'].meal, 'lunch');
});
test('Paid extras do not consume a free main meal', async () => {
  reset(); await ok(await choose('lunch')); await ok(await guestOrder(false, {items: [line(false, extra)]}));
  assert.equal(saved().posOrders[0].cents, 400); assert.equal(meals.mealContext(saved().stays[0]).locked, false);
  await ok(await choose('dinner'));
});
test('An allowance must be selected before ordering included main-meal products', async () => {
  reset(); await rejects(await guestOrder(true), /Choose Free Lunch or Free Dinner/);
  await rejects(await waiterOrder(true), /Choose Free Lunch or Free Dinner/);
  assert.equal(saved().posOrders.length, 0);
});
test('Both screens reject stale quoted inclusion instead of silently changing the bill', async () => {
  reset(); await ok(await choose('dinner'));
  await rejects(await guestOrder(true), /availability changed/);
  await rejects(await waiterOrder(true), /meal plan or included menu changed/);
  assert.equal(saved().posOrders.length, 0); assert.equal(saved().stays[0].posBills.length, 0);
});
test('Stale selection versions and dates cannot overwrite another screen', async () => {
  reset(); await ok(await choose('lunch'));
  await rejects(await choose('dinner', {version: 0}), /another screen/);
  await rejects(await choose('dinner', {date: '2026-09-18'}), /new Maldives day/);
  assert.equal(meals.mealContext(saved().stays[0]).choice, 'lunch');
});
test('A guest cannot choose or order for a different room', async () => {
  reset(); await rejects(await choose('lunch', {stayId: 'NV-0002'}), /assignment changed/);
  await rejects(await guestOrder(false, {stayId: 'NV-0002'}), /assignment changed/);
  assert.equal(saved().stays[1].halfBoardMeals, undefined);
});
test('Guest cannot order or choose before check-in or after checkout', async () => {
  for (const status of ['Confirmed', 'Checked Out']) {
    reset({status}); await rejects(await choose('lunch'), /check in/);
    await rejects(await guestOrder(true), /check in/);
    assert.equal(saved().posOrders.length, 0);
  }
});
test('Kitchen-only and unauthenticated accounts cannot set allowances; cross-origin denied', async () => {
  reset(); current = kitchen; await rejects(await choose('lunch'), /access required/, 403);
  current = null; await rejects(await choose('lunch'), /access required/, 403);
  current = guest; goodOrigin = false; await rejects(await choose('lunch'), /access required/, 403);
});
test('Only checked-in Half Board rooms can select free lunch or dinner', async () => {
  for (const meal of ['Full Board', 'Bed & Breakfast', 'Room only']) {
    reset({meal}); await rejects(await choose('lunch'), /Half Board room is required/);
  }
});
test('Same room number in another stay does not share a previous stay allowance', () => {
  const previous = newStay({halfBoardMeals: {'2026-09-19': {meal: 'lunch', lockedAt: 'used', version: 2}}});
  const next = newStay({id: 'NV-0099'});
  assert.equal(meals.mealContext(previous).locked, true); assert.equal(meals.mealContext(next).choice, null);
});
test('Order idempotency does not create duplicate bills or consume twice', async () => {
  reset(); await ok(await choose('lunch')); const token = crypto.randomUUID();
  await ok(await guestOrder(true, {token})); const version = meals.mealContext(saved().stays[0]).version;
  await ok(await guestOrder(true, {token})); assert.equal(saved().posOrders.length, 1);
  assert.equal(saved().stays[0].posBills.length, 1); assert.equal(meals.mealContext(saved().stays[0]).version, version);
});
test('Failed compare-and-swap writes leave allowance, order, and linked bill unchanged', async () => {
  reset(); await ok(await choose('lunch')); const before = saved(); failNextWrite = true;
  await rejects(await guestOrder(true), /Another order arrived/, 409); assert.deepEqual(saved(), before);
  failNextWrite = true; await rejects(await waiterOrder(true), /Orders changed/, 409); assert.deepEqual(saved(), before);
});
test('Failed selection write cannot replace a saved choice', async () => {
  reset(); await ok(await choose('lunch')); const before = saved(); failNextWrite = true;
  await rejects(await choose('dinner'), /another screen/, 409); assert.deepEqual(saved(), before);
});
test('Concurrent guest and waiter submissions cannot both overwrite shared room state', async () => {
  reset(); await ok(await choose('lunch')); const waiting = [];
  loadBarrier = () => new Promise(resolve => {waiting.push(resolve); if (waiting.length === 2) {loadBarrier = null; waiting.forEach(done => done());}});
  const responses = await Promise.all([guestOrder(true), waiterOrder(true)]);
  assert.deepEqual(responses.map(r => r.status).sort(), [200, 409]);
  assert.equal(saved().posOrders.length, 1); assert.equal(saved().stays[0].posBills.length, 1);
  assert.equal(meals.mealContext(saved().stays[0]).locked, true);
});
test('Outside service hours Half Board items are paid, including Friday before 13:30', async () => {
  reset(); clock = '2026-09-18T07:00:00Z'; await ok(await choose('lunch'));
  await ok(await guestOrder(false)); assert.equal(saved().posOrders[0].cents, 800);
  assert.equal(meals.mealContext(saved().stays[0]).locked, false);
  clock = '2026-09-18T08:30:00Z'; await ok(await guestOrder(true)); assert.equal(saved().posOrders[1].cents, 0);
});
test('New Maldives day gets a new choice without modifying yesterday or its bills', async () => {
  reset(); await ok(await choose('lunch')); await ok(await guestOrder(true));
  const yesterday = structuredClone(saved().stays[0].halfBoardMeals['2026-09-19']);
  clock = '2026-09-20T07:00:00Z'; await ok(await choose('dinner')); await ok(await guestOrder(false));
  assert.deepEqual(saved().stays[0].halfBoardMeals['2026-09-19'], yesterday);
  assert.equal(saved().posOrders[0].cents, 0); assert.equal(saved().posOrders[1].cents, 800);
});
test('Legacy included orders are recovered without repricing old restaurant bills', () => {
  reset(); const state = saved(); state.posOrders = [{id: 'POS-OLD', stayId: 'NV-0001', cents: 400, createdAt: clock,
    items: [{name: 'Rice (meal plan included)', cents: 0}, {name: 'Juice', cents: 400}]}];
  state.stays[0].posBills = [{id: 'POS-OLD', totalCents: 400}];
  const beforeOrders = structuredClone(state.posOrders), beforeBills = structuredClone(state.stays[0].posBills);
  meals.restoreHalfBoardSelections(state); assert.equal(meals.mealContext(state.stays[0]).choice, 'lunch');
  assert.equal(meals.mealContext(state.stays[0]).locked, true);
  assert.deepEqual(state.posOrders, beforeOrders); assert.deepEqual(state.stays[0].posBills, beforeBills);
  const copy = structuredClone(state); meals.restoreHalfBoardSelections(state); assert.deepEqual(state, copy);
});
test('Legacy cancelled orders, breakfast, and explicit cash discounts do not use a main-meal allowance', () => {
  reset(); const state = saved(); state.orders = [{kind: 'food', id: 'CANCEL', stayId: 'NV-0001', createdAt: clock, included: true, status: 'Cancelled'}];
  state.posOrders = [{id: 'BREAKFAST', stayId: 'NV-0001', createdAt: '2026-09-19T02:30:00Z', items: [{included: true}]},
    {id: 'DISCOUNT', stayId: 'NV-0001', createdAt: clock, complimentary: true, items: [{discount: 100}]}];
  meals.restoreHalfBoardSelections(state); assert.equal(state.stays[0].halfBoardMeals, undefined);
});
test('Legacy guest-services food API follows the same choice, lock, and dinner charges', async () => {
  reset(); await ok(await choose('lunch'));
  const body = {action: 'order', stayId: 'NV-0001', itemId: 'rice', quantity: 1, notes: '', token: crypto.randomUUID(), expectedCents: 0};
  await ok(await legacy.POST(request(body))); assert.equal(saved().orders[0].cents, 0);
  assert.equal(meals.mealContext(saved().stays[0]).locked, true);
  clock = '2026-09-19T13:00:00Z'; await rejects(await legacy.POST(request({...body, token: crypto.randomUUID()})), /Price or meal plan changed/);
  await ok(await legacy.POST(request({...body, token: crypto.randomUUID(), expectedCents: 800})));
  assert.equal(saved().orders[1].cents, 800);
});
test('Full Board still receives included menu items for both lunch and dinner', async () => {
  reset({meal: 'Full Board'}); await ok(await guestOrder(true)); clock = '2026-09-19T13:00:00Z'; await ok(await waiterOrder(true));
  assert.equal(saved().posOrders[0].cents, 0); assert.equal(saved().posOrders[1].cents, 0);
  assert.equal(saved().stays[0].halfBoardMeals, undefined);
});
test('Regular cashier pricing stays paid unless explicitly using the waiter meal-plan flow', async () => {
  reset(); current = cashier;
  await ok(await pos.POST(request({action: 'create', revision: revision(), token: crypto.randomUUID(), table: 'Table 1',
    customer: '', stayId: 'NV-0001', notes: '', items: [line(false)]})));
  assert.equal(saved().posOrders[0].cents, 800); assert.equal(saved().stays[0].halfBoardMeals, undefined);
});
test('Cashier reprice cannot turn dinner free after included lunch; room folio stays in sync', async () => {
  reset(); await ok(await choose('lunch')); await ok(await guestOrder(true)); clock = '2026-09-19T13:00:00Z';
  await ok(await guestOrder(false)); current = cashier;
  const order = saved().posOrders[1];
  await ok(await pos.POST(request({action: 'edit', id: order.id, revision: revision(), stayId: 'NV-0001', repriceMeal: true,
    expectedCents: 800, table: 'Table 1', notes: '', items: [{id: 'rice', name: 'Rice', quantity: 1, unitCents: 800, discount: 0}]})));
  assert.equal(saved().posOrders[1].cents, 800); assert.equal(saved().stays[0].posBills.find(b => b.id === order.id).totalCents, 800);
});
test('Repricing an older breakfast uses original service time and does not consume lunch', async () => {
  reset(); clock = '2026-09-19T02:30:00Z'; await ok(await guestOrder(true)); clock = '2026-09-19T07:00:00Z'; current = cashier;
  const order = saved().posOrders[0];
  await ok(await pos.POST(request({action: 'edit', id: order.id, revision: revision(), stayId: 'NV-0001', repriceMeal: true,
    expectedCents: 0, table: 'Table 1', notes: '', items: [{id: 'rice', name: 'Rice', quantity: 1, unitCents: 800, discount: 0}]})));
  assert.equal(saved().posOrders[0].cents, 0); assert.equal(saved().stays[0].halfBoardMeals, undefined);
});
test('Public schedule verification returns exact hours and no room or account records', async () => {
  reset(); const data = await ok(await scheduleApi.GET());
  assert.equal(data.version, 'half-board-daily-v1'); assert.equal(data.timeZone, 'Indian/Maldives');
  assert.deepEqual(data.regular.lunch, ['12:00', '15:00']); assert.deepEqual(data.friday.lunch, ['13:30', '15:00']);
  assert.equal(data.stays, undefined); assert.equal(data.accounts, undefined);
});
test('Both ordering screens render the shared selector, refresh shared data, and quote current inclusion', () => {
  for (const file of ['app/waiter-menu.tsx', 'app/restaurant/guest/menu.tsx']) {
    const source = readFileSync(path.join(root, file), 'utf8');
    assert.match(source, /<HalfBoardChoice/); assert.match(source, /mealAccess/); assert.match(source, /startLiveRefresh/);
    assert.match(source, /choiceNeeded/); assert.match(source, /included:included\(i\)/);
    const {diagnostics} = ts.transpileModule(source, {fileName: file, reportDiagnostics: true, compilerOptions: {jsx: ts.JsxEmit.ReactJSX}});
    assert.equal(diagnostics.filter(d => d.category === ts.DiagnosticCategory.Error).length, 0);
  }
});
