// Run with: node --test tests/excursion-trip-counts.test.cjs
// Both real GET handlers are exercised with the same stored schedules and bookings.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const root = path.resolve(__dirname, '..');

function loader(mocks = {}) {
  const cache = new Map();
  return function load(relative) {
    if (cache.has(relative)) return cache.get(relative);
    const filename = path.join(root, relative);
    const {outputText, diagnostics} = ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
      fileName: filename, reportDiagnostics: true,
      compilerOptions: {module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022},
    });
    assert.equal(diagnostics.length, 0, relative + ' must compile');
    const module = {exports: {}};
    const localRequire = id => Object.hasOwn(mocks, id) ? mocks[id] : id.startsWith('.')
      ? load(path.relative(root, path.resolve(path.dirname(filename), id + '.ts'))) : require(id);
    new Function('require', 'module', 'exports', outputText)(localRequire, module, module.exports);
    cache.set(relative, module.exports);
    return module.exports;
  };
}
const {buildExcursionManifest} = loader()('lib/excursion-manifest.ts');
const selected = {
  id: 'daily-shark', name: 'Shark Snorkeling + Turtle Snorkeling',
  date: '2026-09-21', time: '11:00', endTime: '14:30', capacity: 8,
  vesselId: 'vessel-a', crewIds: ['crew-a'], status: 'Open',
};
const resources = {
  vessels: [{id: 'vessel-a', name: 'Boat A', condition: 'Available'}, {id: 'vessel-b', name: 'Boat B', condition: 'Available'}],
  crew: [{id: 'crew-a', name: 'Guide A'}], gopros: [], drones: [],
};
function booking(overrides = {}) {
  const result = {
    id: 'booking-a', kind: 'excursion', scheduleId: selected.id, name: selected.name,
    date: selected.date, time: selected.time, quantity: 2, adults: 2, cents: 12000,
    approvalStatus: 'Approved', status: 'Scheduled', guest: 'Guest A', ...overrides,
  };
  result.excursionGuestRoster ??= Array.from({length: result.quantity}, (_, index) => ({
    id: result.id + ':' + (index + 1), slot: index + 1,
    name: result.guest + ' ' + (index + 1), ageCategory: 'adult', boarded: false,
  }));
  return result;
}
const manifest = (orders, schedules = [selected], trip = selected) =>
  buildExcursionManifest(trip, schedules, {orders, stays: []}, resources, () => false);

