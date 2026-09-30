import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {stripTypeScriptTypes} from 'node:module';
import {applyExcursionBillingAdjustment as adjust, applyExcursionBillEdit as editBill, excursionPricing, excursionFolioBill} from '../lib/excursion-billing.ts';

const actor = {role: 'admin', userId: 'admin-test', username: 'test-admin'};
const request = (extra = {}) => ({id: 'EXC-TEST', action: 'discount', discountPercent: 10,
  requestId: crypto.randomUUID(), reason: 'Package discount', revision: 7, ...extra});
function fixture(walkin = false) {
  return {stays: [{id: 'NV-TEST', room: '304', legacyFolio: false, meal: 'BB', base: 10000,
    checkIn: '2026-09-20', checkOut: '2026-09-22', initialPaid: 0, payments: [], extensions: [], history: [], paidBills: {}}],
    orders: [{id: 'EXC-TEST', kind: 'excursion', name: 'Turtle Snorkeling', quantity: 3, adults: 2, infants: 1,
      groupName: 'Test family', guest: 'Test Guest', cents: 5000, status: 'Scheduled', approvalStatus: 'Approved',
      ...(walkin ? {} : {stayId: 'NV-TEST'}), schedule: {date: '2026-09-20', time: '08:00', vesselId: 'boat-test'}}]};
}
const source = path => readFileSync(new URL(path, import.meta.url), 'utf8');
const js = text => stripTypeScriptTypes(text.replace(/^import .*;\r?\n/gm, ''), {mode: 'strip'}).replace(/\bexport /g, '');
const paidFunction = source('../lib/excursion-workflow.ts').match(/^export function excursionPaid.*$/m)[0];
const excursionPaid = new Function('excursionPricing', js(paidFunction) + ';return excursionPaid;')(excursionPricing);
const paidBillStatus = (stay, bill) => bill.complimentary && bill.totalCents === 0 ? {...bill, status: 'Complimentary'} :
  !stay.markedUnpaid && stay.paidBills?.['Excursions:' + bill.id] === bill.totalCents ? {...bill, status: 'Paid'} : bill;
const folioFor = new Function('excursionFolioBill', 'paidBillStatus', 'authDb', 'readBill', 'total',
  js(source('../lib/stays.ts')) + ';return folioFor;')(excursionFolioBill, paidBillStatus,
    () => ({prepare: () => ({bind: () => ({all: async () => ({results: []})})})}),
    async () => ({items: [], status: 'Posted'}), bill => bill.items.reduce((sum, i) => sum + i[2] * (1 - i[3] / 100), 0));

// Execute the actual route with isolated auth/database dependencies; never contact live guest data.
function routeHarness(options = {}) {
  let persisted = fixture(), rev = 7, writes = 0, loads = 0;
  const dependencies = {
    authDb: () => ({prepare: () => ({bind: (...values) => ({
      all: async () => ({results: []}),
      run: async () => {writes++; if (options.conflict) return {meta: {changes: 0}};
        persisted = JSON.parse(values[0]); rev++; return {meta: {changes: 1}};}
    })})}),
    currentUser: async () => options.user === undefined ? actor : options.user,
    hasPermission: user => !!user && user.role !== 'guest',
    sameOrigin: req => req.headers.get('Origin') === new URL(req.url).origin,
    loadStays: async () => {loads++; return {state: structuredClone(persisted), revision: rev};}, stayKey: 'hotel-stays-v1',
    excursionPaid, excursionResources: () => ({crew: [], vessels: []}),
    isConfirmedExcursion: order => order.approvalStatus === 'Approved' && order.status !== 'Cancelled',
    toConfirmedExcursionBooking: order => ({id: order.id, date: '', time: '', totalCents: order.cents}),
    applyExcursionBillEdit: editBill, applyExcursionBillingAdjustment: adjust, excursionFolioBill, excursionPricing,
    // The route reports whether each booking can still be moved (added in a015b05).
    excursionReassignmentError: () => '',
  };
  const routes = new Function(...Object.keys(dependencies), js(source('../app/api/excursion-bookings/route.ts')) + ';return {GET, PATCH};')(...Object.values(dependencies));
  return {...routes, get state() {return persisted;}, get writes() {return writes;}, get loads() {return loads;}};
}
function http(input, origin = 'https://example.test') {
  return new Request('https://example.test/api/excursion-bookings', {method: 'PATCH',
    headers: {'Content-Type': 'application/json', 'Origin': origin}, body: JSON.stringify(input)});
}

