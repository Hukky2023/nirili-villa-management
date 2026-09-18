// Run: node --test tests/excursion-guides.test.cjs
// Real TypeScript modules; in-memory auth/database only. No production data is touched.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const crypto = require('node:crypto');
const ts = require('typescript');
const root = path.resolve(__dirname, '..');
function loadModule(relative, overrides = {}, cache = new Map()) {
  const file = path.resolve(root, relative);
  if (overrides[file]) return overrides[file];
  if (cache.has(file)) return cache.get(file).exports;
  const compiled = ts.transpileModule(fs.readFileSync(file, 'utf8'), {
    compilerOptions: {module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX}, reportDiagnostics: true,
  });
  assert.equal((compiled.diagnostics || []).filter(d => d.category === ts.DiagnosticCategory.Error).length, 0, relative);
  const module = {exports: {}}; cache.set(file, module);
  const requireLocal = id => {
    if (id.endsWith('.css')) return {};
    if (id === 'react/jsx-runtime') return {jsx: (type, props) => ({type, props}), jsxs: (type, props) => ({type, props})};
    if (!id.startsWith('.')) throw Error('Unexpected dependency: ' + id);
    let resolved = path.resolve(path.dirname(file), id);
    if (!path.extname(resolved)) resolved += '.ts';
    return loadModule(resolved, overrides, cache);
  };
  vm.runInNewContext(compiled.outputText, {module, exports: module.exports, require: requireLocal, Request, Response, URL, crypto, console}, {filename: file});
  return module.exports;
}
const guides = loadModule('lib/excursion-guides.ts');
const date = '2026-09-24';
const crew = ['a', 'b', 'c', 'd'].map(id => ({id, name: 'Guide ' + id}));
const trip = (extra = {}) => ({id: 't1', date, time: '08:00', name: 'Turtle', capacity: 6, vesselId: 'v1', crewIds: ['a', 'b'], guideIds: ['a', 'b'], status: 'Open', sharedGroup: '', ...extra});
const booking = (extra = {}) => ({id: 'o1', kind: 'excursion', scheduleId: 't1', quantity: 5, status: 'Scheduled', approvalStatus: 'Approved', ...extra});
const keyOf = s => `excursion-schedule:${s.date}:${s.id}`;
const request = (method, body) => new Request(`https://nirili.test/api/excursion-schedules?date=${date}`, {method, ...(method === 'GET' ? {} : {headers: {'Content-Type': 'application/json'}, body: JSON.stringify(body)})});
function fixture({schedules = [trip()], orders = [booking()], members = crew, user = {role: 'admin', userId: 'admin', username: 'admin'}, allowed = true, origin = true} = {}) {
  let state = {orders: structuredClone(orders), stays: [], excursionResources: {crew: structuredClone(members), vessels: [{id: 'v1', name: 'Boat', capacity: 12, condition: 'Available'}]}};
  const rows = new Map(schedules.map(s => [keyOf(s), {payload: JSON.stringify(s), revision: 1}]));
  const db = {prepare(sql) {
    let args = [];
    return {
      bind(...values) {args = values; return this;},
      async first() {return rows.get(args[0]) || null;},
      async all() {const prefix = args[0].slice(0, -1); return {results: [...rows].filter(([key]) => key.startsWith(prefix)).map(([key, row]) => ({key, ...row}))};},
      async run() {
        if (sql.startsWith('INSERT')) {if (rows.has(args[0])) return {meta: {changes: 0}}; rows.set(args[0], {payload: args[1], revision: 1}); return {meta: {changes: 1}};}
        if (sql.startsWith('UPDATE')) {const row = rows.get(args[2]); if (!row || row.revision !== args[3]) return {meta: {changes: 0}}; rows.set(args[2], {payload: args[0], revision: row.revision + 1}); return {meta: {changes: 1}};}
        if (sql.startsWith('DELETE')) return {meta: {changes: Number(rows.delete(args[0]))}};
        throw Error('Unexpected SQL: ' + sql);
      },
    };
  }};
  const overrides = {};
  const mock = (name, value) => {overrides[path.join(root, 'lib', name + '.ts')] = value;};
  mock('auth', {authDb: () => db, currentUser: async () => user, hasPermission: () => allowed, sameOrigin: () => origin});
  mock('stays', {loadStays: async () => ({state, revision: 1})});
  mock('stay-login', {saveStayAccess: async next => {state = next; return true;}});
  mock('excursion-workflow', {excursionResources: input => input.excursionResources});
  mock('excursion-default-schedule', {ensureStandardDailyExcursions: async () => {}});
  return {state: () => state, rows, route: loadModule('app/api/excursion-schedules/route.ts', overrides), server: loadModule('lib/excursion-guide-server.ts', overrides)};
}

