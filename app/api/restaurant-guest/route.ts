import {diningRoom,diningOrderRoom} from '../../../lib/dining-room';
import {sessionCookieName} from '../../../lib/tab-session';
import {mealItemIncluded,mealPlanOrderStatus,restaurantMealPeriod} from '../../../lib/meal-access';
import {cookies} from 'next/headers';
import {currentGuestUser,authDb,randomToken,digest,sameOrigin,limit} from '../../../lib/auth';
import {loadStays,stayKey} from '../../../lib/stays';
import {loadMenu} from '../../../lib/menu-server';
import {restaurantTables} from '../../../lib/restaurant-tables';
import {walkInExcursionProfile} from '../../../lib/walkin-excursion-access';
import {mirrorHotelState,mirrorOperationalRecord,readOperationalRecordPrimary,restoreRestaurantOrdersPrimary,saveOperationalRecordPrimary} from '../../../lib/supabase-bridge';
import {updateRoomInventory} from '../../../lib/rooms';
import {restaurantPaymentStatus,syncRestaurantRoomBill} from '../../../lib/pos-room-billing';
import {emitAdminNotification} from '../../../lib/admin-notifications';

async function identity(r:Request,create=false){
 const diningCookie=await sessionCookieName('nirili_dining');
 const requested=new URL(r.url).searchParams.get('mode');
 if(requested==='account'){
  const u=await currentGuestUser();
  if(u?.role!=='guest'||!u.userId.startsWith('walkin-exc-'))throw Error('Sign in with your temporary walk-in guest account.');
  return {key:'guest:'+u.userId,mode:'account',user:u,token:'',fresh:false};
 }
 if(requested==='inhouse'){
  const u=await currentGuestUser();
  if(u?.role!=='guest')throw Error('Sign in with your in-house guest account.');
  return {key:'guest:'+u.userId,mode:'inhouse',user:u,token:'',fresh:false};
 }
 let token=(await cookies()).get(diningCookie)?.value;
 const valid=!!token&&/^[a-f0-9]{64}$/.test(token);
 if(!valid&&!create)throw Error('Open the menu again to start your visit.');
 if(!valid)token=randomToken();
 return {key:'walk:'+await digest(token!),mode:'walkin',user:null,token:token!,fresh:!valid};
}

async function restaurantState(){
 try{
  const row=await readOperationalRecordPrimary(stayKey);
  if(row?.payload){
   const state=row.payload;state.requests??=[];state.orders??=[];state.posOrders??=[];state.stays??=[];state.rooms??=[];
   try{await restoreRestaurantOrdersPrimary(state);}catch{}
   updateRoomInventory(state);
   return {state,revision:Number(row.revision)||0};
  }
 }catch{}
 const fallback=await loadStays();
 try{await restoreRestaurantOrdersPrimary(fallback.state);}catch{}
 return fallback;
}

async function saveRestaurantState(state:any,revision:number,by:string){
 let nextRevision=0,primaryAvailable=true;
 try{nextRevision=await saveOperationalRecordPrimary(stayKey,state,revision,by);}catch{primaryAvailable=false;}
 if(primaryAvailable){
  if(!nextRevision)return 0;
  try{await authDb().prepare('INSERT INTO operation_records(key,payload,revision,updated_by) VALUES(?,?,?,?) ON CONFLICT(key) DO UPDATE SET payload=excluded.payload,revision=excluded.revision,updated_by=excluded.updated_by').bind(stayKey,JSON.stringify(state),nextRevision,by).run();}catch{}
  try{await mirrorHotelState(state);}catch{}
  return nextRevision;
 }
 const saved=revision===0
  ?await authDb().prepare('INSERT OR IGNORE INTO operation_records(key,payload,revision,updated_by) VALUES(?,?,1,?)').bind(stayKey,JSON.stringify(state),by).run()
  :await authDb().prepare('UPDATE operation_records SET payload=?,revision=revision+1,updated_by=? WHERE key=? AND revision=?').bind(JSON.stringify(state),by,stayKey,revision).run();
 if(!saved.meta.changes)return 0;
 try{await Promise.all([mirrorHotelState(state),mirrorOperationalRecord(stayKey,state,revision+1,by)]);}catch{}
 return revision+1;
}

