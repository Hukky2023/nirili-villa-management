// Run: node tests/excursion-vessels.test.cjs
// Isolated handler tests use hooks/JSX stubs; these are not browser E2E tests.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const read = file => fs.readFileSync(path.join(__dirname, '..', file), 'utf8');
const options = {target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, strict: true};
let passed = 0;
function pass(name) { console.log('PASS ' + name); passed++; }
function transpile(file) {
 const result = ts.transpileModule(read(file), {compilerOptions: options, fileName: file, reportDiagnostics: true});
 assert.equal((result.diagnostics || []).filter(d => d.category === ts.DiagnosticCategory.Error).length, 0, file + ' syntax');
 return result.outputText;
}
const output = transpile('app/excursion-vessels.tsx');
const backendOutput = transpile('lib/excursion-workflow.ts');
const initial = {canSchedule:true, revision:7, resources:{vessels:[{id:'yellow',name:'Yellow Dinghy',condition:'Available'},{id:'big',name:'Big Launch',condition:'Available',capacity:20}]}};
function harness(data = structuredClone(initial)) {
 const hooks = [], effects = [], calls = [], events = [], confirmations = [];
 let cursor = 0, tree, confirmed = true, response = async () => {throw Error('Unexpected fetch');};
 const document = {activeElement:{isConnected:true,focus(){}},body:{style:{overflow:''}},addEventListener(){},removeEventListener(){}};
 const react = {
  useState(value) {const i=cursor++; if(!(i in hooks))hooks[i]=value; return [hooks[i], next=>{hooks[i]=typeof next==='function'?next(hooks[i]):next;}];},
  useRef(value) {const i=cursor++; if(!(i in hooks))hooks[i]={current:value}; return hooks[i];},
  useEffect(fn,deps) {const i=cursor++;const old=hooks[i];if(!old||deps.some((d,j)=>!Object.is(d,old.deps[j])))effects.push(()=>{old?.cleanup?.();hooks[i]={deps,cleanup:fn()};});},
 };
 const runtime = {jsx:(type,props,key)=>({type,props:props||{},key}),jsxs:(type,props,key)=>({type,props:props||{},key}),Fragment:'fragment'};
 const exports = {};
 const context = {exports,Error,require:name=>name==='react'?react:runtime,document,window:{dispatchEvent:event=>events.push(event.type),confirm:message=>{confirmations.push(message);return confirmed;}},Event,fetch:async(url,init)=>{calls.push({url,init,body:init?.body?JSON.parse(init.body):null});return response(url,init);},console};
 vm.runInNewContext(output, context);
 const Component = exports.default;
 function render(next) {if(arguments.length)data=next;cursor=0;tree=Component({data});while(effects.length)effects.shift()();return tree;}
 function all(test,node=tree) {const out=[];function walk(n){if(Array.isArray(n)){n.forEach(walk);return;}if(!n||typeof n!=='object')return;if(test(n))out.push(n);walk(n.props?.children);}walk(node);return out;}
 function text(n) {if(arguments.length===0)n=tree;if(Array.isArray(n))return n.map(text).join('');if(n==null||typeof n==='boolean')return '';if(typeof n!=='object')return String(n);return text(n.props?.children);}
 function button(label) {const b=all(n=>n.type==='button'&&(n.props['aria-label']===label||text(n)===label))[0];assert.ok(b,'button '+label);return b;}
 function click(label) {const b=button(label);const pending=b.props.onClick?.({target:b,currentTarget:b});render();return pending;}
 function field(kind,value) {const n=all(n=>kind==='capacity'?n.type==='input'&&n.props.type==='number':kind==='name'?n.type==='input'&&n.props.type!=='number':n.type===kind)[0];assert.ok(n,kind);n.props.onChange({target:{value}});render();}
 async function submit() {const form=all(n=>n.type==='form')[0];assert.ok(form);await form.props.onSubmit({preventDefault(){}});render();}
 function reply(status,body) {response=async()=>({ok:status>=200&&status<300,status,json:async()=>structuredClone(body)});}
 render();return {all,text,button,click,field,submit,reply,render,calls,events,confirmations,document,setResponse(fn){response=fn;},setConfirm(value){confirmed=value;}};
}
const backend = {};
vm.runInNewContext(backendOutput, {exports:backend,crypto,require:name=>name==='./guest-catalog'?{catalog:[],validDate:()=>true}:{scheduleExcursion:()=>{throw Error('Not used by vessel settings tests');}}});
function state() {return {stays:[{id:'stay',base:12300,paidBills:{'Excursions:e1':8000}}],orders:[],excursionResources:{...structuredClone(initial.resources),crew:[]}};}
function update(s,details) {backend.applyExcursionAction(s,{action:'excursion-vessel-condition',vesselId:'yellow',condition:'Available',...details},'2026-09-18','admin');}
const json = value => JSON.stringify(value);