test('strictly more than four passengers, not capacity or booking count', () => {
  for (const pax of [0, 1, 2, 3, 4]) assert.equal(guides.requiredExcursionGuides(pax), 0);
  for (const pax of [5, 6, 12, 100]) assert.equal(guides.requiredExcursionGuides(pax), 3);
  const status = guides.guideRuleFor(trip({capacity: 100}), [trip()], [booking({quantity: 4})], crew);
  assert.equal(status.requiredGuides, 0);
});
test('assigned crew count as guides by default while explicit guide selections remain supported', () => {
  assert.equal(guides.assignedGuideCount([], ['a', 'b', 'c'], crew), 3);
  assert.equal(guides.assignedGuideCount(['a', 'a', 'b'], ['a', 'b'], crew), 2);
  assert.equal(guides.assignedGuideCount(['a', 'b', 'c'], ['a', 'b'], crew), 2);
  assert.equal(guides.assignedGuideCount(['a', 'b', 'unknown'], ['a', 'b', 'unknown'], crew), 2);
  assert.equal(guides.assignedGuideCount(['a', 'b', 'c'], ['a', 'b', 'c'], [...crew.slice(0, 2), {...crew[2], active: false}]), 2);
  assert.equal(guides.assignedGuideCount(['a', 'b', 'c'], ['a', 'b', 'c'], [crew[0], crew[1], {...crew[2], name: crew[1].name}]), 2);
  assert.throws(() => guides.cleanGuideSelection(['a', 'c'], ['a'], crew), /assigned to this trip/);
  assert.throws(() => guides.cleanGuideSelection('a,b,c', ['a', 'b', 'c'], crew), /Choose guides/);
});
test('shared departures combine confirmed passengers once and exclude pending/cancelled', () => {
  const a = trip({sharedGroup: 'morning'}), b = trip({id: 't2', name: 'Coral', sharedGroup: 'morning'});
  const first = booking({quantity: 2});
  const orders = [first, first, booking({id: 'o2', scheduleId: 't2', quantity: 3}), booking({id: 'pending', quantity: 40, approvalStatus: 'Pending'}), booking({id: 'cancelled', quantity: 20, status: 'Cancelled'}), booking({id: 'declined', approvalStatus: 'Declined'})];
  const result = guides.guideRuleFor(a, [a, b], orders, crew);
  assert.equal(result.confirmedPax, 5); assert.equal(result.requiredGuides, 3); assert.equal(result.missingGuides, 1);
  assert.equal(guides.guideRuleFor(b, [a, b], orders, crew).confirmedPax, 5);
});
test('same vessel/time combines but different dates/times/boats do not', () => {
  const a = trip(), b = trip({id: 't2', name: 'Coral'});
  const orders = [booking({quantity: 2}), booking({id: 'o2', scheduleId: 't2', quantity: 3})];
  assert.equal(guides.guideRuleFor(a, [a, b], orders, crew).confirmedPax, 5);
  for (const changes of [{date: '2026-09-25'}, {time: '09:00'}, {vesselId: 'v2'}]) assert.equal(guides.guideRuleFor(a, [a, {...b, ...changes}], orders, crew).confirmedPax, 2);
});
test('extra-vessel passengers count toward the trip-wide guide minimum', () => {
  const result = guides.guideRuleFor(trip(), [trip()], [booking({quantity: 4}), booking({id: 'extra', quantity: 1, separateVessel: true})], crew);
  assert.equal(result.confirmedPax, 5); assert.equal(result.needsGuides, true);
});
test('GET flags existing five-passenger trips without deleting any booking', async () => {
  const f = fixture(), before = JSON.stringify(f.state());
  const response = await f.route.GET(request('GET'));
  assert.equal(response.status, 200);
  const rule = (await response.json()).schedules[0].guideRule;
  assert.equal(rule.confirmedPax, 5); assert.equal(rule.assignedGuides, 2); assert.equal(rule.missingGuides, 1);
  assert.equal(JSON.stringify(f.state()), before);
});
test('server rejects a five-passenger edit with two guides even with forged client counts', async () => {
  const f = fixture(), before = f.rows.get(keyOf(trip())).payload;
  const response = await f.route.PUT(request('PUT', {...trip(), revision: 1, bookedPax: 0, guideRule: {confirmedPax: 0}}));
  assert.equal(response.status, 400); assert.match((await response.json()).error, /5 confirmed guests.*at least 3/);
  assert.equal(f.rows.get(keyOf(trip())).payload, before);
});
test('three or more marked guides save and existing capacity synchronisation still works', async () => {
  for (const selected of [['a', 'b', 'c'], ['a', 'b', 'c', 'd']]) {
    const f = fixture(), before = JSON.stringify(f.state());
    const response = await f.route.PUT(request('PUT', {...trip(), revision: 1, crewIds: selected, guideIds: selected}));
    assert.equal(response.status, 200);
    const saved = (await response.json()).schedule;
    assert.deepEqual(saved.guideIds, selected); assert.equal(saved.capacity, 12);
    assert.equal(JSON.stringify(f.state()), before);
  }
});
test('four passengers can retain fewer guides; cancellations recalculate the requirement', async () => {
  const f = fixture({orders: [booking({quantity: 4}), booking({id: 'cancelled', quantity: 2, status: 'Cancelled'})]});
  assert.equal((await f.route.PUT(request('PUT', {...trip(), revision: 1}))).status, 200);
});
test('cannot bypass three-guide requirement by duplicate, non-crew, or unknown IDs', async () => {
  for (const change of [{guideIds: ['a', 'a', 'b']}, {guideIds: ['a', 'b', 'c']}, {crewIds: ['a', 'b', 'fake'], guideIds: ['a', 'b', 'fake']}]) {
    const f = fixture(); assert.equal((await f.route.PUT(request('PUT', {...trip(), ...change, revision: 1}))).status, 400);
  }
});
test('POST joining an occupied shared departure also requires three guides', async () => {
  const f = fixture();
  const response = await f.route.POST(request('POST', trip({id: '', name: 'Coral'})));
  assert.equal(response.status, 400); assert.match((await response.json()).error, /at least 3/);
});
test('shared assignment can be saved row by row using the same three guides', async () => {
  const a = trip({sharedGroup: 'morning'}), b = trip({id: 't2', name: 'Coral', sharedGroup: 'morning'});
  const f = fixture({schedules: [a, b], orders: [booking({quantity: 2}), booking({id: 'o2', scheduleId: 't2', quantity: 3})]});
  for (const row of [a, b]) assert.equal((await f.route.PUT(request('PUT', {...row, revision: 1, crewIds: ['a', 'b', 'c'], guideIds: ['a', 'b', 'c']}))).status, 200);
});
test('closing an understaffed trip is allowed but reopening is blocked', async () => {
  const f = fixture();
  assert.equal((await f.route.PUT(request('PUT', {...trip(), revision: 1, status: 'Closed'}))).status, 200);
  assert.equal((await f.route.PUT(request('PUT', {...trip(), revision: 2, status: 'Open'}))).status, 400);
});
test('older clients preserve existing marked guides on a vessel-only update', async () => {
  const saved = trip({crewIds: ['a', 'b', 'c'], guideIds: ['a', 'b', 'c']});
  const f = fixture({schedules: [saved]}); const input = {...saved, revision: 1}; delete input.guideIds;
  const response = await f.route.PUT(request('PUT', input));
  assert.equal(response.status, 200); assert.deepEqual((await response.json()).schedule.guideIds, ['a', 'b', 'c']);
});
test('permission, origin and stale-revision protection remain enforced', async () => {
  for (const opts of [{user: null}, {user: {role: 'guest'}}, {allowed: false}, {origin: false}]) {
    const f = fixture(opts); for (const method of ['POST', 'PUT']) assert.equal((await f.route[method](request(method, {...trip(), revision: 1}))).status, 403);
  }
  const f = fixture({orders: [booking({quantity: 4})]});
  assert.equal((await f.route.PUT(request('PUT', {...trip(), revision: 5}))).status, 409);
});
test('a later booking creates a visible staffing deficit without losing the booking', async () => {
  const f = fixture({orders: [booking({quantity: 4})]});
  const response = await f.route.PATCH(request('PATCH', {action: 'admin-booking', date, scheduleId: 't1', guestType: 'walkin', quantity: 1, guest: 'Test guest', phone: '+9607771234', hotel: 'Test hotel'}));
  assert.equal(response.status, 201);
  const view = await (await f.route.GET(request('GET'))).json();
  assert.equal(view.schedules[0].guideRule.confirmedPax, 5); assert.equal(view.schedules[0].guideRule.needsGuides, true);
  assert.equal(f.state().orders.length, 2);
});
test('departure checks current schedule, not stale booking snapshots', async () => {
  const snapshot = {date, time: '08:00', vesselId: 'v1', crewIds: ['a', 'b', 'c'], guideIds: ['a', 'b', 'c']};
  const f = fixture({orders: [booking({schedule: snapshot, status: 'Departed'})]});
  await assert.rejects(f.server.validateExcursionGuideAction(f.state(), {action: 'excursion-status', id: 'o1', status: 'Departed'}), /at least 3/);
  const live = trip({crewIds: ['a', 'b', 'c'], guideIds: ['a', 'b', 'c']});
  const g = fixture({schedules: [live], orders: [booking({schedule: {...snapshot, crewIds: ['a'], guideIds: []}, status: 'Departed'})]});
  await g.server.validateExcursionGuideAction(g.state(), {action: 'excursion-status', id: 'o1', status: 'Departed'});
  assert.deepEqual(Array.from(g.state().orders[0].schedule.guideIds), ['a', 'b', 'c']);
});
test('closed or deleted schedules cannot depart', async () => {
  const order = booking({schedule: {date, time: '08:00'}, status: 'Departed'});
  const closed = fixture({schedules: [trip({status: 'Closed'})], orders: [order]});
  await assert.rejects(closed.server.validateExcursionGuideAction(closed.state(), {action: 'excursion-status', id: 'o1', status: 'Departed'}), /closed/);
  const absent = fixture({schedules: [], orders: [order]});
  await assert.rejects(absent.server.validateExcursionGuideAction(absent.state(), {action: 'excursion-status', id: 'o1', status: 'Departed'}), /no longer exists/);
});
test('legacy scheduling and legacy departures cannot bypass the passenger threshold', async () => {
  const stored = {date, time: '08:00', vesselId: 'v1', crewIds: ['a', 'b'], guideIds: ['a', 'b']};
  const f = fixture({schedules: [], orders: [booking({scheduleId: undefined, name: 'Turtle', schedule: stored})]});
  await assert.rejects(f.server.validateExcursionGuideAction(f.state(), {action: 'schedule-excursion', id: 'o1', guideIds: ['a', 'b']}), /at least 3/);
  await assert.rejects(f.server.validateExcursionGuideAction(f.state(), {action: 'excursion-status', id: 'o1', status: 'Departed'}), /at least 3/);
});
test('cancellation/payment/resource actions are not obstructed by understaffed trips', async () => {
  const f = fixture();
  for (const action of [{action: 'excursion-status', status: 'Cancelled'}, {action: 'excursion-payment'}, {action: 'excursion-vessel-condition'}]) await f.server.validateExcursionGuideAction(f.state(), {id: 'o1', ...action});
});
test('picker removes guide designation when the crew member is unassigned', () => {
  const Picker = loadModule('app/excursion-guide-picker.tsx').default;
  let result;
  const tree = Picker({crew, crewIds: ['a', 'b', 'c'], guideIds: ['a', 'b', 'c'], confirmedPax: 5, onChange: (...args) => {result = args;}});
  function find(node, predicate) {if (!node || typeof node !== 'object') return; if (predicate(node)) return node; const children = node.props?.children; for (const child of (Array.isArray(children) ? children.flat(Infinity) : [children])) {const match = find(child, predicate); if (match) return match;}}
  const input = find(tree, node => node.type === 'input' && node.props.checked === true);
  assert.ok(input); input.props.onChange();
  assert.deepEqual(Array.from(result[0]), ['b', 'c']); assert.deepEqual(Array.from(result[1]), ['b', 'c']);
});
test('all changed TypeScript entry points have valid syntax and departure guard is before saving', () => {
  const files = ['app/excursion-scheduler.tsx', 'app/excursion-guide-picker.tsx', 'app/api/guest-services/route.ts', 'app/api/excursion-schedules/route.ts', 'lib/excursion-guides.ts', 'lib/excursion-guide-server.ts'];
  for (const file of files) {
    const source = fs.readFileSync(path.join(root, file), 'utf8');
    const compiled = ts.transpileModule(source, {compilerOptions: {target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX}, reportDiagnostics: true});
    assert.equal((compiled.diagnostics || []).filter(d => d.category === ts.DiagnosticCategory.Error).length, 0, file);
  }
  const route = fs.readFileSync(path.join(root, 'app/api/guest-services/route.ts'), 'utf8');
  assert.ok(route.indexOf('await validateExcursionGuideAction(state,b)') < route.indexOf('const saved=await saveStayAccess'));
});