async function view(id:any){
 const {state}=await restaurantState();
 let profile:any=null;
 if(id.mode==='walkin'){
  const visit=await authDb().prepare('SELECT payload FROM operation_records WHERE key=?').bind('dining-visit:'+id.key).first<any>();
  profile=visit?JSON.parse(visit.payload):null;
 }else if(id.mode==='account'){
  const walkIn=walkInExcursionProfile(state,id.user.userId);
  profile=walkIn?{name:walkIn.name,hotel:walkIn.hotel,room:walkIn.room,departureDate:walkIn.departureDate}:null;
 }
 const assigned=id.mode==='inhouse'&&id.user?diningRoom(state.stays,id.user):null;
 const mp=assigned?mealPlanOrderStatus(state,assigned.id):null;
 const assignedRoom=assigned?{id:assigned.id,room:assigned.room,meal:assigned.meal,status:assigned.status,freeOrderAvailable:mp!.available,freeOrdersRemaining:mp!.remaining,dailyFreeOrderLimit:mp!.limit,includedOrdersToday:mp!.used,halfBoardFreeOrderAvailable:mp!.available,halfBoardIncludedMeal:'',halfBoardMealLocked:!mp!.available}:null;
 const stays=assignedRoom?[assignedRoom]:[];
 return {
  visit:profile,
  items:(await loadMenu()).items,
  tables:restaurantTables,
  mealPeriod:restaurantMealPeriod(),
  mode:id.mode,
  stays,
  assignedRoom,
  guest:id.user?.displayName||profile?.name||'',
  orders:(state.posOrders||[]).filter((o:any)=>o.guestKey===id.key).map((o:any)=>({
   id:o.id,table:o.table,items:o.items,cents:o.cents,kitchen:o.kitchen,createdAt:o.createdAt,
   paymentStatus:restaurantPaymentStatus(o,state.stays.find((s:any)=>s.id===o.stayId))
  }))
 };
}

export async function GET(r:Request){
 const diningCookie=await sessionCookieName('nirili_dining');
 try{
  const id=await identity(r,true),headers:Record<string,string>={'Cache-Control':'no-store'};
  if(id.fresh)headers['Set-Cookie']=diningCookie+'='+id.token+'; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=43200';
  return Response.json(await view(id),{headers});
 }catch(e){return Response.json({error:(e as Error).message},{status:401});}
}