test('percentage changes the one group charge and preserves guests and trip assignments', () => {
  const state = fixture(), before = structuredClone(state.orders[0]);
  adjust(state, request(), actor);
  assert.equal(state.orders.length, 1); assert.equal(state.orders[0].cents, 4500);
  for (const key of ['quantity', 'adults', 'infants', 'groupName', 'guest', 'stayId', 'status', 'schedule']) {
    assert.deepEqual(state.orders[0][key], before[key]);
  }
  assert.equal(excursionFolioBill(state.orders[0]).items[0][2], 50);
  assert.equal(excursionFolioBill(state.orders[0]).items[0][3], 10);
});

test('edits replace the discount instead of compounding, and restore recovers the original', () => {
  const state = fixture(); adjust(state, request(), actor);
  adjust(state, request({discountPercent: 20}), actor); assert.equal(state.orders[0].cents, 4000);
  adjust(state, request({action: 'free'}), actor); assert.equal(state.orders[0].cents, 0);
  adjust(state, request({discountPercent: 25}), actor); assert.equal(state.orders[0].cents, 3750);
  adjust(state, request({action: 'restore'}), actor); assert.equal(state.orders[0].cents, 5000);
  assert.equal(excursionPricing(state.orders[0]).adjusted, false);
  assert.equal(state.orders[0].billingHistory.length, 5);
});

test('free in-house booking remains on the same room bill, including when other room bills are unpaid', async () => {
  const state = fixture(); state.stays[0].markedUnpaid = true;
  adjust(state, request({action: 'free'}), actor);
  const folio = await folioFor(state.stays[0], state.orders);
  const bill = folio.bills.find(b => b.id === 'EXC-TEST');
  assert.equal(bill.totalCents, 0); assert.equal(bill.status, 'Complimentary');
  assert.equal(bill.items[0][2], 50); assert.equal(bill.items[0][3], 100);
  assert.equal(folio.totalCents, 10000); assert.equal(folio.balanceCents, 10000);
  assert.equal(excursionPaid(state.orders[0], state), true);
  assert.deepEqual(state.stays[0].payments, []);
});

test('walk-in free booking needs no fake receipt to pass the excursion payment gate', () => {
  const state = fixture(true); adjust(state, request({action: 'free'}), actor);
  assert.equal(excursionPaid(state.orders[0], state), true);
  assert.equal(state.orders[0].excursionPayments, undefined);
  assert.equal(state.stays[0].history.length, 0);
});

test('100% discount is complimentary', () => {
  const state = fixture(); adjust(state, request({discountPercent: 100}), actor);
  assert.equal(state.orders[0].cents, 0); assert.equal(excursionPricing(state.orders[0]).complimentary, true);
});

test('paid receipts are preserved; the reduction creates room credit, not an automatic refund', async () => {
  const state = fixture(), stay = state.stays[0];
  stay.initialPaid = 10000; stay.payments = [{id: 'receipt-test', cents: 5000, method: 'Cash'}];
  stay.paidBills['Excursions:EXC-TEST'] = 5000;
  const receipts = structuredClone(stay.payments);
  adjust(state, request({discountPercent: 20}), actor);
  const folio = await folioFor(stay, state.orders);
  assert.deepEqual(stay.payments, receipts); assert.equal(folio.paidCents, 15000);
  assert.equal(folio.balanceCents, -1000); assert.equal(stay.paidBills['Excursions:EXC-TEST'], 4000);
  assert.equal(excursionPaid(state.orders[0], state), true);
});

test('partial payments remain partial and walk-in receipts stay unchanged', () => {
  const state = fixture(true); state.orders[0].excursionPayments = [{cents: 1000, method: 'Card'}];
  adjust(state, request(), actor); assert.equal(excursionPaid(state.orders[0], state), false);
  assert.deepEqual(state.orders[0].excursionPayments, [{cents: 1000, method: 'Card'}]);
});

test('invoice and folio totals agree on the adjusted booking charge for both folio modes', async () => {
  for (const legacyFolio of [false, true]) {
    const state = fixture(); state.stays[0].legacyFolio = legacyFolio;
    adjust(state, request({discountPercent: 12.5}), actor);
    const f = await folioFor(state.stays[0], state.orders), matches = f.bills.filter(b => b.id === 'EXC-TEST');
    assert.equal(matches.length, 1); assert.equal(matches[0].totalCents, 4375);
    const item = matches[0].items[0]; assert.equal(Math.round(item[2] * 100 * (1 - item[3] / 100)), 4375);
  }
});