function api(orders, schedules = [selected], allowed = true) {
  const state = {orders, stays: []};
  let reads = 0, saves = 0;
  const db = {prepare: () => {
    let values = [];
    return {
      bind(...args) {values = args; return this;},
      async first() {return {key: values[0]};}, // The existing one-time cleanup already ran.
      async all() {
        reads++;
        const date = String(values[0]).slice('excursion-schedule:'.length, 'excursion-schedule:'.length + 10);
        return {results: schedules.filter(s => s.date === date).map(s => ({
          key: 'excursion-schedule:' + s.date + ':' + s.id, payload: JSON.stringify(s), revision: 1,
        }))};
      },
    };
  }};
  const load = loader({
    '../../../lib/auth': {authDb: () => db, currentUser: async () => ({userId: 'admin', username: 'admin', role: 'admin'}), hasPermission: () => allowed, sameOrigin: () => true},
    '../../../lib/stays': {loadStays: async () => {reads++; return {state, revision: 1};}},
    '../../../lib/stay-login': {saveStayAccess: async () => {saves++; return true;}},
    '../../../lib/excursion-workflow': {excursionResources: () => resources, excursionPaid: () => false},
    '../../../lib/excursion-children': {},
    '../../../lib/excursion-menu': {},
    '../../../lib/excursion-default-schedule': {ensureStandardDailyExcursions: async () => {}},
    '../../../lib/excursion-guides': {guideRuleFor: () => ({confirmedPax: 0, requiredGuides: 0, assignedGuides: 1})},
    '../../../lib/guest-catalog': {},
    '../../../lib/excursion-services': {},
    '../../../lib/excursion-operations': {},
  });
  const scheduleRoute = load('app/api/excursion-schedules/route.ts');
  const viewRoute = load('app/api/excursion-manifest/route.ts');
  return {
    state, reads: () => reads, saves: () => saves,
    schedule: (date = selected.date) => scheduleRoute.GET(new Request('https://example.test/api/excursion-schedules?date=' + date)),
    view: (trip = selected) => viewRoute.GET(new Request('https://example.test/api/excursion-manifest?date=' + trip.date + '&scheduleId=' + trip.id)),
    depart: () => viewRoute.PATCH(new Request('https://example.test/api/excursion-manifest', {
      method: 'PATCH', headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({action: 'trip-status', scheduleId: selected.id, date: selected.date, status: 'Guests boarded & Departed'}),
    })),
    save: rosters => viewRoute.PATCH(new Request('https://example.test/api/excursion-manifest', {
      method: 'PATCH', headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({action: 'save-attendance', scheduleId: selected.id, date: selected.date, rosters}),
    })),
  };
}
async function assertSameDeparture(client, trip = selected) {
  const scheduleResponse = await client.schedule(trip.date), viewResponse = await client.view(trip);
  assert.equal(scheduleResponse.status, 200);
  assert.equal(viewResponse.status, 200);
  const scheduleData = await scheduleResponse.json(), {manifest: result} = await viewResponse.json();
  const row = scheduleData.schedules.find(s => s.id === trip.id);
  assert.ok(row);
  const group = scheduleData.sharedBoatGroups[row.sharedBoatKey];
  const displayedPax = group?.scheduleIds.length > 1 ? group.bookedPax : row.bookedPax;
  assert.equal(displayedPax, result.totals.boatPax, 'timetable capacity and View boat total must match');
  assert.equal(row.confirmedPax, result.totals.pax, 'all confirmed guests must match');
  const mainNames = result.bookings.filter(b => !b.separateVessel).flatMap(b => b.people.map(p => p.name));
  assert.deepEqual(row.guestNames, mainNames, 'names and passenger count must use the same bookings');
  assert.equal(row.guestNames.length, row.bookedPax);
  assert.equal(row.bookedPax, result.totals.mainVesselPax);
  assert.equal(row.remainingSeats, Math.max(0, result.totals.capacity - displayedPax));
  assert.equal(row.isFull, displayedPax >= result.totals.capacity);
  assert.match(viewResponse.headers.get('cache-control'), /no-store/);
  assert.match(scheduleResponse.headers.get('cache-control'), /no-store/);
  return {row, result, group, scheduleData};
}

