// Run after installing dependencies: node --test tests/excursion-bookings.test.cjs
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const root = path.resolve(__dirname, '..');
function loadTS(file, imports = {}) {
  const result = ts.transpileModule(fs.readFileSync(path.join(root, file), 'utf8'), {
    fileName: file, reportDiagnostics: true,
    compilerOptions: {target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX},
  });
  assert.equal((result.diagnostics || []).filter(d => d.category === ts.DiagnosticCategory.Error).length, 0, file + ' syntax');
  const module = {exports: {}};
  new Function('require', 'module', 'exports', result.outputText)(name => {
    if (Object.hasOwn(imports, name)) return imports[name];
    throw new Error('Unexpected import in isolated test: ' + name);
  }, module, module.exports);
  return module.exports;
}
const helpers = loadTS('lib/excursion-bookings.ts');
const resources = {vessels: [{id: 'main', name: 'Main boat'}, {id: 'extra', name: 'Extra boat'}], crew: [{id: 'guide', name: 'Guide One'}]};
const order = {id: 'EXC-TEST', kind: 'excursion', name: 'Turtle', approvalStatus: 'Approved', status: 'Scheduled', quantity: 2, cents: 5000, guest: 'Test Guest', scheduleId: 'trip', date: '2026-09-20', schedule: {date: '2026-09-20', time: '08:00', vesselId: 'main', vessel: 'Main boat', crewIds: [], crew: []}};