test('cent rounding and decimal percentages do not produce fractional money', () => {
  for (const [cents, percent, expected] of [[3999, 50, 2000], [1, 50, 1], [5000, 12.34, 4383]]) {
    const state = fixture(); state.orders[0].cents = cents;
    adjust(state, request({discountPercent: percent}), actor); assert.equal(state.orders[0].cents, expected);
  }
});

test('invalid discounts, invalid amounts and oversized reasons cannot mutate the state', () => {
  for (const discountPercent of [-1, 0, 100.01, Infinity, NaN, 1.234, '10', null]) {
    const state = fixture(), before = structuredClone(state);
    assert.throws(() => adjust(state, request({discountPercent}), actor)); assert.deepEqual(state, before);
  }
  const state = fixture(); assert.throws(() => adjust(state, request({reason: 'x'.repeat(501)}), actor));
  state.orders[0].cents = -1; assert.throws(() => adjust(state, request(), actor));
});

test('only admins may adjust bills even when staff have bill or excursion permissions', () => {
  for (const role of ['staff', 'guest']) {
    const state = fixture(), before = structuredClone(state);
    assert.throws(() => adjust(state, request({action: 'free'}), {...actor, role, permissions: ['edit_bills', 'edit_excursions']}), /Only Admin/);
    assert.deepEqual(state, before);
  }
});

test('cancelled, pending and unknown excursion bookings are rejected', () => {
  const state = fixture(); state.orders[0].status = 'Cancelled'; assert.throws(() => adjust(state, request(), actor));
  state.orders[0].status = 'Scheduled'; state.orders[0].approvalStatus = 'Pending'; assert.throws(() => adjust(state, request(), actor));
  assert.throws(() => adjust(fixture(), request({id: 'not-found'}), actor));
});

test('retries are idempotent and cannot reuse an action token for a different change', () => {
  const state = fixture(), input = request(); adjust(state, input, actor);
  assert.equal(adjust(state, input, actor).duplicate, true);
  assert.equal(state.orders[0].billingHistory.length, 1); assert.equal(state.stays[0].history.length, 1);
  assert.throws(() => adjust(state, {...input, action: 'free'}, actor));
});

test('audit records preserve original and previous amounts, actor, reason and timestamp', () => {
  const state = fixture(); adjust(state, request(), actor);
  const h = state.orders[0].billingHistory[0];
  assert.equal(h.originalCents, 5000); assert.equal(h.previousCents, 5000); assert.equal(h.totalCents, 4500);
  assert.equal(h.userId, actor.userId); assert.equal(h.by, actor.username); assert.equal(h.reason, 'Package discount');
  assert.ok(Number.isFinite(Date.parse(h.at))); assert.equal(state.stays[0].history[0].orderId, 'EXC-TEST');
});

test('external bill edits do not resurrect stale pricing metadata', () => {
  const state = fixture(); adjust(state, request(), actor); state.orders[0].cents = 6000;
  assert.equal(excursionPricing(state.orders[0]).adjusted, false);
  adjust(state, request({discountPercent: 20}), actor); assert.equal(state.orders[0].cents, 4800);
});

test('PATCH enforces admin authentication and same-origin before loading billing data', async () => {
  for (const user of [null, {...actor, role: 'guest'}, {...actor, role: 'staff'}]) {
    const h = routeHarness({user}); assert.equal((await h.PATCH(http(request()))).status, 403);
    assert.equal(h.writes, 0); assert.equal(h.loads, 0);
  }
  const h = routeHarness(); assert.equal((await h.PATCH(http(request(), 'https://other.test'))).status, 403);
  assert.equal(h.loads, 0);
});

test('PATCH writes one adjusted state and repeat requests never create duplicate charges', async () => {
  const h = routeHarness(), input = request();
  assert.equal((await h.PATCH(http(input))).status, 200);
  assert.equal(h.state.orders[0].cents, 4500); assert.equal(h.writes, 1);
  assert.equal((await h.PATCH(http(input))).status, 200); assert.equal(h.writes, 1);
  assert.equal(h.state.orders.length, 1); assert.equal(h.state.orders[0].billingHistory.length, 1);
});

