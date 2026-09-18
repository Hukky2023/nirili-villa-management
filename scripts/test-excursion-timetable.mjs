import assert from 'node:assert/strict';
import {test} from 'node:test';
import {execFileSync} from 'node:child_process';
import {mkdtempSync, writeFileSync, rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join, dirname} from 'node:path';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';

const require = createRequire(import.meta.url);
const root = dirname(dirname(fileURLToPath(import.meta.url)));
const output = mkdtempSync(join(tmpdir(), 'nirili-timetable-test-'));
let buildExcursionTimetable, formatExcursionTimetable, isTimetableDate;
try {
  execFileSync(process.execPath, [require.resolve('typescript/bin/tsc'), '--target', 'ES2022', '--module', 'commonjs', '--strict', '--skipLibCheck', '--noEmitOnError', '--outDir', output, 'lib/excursion-timetable.ts'], {cwd: root, stdio: 'inherit'});
  writeFileSync(join(output, 'package.json'), '{"type":"commonjs"}');
  ({buildExcursionTimetable, formatExcursionTimetable, isTimetableDate} = require(join(output, 'excursion-timetable.js')));
} finally { rmSync(output, {recursive: true, force: true}); }
const date = '2026-09-18', generated = '2026-09-17T23:57:00Z';
const resources = {vessels: [{id: 'v1', name: 'Test Main'}, {id: 'v2', name: 'Test Extra'}], crew: [{id: 'c1', name: 'Test Crew'}, {id: 'c2', name: 'Extra Crew'}]};
const trip = (id, fields = {}) => ({id, date, name: id, time: '07:00', capacity: 6, status: 'Open', vesselId: 'v1', crewIds: ['c1'], ...fields});
const order = (id, scheduleId, quantity, fields = {}) => ({id, scheduleId, kind: 'excursion', quantity, status: 'Scheduled', approvalStatus: 'Approved', guest: 'PRIVATE-GUEST', phone: '+9609999999', notes: 'PRIVATE-NOTE', cents: 12345, ...fields});
const build = (schedules, orders = []) => buildExcursionTimetable(date, schedules, {orders}, resources, generated);

test('validates real dates, including leap days', () => {
  for (const value of [date, '2024-02-29']) assert.equal(isTimetableDate(value), true);
  for (const value of ['2026-02-29', '2026-04-31', '2026-13-01', '18-09-2026', '', '2026-09-18%']) assert.equal(isTimetableDate(value), false);
});
test('selects only this date, sorts times and retains zero-pax trips', () => {
  const data = build([trip('late', {time: '16:00'}), trip('other', {date: '2026-09-19'}), trip('early')], [order('o', 'other', 9)]);
  assert.deepEqual(data.trips.map(t => t.id), ['early', 'late']);
  assert.deepEqual(data.totals, {trips: 2, bookings: 0, pax: 0});
});
test('counts confirmed pax per trip, not repeated shared-boat totals', () => {
  const data = build([trip('a', {sharedGroup: 'morning'}), trip('b', {sharedGroup: 'morning'})], [order('a1', 'a', 2), order('b1', 'b', 3)]);
  assert.deepEqual(data.trips.map(t => t.confirmedPax), [2, 3]);
  assert.deepEqual(data.trips.map(t => t.sharedBoatPax), [5, 5]);
  assert.equal(data.totals.pax, 5);
});
test('excludes pending, cancelled, declined, unknown approval and non-excursion orders', () => {
  const data = build([trip('a')], [order('ok', 'a', 2), order('p', 'a', 7, {approvalStatus: 'Pending'}), order('c', 'a', 8, {status: 'canceled'}), order('d', 'a', 9, {approvalStatus: 'Declined'}), order('u', 'a', 10, {approvalStatus: 'unknown'}), order('x', 'a', 11, {kind: 'transfer'})]);
  assert.equal(data.totals.pax, 2); assert.equal(data.totals.bookings, 1);
});
test('adds extra-vessel pax once with the recorded extra vessel and crew', () => {
  const extra = {separateVessel: true, overflowVesselId: 'v2', schedule: {vesselId: 'v2', crewIds: ['c2']}};
  const data = build([trip('a')], [order('a1', 'a', 5), order('x1', 'a', 2, extra), order('x2', 'a', 1, extra)]);
  assert.equal(data.totals.pax, 8); assert.equal(data.trips[0].mainVesselPax, 5); assert.equal(data.trips[0].sharedBoatPax, 5);
  assert.deepEqual(data.trips[0].extraVessels, [{vessel: 'Test Extra', crew: ['Extra Crew'], pax: 3}]);
});
test('uses current main-vessel and crew assignments', () => {
  const data = build([trip('a', {vesselId: 'v2', crewIds: ['c2']})], [order('a1', 'a', 2, {schedule: {vesselId: 'v1', crewIds: ['c1']}})]);
  assert.equal(data.trips[0].vessel, 'Test Extra'); assert.deepEqual(data.trips[0].crew, ['Extra Crew']);
});
test('reports unassigned resources and keeps closed booking schedules', () => {
  const data = build([trip('a', {vesselId: '', crewIds: [], status: 'Closed'})]);
  const text = formatExcursionTimetable(data);
  assert.match(text, /Assigned vessel: Not assigned/); assert.match(text, /Assigned crew: Not assigned/); assert.match(text, /Booking status: Closed/);
});
test('does not expose guest identities, contacts, payment details or notes', () => {
  const data = build([trip('a', {notes: 'PRIVATE-SCHEDULE-NOTE'})], [order('private-id', 'a', 2)]);
  const exported = JSON.stringify(data) + formatExcursionTimetable(data);
  for (const privateValue of ['PRIVATE-GUEST', '+9609999999', 'PRIVATE-NOTE', '12345', 'private-id', 'PRIVATE-SCHEDULE-NOTE']) assert.equal(exported.includes(privateValue), false);
});
test('does not duplicate ambiguous legacy orders across matching trips', () => {
  const data = build([trip('a', {name: 'Same'}), trip('b', {name: 'Same'})], [order('legacy', '', 4, {name: 'Same', schedule: {date, time: '07:00'}})]);
  assert.equal(data.totals.pax, 0);
});
test('matches unambiguous legacy orders and honours an explicit schedule ID', () => {
  const data = build([trip('a'), trip('b', {time: '08:00'})], [order('legacy', '', 2, {name: 'a', schedule: {date, time: '07:00'}}), order('linked', 'b', 3, {name: 'a', schedule: {date, time: '07:00'}})]);
  assert.deepEqual(data.trips.map(t => t.confirmedPax), [2, 3]);
});
test('labels the date and snapshot in Maldives time and counts places, not unique people', () => {
  const text = formatExcursionTimetable(build([trip('a'), trip('b', {time: '08:00'})], [order('1', 'a', 1), order('2', 'b', 1)]));
  assert.match(text, /Friday, 18 September 2026/); assert.match(text, /18 Sept 2026, 04:57/); assert.match(text, /Total confirmed passenger places: 2/); assert.match(text, /not unique people/);
});
test('is read-only and supports empty schedules', () => {
  const schedules = [trip('a')], state = {orders: [order('a1', 'a', 1)]};
  const before = JSON.stringify({schedules, state, resources});
  buildExcursionTimetable(date, schedules, state, resources, generated);
  assert.equal(JSON.stringify({schedules, state, resources}), before);
  assert.match(formatExcursionTimetable(build([])), /No scheduled trips for this date/);
});