test('approved, auto-confirmed and legacy scheduled excursions are included', () => {
  for (const value of [order, {...order, approvalStatus: undefined, autoConfirmed: true}, {...order, approvalStatus: undefined}, {...order, approvalStatus: undefined, status: 'Completed'}, {...order, approvalStatus: undefined, status: 'New'}]) {
    assert.equal(helpers.isConfirmedExcursion(value), true);
  }
});
test('pending, declined, cancelled and unscheduled requests are excluded', () => {
  for (const status of ['Pending', 'Declined', 'Cancelled', 'Canceled', 'Rejected', 'Awaiting scheduling', 'Requested', 'Over capacity request']) {
    assert.equal(helpers.isConfirmedExcursion({...order, approvalStatus: status, autoConfirmed: true}), false, status);
    assert.equal(helpers.isConfirmedExcursion({...order, status}), false, status);
  }
  assert.equal(helpers.isConfirmedExcursion({...order, approvalStatus: 'Unrecognized'}), false);
  assert.equal(helpers.isConfirmedExcursion({kind: 'excursion', status: 'New'}), false);
  assert.equal(helpers.isConfirmedExcursion({...order, kind: 'transfer'}), false);
  assert.equal(helpers.isConfirmedExcursion(null), false);
});
test('active bookings use current schedule assignments and room payment result', () => {
  const booking = helpers.toConfirmedExcursionBooking({...order, stayId: 'stay'}, {room: '203', whatsapp: '+9607000000'}, {date: '2026-09-21', time: '09:00', vesselId: 'extra', crewIds: ['guide']}, resources, true);
  assert.equal(booking.date, '2026-09-21'); assert.equal(booking.time, '09:00');
  assert.equal(booking.hotel, 'Nirili Villa'); assert.equal(booking.room, '203');
  assert.equal(booking.phone, '+9607000000'); assert.equal(booking.vessel, 'Extra boat');
  assert.deepEqual(booking.crew, ['Guide One']); assert.equal(booking.paymentStatus, 'Paid');
});
test('cleared assignments do not fall back to stale crew or vessel', () => {
  const booking = helpers.toConfirmedExcursionBooking(order, null, {date: order.date, time: '08:00', vesselId: '', crewIds: []}, resources, false);
  assert.equal(booking.vessel, 'Not assigned'); assert.deepEqual(booking.crew, []);
});
test('extra-vessel bookings keep their separate vessel', () => {
  const booking = helpers.toConfirmedExcursionBooking({...order, separateVessel: true, overflowVesselId: 'extra'}, null, {vesselId: 'main', crewIds: ['guide']}, resources, false);
  assert.equal(booking.vessel, 'Extra boat'); assert.deepEqual(booking.crew, []);
});
test('completed and departed trips retain their recorded departure', () => {
  for (const status of ['Completed', 'Departed']) {
    const booking = helpers.toConfirmedExcursionBooking({...order, status}, null, {date: '2027-01-01', time: '12:00', vesselId: 'extra'}, resources, true);
    assert.equal(booking.date, '2026-09-20'); assert.equal(booking.time, '08:00');
    assert.equal(booking.vessel, 'Main boat'); assert.equal(booking.tripStatus, status);
  }
});
test('walk-in details and notes are preserved without exposing internal fields', () => {
  const booking = helpers.toConfirmedExcursionBooking({...order, hotel: 'Other Hotel', externalRoom: '12', notes: 'Meet at reception', password: 'never-return', accountId: 'private'}, null, null, resources, false);
  assert.equal(booking.guestType, 'Walk-in'); assert.equal(booking.hotel, 'Other Hotel'); assert.equal(booking.room, '12');
  assert.equal(booking.notes, 'Meet at reception'); assert.equal(booking.totalCents, 5000);
  assert.equal('password' in booking, false); assert.equal('accountId' in booking, false);
});
function routeFor(user, orders = [order], fail = false) {
  let reads = 0;
  const state = {stays: [], orders};
  const route = loadTS('app/api/excursion-bookings/route.ts', {
    '../../../lib/auth': {
      currentUser: async () => user,
      hasPermission: (u, p) => !!u && (u.role === 'admin' || (u.role === 'staff' && u.permissions.includes(p))),
      authDb: () => ({prepare(sql) {
        assert.match(sql, /^SELECT /);
        return {bind(value) {assert.equal(value, 'excursion-schedule:%'); return {all: async () => ({results: []})};}};
      }}),
    },
    '../../../lib/stays': {loadStays: async () => {reads++; if (fail) throw Error('Database unavailable'); return {state};}},
    '../../../lib/excursion-workflow': {excursionResources: () => resources, excursionPaid: o => o.id === 'paid'},
    '../../../lib/excursion-bookings': helpers,
  });
  return {...route, reads: () => reads, state};
}
test('guest and unauthorized staff cannot read guest booking details', async () => {
  for (const user of [null, {role: 'guest'}, {role: 'staff', permissions: []}]) {
    const route = routeFor(user), response = await route.GET();
    assert.equal(response.status, 403); assert.equal(route.reads(), 0);
    assert.match(response.headers.get('cache-control'), /no-store/);
  }
});
test('authorized endpoint returns only confirmed excursions across all dates without mutations', async () => {
  const orders = [order, {...order, id: 'paid', date: '2027-01-05', schedule: {date: '2027-01-05', time: '11:00'}}, {...order, id: 'pending', approvalStatus: 'Pending'}, {...order, id: 'cancelled', status: 'Cancelled'}, {...order, id: 'restaurant', kind: 'restaurant'}];
  const route = routeFor({role: 'admin'}, orders), original = JSON.stringify(route.state);
  const response = await route.GET(), body = await response.json();
  assert.equal(response.status, 200); assert.equal(body.bookings.length, 2);
  assert.equal(body.bookings[0].date, '2026-09-20'); assert.equal(body.bookings[1].date, '2027-01-05');
  assert.equal(body.bookings[1].paymentStatus, 'Paid'); assert.equal(JSON.stringify(route.state), original);
  assert.match(response.headers.get('cache-control'), /private, no-store/);
});
test('authorized staff and empty booking list work', async () => {
  const response = await routeFor({role: 'staff', permissions: ['edit_excursions']}, []).GET();
  assert.equal(response.status, 200); assert.deepEqual(await response.json(), {bookings: []});
});
test('read failure produces a retryable error instead of an empty success', async () => {
  const response = await routeFor({role: 'admin'}, [], true).GET();
  assert.equal(response.status, 503); assert.match((await response.json()).error, /try again/);
});
test('Bookings is before Schedule and opens the new component', () => {
  const source = fs.readFileSync(path.join(root, 'app/excursion-scheduler.tsx'), 'utf8');
  assert.match(source, /const tabs:ExcursionTab\[\]=\['Bookings','Schedule'/);
  assert.match(source, /tab==='Bookings'&&<ExcursionBookings\/>/);
});
test('new component and scheduler have valid TypeScript / JSX syntax', () => {
  for (const file of ['app/excursion-bookings.tsx', 'app/excursion-scheduler.tsx']) {
    const result = ts.transpileModule(fs.readFileSync(path.join(root, file), 'utf8'), {
      fileName: file, reportDiagnostics: true,
      compilerOptions: {target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext, jsx: ts.JsxEmit.ReactJSX},
    });
    assert.equal((result.diagnostics || []).filter(d => d.category === ts.DiagnosticCategory.Error).length, 0, file);
  }
});
