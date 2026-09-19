// Run with: node --test tests/excursion-crew.test.cjs
// Uses isolated React-hook/JSX doubles: no production bookings or crew are changed.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const root = path.join(__dirname, '..');

function harness(file, props) {
 const slots = [], effects = [], events = [];
 let cursor = 0, tree;
 const react = {
  useState(value) { const i = cursor++; if (!(i in slots)) slots[i] = value; return [slots[i], value => {slots[i] = typeof value === 'function' ? value(slots[i]) : value;}]; },
  useRef(value) { const i = cursor++; if (!(i in slots)) slots[i] = {current: value}; return slots[i]; },
  useEffect(effect) { effects.push(effect); },
  useMemo(fn) { return fn(); },
 };
 const jsx = (type, props, key) => ({type, props: props || {}, key});
 const code = ts.transpileModule(fs.readFileSync(path.join(root, file), 'utf8'), {
  fileName: file, reportDiagnostics: true,
  compilerOptions: {module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX},
 });
 assert.equal(code.diagnostics.length, 0, 'TSX must transpile without diagnostics');
 const exports = {};
 const context = {exports, Error, Event, Intl, Date, console,
  window: {dispatchEvent(event) {events.push(event.type);}},
  require(id) {
   if (id === 'react') return react;
   if (id === 'react/jsx-runtime') return {jsx, jsxs: jsx, Fragment: 'fragment'};
   if (id.endsWith('/excursion-guides')) return {assignedGuideCount: () => 0, requiredExcursionGuides: pax => pax > 4 ? 3 : 0};
   return {default: id};
  },
 };
 vm.runInNewContext(code.outputText, context, {filename: file});
 function render(next) { if (next) props = next; cursor = 0; tree = exports.default(props); return tree; }
 render();
 return {render, get tree() {return tree;}, slots, effects, events, context};
}
function all(node) {
 if (Array.isArray(node)) return node.flatMap(all);
 if (!node || typeof node !== 'object') return [];
 return [node, ...all(node.props?.children)];
}
const text = node => Array.isArray(node) ? node.map(text).join('') : node && typeof node === 'object' ? text(node.props?.children) : typeof node === 'string' || typeof node === 'number' ? String(node) : '';
const find = (h, predicate) => all(h.tree).find(predicate);
const button = (h, label) => find(h, n => n.type === 'button' && text(n) === label);
const submit = h => find(h, n => n.type === 'form').props.onSubmit({preventDefault() {}});
const inputs = h => all(h.tree).filter(n => n.type === 'input');
function setInput(h, index, value) {inputs(h)[index].props.onChange({target: {value, checked: !!value}}); h.render();}
function name(h, value) {setInput(h, 0, value);}
function username(h, value) {setInput(h, 1, value);}
function password(h, value) {setInput(h, 2, value); setInput(h, 3, value);}
function credentials(h, user = 'new.crew', pass = 'crewpass123') {username(h, user); password(h, pass);}
function form(overrides = {}) {
 const calls = [], closed = [];
 const props = {crew: [{id: 'crew-1', name: 'Existing Crew'}], canManage: true, onSave: async n => {calls.push(n);}, onClose: () => closed.push(true), ...overrides};
 return {h: harness('app/excursion-crew-form.tsx', props), calls, closed, props};
}

