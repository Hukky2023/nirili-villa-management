// Run: node tests/excursion-vessels.test.cjs
// Handler tests use a lightweight hooks/JSX stub; they are not browser E2E tests.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const read = file => fs.readFileSync(path.join(__dirname, '..', file), 'utf8');
const vm = require('node:vm');
const ts = require('typescript');
const options = {target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, strict: true};
for (const file of ['app/excursion-scheduler.tsx', 'app/excursion-vessels.tsx']) {
 const result = ts.transpileModule(read(file), {compilerOptions: options, fileName: file, reportDiagnostics: true});
 assert.equal((result.diagnostics || []).filter(d => d.category === ts.DiagnosticCategory.Error).length, 0, file + ' syntax');
}
const output = ts.transpileModule(read('app/excursion-vessels.tsx'), {compilerOptions: options}).outputText;
const initial = {canSchedule: true, revision: 7, resources: {vessels: [{id:'yellow',name:'Yellow Dinghy',condition:'Available'},{id:'big',name:'Big Launch',condition:'Available'}]}};
function harness(data = initial) {
 const hooks = [], effects = [], calls = [], events = [];
 let cursor = 0, tree, response = async () => {throw Error('Unexpected fetch');};
 const document = {activeElement:{isConnected:true,focus(){}},body:{style:{overflow:''}},addEventListener(){},removeEventListener(){}};
 const react = {
  useState(value) {const i=cursor++; if(!(i in hooks))hooks[i]=value; return [hooks[i], next=>{hooks[i]=typeof next==='function'?next(hooks[i]):next;}];},
  useRef(value) {const i=cursor++; if(!(i in hooks))hooks[i]={current:value}; return hooks[i];},
  useEffect(fn,deps) {const i=cursor++;const old=hooks[i];if(!old||deps.some((d,j)=>!Object.is(d,old.deps[j])))effects.push(()=>{old?.cleanup?.();hooks[i]={deps,cleanup:fn()};});},
 };
 const runtime = {jsx:(type,props,key)=>({type,props:props||{},key}),jsxs:(type,props,key)=>({type,props:props||{},key}),Fragment:'fragment'};
 const exports = {};
 const context = {exports,Error,require:name=>name==='react'?react:runtime,document,window:{dispatchEvent:event=>events.push(event.type)},Event,fetch:async(url,init)=>{calls.push({url,init,body:init?.body?JSON.parse(init.body):null});return response(url,init);},console};
 vm.runInNewContext(output, context);
 const Component=exports.default;
 function render(next) {if(arguments.length)data=next;cursor=0;tree=Component({data});while(effects.length)effects.shift()();return tree;}
 function all(test,node=tree) {const out=[];function walk(n){if(Array.isArray(n)){n.forEach(walk);return;}if(!n||typeof n!=='object')return;if(test(n))out.push(n);walk(n.props?.children);}walk(node);return out;}
 function text(n) {if(arguments.length===0)n=tree;if(Array.isArray(n))return n.map(text).join('');if(n==null||typeof n==='boolean')return '';if(typeof n!=='object')return String(n);return text(n.props?.children);}
 function button(label) {const b=all(n=>n.type==='button'&&(n.props['aria-label']===label||text(n)===label))[0];assert.ok(b,'button '+label);return b;}
 function click(label) {const b=button(label);b.props.onClick?.({target:b,currentTarget:b});render();}
 function field(type,value) {const n=all(n=>n.type===type)[0];assert.ok(n,type);n.props.onChange({target:{value}});render();}
 async function submit() {const form=all(n=>n.type==='form')[0];assert.ok(form);await form.props.onSubmit({preventDefault(){}});render();}
 function reply(status,body) {response=async()=>({ok:status>=200&&status<300,status,json:async()=>structuredClone(body)});}
 render();return {all,text,button,click,field,submit,reply,render,calls,events,document,setResponse(fn){response=fn;}};
}
(async()=>{
 let passed=0;
 function pass(name){console.log('PASS '+name);passed++;}
 let h=harness();h.click('Manage Yellow Dinghy');assert.equal(h.all(n=>n.type==='input')[0].props.value,'Yellow Dinghy');assert.equal(h.all(n=>n.type==='input')[0].props.readOnly,true);assert.equal(h.all(n=>n.type==='form')[0].props['aria-modal'],'true');assert.equal(h.document.body.style.overflow,'hidden');pass('Manage opens the correct vessel and accessible dialog');
 h.field('select','Under maintenance');const updated=structuredClone(initial);updated.revision=8;updated.resources.vessels[0].condition='Under maintenance';h.reply(200,updated);await h.submit();assert.deepEqual(h.calls[0].body,{action:'excursion-vessel-condition',vesselId:'yellow',condition:'Under maintenance',revision:7});assert.equal(h.all(n=>n.type==='form').length,0);assert.match(h.text(),/status saved as Under maintenance/);assert.ok(h.events.includes('services-updated'));assert.equal(h.document.body.style.overflow,'');pass('Save uses existing API, correct ID and revision, and refreshes linked lists');
 h.render(initial);assert.match(h.text(),/Under maintenance/);h.click('Manage Yellow Dinghy');assert.equal(h.all(n=>n.type==='select')[0].props.value,'Under maintenance');h.click('Cancel');pass('Slow stale data cannot revert a saved vessel');
 h.click('Manage Big Launch');assert.equal(h.all(n=>n.type==='input')[0].props.value,'Big Launch');h.field('select','Out of service');h.reply(200,{...updated,revision:9});await h.submit();assert.equal(h.calls[1].body.vesselId,'big');assert.equal(h.calls[1].body.condition,'Out of service');pass('Each card manages its own vessel');
 h=harness();h.click('+ Add vessel');h.field('input','  New Boat  ');h.reply(200,{...initial,revision:8,resources:{vessels:[...initial.resources.vessels,{id:'new',name:'New Boat',condition:'Available'}]}});await h.submit();assert.deepEqual(h.calls[0].body,{action:'excursion-resource',resourceType:'vessels',name:'New Boat',condition:'Available',revision:7});assert.match(h.text(),/New Boat added successfully/);pass('Add vessel validates and persists through the existing action');
 h=harness();h.click('+ Add vessel');h.field('input','   ');await h.submit();assert.equal(h.calls.length,0);assert.match(h.text(),/Enter a vessel name/);pass('Blank names cannot be saved');
 h=harness();h.click('+ Add vessel');h.field('input','Yellow Dinghy');h.reply(400,{error:'That name is already in the list.'});await h.submit();assert.match(h.text(),/already in the list/);assert.equal(h.all(n=>n.type==='form').length,1);assert.equal(h.button('Add vessel').props.disabled,false);pass('Backend validation errors stay visible and permit correction');
 h=harness();h.click('Manage Yellow Dinghy');h.field('select','Out of service');h.reply(409,{error:'Bookings changed. Refresh and try again.'});await h.submit();assert.equal(h.button('Save changes').props.disabled,true);assert.ok(h.button('Reload vessel details'));h.reply(200,updated);await h.button('Reload vessel details').props.onClick();h.render();assert.equal(h.all(n=>n.type==='select')[0].props.value,'Under maintenance');assert.equal(h.button('Save changes').props.disabled,false);h.field('select','Available');h.reply(200,{...initial,revision:9});await h.submit();assert.equal(h.calls.at(-1).body.revision,8);pass('Revision conflicts require explicit reload and a reviewed retry');
 h=harness();h.click('Manage Yellow Dinghy');h.setResponse(async()=>{throw Error('Network unavailable');});await h.submit();assert.match(h.text(),/Network unavailable/);assert.equal(h.button('Save changes').props.disabled,false);assert.equal(h.events.length,0);pass('Network failures do not report false success');
 h=harness();h.click('Manage Yellow Dinghy');h.click('Cancel');assert.equal(h.calls.length,0);assert.equal(h.all(n=>n.type==='form').length,0);pass('Cancel closes without writing any data');
 h=harness({...initial,canSchedule:false});assert.equal(h.button('Manage Yellow Dinghy').props.disabled,true);h.click('Manage Yellow Dinghy');assert.equal(h.all(n=>n.type==='form').length,0);assert.equal(h.calls.length,0);pass('Non-admin users cannot open or save vessel management');
 h=harness(null);assert.equal(h.button('+ Add vessel').props.disabled,true);assert.match(h.text(),/Loading vessels/);pass('Loading state cannot submit with missing resource data');
 h=harness();h.click('Manage Yellow Dinghy');let release;h.setResponse(()=>new Promise(resolve=>release=resolve));const first=h.submit();const second=h.submit();assert.equal(h.calls.length,1);release({ok:true,status:200,json:async()=>updated});await Promise.all([first,second]);pass('Duplicate submit events issue only one mutation');
 const scheduler=read('app/excursion-scheduler.tsx');assert.match(scheduler,/tab==='Vessels'&&<ExcursionVessels data=\{data\}/);for(const keep of ['ExcursionGuestListButton','ExcursionShareTimetable','openAssignment','Crew members'])assert.ok(scheduler.includes(keep));pass('Scheduler integrates the working panel while retaining previous features');
 console.log(`\n${passed} handler/integration checks passed; both TSX files transpile without syntax errors.`);
})().catch(e=>{console.error(e);process.exitCode=1;});