export async function POST(r:Request){
 const diningCookie=await sessionCookieName('nirili_dining');
 if(!sameOrigin(r))return Response.json({error:'Invalid request.'},{status:403});
 try{
  const b=await r.json();
  if(b.action==='start'){
   if(typeof b.name!=='string'||!b.name.trim()||b.name.length>100||!restaurantTables.includes(b.table))throw Error('Enter your name and select a table.');
   if(!await limit('dining-start:'+(r.headers.get('cf-connecting-ip')||'unknown'),60,900000))throw Error('Please try again later or ask the cashier.');
   const token=randomToken(),key='walk:'+await digest(token),profile={name:b.name.trim(),table:b.table};
   await authDb().prepare('INSERT INTO operation_records(key,payload,revision,updated_by) VALUES(?,?,1,?)').bind('dining-visit:'+key,JSON.stringify(profile),key).run();
   return Response.json({ok:true},{headers:{'Cache-Control':'no-store','Set-Cookie':diningCookie+'='+token+'; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=43200'}});
  }
  if(b.action==='end')return Response.json({ok:true},{headers:{'Set-Cookie':diningCookie+'=; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=0'}});
  const who=await identity(r);
  let walkName=who.user?.displayName||'';
  if(who.mode==='walkin'){
   const visit=await authDb().prepare('SELECT payload FROM operation_records WHERE key=?').bind('dining-visit:'+who.key).first<any>();
   if(!visit)throw Error('Enter your name and table on the guest welcome page first.');
   walkName=JSON.parse(visit.payload).name;
  }
  if(!await limit('dining:'+who.key,30,900000)||!await limit('dining-ip:'+(r.headers.get('cf-connecting-ip')||'unknown'),100,900000))throw Error('Please contact the cashier to place another order.');
  const {state,revision}=await restaurantState();
  state.posOrders??=[];
  if(typeof b.token!=='string'||!/^[-a-zA-Z0-9]{12,80}$/.test(b.token))throw Error('Refresh the menu and try again.');
  if(state.posOrders.some((o:any)=>o.guestKey===who.key&&o.token===b.token))return Response.json(await view(who));
  if(!restaurantTables.includes(b.table)||!Array.isArray(b.items)||!b.items.length||b.items.length>40||typeof b.notes!=='string'||b.notes.length>1000)throw Error('Select a table and menu items.');
  const s=who.mode==='inhouse'&&who.user?diningOrderRoom(state.stays,who.user,b.stayId):null;
  const menu=(await loadMenu()).items,seen=new Set(),mealPeriod=restaurantMealPeriod(),mp=mealPlanOrderStatus(state,s?.id);
  const items=b.items.map((x:any)=>{
   const i=menu.find((i:any)=>i.id===x.id);
   if(!i||seen.has(x.id)||!Number.isInteger(x.quantity)||x.quantity<1||x.quantity>20)throw Error('Check the selected items and quantities.');
   if(x.cents!==i.cents)throw Error('A price changed. Refresh the menu before ordering.');
   seen.add(x.id);
   const included=mealItemIncluded(s?.meal,i,mp.available);
   if(typeof x.included==='boolean'&&x.included!==included)throw Error('Meal plan availability changed. Refresh the menu and review the charges before ordering.');
   return {id:i.id,name:i.category+' · '+i.name+(included?' (meal plan included)':''),quantity:x.quantity,unitCents:included?0:i.cents,cents:included?0:i.cents*x.quantity,included,menuCents:i.cents};
  });
  const date=new Date().toISOString(),id='POS-'+crypto.randomUUID().slice(0,8).toUpperCase(),cents=items.reduce((n:number,i:any)=>n+i.cents,0),mealPlanFreeOrder=items.some((i:any)=>i.included===true);
  const order={
   id,token:b.token,guestKey:who.key,by:who.key,
   createdBy:who.mode==='inhouse'?'In-house guest':who.mode==='account'?'Walk-in guest account':'Walk-in customer',
   createdAt:date,stayId:s?.id||'',room:s?.room||'',customer:s?.guest||who.user?.displayName||walkName,table:b.table,notes:b.notes.trim(),items,cents,
   kitchen:'Awaiting cashier',method:s&&cents>0?'Room':'',mealPeriod,mealPlanFreeOrder,dailyFreeOrderLimit:mp.limit,history:[{date,by:who.mode,detail:'Guest order sent to cashier'}]
  };
  state.posOrders.push(order);
  if(s){
   s.history??=[];const billed=syncRestaurantRoomBill(s,order);
   s.history.unshift({date,by:'Guest',detail:billed?'Restaurant order '+id+' charged to room · USD '+(cents/100).toFixed(2):'Restaurant meal-plan order '+id+' · Included · no room charge'});
  }
  if(!await saveRestaurantState(state,revision,who.key))return Response.json({error:'Another order arrived. Please tap Send again.'},{status:409});
  try{await emitAdminNotification({id:'restaurant:new:'+id,type:'restaurant',title:'New restaurant order',detail:String(order.customer||'Guest')+' · '+String(order.table||'')+(order.room?' · Room '+order.room:'')+' · USD '+(cents/100).toFixed(2),ref:id,url:'/restaurant'});}catch{}
  return Response.json(await view(who));
 }catch(e){return Response.json({error:(e as Error).message},{status:400});}
}
