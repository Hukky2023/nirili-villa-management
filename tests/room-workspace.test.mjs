import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

const fileName='app/room-workspace.tsx';
const source=readFileSync(new URL('../'+fileName,import.meta.url),'utf8');
const ast=ts.createSourceFile(fileName,source,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);
const compile=code=>ts.transpileModule(code,{fileName,compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX},reportDiagnostics:true});
function nodesWhere(root,predicate){
 const found=[];
 function visit(node){if(predicate(node))found.push(node);ts.forEachChild(node,visit);}
 visit(root);return found;
}
function namedFunction(name){
 const matches=nodesWhere(ast,node=>ts.isFunctionDeclaration(node)&&node.name?.text===name);
 assert.equal(matches.length,1,'Expected one '+name+' function');return matches[0].getText(ast);
}
const helperCode=()=>compile(namedFunction('checkoutBuggyPickup')).outputText;
function pickup(date,time){return vm.runInNewContext(helperCode()+'\nJSON.stringify(checkoutBuggyPickup(date,time))',{date,time});}

// A parser test catches malformed strings/JSX before the production bundler.
test('room workspace compiles and has exactly one default component',()=>{
 assert.deepEqual(ast.parseDiagnostics.map(d=>ts.flattenDiagnosticMessageText(d.messageText,'\n')),[]);
 assert.deepEqual((compile(source).diagnostics||[]).filter(d=>d.category===ts.DiagnosticCategory.Error).map(d=>ts.flattenDiagnosticMessageText(d.messageText,'\n')),[]);
 const components=nodesWhere(ast,node=>ts.isFunctionDeclaration(node)&&node.name?.text==='RoomWorkspace');
 assert.equal(components.length,1);
 assert.ok(components[0].modifiers?.some(m=>m.kind===ts.SyntaxKind.DefaultKeyword));
 assert.equal(nodesWhere(ast,node=>node.kind===ts.SyntaxKind.DefaultKeyword).length,1);
});

test('currency helper preserves the literal dollar sign',()=>{
 const declarations=nodesWhere(ast,node=>ts.isVariableDeclaration(node)&&node.name.getText(ast)==='usd');
 assert.equal(declarations.length,1);
 const code=compile('const '+declarations[0].getText(ast)+';').outputText;
 for(const [value,expected] of [[0,'$0.00'],[38000,'$380.00'],[12345,'$123.45']])assert.equal(vm.runInNewContext(code+'\nusd(value)',{value}),expected);
});

test('checkout pickup accepts valid times and subtracts exactly 15 minutes',()=>{
 assert.equal(pickup('2026-09-21','13:15'),JSON.stringify({date:'2026-09-21',time:'13:00'}));
 assert.equal(pickup('2026-09-21','11:30'),JSON.stringify({date:'2026-09-21',time:'11:15'}));
 assert.equal(pickup('2026-09-21','00:15'),JSON.stringify({date:'2026-09-21',time:'00:00'}));
});

test('early departures book pickup on the previous calendar date',()=>{
 assert.equal(pickup('2026-09-21','00:10'),JSON.stringify({date:'2026-09-20',time:'23:55'}));
 assert.equal(pickup('2027-01-01','00:00'),JSON.stringify({date:'2026-12-31',time:'23:45'}));
});

test('invalid dates and times cannot create a pickup',()=>{
 for(const time of ['','25:00','13:60','1:15 PM','13:15:00','bad'])assert.equal(pickup('2026-09-21',time),'null');
 for(const date of ['','21-09-2026','2026-02-30','2026-13-01'])assert.equal(pickup(date,'13:15'),'null');
});

test('checkout buggy dialog exists once outside the empty-room branch and other forms',()=>{
 const dialogs=nodesWhere(ast,node=>ts.isJsxElement(node)&&node.openingElement.attributes.properties.some(p=>ts.isJsxAttribute(p)&&p.name.getText(ast)==='aria-labelledby'&&p.initializer&&ts.isStringLiteral(p.initializer)&&p.initializer.text==='checkout-buggy-title'));
 assert.equal(dialogs.length,1);
 for(let node=dialogs[0].parent;node;node=node.parent){
  if(!ts.isJsxElement(node))continue;
  assert.notEqual(node.openingElement.tagName.getText(ast),'form','No nested forms');
  const classes=node.openingElement.attributes.properties.filter(p=>ts.isJsxAttribute(p)&&p.name.getText(ast)==='className'&&p.initializer&&ts.isStringLiteral(p.initializer)).map(p=>p.initializer.text);
  assert.ok(!classes.includes('empty-room')&&!classes.includes('room-detail'));
 }
});

function bookingHarness({departureTime='13:15',checkOut='2026-09-21',ok=true,canEdit=true}={}){
 const calls=[],state={error:'',notice:'',busy:false,dialog:'open'},events=[];
 const context={
  canEdit,busy:false,stay:{id:'NV-TEST',guest:'Test Guest',room:'203',whatsapp:'+9607000000',pax:2,checkOut},
  checkoutBuggy:{departureTime},
  setBusy:value=>{state.busy=value;},setError:value=>{state.error=value;},setNotice:value=>{state.notice=value;},setCheckoutBuggy:value=>{state.dialog=value;},
  fetch:async(url,options)=>{calls.push({url,...options});return {ok,json:async()=>ok?{ok:true,pickup:{id:'buggy-test'}}:{error:'Could not save booking.'}};},
  Event:class{constructor(type){this.type=type;}},window:{dispatchEvent:event=>events.push(event.type)},
 };
 vm.createContext(context);
 vm.runInContext(helperCode()+'\n'+compile(namedFunction('bookCheckoutBuggy')).outputText,context);
 return {calls,state,events,run:()=>context.bookCheckoutBuggy({preventDefault(){}})};
}

test('booking submits saved guest details and calculated date/time then closes on success',async()=>{
 const h=bookingHarness({departureTime:'00:10'});await h.run();
 assert.equal(h.calls.length,1);assert.equal(h.calls[0].url,'/api/buggy-driver');assert.equal(h.calls[0].method,'POST');
 const body=JSON.parse(h.calls[0].body);
 assert.equal(body.guest,'Test Guest');assert.equal(body.phone,'+9607000000');assert.equal(body.quantity,2);
 assert.equal(body.date,'2026-09-20');assert.equal(body.pickupTime,'23:55');assert.equal(body.departureTime,'00:10');assert.equal(body.bookingType,'checkout');
 assert.equal(h.state.dialog,null);assert.equal(h.state.busy,false);assert.deepEqual(h.events,['services-updated']);
 assert.match(h.state.notice,/23:55/);
});

test('invalid departure or missing edit permission never submits a booking',async()=>{
 const invalid=bookingHarness({departureTime:'25:00'});await invalid.run();assert.equal(invalid.calls.length,0);assert.match(invalid.state.error,/valid/);
 const forbidden=bookingHarness({canEdit:false});await forbidden.run();assert.equal(forbidden.calls.length,0);
});

test('failed save preserves the popup and reports the error without claiming success',async()=>{
 const h=bookingHarness({ok:false});await h.run();
 assert.equal(h.state.dialog,'open');assert.equal(h.state.error,'Could not save booking.');assert.equal(h.state.notice,'');assert.equal(h.state.busy,false);assert.deepEqual(h.events,[]);
});
