// Run with: node --test tests/excursion-manifest.test.cjs
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const root = path.resolve(__dirname, '..');
function loadTs(relative, mocks = {}) {
  const filename = path.join(root, relative);
  const {outputText, diagnostics} = ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
    fileName: filename, reportDiagnostics: true,
    compilerOptions: {module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX},
  });
  assert.equal(diagnostics.length, 0, relative + ' must compile');
  const module = {exports: {}};
  const localRequire = id => Object.hasOwn(mocks, id) ? mocks[id] : id.startsWith('.')
    ? loadTs(path.relative(root, path.resolve(path.dirname(filename), id + '.ts')), mocks) : require(id);
  new Function('require', 'module', 'exports', outputText)(localRequire, module, module.exports);
  return module.exports;
}
const {buildExcursionManifest} = loadTs('lib/excursion-manifest.ts');
const selected = {id: 'trip-a', name: 'Turtle + Coral Garden', date: '2026-09-18', time: '08:00', capacity: 6, vesselId: 'boat-1', crewIds: ['crew-1'], status: 'Open', notes: 'Meet 07:45 at the jetty'};
const resources = {vessels: [{id: 'boat-1', name: 'Main boat'}, {id: 'boat-2', name: 'Extra boat'}], crew: [{id: 'crew-1', name: 'Guide A'}]};
const order = (fields = {}) => ({id: 'booking-1', kind: 'excursion', scheduleId: selected.id, name: selected.name, approvalStatus: 'Approved', guest: 'Test Guest', quantity: 2, cents: 12000, ...fields});
const manifest = (orders, schedules = [selected], stays = []) => buildExcursionManifest(selected, schedules, {orders, stays}, resources, o => o.paid === true);

test('selects confirmed bookings by exact schedule ID, not excursion name', () => {
  const result = manifest([order(), order({id: 'other', scheduleId: 'trip-b'}), order({id: 'deleted', scheduleId: 'deleted', schedule: {date: selected.date, time: selected.time}}), order({id: 'pending', approvalStatus: 'Pending'}), order({id: 'cancelled', status: 'Cancelled'}), order({id: 'declined', approvalStatus: 'Declined'}), order({id: 'food', kind: 'restaurant'})], [selected, {...selected, id: 'trip-b', time: '11:00'}]);
  assert.deepEqual(result.bookings.map(b => b.id), ['booking-1']);
  assert.equal(result.totals.pax, 2);
});
test('shared boat seats and extra vessel passengers are counted separately', () => {
  const sibling = {...selected, id: 'trip-b', name: 'Coral Garden only'};
  const result = manifest([order(), order({id: 'sibling', scheduleId: sibling.id, quantity: 3}), order({id: 'extra', quantity: 4, separateVessel: true, overflowVesselId: 'boat-2'})], [selected, sibling]);
  assert.deepEqual(result.totals, {bookings: 2, pax: 6, mainVesselPax: 2, extraVesselPax: 4, boatPax: 5, capacity: 6, sharedTrips: 2});
  assert.equal(result.bookings.find(b => b.id === 'extra').vessel, 'Extra boat');
  assert.equal(result.bookings.some(b => b.id === 'sibling'), false);
});
test('same-boat groups work before a vessel is assigned', () => {
  const a = {...selected, vesselId: '', sharedGroup: 'morning'};
  const b = {...a, id: 'trip-b', capacity: 5};
  const result = buildExcursionManifest(a, [a, b], {orders: [order(), order({id: 'b', scheduleId: b.id})]}, resources, () => false);
  assert.equal(result.totals.boatPax, 4); assert.equal(result.totals.capacity, 5);
  assert.equal(result.trip.vessel, 'Not assigned');
});
test('unique legacy matching normalizes whitespace and case but not date or time', () => {
  const result = manifest([
    order({scheduleId: '', name: '  TURTLE   + Coral Garden ', schedule: {date: selected.date, time: selected.time}}),
    order({id: 'wrong-date', scheduleId: '', schedule: {date: '2026-09-19', time: selected.time}}),
    order({id: 'wrong-time', scheduleId: '', schedule: {date: selected.date, time: '10:00'}}),
  ]);
  assert.equal(result.bookings.length, 1);
});
test('ambiguous legacy departures are excluded, unique vessel match is accepted', () => {
  const legacy = order({scheduleId: '', schedule: {date: selected.date, time: selected.time}});
  const other = {...selected, id: 'trip-b', vesselId: 'boat-2'};
  assert.equal(manifest([legacy], [selected, other]).bookings.length, 0);
  legacy.schedule.vesselId = selected.vesselId;
  assert.equal(manifest([legacy], [selected, other]).bookings.length, 1);
  assert.equal(manifest([legacy], [selected, {...other, vesselId: selected.vesselId}]).bookings.length, 0);
});
test('payment is separate from confirmation; in-house details use the linked stay', () => {
  const result = manifest([order({stayId: 'stay-1', guest: '', paid: true}), order({id: 'walkin', hotel: 'Other hotel', externalRoom: 'A2', phone: 'test-phone', paid: false})], [selected], [{id: 'stay-1', guest: 'In-house Guest', room: '203', whatsapp: 'inhouse-phone', password: 'not-exposed'}]);
  const inhouse = result.bookings.find(b => b.id === 'booking-1');
  assert.equal(inhouse.guest, 'In-house Guest'); assert.equal(inhouse.room, '203');
  assert.equal(inhouse.phone, 'inhouse-phone'); assert.equal(inhouse.hotel, 'Nirili Villa');
  assert.equal(inhouse.paymentStatus, 'Paid');
  const walkin = result.bookings.find(b => b.id === 'walkin');
  assert.equal(walkin.hotel, 'Other hotel'); assert.equal(walkin.room, 'A2');
  assert.equal(walkin.paymentStatus, 'Unpaid');
  assert.equal(JSON.stringify(result).includes('not-exposed'), false);
});
test('departed bookings retain recorded assignment snapshots', () => {
  const result = manifest([order({status: 'Departed', schedule: {date: selected.date, time: selected.time, vesselId: 'boat-2', crew: ['Original guide']}})]);
  assert.equal(result.bookings[0].vessel, 'Extra boat');
  assert.deepEqual(result.bookings[0].crew, ['Original guide']);
  assert.equal(result.bookings[0].tripStatus, 'Departed');
});
test('missing passenger names are not invented and zero bookings have zero totals', () => {
  const empty = manifest([]);
  assert.equal(empty.totals.bookings, 0); assert.equal(empty.totals.pax, 0);
  const result = manifest([order({guest: '', quantity: 3})]);
  assert.equal(result.bookings.length, 1);
  assert.equal(result.bookings[0].guest, 'Guest name not recorded');
  assert.equal(result.totals.pax, 3);
});
test('manifest calculation leaves all existing records unchanged', () => {
  const orders = [order({notes: 'Pickup instruction', quantity: 2})];
  const before = JSON.stringify({orders, selected, resources});
  manifest(orders);
  assert.equal(JSON.stringify({orders, selected, resources}), before);
});