(async()=>{
 let h=harness();h.click('Manage Yellow Dinghy');assert.equal(h.all(n=>n.type==='input')[0].props.value,'Yellow Dinghy');assert.notEqual(h.all(n=>n.type==='input')[0].props.readOnly,true);assert.equal(h.all(n=>n.type==='input'&&n.props.type==='number')[0].props.value,'');assert.equal(h.all(n=>n.type==='form')[0].props['aria-modal'],'true');assert.equal(h.document.body.style.overflow,'hidden');pass('Manage opens an editable name and empty, not invented, passenger capacity');
 h.field('name','  Nirili One  ');h.field('capacity','12');h.field('select','Under maintenance');
 const updated=structuredClone(initial);updated.revision=8;Object.assign(updated.resources.vessels[0],{name:'Nirili One',capacity:12,condition:'Under maintenance'});
 h.reply(200,updated);await h.submit();assert.deepEqual(h.calls[0].body,{action:'excursion-vessel-condition',vesselId:'yellow',name:'Nirili One',capacity:12,condition:'Under maintenance',revision:7});assert.equal(h.all(n=>n.type==='form').length,0);assert.match(h.text(),/vessel details saved/);assert.match(h.text(),/Capacity: 12 passengers/);assert.ok(h.events.includes('services-updated'));assert.equal(h.document.body.style.overflow,'');pass('Rename, numeric capacity and status save together using the stable ID and revision');
 h.render(initial);h.click('Manage Nirili One');assert.equal(h.all(n=>n.type==='input')[0].props.value,'Nirili One');assert.equal(h.all(n=>n.type==='input'&&n.props.type==='number')[0].props.value,'12');h.click('Cancel');pass('Stale background data cannot revert the saved name or capacity');
 h.click('Manage Big Launch');assert.equal(h.all(n=>n.type==='input'&&n.props.type==='number')[0].props.value,'20');h.field('capacity','25');h.reply(200,{...updated,revision:9});await h.submit();assert.equal(h.calls.at(-1).body.vesselId,'big');assert.equal(h.calls.at(-1).body.capacity,25);pass('Each card loads and edits its own saved passenger capacity');
 h=harness();h.click('+ Add vessel');h.field('name',' New Boat ');h.field('capacity','6');h.reply(200,{...initial,revision:8,resources:{vessels:[...initial.resources.vessels,{id:'new',name:'New Boat',capacity:6,condition:'Available'}]}});await h.submit();assert.deepEqual(h.calls[0].body,{action:'excursion-resource',resourceType:'vessels',name:'New Boat',capacity:6,condition:'Available',revision:7});assert.match(h.text(),/New Boat added successfully/);pass('Add vessel also saves passenger capacity');
 for(const value of ['0','-1','2.5','NaN','Infinity','9007199254740992']){h=harness();h.click('Manage Yellow Dinghy');h.field('capacity',value);await h.submit();assert.equal(h.calls.length,0);assert.match(h.text(),/positive whole number/);}pass('Client rejects zero, negative, fractional, nonnumeric and unsafe capacities');
 h=harness();h.click('Manage Big Launch');h.field('capacity','');h.reply(200,{...initial,revision:8});await h.submit();assert.equal(h.calls[0].body.capacity,null);pass('Clearing a capacity explicitly sends Not set rather than silently restoring its old value');
 for(const name of ['   ','x'.repeat(101)]){h=harness();h.click('Manage Yellow Dinghy');h.field('name',name);await h.submit();assert.equal(h.calls.length,0);assert.match(h.text(),/Enter a vessel name/);}pass('Blank and overlong names cannot be saved');
 h=harness();h.click('Manage Yellow Dinghy');h.field('name','Big Launch');h.reply(400,{error:'That name is already in the list.'});await h.submit();assert.match(h.text(),/already in the list/);assert.equal(h.all(n=>n.type==='form').length,1);assert.equal(h.button('Save changes').props.disabled,false);pass('Server validation stays visible without closing the editor');
 h=harness();h.click('Manage Yellow Dinghy');h.field('name','My edit');h.field('capacity','6');h.reply(409,{error:'Bookings changed. Refresh and try again.'});await h.submit();assert.equal(h.button('Save changes').props.disabled,true);h.reply(200,updated);await h.click('Reload vessel details');h.render();assert.equal(h.all(n=>n.type==='input')[0].props.value,'Nirili One');assert.equal(h.all(n=>n.type==='input'&&n.props.type==='number')[0].props.value,'12');assert.equal(h.button('Save changes').props.disabled,false);h.reply(200,{...updated,revision:9});await h.submit();assert.equal(h.calls.at(-1).body.revision,8);pass('Conflict reload refreshes name, capacity and status before a reviewed retry');
 h=harness();h.click('Manage Yellow Dinghy');h.setResponse(async()=>{throw Error('Network unavailable');});await h.submit();assert.match(h.text(),/Network unavailable/);assert.equal(h.button('Save changes').props.disabled,false);assert.equal(h.events.length,0);pass('Network failure cannot report false success');
 h=harness();h.click('Manage Yellow Dinghy');h.field('name','Unsaved name');h.click('Cancel');assert.equal(h.calls.length,0);assert.equal(h.all(n=>n.type==='form').length,0);assert.ok(h.button('Manage Yellow Dinghy'));pass('Cancel discards edits without modifying the card');
 h=harness({...initial,canSchedule:false});for(const label of ['+ Add vessel','Manage Yellow Dinghy','Delete Yellow Dinghy'])assert.equal(h.button(label).props.disabled,true);h.click('Manage Yellow Dinghy');assert.equal(h.all(n=>n.type==='form').length,0);assert.equal(h.calls.length,0);pass('Existing admin-only access remains enforced in the UI');
 h=harness(null);assert.equal(h.button('+ Add vessel').props.disabled,true);assert.match(h.text(),/Loading vessels/);pass('Missing resource data cannot create a mutation');
 h=harness();h.click('Manage Yellow Dinghy');let release;h.setResponse(()=>new Promise(resolve=>release=resolve));const first=h.submit(),second=h.submit();assert.equal(h.calls.length,1);release({ok:true,status:200,json:async()=>updated});await Promise.all([first,second]);pass('Duplicate save events issue only one mutation');
 h=harness();h.setConfirm(false);await h.click('Delete Yellow Dinghy');assert.equal(h.calls.length,0);h.setConfirm(true);h.reply(200,{...initial,revision:8,resources:{vessels:[initial.resources.vessels[1]]}});await h.click('Delete Yellow Dinghy');h.render();assert.match(h.confirmations.at(-1),/Yellow Dinghy/);assert.equal(h.calls[0].body.action,'excursion-vessel-remove');assert.equal(h.calls[0].body.vesselId,'yellow');assert.equal(h.all(n=>n.type==='button'&&n.props['aria-label']==='Manage Yellow Dinghy').length,0);pass('Delete still requires confirmation and a successful server response');

 let s=state();s.orders=[
  {id:'e1',kind:'excursion',quantity:2,cents:8000,status:'Scheduled',schedule:{vesselId:'yellow',vessel:'Yellow Dinghy',date:'2026-09-19',time:'08:00',crew:['Pele']}},
  {id:'e2',kind:'excursion',quantity:1,cents:4000,status:'Scheduled',schedule:{vessel:'Yellow Dinghy',date:'2026-09-19',time:'08:00',crew:['Pele']}},
  {id:'history',kind:'excursion',quantity:2,cents:8000,status:'Completed',schedule:{vessel:'Yellow Dinghy',date:'2026-08-01',time:'08:00',crew:['Pele']}},
  {id:'other',kind:'excursion',quantity:1,cents:4000,status:'Scheduled',schedule:{vesselId:'big',vessel:'Big Launch',crew:[]}}
 ];
 const before=structuredClone(s);update(s,{name:' Nirili One ',capacity:12});assert.equal(s.excursionResources.vessels[0].name,'Nirili One');assert.equal(s.excursionResources.vessels[0].id,'yellow');assert.equal(s.excursionResources.vessels[0].capacity,12);assert.equal(s.excursionResources.vessels[0].updatedBy,'admin');assert.equal(s.orders[0].schedule.vessel,'Nirili One');assert.equal(s.orders[1].schedule.vessel,'Nirili One');assert.equal(s.orders[1].schedule.vesselId,'yellow');assert.equal(s.orders[2].schedule.vessel,'Yellow Dinghy');assert.equal(s.orders[2].schedule.vesselId,'yellow');assert.equal(json(s.orders[3]),json(before.orders[3]));assert.equal(json(s.stays),json(before.stays));
 for(let i=0;i<3;i++){const a=structuredClone(s.orders[i]),b=structuredClone(before.orders[i]);delete a.schedule.vessel;delete a.schedule.vesselId;delete b.schedule.vessel;delete b.schedule.vesselId;assert.equal(json(a),json(b));}
 pass('Server rename preserves vessel ID, passengers, payments, crew, dates and completed-trip names');
 assert.equal(backend.excursionResources(s).vessels.length,2);assert.ok(!backend.excursionResources(s).vessels.some(v=>v.name==='Yellow Dinghy'));update(s,{name:'Nirili Two',capacity:14});assert.equal(backend.excursionResources(s).vessels.length,2);pass('Repeated renames cannot recreate historic names as phantom vessels');
 for(const capacity of [0,-1,1.5,'6',true,NaN,Infinity,Number.MAX_SAFE_INTEGER+1]){const x=state(),old=json(x);assert.throws(()=>update(x,{name:'Do not save',capacity}),/positive whole number/);assert.equal(json(x),old);}pass('Server validates capacity types and values before any mutation');
 for(const name of ['', ' ', 'x'.repeat(101), null, 123, ' big   launch ']){const x=state(),old=json(x);assert.throws(()=>update(x,{name,capacity:6}),/vessel name|already in the list/);assert.equal(json(x),old);}pass('Server rejects blank, invalid, long and duplicate normalized names atomically');
 s=state();update(s,{name:'  YELLOW   DINGHY  ',capacity:1});assert.equal(s.excursionResources.vessels[0].capacity,1);assert.equal(s.excursionResources.vessels.length,2);pass('A vessel may change its own capitalization without being treated as a duplicate');
 s=state();update(s,{capacity:8});update(s,{condition:'Under maintenance'});assert.equal(s.excursionResources.vessels[0].name,'Yellow Dinghy');assert.equal(s.excursionResources.vessels[0].capacity,8);assert.equal(s.excursionResources.vessels[0].condition,'Under maintenance');pass('Older status-only clients retain saved names and capacities');
 update(s,{capacity:null});assert.equal(s.excursionResources.vessels[0].capacity,undefined);assert.equal(backend.excursionResources(s).vessels[0].capacity,undefined);pass('Explicitly clearing capacity persists Not set');
 s=state();backend.applyExcursionAction(s,{action:'excursion-resource',resourceType:'vessels',name:'New Boat',capacity:30},'2026-09-18','admin');assert.equal(s.excursionResources.vessels.at(-1).capacity,30);assert.equal(s.excursionResources.vessels.at(-1).condition,'Available');pass('Server persists capacity when adding a boat');
 for(const capacity of [0,-1,1.2,'12']){s=state();const old=json(s);assert.throws(()=>backend.applyExcursionAction(s,{action:'excursion-resource',resourceType:'vessels',name:'New Boat',capacity},'2026-09-18','admin'),/positive whole number/);assert.equal(json(s),old);}pass('Invalid capacity cannot create a new vessel');
 s=state();backend.applyExcursionAction(s,{action:'excursion-resource',resourceType:'crew',name:'Crew member'},'2026-09-18','admin');assert.equal(s.excursionResources.crew[0].name,'Crew member');assert.equal(s.excursionResources.crew[0].capacity,undefined);pass('Crew resources remain unchanged by vessel capacity support');
 s=state();s.orders=[{kind:'excursion',status:'Completed',schedule:{vessel:'Yellow Dinghy',crew:[]}}];update(s,{name:'Nirili One',capacity:6});backend.applyExcursionAction(s,{action:'excursion-vessel-remove',vesselId:'yellow'},'2026-09-18','admin');assert.equal(backend.excursionResources(s).vessels.length,1);assert.equal(s.orders.length,1);assert.equal(s.orders[0].schedule.vessel,'Yellow Dinghy');pass('Deleting a renamed inactive vessel cannot resurrect historic aliases or delete history');
 s=state();s.orders=[{kind:'excursion',status:'Scheduled',schedule:{vesselId:'yellow',vessel:'Yellow Dinghy',crew:[]}}];update(s,{name:'Nirili One',capacity:6});assert.throws(()=>backend.applyExcursionAction(s,{action:'excursion-vessel-remove',vesselId:'yellow'},'2026-09-18','admin'),/active trips/);pass('A renamed vessel with active bookings is still protected from deletion');
 s=state();s.orders=[{kind:'excursion',status:'Scheduled',schedule:{vesselId:'',crew:[]}}];assert.doesNotThrow(()=>backend.excursionResources(s));pass('Unassigned trips without a vessel name do not break the resource list');
 s=state();const old=json(s);assert.throws(()=>update(s,{name:'Do not save',capacity:6,condition:'Unknown'}),/valid vessel condition/);assert.equal(json(s),old);assert.throws(()=>update(s,{vesselId:'missing',name:'Boat',capacity:6}),/Vessel not found/);pass('Unknown status or vessel ID cannot save partial changes');

 // This also runs in the full repository; an isolated component checkout can omit it.
 const schedulerPath=path.join(__dirname,'..','app/excursion-scheduler.tsx');
 if(fs.existsSync(schedulerPath)){
  transpile('app/excursion-scheduler.tsx');const scheduler=read('app/excursion-scheduler.tsx');assert.match(scheduler,/tab==='Vessels'&&<ExcursionVessels data=\{data\}/);for(const keep of ['ExcursionGuestListButton','ExcursionShareTimetable','openAssignment','Crew members'])assert.ok(scheduler.includes(keep));pass('Scheduler retains vessel integration, guest lists, timetable sharing and assignment actions');
 }else console.log('SKIP scheduler integration: not present in this isolated component checkout');
 console.log(`\n${passed} vessel handler and workflow checks passed; modified TS/TSX files transpile without syntax errors.`);
})().catch(e=>{console.error(e);process.exitCode=1;});