test('crew form is labelled, modal, and uses a bounded required input', () => {
 const {h} = form();
 const dialog = find(h, n => n.type === 'form');
 assert.equal(dialog.props.role, 'dialog'); assert.equal(dialog.props['aria-modal'], 'true');
 assert.equal(find(h, n => n.type === 'input').props.maxLength, 100);
 assert.equal(find(h, n => n.type === 'input').props.required, true);
});
for (const value of ['', '   ', 'a'.repeat(101)]) test('invalid name is not saved: ' + JSON.stringify(value.slice(0, 12)), async () => {
 const {h, calls} = form(); name(h, value); await submit(h); h.render();
 assert.equal(calls.length, 0); assert.match(text(h.tree), /1–100 characters/);
});
test('existing crew names are matched without case or whitespace differences', async () => {
 const {h, calls} = form(); name(h, '  EXISTING   crew  '); await submit(h); h.render();
 assert.equal(calls.length, 0); assert.match(text(h.tree), /already in the crew list/);
});
test('valid admin-chosen username and password are sent once', async () => {
 const {h, calls} = form(); name(h, '  New Crew  '); credentials(h); await submit(h);
 assert.deepEqual(calls, [{name: 'New Crew', username: 'new.crew', password: 'crewpass123'}]);
});
test('invalid username is rejected', async () => {
 const {h, calls} = form(); name(h, 'New Crew'); credentials(h, 'bad username'); await submit(h); h.render();
 assert.equal(calls.length, 0); assert.match(text(h.tree), /Username must be 3–40 characters/);
});
test('short or mismatched password is rejected', async () => {
 const {h, calls} = form(); name(h, 'New Crew'); username(h, 'new.crew'); setInput(h, 2, 'short'); setInput(h, 3, 'short'); await submit(h); h.render();
 assert.equal(calls.length, 0); assert.match(text(h.tree), /8–128 characters/);
 setInput(h, 2, 'crewpass123'); setInput(h, 3, 'different123'); await submit(h); h.render();
 assert.equal(calls.length, 0); assert.match(text(h.tree), /do not match/);
});
test('non-admin saves are blocked even when the handler is invoked directly', async () => {
 const {h, calls} = form({canManage: false}); name(h, 'New Crew'); credentials(h); await submit(h); h.render();
 assert.equal(calls.length, 0); assert.equal(button(h, 'Create crew login').props.disabled, true);
 assert.match(text(h.tree), /Only Admin/);
});
test('an in-flight save blocks double submission and cancellation', async () => {
 let done; const calls = [];
 const {h, closed} = form({onSave: n => {calls.push(n); return new Promise(resolve => {done = resolve;});}});
 name(h, 'New Crew'); credentials(h); const pending = submit(h); h.render();
 assert.equal(button(h, 'Creating…').props.disabled, true);
 await submit(h); button(h, 'Cancel').props.onClick();
 assert.equal(calls.length, 1); assert.equal(closed.length, 0);
 done(); await pending;
});
test('cancel closes without a write', () => {
 const {h, calls, closed} = form(); button(h, 'Cancel').props.onClick();
 assert.equal(closed.length, 1); assert.equal(calls.length, 0);
});
test('server conflict preserves the name and refreshes without retrying the write', async () => {
 let attempts = 0;
 const {h} = form({onSave: async () => {attempts++; throw new Error('Bookings changed. Refresh and try again.');}});
 name(h, 'New Crew'); credentials(h); await submit(h); h.render();
 assert.match(text(h.tree), /Bookings changed/); assert.equal(inputs(h)[0].props.value, 'New Crew');
 assert.deepEqual(h.events, ['services-updated']); assert.equal(attempts, 1);
 assert.equal(button(h, 'Create crew login').props.disabled, false);
});
test('a retry uses the new callback after refreshed data', async () => {
 const fixture = form({onSave: async () => {throw new Error('Refresh and try again.');}});
 name(fixture.h, 'New Crew'); credentials(fixture.h); await submit(fixture.h);
 const calls = []; fixture.h.render({...fixture.props, onSave: async input => {calls.push(input);}});
 await submit(fixture.h); assert.deepEqual(calls, [{name: 'New Crew', username: 'new.crew', password: 'crewpass123'}]);
});
test('keyboard focus is restored after closing and Escape cancels', () => {
 const {h, closed} = form(); let focused = '', listener;
 const previous = {isConnected: true, focus() {focused = 'previous';}};
 const input = {focus() {focused = 'input';}};
 h.context.document = {activeElement: previous, body: {style: {overflow: 'auto'}}, addEventListener(_, fn) {listener = fn;}, removeEventListener() {}};
 h.slots[8].current = {querySelector: () => input};
 const cleanup = h.effects[0](); assert.equal(focused, 'input'); assert.equal(h.context.document.body.style.overflow, 'hidden');
 listener({key: 'Escape', preventDefault() {}}); assert.equal(closed.length, 1);
 cleanup(); assert.equal(focused, 'previous'); assert.equal(h.context.document.body.style.overflow, 'auto');
});
test('scheduler opens the form, sends the existing crew action and exposes saved crew to the picker', async () => {
 const original = {id: 'crew-1', name: 'Existing Crew'};
 const calls = [];
 let props = {data: {canSchedule: true, revision: 7, resources: {crew: [original], vessels: []}}};
 props.mutate = async body => {calls.push(body); props = {...props, data: {...props.data, revision: 8, resources: {vessels: [], crew: [original, {id: 'crew-2', name: body.name}]}}};};
 const h = harness('app/excursion-scheduler.tsx', props);
 button(h, 'Crew members').props.onClick(); h.render();
 assert.equal(button(h, '+ Add crew member').props.disabled, false);
 button(h, '+ Add crew member').props.onClick(); h.render();
 const editor = find(h, n => n.type === './excursion-crew-form'); assert.ok(editor);
 await editor.props.onSave({name: 'New Crew', username: 'new.crew', password: 'crewpass123'}); h.render(props);
 assert.equal(calls.length, 1); assert.equal(calls[0].action, 'excursion-resource');
 assert.equal(calls[0].resourceType, 'crew'); assert.equal(calls[0].name, 'New Crew');
 assert.equal(calls[0].username, 'new.crew'); assert.equal(calls[0].password, 'crewpass123');
 assert.equal(find(h, n => n.type === './excursion-crew-form'), undefined);
 assert.match(text(h.tree), /New Crew added to the crew list/);
 button(h, 'Schedule').props.onClick(); h.render(); button(h, '+ Create schedule').props.onClick(); h.render();
 const picker = find(h, n => n.type === './excursion-guide-picker');
 assert.equal(picker.props.crew.length, 2); assert.equal(picker.props.crew[0], original);
 assert.equal(picker.props.crew[1].name, 'New Crew');
 assert.equal(picker.props.crewIds.length, 0); assert.equal(picker.props.guideIds.length, 0);
});
for (const data of [null, {canSchedule: false, revision: 1}, {canSchedule: true}]) test('scheduler disables Add until admin data and revision are available', () => {
 const h = harness('app/excursion-scheduler.tsx', {data, mutate: async () => {}});
 button(h, 'Crew members').props.onClick(); h.render();
 assert.equal(button(h, '+ Add crew member').props.disabled, true);
});
test('scheduler disables Add without the save callback', () => {
 const h = harness('app/excursion-scheduler.tsx', {data: {canSchedule: true, revision: 1}});
 button(h, 'Crew members').props.onClick(); h.render();
 assert.equal(button(h, '+ Add crew member').props.disabled, true);
});
