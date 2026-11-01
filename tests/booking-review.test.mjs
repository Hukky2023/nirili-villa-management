import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url),ts=require('typescript');
const source=readFileSync(new URL('../app/guest-services.tsx',import.meta.url),'utf8');
const compiled=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX}}).outputText;

// Exercise the production component's rendered controls and handlers with an
// isolated hook/API harness. No live bookings or outbound emails are touched.
async function review({multi=false,email=true,postError='',sent=true,hold=false}={}){
 const request={id:'TEST-REQUEST',guest:'Test guest',checkIn:'2027-01-01',checkOut:'2027-01-03',pax:multi?5:2,adults:2,children:0,meal:'Bed & Breakfast',email:email?'test@example.invalid':'',status:'Pending',...(multi?{rooms:[{adults:2,children:0},{adults:3,children:0}]}:{})};
 let data={revision:3,requests:[request],bookingChanges:[],stays:[],rooms:[]},index=0,tree,focusCount=0,release;
 const hooks=[],effects=[],calls=[];
 const useState=initial=>{const slot=index++;if(!(slot in hooks))hooks[slot]=initial;return [hooks[slot],value=>{hooks[slot]=typeof value==='function'?value(hooks[slot]):value}];};
 const useRef=initial=>{const slot=index++;if(!(slot in hooks))hooks[slot]={current:initial};return hooks[slot];};
 const useEffect=fn=>{const slot=index++;if(!(slot in hooks)){hooks[slot]=true;effects.push(fn)}};
 const jsx=(type,props)=>({type,props});
 const noop=()=>null;
 const imports={
  react:{useState,useRef,useEffect},'react/jsx-runtime':{jsx,jsxs:jsx},
  './ui-language':{default:noop,UiText:noop,UiField:noop,UiOption:noop},
  '../lib/live-refresh':{REFRESH_INTERVALS:{standard:45000},startLiveRefresh:()=>()=>{}},
  '../lib/guest-catalog':{plans:[],nightly:()=>5000,islandToday:()=> '2026-11-01'},
  '../lib/i18n/runtime':{localizedConfirm:()=>true,localizedAlert:noop},
  '../lib/meal-access':{mealItemIncluded:()=>false},'../lib/date-format':{formatDateDMY:x=>x},
  'lucide-react':{X:noop},
 };
 const fetch=async(url,options={})=>{
  if(options.method==='POST'){
   const body=JSON.parse(options.body);calls.push(body);
   if(hold)await new Promise(resolve=>{release=resolve});
   if(postError)return {ok:false,json:async()=>({error:postError})};
   data={...data,revision:4,requests:[{...request,status:'Declined'}],bookingDecision:{sent}};
  }
  return {ok:true,json:async()=>structuredClone(data)};
 };
 const module={exports:{}};
 new Function('require','module','exports','fetch','window',compiled)(name=>{
  if(name in imports)return imports[name];
  if(name.endsWith('.css'))return {};
  if(name.startsWith('./'))return {default:noop};
  throw Error('Unexpected import '+name);
 },module,module.exports,fetch,{dispatchEvent:()=>{}});
 function render(){index=0;tree=module.exports.BookingReview();for(const node of nodes(tree))if(node.type==='textarea'&&node.props.ref)node.props.ref.current={focus:()=>focusCount++};return tree;}
 render();effects.splice(0).forEach(fn=>fn());await new Promise(resolve=>setImmediate(resolve));render();
 const find=(type,label)=>nodes(tree).find(n=>n.type===type&&textOf(n).includes(label));
 const button=label=>find('button',label);
 button('Review & allocate').props.onClick();render();
 return {
  render,button,find,calls,
  reason(value){find('textarea','').props.onChange({target:{value}});render()},
  decline(){return button('Decline booking').props.onClick()},
  get tree(){return tree},get focusCount(){return focusCount},release(){release()},
 };
}
function nodes(node){if(Array.isArray(node))return node.flatMap(nodes);if(!node||typeof node!=='object')return [];return [node,...nodes(node.props?.children)];}
function textOf(node){if(Array.isArray(node))return node.map(textOf).join('');if(node==null||typeof node==='boolean')return '';if(typeof node!=='object')return String(node);return textOf(node.props?.children);}
function alerts(tree){return nodes(tree).filter(n=>n.props?.role==='alert').map(textOf).join(' ');}

for(const multi of [false,true]){
 test(`${multi?'multi-room':'single-room'} decline is clickable without assigning a room`,async()=>{
  const ui=await review({multi});
  assert.equal(ui.button('Decline booking').props.disabled,false);
  assert.equal(ui.button('Decline booking').props.type,'button');
  assert.equal(ui.button('Confirm & allocate room').props.type,'submit');
  assert(nodes(ui.tree).some(n=>n.type==='select'&&n.props.required&&n.props.value===''));
  ui.reason('   ');await ui.decline();ui.render();
  assert.equal(ui.calls.length,0);assert.equal(ui.focusCount,1);
  const dialog=ui.find('form','');assert.match(alerts(dialog),/Enter a reason/);
  assert.equal(ui.find('textarea','').props['aria-invalid'],true);
  ui.reason('  No rooms available for these dates.  ');
  assert.equal(ui.find('textarea','').props['aria-invalid'],false);
  await ui.decline();ui.render();
  assert.deepEqual(ui.calls,[{action:'decline',id:'TEST-REQUEST',declineReason:'No rooms available for these dates.',revision:3}]);
  assert.equal(ui.find('form',''),undefined);assert.equal(ui.button('Review & allocate'),undefined);
  assert.match(textOf(ui.tree),/Booking declined\. Guest email sent\./);
 });
}

test('failed rejection stays in the dialog with the reason preserved and can be retried',async()=>{
 const ui=await review({postError:'Bookings changed. Refresh and try again.'});
 ui.reason('No availability');await ui.decline();ui.render();
 assert.match(alerts(ui.find('form','')),/Bookings changed/);
 assert.equal(ui.find('textarea','').props.value,'No availability');
 assert.equal(ui.button('Decline booking').props.disabled,false);
});

test('double taps send only one rejection and disable both decisions while saving',async()=>{
 const ui=await review({hold:true});ui.reason('No availability');
 const pending=ui.decline();await ui.decline();ui.render();
 assert.equal(ui.calls.length,1);assert.equal(ui.button('Decline booking').props.disabled,true);
 assert.equal(ui.button('Saving…').props.disabled,true);
 ui.release();await pending;ui.render();assert.match(textOf(ui.tree),/Booking declined/);
});

test('email failure is reported separately from the saved rejection',async()=>{
 const ui=await review({sent:false});ui.reason('No availability');await ui.decline();ui.render();
 assert.match(textOf(ui.tree),/Booking declined\..*email could not be sent/);
});

test('bookings without an email can still be rejected',async()=>{
 const ui=await review({email:false});ui.reason('No availability');await ui.decline();ui.render();
 assert.match(textOf(ui.tree),/Booking declined\. No guest email address is available\./);
});