test('a reused daily ID never brings yesterday or tomorrow into a single-day manifest', () => {
  const result = manifest([
    booking(), booking({id: 'yesterday', date: '2026-09-20', quantity: 3}),
    booking({id: 'tomorrow', date: '2026-09-22', quantity: 4}),
    booking({id: 'snapshot-date', date: '', schedule: {date: '2026-09-20', time: selected.time}}),
  ]);
  assert.deepEqual(result.bookings.map(b => b.id), ['booking-a']);
  assert.equal(result.totals.pax, 2);
});
test('repeated IDs resolve by date when schedules for several days are provided', () => {
  const tomorrow = {...selected, date: '2026-09-22'};
  const orders = [booking(), booking({id: 'next-day', date: tomorrow.date, quantity: 3})];
  assert.equal(manifest(orders, [selected, tomorrow]).totals.pax, 2);
  assert.equal(manifest(orders, [selected, tomorrow], tomorrow).totals.pax, 3);
});
test('a cancelled sibling cannot contribute guests, capacity, or shared-trip count', () => {
  const cancelled = {...selected, id: 'cancelled-trip', status: 'Cancelled', capacity: 1};
  const orders = [booking(), booking({id: 'cancelled-trip-booking', scheduleId: cancelled.id, quantity: 6})];
  const result = manifest(orders, [selected, cancelled]);
  assert.equal(result.totals.pax, 2);
  assert.equal(result.totals.sharedTrips, 1);
  assert.equal(result.totals.capacity, 8);
  assert.deepEqual(result, manifest(orders, [selected]));
});
test('cancelled trip cannot be recovered through legacy name matching', () => {
  const cancelled = {...selected, id: 'cancelled-trip', name: 'Cancelled turtle trip', status: 'Cancelled'};
  const legacy = booking({id: 'legacy', scheduleId: '', name: cancelled.name, schedule: {date: selected.date, time: selected.time}});
  assert.equal(manifest([booking(), legacy], [selected, cancelled]).totals.pax, 2);
  assert.equal(manifest([booking({scheduleId: cancelled.id})], [selected, cancelled], cancelled).totals.pax, 0);
});
test('Closed or departed is not the same as Cancelled: legitimate history remains visible', () => {
  const closed = {...selected, status: 'Closed', tripStatus: 'Guests boarded & Departed'};
  assert.equal(manifest([booking({status: 'Departed'})], [closed], closed).totals.pax, 2);
});
test('the same vessel on earlier/later departures and other vessels do not leak guests', () => {
  const early = {...selected, id: 'early', time: '07:00', endTime: '11:00'};
  const late = {...selected, id: 'late', time: '14:30'};
  const otherVessel = {...selected, id: 'other-vessel', vesselId: 'vessel-b'};
  const orders = [booking(), ...[early, late, otherVessel].map(s => booking({id: s.id, scheduleId: s.id, time: s.time}))];
  assert.equal(manifest(orders, [selected, early, late, otherVessel]).totals.pax, 2);
});
test('current booked date/time wins over a stale legacy snapshot', () => {
  const old = {...selected, id: 'old', date: '2026-09-20'};
  const orders = [booking({scheduleId: '', schedule: {date: old.date, time: '07:00'}})];
  assert.equal(manifest(orders, [selected, old]).totals.pax, 2);
  assert.equal(manifest(orders, [selected, old], old).totals.pax, 0);
});
test('explicit IDs retain edited trip assignments rather than matching stale names or times', () => {
  const result = manifest([booking({name: 'Old excursion name', time: '10:00'})]);
  assert.equal(result.totals.pax, 2);
});
test('only genuinely undated unique legacy IDs retain their compatibility fallback', () => {
  const legacy = booking({date: '', time: '', schedule: {}});
  assert.equal(manifest([legacy]).totals.pax, 2);
  assert.equal(manifest([legacy], [selected, {...selected, date: '2026-09-22'}]).totals.pax, 0);
  assert.equal(manifest([booking({scheduleId: 'deleted'})]).totals.pax, 0);
});
test('duplicate stored booking IDs count once without merging different families', () => {
  const first = booking(), other = booking({id: 'family-b'});
  const result = manifest([first, structuredClone(first), other]);
  assert.equal(result.totals.bookings, 2);
  assert.equal(result.totals.pax, 4);
});
test('pending, declined and cancelled orders never appear as confirmed passengers', () => {
  const orders = [booking(), ...['Pending', 'Declined', 'Cancelled'].map(status => booking({id: status, approvalStatus: status})), booking({id: 'cancelled-order', status: 'Cancelled'})];
  assert.equal(manifest(orders).totals.pax, 2);
});
test('reported two-versus-eight case is consistent across both real GET handlers', async () => {
  const cancelled = {...selected, id: 'cancelled-trip', status: 'Cancelled'};
  const client = api([booking(), booking({id: 'old-group', date: '2026-09-20', quantity: 4}), booking({id: 'cancelled-group', scheduleId: cancelled.id})], [selected, cancelled]);
  const {result, row, scheduleData} = await assertSameDeparture(client);
  assert.equal(result.totals.pax, 2);
  assert.equal(row.bookedPax, 2);
  assert.equal(scheduleData.schedules.length, 1);
});
test('shared-boat total is five, not ten, for two excursions with two plus three guests', async () => {
  const sibling = {...selected, id: 'turtle-only', name: 'Turtle Snorkeling'};
  const client = api([booking(), booking({id: 'family-b', scheduleId: sibling.id, quantity: 3})], [selected, sibling]);
  const {result, group} = await assertSameDeparture(client);
  assert.equal(result.totals.pax, 2);
  assert.deepEqual(result.bookings.map(b => b.id), ['booking-a']);
  assert.equal(result.totals.boatPax, 5);
  assert.equal(group.bookedPax, 5);
  assert.equal(group.capacity, 8);
  await assertSameDeparture(client, sibling);
});
test('explicit shared groups work before vessel assignment; pending passengers stay separate', async () => {
  const a = {...selected, vesselId: '', sharedGroup: 'morning'};
  const b = {...a, id: 'turtle-only', name: 'Turtle only'};
  const client = api([booking(), booking({id: 'other', scheduleId: b.id, quantity: 1}), booking({id: 'waiting', scheduleId: b.id, approvalStatus: 'Pending', quantity: 4})], [a, b]);
  const {result, group} = await assertSameDeparture(client, a);
  assert.equal(result.totals.pax, 2);
  assert.equal(result.totals.boatPax, 3);
  assert.equal(group.pendingPax, 4);
});
test('extra vessels keep their own timetable rows and passenger lists', async () => {
  const extra = {...selected, id: 'extra-vessel-trip', vesselId: 'vessel-b', capacity: 6};
  const client = api([booking(), booking({id: 'extra-guests', scheduleId: extra.id, quantity: 3})], [selected, extra]);
  assert.equal((await assertSameDeparture(client)).result.totals.pax, 2);
  assert.equal((await assertSameDeparture(client, extra)).result.totals.pax, 3);
});
test('legacy separate-vessel passengers remain separately identified, not counted on main boat', async () => {
  const client = api([booking(), booking({id: 'legacy-extra', separateVessel: true, overflowVesselId: 'vessel-b', quantity: 3})]);
  const {row, result} = await assertSameDeparture(client);
  assert.equal(result.totals.pax, 5);
  assert.equal(result.totals.boatPax, 2);
  assert.equal(result.totals.extraVesselPax, 3);
  assert.equal(row.extraVesselBookings[0].quantity, 3);
});
test('refresh after booking additions and cancellations keeps both screens aligned', async () => {
  const client = api([booking()]);
  assert.equal((await assertSameDeparture(client)).result.totals.pax, 2);
  client.state.orders.push(booking({id: 'new-family', quantity: 3}));
  assert.equal((await assertSameDeparture(client)).result.totals.pax, 5);
  client.state.orders[0].status = 'Cancelled';
  assert.equal((await assertSameDeparture(client)).result.totals.pax, 3);
});
test('empty departure shows zero guests in both views without altering stored records', async () => {
  const orders = [booking({id: 'previous-date', date: '2026-09-20'})];
  const before = JSON.stringify({orders, selected, resources});
  assert.equal((await assertSameDeparture(api(orders))).result.totals.pax, 0);
  assert.equal(JSON.stringify({orders, selected, resources}), before);
});
test('attendance save accepts only the current list and leaves another date untouched', async () => {
  const old = booking({id: 'old-family', date: '2026-09-20'}), before = JSON.stringify(old);
  const client = api([booking(), old]);
  const rosters = client.state.orders.map(o => ({bookingId: o.id, people: o.excursionGuestRoster.map(p => ({id: p.id, name: p.name, boarded: true}))}));
  assert.equal((await client.save(rosters)).status, 400);
  assert.equal(client.saves(), 0);
  const saved = await client.save([rosters[0]]);
  assert.equal(saved.status, 200);
  assert.equal(client.saves(), 1);
  assert.equal(JSON.stringify(old), before);
  assert.equal((await saved.json()).manifest.totals.pax, 2);
});
test('both guest-data endpoints reject unauthorized reads before accessing records', async () => {
  const client = api([booking()], [selected], false);
  assert.equal((await client.schedule()).status, 403);
  assert.equal((await client.view()).status, 403);
  assert.equal(client.reads(), 0);
});

test('departure-only checks can read the full shared roster without adding sibling guests to View', () => {
  const sibling = {...selected, id: 'turtle-only', name: 'Turtle Snorkeling'};
  const orders = [booking(), booking({id: 'sibling-family', scheduleId: sibling.id, quantity: 3})];
  assert.equal(manifest(orders, [selected, sibling]).totals.pax, 2);
  const full = buildExcursionManifest(selected, [selected, sibling], {orders}, resources, () => false, 'departure');
  assert.equal(full.totals.pax, 5);
});
test('a shared departure cannot mark an unreviewed sibling roster departed', async () => {
  const sibling = {...selected, id: 'turtle-only', name: 'Turtle Snorkeling'};
  const current = booking({attendanceReviewedAt: '2026-09-21T05:00:00Z'});
  current.excursionGuestRoster.forEach(p => {p.boarded = true;});
  const client = api([current, booking({id: 'sibling-family', scheduleId: sibling.id})], [selected, sibling]);
  const response = await client.depart();
  assert.equal(response.status, 400);
  assert.match((await response.json()).error, /every trip sharing this departure/);
  assert.equal(client.saves(), 0);
});