test('PATCH rejects stale revisions and compare-and-swap conflicts without overwriting stored data', async () => {
  const stale = routeHarness(); assert.equal((await stale.PATCH(http(request({revision: 6})))).status, 409);
  assert.equal(stale.writes, 0); assert.equal(stale.state.orders[0].cents, 5000);
  const clash = routeHarness({conflict: true}); assert.equal((await clash.PATCH(http(request()))).status, 409);
  assert.equal(clash.state.orders[0].cents, 5000);
});

test('GET exposes billing controls and audit details only to Admin', async () => {
  const admin = routeHarness(); await admin.PATCH(http(request()));
  const a = await (await admin.GET()).json(); assert.equal(a.canAdjustBilling, true); assert.equal(a.bookings[0].billingHistory.length, 1);
  const staff = routeHarness({user: {...actor, role: 'staff'}}), s = await (await staff.GET()).json();
  assert.equal(s.canAdjustBilling, false); assert.equal('billingHistory' in s.bookings[0], false);
});


test('admin excursion bill edit updates the booking charge and folio line items',()=>{
  const state=fixture(),order=state.orders[0];
  const result=editBill(state,{
    id:order.id,revision:0,date:'23 Sep 2026 · 14:00',status:'Posted',
    requestId:crypto.randomUUID(),
    items:[['Turtle Snorkeling package',3,60,10],['Private pickup',1,20,0]]
  },actor);
  assert.equal(order.cents,7400);
  assert.equal(order.billingRevision,1);
  assert.equal(order.billingEditedBy,'test-admin');
  assert.deepEqual(result.bill.items,[['Turtle Snorkeling package',3,60,10],['Private pickup',1,20,0]]);
  assert.equal(result.bill.totalCents,7400);
  assert.equal(result.bill.date,'23 Sep 2026 · 14:00');
});

test('excursion bill quantity is informational and never multiplies the group charge',()=>{
  const state=fixture(),order=state.orders[0];
  editBill(state,{id:order.id,revision:0,date:'23 Sep 2026',status:'Posted',items:[['Private Shark Trip',6,200,0]]},actor);
  assert.equal(order.cents,20000);
  assert.equal(excursionFolioBill(order).totalCents,20000);
});

test('second admin edit requires the latest excursion billing revision',()=>{
  const state=fixture(),order=state.orders[0];
  editBill(state,{id:order.id,revision:0,date:'23 Sep 2026',status:'Posted',items:[['Turtle Snorkeling',3,45,0]]},actor);
  assert.throws(()=>editBill(state,{id:order.id,revision:0,date:'23 Sep 2026',status:'Posted',items:[['Turtle Snorkeling',3,40,0]]},actor),/changed elsewhere/i);
  editBill(state,{id:order.id,revision:1,date:'23 Sep 2026',status:'Posted',items:[['Turtle Snorkeling',3,40,0]]},actor);
  assert.equal(order.cents,4000);
  assert.equal(order.billingRevision,2);
});

test('lowering a settled excursion keeps it paid and creates credit; increasing never invents payment',()=>{
  const state=fixture(),stay=state.stays[0],order=state.orders[0];
  stay.paidBills['Excursions:'+order.id]=5000;
  editBill(state,{id:order.id,revision:0,date:'23 Sep 2026',status:'Posted',items:[['Turtle Snorkeling',3,40,0]]},actor);
  assert.equal(stay.paidBills['Excursions:'+order.id],4000);
  editBill(state,{id:order.id,revision:1,date:'23 Sep 2026',status:'Posted',items:[['Turtle Snorkeling',3,60,0]]},actor);
  assert.equal(stay.paidBills['Excursions:'+order.id],4000);
  assert.equal(excursionPaid(order,state),false);
});

test('flat discount and free actions continue to work after a custom excursion bill edit',()=>{
  const state=fixture(),order=state.orders[0];
  editBill(state,{id:order.id,revision:0,date:'23 Sep 2026',status:'Posted',items:[['Trip',3,60,0],['Pickup',1,20,0]]},actor);
  adjust(state,request({discountPercent:25}),actor);
  assert.equal(order.cents,6000);
  assert.deepEqual(excursionFolioBill(order).items,[['Trip',3,60,25],['Pickup',1,20,25]]);
  adjust(state,request({action:'free'}),actor);
  assert.equal(order.cents,0);
  assert.equal(excursionPricing(order).complimentary,true);
});