function route({allowed = true, schedules = [selected], fail = false} = {}) {
  let reads = 0;
  const chain = {bind: () => chain, all: async () => ({results: schedules.map(s => ({payload: JSON.stringify(s)}))})};
  const {GET} = loadTs('app/api/excursion-manifest/route.ts', {
    '../../../lib/auth': {currentUser: async () => ({role: 'staff'}), hasPermission: (_, permission) => allowed && permission === 'edit_excursions', authDb: () => ({prepare: () => chain})},
    '../../../lib/stays': {loadStays: async () => {reads++; if (fail) throw Error('private database details'); return {state: {orders: [order()], stays: []}};}},
    '../../../lib/excursion-workflow': {excursionResources: () => resources, excursionPaid: () => false},
  });
  return {get: id => GET(new Request('https://example.test/api/excursion-manifest' + (id === undefined ? '' : '?scheduleId=' + encodeURIComponent(id)))), reads: () => reads};
}
test('API denies unauthorized access before reading guest records', async () => {
  const api = route({allowed: false}); const response = await api.get(selected.id);
  assert.equal(response.status, 403); assert.equal(api.reads(), 0);
  assert.equal(response.headers.get('cache-control'), 'private, no-store');
});
test('API validates IDs and does not reveal unrelated bookings for a deleted trip', async () => {
  const api = route();
  assert.equal((await api.get()).status, 400);
  assert.equal((await api.get('x'.repeat(161))).status, 400);
  assert.equal(api.reads(), 0);
  assert.equal((await api.get('deleted')).status, 404);
});
test('API returns only the selected manifest with private no-store headers', async () => {
  const response = await route().get(selected.id); const body = await response.json();
  assert.equal(response.status, 200); assert.equal(body.manifest.trip.id, selected.id);
  assert.equal(body.manifest.bookings.length, 1); assert.equal(body.orders, undefined);
  assert.equal(response.headers.get('vary'), 'Cookie');
  assert.equal(response.headers.get('cache-control'), 'private, no-store');
});
test('API errors are retryable and do not disclose database details', async () => {
  const response = await route({fail: true}).get(selected.id);
  assert.equal(response.status, 503);
  assert.equal((await response.text()).includes('private database details'), false);
});
test('scheduler puts View immediately after Delete and the dialog compiles', () => {
  const scheduler = fs.readFileSync(path.join(root, 'app/excursion-scheduler.tsx'), 'utf8');
  assert.match(scheduler, /Delete<\/button><ExcursionGuestListButton scheduleId=\{item.id\}/);
  for (const name of ['app/excursion-scheduler.tsx', 'app/excursion-guest-list.tsx']) {
    const result = ts.transpileModule(fs.readFileSync(path.join(root, name), 'utf8'), {fileName: name, reportDiagnostics: true, compilerOptions: {jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2022}});
    assert.equal(result.diagnostics.length, 0, name);
  }
});
