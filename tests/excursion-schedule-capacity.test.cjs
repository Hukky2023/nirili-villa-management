// Run with: node --test tests/excursion-schedule-capacity.test.cjs
// Uses the real route with in-memory substitutes for auth and D1; no live data.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const crypto = require('node:crypto');
const ts = require('typescript');

// Load the real pure guide rule alongside the route; it imports only the booking projection.
function loadPure(relative) {
  const file = path.join(__dirname, '../lib', relative + '.ts');
  const output = ts.transpileModule(fs.readFileSync(file, 'utf8'), {compilerOptions: {module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022}}).outputText;
  const module = {exports: {}};
  vm.runInNewContext(output, {module, exports: module.exports, require: id => loadPure(id.replace(/^\.\//, ''))});
  return module.exports;
}
const guideRules = loadPure('excursion-guides');

const source = fs.readFileSync(path.join(__dirname, '../app/api/excursion-schedules/route.ts'), 'utf8');
const compiled = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  reportDiagnostics: true,
});
assert.equal((compiled.diagnostics || []).filter(d => d.category === ts.DiagnosticCategory.Error).length, 0);
const date = '2026-09-24';
const keyOf = s => `excursion-schedule:${s.date}:${s.id}`;
const trip = (overrides = {}) => ({
  id: 'trip-1', date, time: '08:00', name: 'Turtle + Coral Garden', capacity: 6,
  vesselId: '', crewIds: ['crew-1'], priceCents: 2500, status: 'Open', notes: 'Main jetty',
  sharedGroup: '', createdAt: '2026-09-18T00:00:00Z', ...overrides,
});
const order = (overrides = {}) => ({
  id: 'booking-1', kind: 'excursion', scheduleId: 'trip-1', quantity: 2,
  approvalStatus: 'Approved', status: 'Scheduled', cents: 5000, guest: 'Test guest',
  ...overrides,
});

function fixture({ schedules = [trip()], vessels = [{ id: 'boat-1', name: 'Test boat', capacity: 12, condition: 'Available' }], orders = [order()], revision = 1, user = { role: 'admin', userId: 'admin-1', username: 'admin' }, allowed = true, origin = true, failResources = false } = {}) {
  let state = { stays: [], orders: structuredClone(orders), excursionResources: { vessels: structuredClone(vessels), crew: [{ id: 'crew-1', name: 'Test crew' }, {id: 'crew-2', name: 'Second guide'}, {id: 'crew-3', name: 'Third guide'}] } };
  const rows = new Map(schedules.map(s => [keyOf(s), { payload: JSON.stringify(s), revision }]));
  let resourceReads = 0;
  const db = {
    prepare(sql) {
      let args = [];
      return {
        bind(...values) { args = values; return this; },
        async first() {
          assert.equal(sql, 'SELECT payload FROM operation_records WHERE key=?');
          const row = rows.get(args[0]);
          return row ? { payload: row.payload } : null;
        },
        async all() {
          assert.equal(sql, 'SELECT key,payload,revision FROM operation_records WHERE key LIKE ?');
          const prefix = args[0].slice(0, -1);
          return { results: [...rows].filter(([key]) => key.startsWith(prefix)).map(([key, row]) => ({ key, ...row })) };
        },
        async run() {
          if (sql.startsWith('INSERT INTO operation_records')) {
            const [key, payload] = args;
            if (rows.has(key)) return { meta: { changes: 0 } };
            rows.set(key, { payload, revision: 1 });
            return { meta: { changes: 1 } };
          }
          if (sql.startsWith('UPDATE operation_records')) {
            const [payload, , key, expectedRevision] = args;
            const row = rows.get(key);
            if (!row || row.revision !== expectedRevision) return { meta: { changes: 0 } };
            rows.set(key, { payload, revision: row.revision + 1 });
            return { meta: { changes: 1 } };
          }
          throw Error('Unexpected SQL in test: ' + sql);
        },
      };
    },
  };
  const mocks = {
    '../../../lib/excursion-guides': guideRules,
    '../../../lib/auth': { authDb: () => db, currentUser: async () => user, hasPermission: () => allowed, sameOrigin: () => origin },
    '../../../lib/stays': { loadStays: async () => { resourceReads++; if (failResources) throw Error('Resource read failed'); return { state, revision: 1 }; } },
    '../../../lib/stay-login': { saveStayAccess: async next => { state = next; return true; } },
    '../../../lib/excursion-default-schedule': { ensureStandardDailyExcursions: async () => {} },
    '../../../lib/excursion-workflow': { excursionResources: s => s.excursionResources },
  };
  const module = { exports: {} };
  vm.runInNewContext(compiled.outputText, {
    module, exports: module.exports, Request, Response, URL, crypto,
    require: id => { if (!mocks[id]) throw Error('Unexpected import: ' + id); return mocks[id]; },
  }, { filename: 'excursion-schedules/route.js' });
  return {
    route: module.exports, rows,
    state: () => state,
    reads: () => resourceReads,
    saved: id => JSON.parse(rows.get(`excursion-schedule:${date}:${id}`).payload),
  };
}
const request = (method, body) => new Request(`https://nirili.test/api/excursion-schedules?date=${date}`, {
  method, ...(method === 'GET' ? {} : { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }),
});

test('assigning a larger vessel persists 2 / 12 instead of 2 / 6 without changing guests or billing', async () => {
  const f = fixture();
  const before = structuredClone(f.state());
  const response = await f.route.PUT(request('PUT', { ...trip(), revision: 1, vesselId: 'boat-1' }));
  assert.equal(response.status, 200);
  const result = (await response.json()).schedule;
  assert.equal(result.capacity, 12);
  assert.equal(result.revision, 2);
  assert.equal(f.saved('trip-1').capacity, 12);
  assert.equal(result.priceCents, 2500);
  assert.deepEqual(result.crewIds, ['crew-1']);
  assert.equal(result.createdAt, trip().createdAt);
  assert.deepEqual(f.state(), before);
  const view = await (await f.route.GET(request('GET'))).json();
  assert.equal(view.schedules[0].bookedPax, 2);
  assert.equal(view.schedules[0].capacity, 12);
  assert.equal(view.schedules[0].capacity - view.schedules[0].bookedPax, 10);
});

test('creating a trip with a larger assigned vessel uses its saved capacity', async () => {
  const f = fixture({ schedules: [], orders: [] });
  const response = await f.route.POST(request('POST', { ...trip(), vesselId: 'boat-1' }));
  assert.equal(response.status, 201);
  const { schedule } = await response.json();
  assert.equal(schedule.capacity, 12);
  assert.equal(f.saved(schedule.id).capacity, 12);
});

test('shared-departure assignment updates each row, but does not multiply boat seats or passengers', async () => {
  const guideTeam = {crewIds: ['crew-1', 'crew-2', 'crew-3'], guideIds: ['crew-1', 'crew-2', 'crew-3']};
  const a = trip({ sharedGroup: 'morning', ...guideTeam });
  const b = trip({ id: 'trip-2', name: 'Coral Garden only', sharedGroup: 'morning', ...guideTeam });
  const otherDate = trip({ id: 'trip-3', date: '2026-09-25' });
  const f = fixture({ schedules: [a, b, otherDate], orders: [order(), order({ id: 'booking-2', scheduleId: 'trip-2', quantity: 3 }), order({ id: 'extra', quantity: 4, separateVessel: true }), order({ id: 'pending', quantity: 7, approvalStatus: 'Pending' }), order({ id: 'cancelled', quantity: 9, status: 'Cancelled' })] });
  // This is the existing scheduler's shared-group assignment loop.
  for (const item of [a, b]) {
    const response = await f.route.PUT(request('PUT', { ...item, revision: 1, vesselId: 'boat-1' }));
    assert.equal(response.status, 200);
  }
  const view = await (await f.route.GET(request('GET'))).json();
  const group = view.sharedBoatGroups[`${date}|08:00|group:morning`];
  assert.equal(group.capacity, 12);
  assert.equal(group.bookedPax, 5);
  assert.equal(group.pendingPax, 7);
  assert.equal(view.schedules[0].capacity, 12);
  assert.equal(view.schedules[1].capacity, 12);
  assert.equal(view.schedules.find(s => s.id === 'trip-1').extraVesselBookings[0].quantity, 4);
  assert.equal(JSON.parse(f.rows.get(keyOf(otherDate)).payload).capacity, 6);
});

test('without a recorded valid vessel capacity, keep the existing schedule limit', async t => {
  for (const capacity of [undefined, null, '', 0, -1, 12.5, 'invalid', Number.MAX_SAFE_INTEGER + 1]) {
    await t.test(String(capacity), async () => {
      const f = fixture({ vessels: [{ id: 'boat-1', name: 'Test boat', capacity }] });
      const response = await f.route.PUT(request('PUT', { ...trip(), revision: 1, vesselId: 'boat-1' }));
      assert.equal(response.status, 200);
      assert.equal((await response.json()).schedule.capacity, 6);
    });
  }
});

test('an equal or smaller vessel does not automatically decrease the schedule limit', async () => {
  for (const capacity of [4, 6]) {
    const f = fixture({ vessels: [{ id: 'boat-1', name: 'Test boat', capacity }] });
    const response = await f.route.PUT(request('PUT', { ...trip(), revision: 1, vesselId: 'boat-1' }));
    assert.equal(response.status, 200);
    assert.equal((await response.json()).schedule.capacity, 6);
  }
});

test('read saved vessel capacity instead of client-supplied vessel metadata', async () => {
  const f = fixture();
  const response = await f.route.PUT(request('PUT', { ...trip(), revision: 1, vesselId: 'boat-1', vesselCapacity: 99, vessel: { capacity: 99 } }));
  assert.equal(response.status, 200);
  assert.equal((await response.json()).schedule.capacity, 12);
});

test('an unassigned trip keeps its limit while validating actual crew and passengers', async () => {
  const f = fixture();
  const response = await f.route.POST(request('POST', trip()));
  assert.equal(response.status, 201);
  assert.equal((await response.json()).schedule.capacity, 6);
  assert.equal(f.reads(), 1);
});

test('stale revisions are rejected without overwriting the saved trip', async () => {
  const f = fixture({ revision: 2 });
  const response = await f.route.PUT(request('PUT', { ...trip(), revision: 1, vesselId: 'boat-1' }));
  assert.equal(response.status, 409);
  assert.equal(f.saved('trip-1').capacity, 6);
  assert.equal(f.saved('trip-1').vesselId, '');
});

test('existing staff permission and same-origin checks still protect all writes', async t => {
  for (const [name, options] of [['no session', { user: null }], ['guest', { user: { role: 'guest' } }], ['no permission', { allowed: false }], ['cross origin', { origin: false }]]) {
    await t.test(name, async () => {
      const f = fixture(options);
      for (const method of ['POST', 'PUT']) {
        const response = await f.route[method](request(method, { ...trip(), revision: 1, vesselId: 'boat-1' }));
        assert.equal(response.status, 403);
      }
      assert.equal(f.reads(), 0);
      assert.equal(f.saved('trip-1').capacity, 6);
    });
  }
});

test('new bookings can use the added seats without requiring an extra vessel', async () => {
  const f = fixture();
  const assigned = await f.route.PUT(request('PUT', { ...trip(), revision: 1, vesselId: 'boat-1' }));
  assert.equal(assigned.status, 200);
  const response = await f.route.PATCH(request('PATCH', {
    action: 'admin-booking', date, scheduleId: 'trip-1', guestType: 'walkin',
    quantity: 8, guest: 'Another test guest', phone: '+9607771234', hotel: 'Test hotel', externalRoom: '201',
  }));
  assert.equal(response.status, 201);
  const { booking } = await response.json();
  assert.equal(booking.separateVessel, false);
  const view = await (await f.route.GET(request('GET'))).json();
  assert.equal(view.schedules[0].guideRule.needsGuides, true);
  assert.equal(view.schedules[0].bookedPax, 10);
  assert.equal(view.schedules[0].capacity, 12);
});

test('resource loading failures cannot silently save an unsynchronised assignment', async () => {
  const f = fixture({ failResources: true });
  const response = await f.route.PUT(request('PUT', { ...trip(), revision: 1, vesselId: 'boat-1' }));
  assert.equal(response.status, 400);
  assert.equal(f.saved('trip-1').capacity, 6);
  assert.equal(f.saved('trip-1').vesselId, '');
});
