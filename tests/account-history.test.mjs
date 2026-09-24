import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
const require=createRequire(import.meta.url),ts=require('typescript');
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
function load(file,mocks={}){
 const source=readFileSync(path.join(root,file),'utf8');
 const {outputText,diagnostics}=ts.transpileModule(source,{fileName:file,reportDiagnostics:true,compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}});
 assert.equal(diagnostics?.filter(d=>d.category===ts.DiagnosticCategory.Error).length,0,file+' syntax');
 const module={exports:{}};
 new Function('require','module','exports',outputText)(name=>{if(!(name in mocks))throw Error('Unexpected import '+name+' from '+file);return mocks[name];},module,module.exports);
 return module.exports;
}
let current,db,failHistory=false;
class D1 {
 constructor(){this.raw=new DatabaseSync(':memory:');this.raw.exec(`CREATE TABLE accounts(id TEXT PRIMARY KEY,username TEXT UNIQUE,email TEXT,name TEXT,role TEXT,permissions TEXT,active INTEGER,password_hash TEXT,salt TEXT); CREATE TABLE account_sessions(account_id TEXT); CREATE TABLE operation_records(key TEXT PRIMARY KEY,payload TEXT,revision INTEGER,updated_by TEXT);`);}
 prepare(sql){
  const self=this;
  return {bind(...args){return {sql,args,async first(){return self.raw.prepare(sql).get(...args)||null;},async all(){return {results:self.raw.prepare(sql).all(...args)};},async run(){return self.execute(sql,args);}};},async all(){return {results:self.raw.prepare(sql).all()};}};
 }
 execute(sql,args){if(failHistory&&sql.startsWith('INSERT INTO operation_records')&&String(args[0]).startsWith('account-history-event:'))throw Error('History storage unavailable');const r=this.raw.prepare(sql).run(...args);return {meta:{changes:Number(r.changes)}};}
 async batch(statements){this.raw.exec('BEGIN');try{const result=statements.map(s=>this.execute(s.sql,s.args));this.raw.exec('COMMIT');return result;}catch(e){this.raw.exec('ROLLBACK');throw e;}}
}
const auth={authDb:()=>db,currentUser:async()=>current,sameOrigin:()=>true,hashPassword:async()=>({hash:'new-hash',salt:'new-salt'}),verifyPassword:async()=>false,validPassword:()=>true,validEmail:()=>true};
const events=load('lib/account-history-events.ts');
const history=load('lib/account-history.ts',{'./auth':auth,'./account-history-events':events});
const userApi=load('app/api/user-account/route.ts',{'../../../lib/auth':auth,'../../../lib/account-history':history,'../../../lib/supabase-bridge':{deactivateSupabaseAccount:async()=>true,deleteLegacySessionsForAccount:async()=>true}});
const stays={stayKey:'hotel-stays-v1',loadStays:async()=>{const row=await db.prepare('SELECT payload,revision FROM operation_records WHERE key=?').bind('hotel-stays-v1').first();return {state:JSON.parse(row.payload),revision:row.revision};}};
const credentials={credentialStatement:async(id,hash,password,by)=>db.prepare('INSERT INTO operation_records(key,payload,revision,updated_by) SELECT ?,?,1,? WHERE EXISTS(SELECT 1 FROM accounts WHERE id=?)').bind('credential:'+id,JSON.stringify({hash,password}),by,id),mirrorCredentialRecord:async()=>true};
const supabaseBridge={deleteLegacySessionsForAccount:async()=>true,mirrorLegacyAccount:async()=>true,ensureSupabaseEmployee:async()=>true};
const staffApi=load('app/api/staff-access/route.ts',{'../../../lib/auth':auth,'../../../lib/account-history':history,'../../../lib/account-history-events':events,'../../../lib/stays':stays,'../../../lib/credential-store':credentials,'../../../lib/walkin-excursion-access':{walkInExcursionProfile:(state,id)=>state.walkinExcursionAccounts?.find(p=>p.accountId===id)},'../../../lib/supabase-bridge':supabaseBridge});
const staySupabaseBridge={deactivateSupabaseAccount:async()=>true,deleteOperationalRecordPrimary:async()=>true,mirrorHotelState:async()=>true,mirrorLegacyAccount:async()=>true,mirrorOperationalRecord:async()=>true,saveOperationalRecordPrimary:async()=>0};
const stayLogin=load('lib/stay-login.ts',{'./auth':auth,'./credential-store':credentials,'./stays':stays,'./account-history':history,'./excursion-extra-vessels':{prepareExtraVesselTrips:async()=>({movedBookings:false,scheduleDays:[],scheduleReads:[],trips:[]})},'./supabase-bridge':staySupabaseBridge});
function reset(){
 db?.raw.close();db=new D1();failHistory=false;current={role:'admin',userId:'admin-id',username:'owner'};
 for(const [id,username,role] of [['admin-id','owner','admin'],['guest-id','101','guest'],['other-id','102','guest'],['staff-id','waiter','staff']])db.raw.prepare('INSERT INTO accounts VALUES(?,?,?,?,?,?,?,?,?)').run(id,username,null,'Test '+id,role,'[]',1,'secret-password-hash','secret-salt');
 db.raw.prepare('INSERT INTO account_sessions VALUES(?)').run('guest-id');db.raw.prepare('INSERT INTO account_sessions VALUES(?)').run('staff-id');
 const state={stays:[{id:'NV-0001',accountId:'guest-id',guest:'Test guest',room:'101',status:'In House',meal:'Full Board',checkIn:'2026-09-18',checkOut:'2026-09-20',checkedInAt:'2026-09-18T10:00:00Z',history:[{date:'2026-09-18T11:00:00Z',detail:'Booking amended',by:'owner'}],payments:[{date:'2026-09-18T12:00:00Z',cents:5000,method:'Cash',by:'owner'}]}],orders:[{id:'EX-1',kind:'excursion',stayId:'NV-0001',accountId:'guest-id',name:'Turtle',status:'Completed',cents:2500,createdAt:'2026-09-18T13:00:00Z',createdBy:'waiter'}],posOrders:[{id:'POS-1',stayId:'NV-0001',guestKey:'guest:guest-id',table:'1',kitchen:'Served',cents:1500,method:'Cash',createdAt:'2026-09-18T14:00:00Z',history:[{date:'2026-09-18T14:10:00Z',detail:'Served',by:'waiter'}]}]};
 db.raw.prepare('INSERT INTO operation_records VALUES(?,?,?,?)').run('hotel-stays-v1',JSON.stringify(state),1,'owner');return state;
}
const req=(body,method='POST')=>new Request('https://test.invalid/api/user-account',{method,headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
const active=id=>db.raw.prepare('SELECT active FROM accounts WHERE id=?').get(id)?.active;
const sessions=id=>db.raw.prepare('SELECT COUNT(*) AS n FROM account_sessions WHERE account_id=?').get(id).n;
const replaceState=state=>db.raw.prepare('UPDATE operation_records SET payload=? WHERE key=?').run(JSON.stringify(state),'hotel-stays-v1');

test('disable preserves history and operational records, revokes login sessions, and saves no credentials',async()=>{
 const state=reset(),before=JSON.stringify(state);assert.equal((await userApi.POST(req({id:'guest-id'}))).status,200);
 assert.equal(active('guest-id'),0);assert.equal(sessions('guest-id'),0);
 assert.equal((await stays.loadStays()).state.stays[0].id,'NV-0001');assert.equal(JSON.stringify((await stays.loadStays()).state),before);
 const saved=await history.readAccountHistory('guest-id');for(const action of ['Account disabled','Checked in','Stay payment recorded','Excursion created','Restaurant order created'])assert(saved.some(e=>e.action===action),action);
 assert(!JSON.stringify(saved).includes('secret-password-hash'));assert(!JSON.stringify(saved).includes('secret-salt'));
 replaceState({stays:[],orders:[],posOrders:[]});const response=await staffApi.GET();assert.equal(response.status,200);assert.match(response.headers.get('Cache-Control'),/no-store/);const user=(await response.json()).users.find(u=>u.id==='guest-id');assert(user.history.some(e=>e.detail.includes('NV-0001')));
});
test('account history endpoint rejects guests, every staff role and anonymous callers',async()=>{
 reset();for(const role of ['guest','staff',null]){current=role?{role,userId:'guest-id',permissions:['edit_bills','edit_excursions']}:null;const response=await staffApi.GET();assert.equal(response.status,403);assert.deepEqual(Object.keys(await response.json()),['error']);}
});
test('only Admin can disable accounts; own/admin accounts remain protected',async()=>{
 reset();current={role:'staff',userId:'staff-id'};assert.equal((await userApi.POST(req({id:'guest-id'}))).status,403);assert.equal(active('guest-id'),1);
 current={role:'admin',userId:'admin-id'};assert.equal((await userApi.POST(req({id:'admin-id'}))).status,400);
});
test('legacy records and concurrent new entries are retained beyond the old 60/100 limits',async()=>{
 reset();const legacy=Array.from({length:120},(_,i)=>({at:'2026-09-01T00:00:00Z',action:'Legacy '+i}));db.raw.prepare('INSERT INTO operation_records VALUES(?,?,1,?)').run('account-history:guest-id',JSON.stringify(legacy),'owner');
 await Promise.all(Array.from({length:150},(_,i)=>history.appendAccountHistory('guest-id',{at:'2026-09-02T00:00:00Z',action:'New '+i})));
 assert.equal((await history.readAccountHistory('guest-id')).length,270);
 const directory=await (await staffApi.GET()).json();assert(directory.users.find(u=>u.id==='guest-id').history.length>=270);
 assert.equal(JSON.parse(db.raw.prepare('SELECT payload FROM operation_records WHERE key=?').get('account-history:guest-id').payload).length,120);
});
test('history write failure rolls back disable and session revocation',async()=>{
 reset();failHistory=true;assert.equal((await userApi.POST(req({id:'guest-id'}))).status,503);assert.equal(active('guest-id'),1);assert.equal(sessions('guest-id'),1);assert.equal((await history.readAccountHistory('guest-id')).length,0);
});
test('bad historical storage is reported, never silently shown as zero history',async()=>{
 reset();db.raw.prepare('INSERT INTO operation_records VALUES(?,?,1,?)').run('account-history:guest-id','broken-json','owner');assert.equal((await staffApi.GET()).status,503);
});
test('existing disabled accounts recover history from deleted booking records by exact account ID',async()=>{
 const state=reset();state.deletedBookings=[{stay:state.stays[0],orders:state.orders,posOrders:state.posOrders,deletedAt:'2026-09-19T10:00:00Z',deletedBy:'owner'}];state.stays=[];state.orders=[];state.posOrders=[];replaceState(state);db.raw.prepare('UPDATE accounts SET active=0 WHERE id=?').run('guest-id');
 const user=(await (await staffApi.GET()).json()).users.find(u=>u.id==='guest-id');assert.equal(user.stays[0].id,'NV-0001');assert(user.history.some(e=>e.action==='Booking deleted; history retained'));assert(user.history.some(e=>e.action==='Restaurant order created'));
});
test('reused room numbers and names do not attach another guest history',async()=>{
 const state=reset();state.stays.push({id:'NV-0002',accountId:'other-id',room:'101',guest:'Test guest',checkedInAt:'2026-09-19T10:00:00Z',history:[{date:'2026-09-19T11:00:00Z',detail:'PRIVATE OTHER GUEST'}]});const result=events.historyFor({id:'guest-id',role:'guest'},state);assert(!JSON.stringify(result).includes('PRIVATE OTHER GUEST'));assert(!JSON.stringify(result).includes('NV-0002'));
});
test('checkout saves checked-out history and disables sessions in the same transaction',async()=>{
 const state=reset();state.stays[0].status='Checked Out';state.stays[0].checkedOutAt='2026-09-19T10:00:00Z';assert.equal(await stayLogin.saveStayAccess(state,1,'admin-id',null,['guest-id']),true);assert.equal(active('guest-id'),0);assert.equal(sessions('guest-id'),0);assert((await history.readAccountHistory('guest-id')).some(e=>e.action==='Checked out'));
});
test('room login replacement preserves the old account links before replacing them',async()=>{
 const state=reset(),plan=await stayLogin.prepareStayLogin(state,state.stays[0]);assert.notEqual(state.stays[0].accountId,'guest-id');assert(await stayLogin.saveStayAccess(state,1,'admin-id',plan));assert.equal(active('guest-id'),0);assert.equal(active(plan.id),1);assert((await history.readAccountHistory('guest-id')).some(e=>e.action==='Checked in'&&e.detail.includes('NV-0001')));
});
test('stale state save neither disables the login nor appends false history',async()=>{
 const state=reset();assert.equal(await stayLogin.saveStayAccess(state,0,'admin-id',null,['guest-id']),false);assert.equal(active('guest-id'),1);assert.equal(sessions('guest-id'),1);assert.equal((await history.readAccountHistory('guest-id')).length,0);
});
test('staff disable through permissions preserves activity and revokes sessions; re-enable retains history',async()=>{
 reset();assert.equal((await staffApi.POST(req({id:'staff-id',permissions:['waiter_pos'],active:false}))).status,200);assert.equal(active('staff-id'),0);assert.equal(sessions('staff-id'),0);const before=await history.readAccountHistory('staff-id');assert(before.some(e=>e.action==='Operational update'));assert.equal((await staffApi.POST(req({id:'staff-id',permissions:['waiter_pos'],active:true}))).status,200);assert.equal(active('staff-id'),1);assert((await history.readAccountHistory('staff-id')).length>before.length);assert.equal(sessions('staff-id'),0);
});
test('staff DELETE disable also retains history and terminates sessions',async()=>{
 reset();assert.equal((await staffApi.DELETE(req({id:'staff-id'},'DELETE'))).status,200);assert.equal(active('staff-id'),0);assert.equal(sessions('staff-id'),0);assert((await history.readAccountHistory('staff-id')).some(e=>e.action==='Account disabled'));
});
test('blocked guest deletion does not write a false deleted event',async()=>{
 reset();await userApi.POST(req({id:'guest-id'}));const before=(await history.readAccountHistory('guest-id')).length;assert.equal((await userApi.DELETE(req({id:'guest-id'},'DELETE'))).status,409);assert.equal((await history.readAccountHistory('guest-id')).length,before);assert.equal(active('guest-id'),0);
});
test('login deletion never deletes the stored history records',async()=>{
 const state=reset();state.stays[0].status='Checked Out';replaceState(state);await userApi.POST(req({id:'guest-id'}));assert.equal((await userApi.DELETE(req({id:'guest-id'},'DELETE'))).status,200);assert.equal(active('guest-id'),undefined);assert((await history.readAccountHistory('guest-id')).some(e=>e.action==='Guest account deleted'));
});
test('encoded account ID prefixes keep archive reads isolated',async()=>{
 reset();await history.appendAccountHistory('guest-id:other',{at:'2026-09-19',action:'Must not leak'});assert.equal((await history.readAccountHistory('guest-id')).length,0);
});
