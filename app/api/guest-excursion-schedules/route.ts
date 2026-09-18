import {authDb,currentUser,sameOrigin} from '../../../lib/auth';
import {loadStays} from '../../../lib/stays';
import {saveStayAccess} from '../../../lib/stay-login';
import {catalog,islandToday,validDate} from '../../../lib/guest-catalog';
import {excursionResources} from '../../../lib/excursion-workflow';
import {ensureStandardDailyExcursions} from '../../../lib/excursion-default-schedule';
import {loadExcursionMenu} from '../../../lib/excursion-menu';

const prefix='excursion-schedule:';
const norm=(v:any)=>String(v||'').trim().replace(/\s+/g,' ').toLowerCase();

function matches(o:any,s:any){
 if(o.kind!=='excursion'||o.status==='Cancelled'||o.approvalStatus==='Declined'||o.approvalStatus==='Cancelled')return false;
 if(o.scheduleId)return o.scheduleId===s.id&&(o.date||o.schedule?.date)===s.date;
 const os=o.schedule||{};
 return (os.date||o.date)===s.date&&os.time===s.time&&(!s.vesselId||os.vesselId===s.vesselId)&&norm(o.name)===norm(s.name);
}
function confirmed(o:any){return o.approvalStatus!=='Pending'&&o.approvalStatus!=='Declined'&&o.approvalStatus!=='Cancelled'&&o.status!=='Cancelled';}
function pending(o:any){return o.approvalStatus==='Pending'&&o.status!=='Cancelled';}
const sharedKey=(s:any)=>s.sharedGroup?s.date+'|'+s.time+'|group:'+s.sharedGroup:s.vesselId?s.date+'|'+s.time+'|vessel:'+s.vesselId:'';

const componentAliases:[RegExp,string][]=[
 [/fish\s*tank/i,'fish tank'],[/sand\s*bank|sandbank/i,'sandbank'],[/turtle/i,'turtle'],
 [/coral\s*garden/i,'coral garden'],[/nurse\s*shark|shark/i,'shark'],[/dolphin/i,'dolphin'],
 [/fishing/i,'fishing'],[/manta/i,'manta'],[/clown\s*fish|clone\s*fish/i,'clown fish'],
 [/beach\s*dinner/i,'beach dinner'],[/seafood/i,'seafood'],[/dinner/i,'dinner'],[/snorkeling/i,'snorkeling']
];
function excursionComponents(name:any){
 const text=String(name||'').toLowerCase().replace(/\([^)]*\)/g,' ');
 const parts=text.split('+').map(x=>x.trim()).filter(Boolean);
 const out:string[]=[];
 for(const part of parts.length?parts:[text]){
  let found=false;
  for(const [re,label] of componentAliases){
   if(re.test(part)){
    if(!out.includes(label))out.push(label);
    found=true;
    if(label!=='snorkeling')break;
   }
  }
  if(!found){
   const cleaned=part.replace(/\b(only|trip|watching|snorkeling)\b/g,' ').replace(/\s+/g,' ').trim();
   if(cleaned&&!out.includes(cleaned))out.push(cleaned);
  }
 }
 return out.filter(x=>x!=='snorkeling'||out.length===1);
}
function scheduleCanServe(menuName:any,scheduleName:any){
 const wanted=excursionComponents(menuName),offered=excursionComponents(scheduleName);
 return wanted.length>0&&wanted.every(x=>offered.includes(x));
}
function candidateLoad(schedule:any,allSchedules:any[],orders:any[]){
 const key=sharedKey(schedule);
 const groupSchedules=key?allSchedules.filter((s:any)=>sharedKey(s)===key):[schedule];
 const groupIds=new Set(groupSchedules.map((s:any)=>s.id));
 const capacity=Math.min(...groupSchedules.map((s:any)=>Math.max(1,Number(s.capacity)||1)));
 const confirmedPax=orders.filter((o:any)=>o.kind==='excursion'&&!o.separateVessel&&o.status!=='Cancelled'&&o.approvalStatus!=='Pending'&&o.approvalStatus!=='Declined'&&o.approvalStatus!=='Cancelled'&&(groupIds.has(o.scheduleId)||groupSchedules.some((s:any)=>matches(o,s)))).reduce((n:number,o:any)=>n+Math.max(0,Number(o.quantity)||0),0);
 return {capacity,confirmedPax,remaining:Math.max(0,capacity-confirmedPax)};
}
function scheduleRank(menuName:any,schedule:any){
 const wanted=excursionComponents(menuName),offered=excursionComponents(schedule.name);
 return Math.max(0,offered.length-wanted.length);
}

const excursionCatalog=catalog.filter((x:any)=>x.kind==='excursion');
const byId=(id:string)=>excursionCatalog.find((x:any)=>x.id===id)?.cents||0;
function priceForSchedule(s:any){
 const explicit=Number(s.priceCents);
 if(Number.isInteger(explicit)&&explicit>0)return explicit;
 const n=norm(s.name).replace(/\s+only$/,'');
 const exact=excursionCatalog.find((x:any)=>norm(x.name)===n);
 if(exact)return exact.cents;
 if(n==='shark + turtle'||n==='shark + turtle snorkeling')return byId('shark-turtle');
 const aliases:[RegExp,string][]=[[/fish\s*tank/,'fishtank'],[/sand\s*bank|sandbank/,'sandbank'],[/turtle/,'turtle'],[/coral\s*garden/,'coral'],[/shark/,'shark'],[/dolphin/,'dolphin'],[/fishing/,'fishing']];
 const parts=n.split('+').map((p:string)=>p.trim()).filter(Boolean);
 if(!parts.length)return 0;
 let total=0;
 for(const part of parts){
  const hit=aliases.find(([re])=>re.test(part));
  if(!hit)return 0;
  const cents=byId(hit[1]);if(!cents)return 0;total+=cents;
 }
 return total;
}

async function schedulesForDate(date:string){
 const rows=await authDb().prepare('SELECT payload FROM operation_records WHERE key LIKE ?').bind(prefix+date+':%').all<any>();
 return (rows.results||[]).map((row:any)=>JSON.parse(row.payload)).sort((a:any,b:any)=>a.time.localeCompare(b.time)||a.name.localeCompare(b.name));
}

export async function GET(r:Request){
 const user=await currentUser();
 if(!user||user.role!=='guest')return Response.json({error:'Guest login required.'},{status:403});
 const date=new URL(r.url).searchParams.get('date')||islandToday();
 if(!validDate(date))return Response.json({error:'Choose a valid date.'},{status:400});
 try{
  await ensureStandardDailyExcursions(date);
  const {state}=await loadStays();
  const stays=(state.stays||[]).filter((s:any)=>s.accountId===user.userId&&s.status==='In House');
  const eligibleStays=stays.filter((s:any)=>s.checkIn<=date&&date<s.checkOut).map((s:any)=>({id:s.id,room:s.room,guest:s.guest,checkIn:s.checkIn,checkOut:s.checkOut}));
  const raw=await schedulesForDate(date);
  const orders=Array.isArray(state.orders)?state.orders:[];
  const groups:Record<string,{capacity:number,confirmedPax:number,pendingPax:number,scheduleIds:string[]}>={};
  const schedules=raw.map((s:any)=>{
   const own=orders.filter((o:any)=>o.accountId===user.userId&&o.scheduleId===s.id&&o.kind==='excursion').sort((a:any,b:any)=>String(b.createdAt||'').localeCompare(String(a.createdAt||'')))[0];
   const confirmedPax=orders.filter((o:any)=>matches(o,s)&&confirmed(o)&&!o.separateVessel).reduce((n:number,o:any)=>n+Math.max(0,Number(o.quantity)||0),0);
   const pendingPax=orders.filter((o:any)=>matches(o,s)&&pending(o)).reduce((n:number,o:any)=>n+Math.max(0,Number(o.quantity)||0),0);
   const sharedBoatKey=sharedKey(s);
   if(sharedBoatKey){const g=groups[sharedBoatKey]||(groups[sharedBoatKey]={capacity:s.capacity,confirmedPax:0,pendingPax:0,scheduleIds:[]});g.capacity=Math.min(g.capacity,s.capacity);g.confirmedPax+=confirmedPax;g.pendingPax+=pendingPax;g.scheduleIds.push(s.id);}
   return {id:s.id,date:s.date,time:s.time,name:s.name,status:s.status,capacity:s.capacity,notes:s.notes||'',priceCents:priceForSchedule(s),sharedBoatKey,confirmedPax,pendingPax,ownBooking:own?{id:own.id,quantity:own.quantity,status:own.approvalStatus==='Approved'?'Confirmed':own.approvalStatus||own.status,createdAt:own.createdAt}:null};
  });
  const enriched=schedules.map((s:any)=>{const g=s.sharedBoatKey?groups[s.sharedBoatKey]:null;const capacity=g?.capacity??s.capacity,confirmedPax=g?.confirmedPax??s.confirmedPax,pendingPax=g?.pendingPax??s.pendingPax;return {...s,capacity,confirmedPax,pendingPax,remainingSeats:Math.max(0,capacity-confirmedPax),isFull:confirmedPax>=capacity,sharedBoat:!!g&&g.scheduleIds.length>1};});
  const myBookings=orders.filter((o:any)=>o.accountId===user.userId&&o.kind==='excursion'&&o.status!=='Cancelled'&&o.approvalStatus!=='Declined'&&o.approvalStatus!=='Cancelled').map((o:any)=>{
   const bookingStay=(state.stays||[]).find((s:any)=>s.id===o.stayId);
   return {id:o.id,stayId:o.stayId,menuItemId:o.menuItemId||'',name:o.name,quantity:o.quantity,date:o.date,time:o.time||o.schedule?.time||'',status:o.approvalStatus==='Approved'?'Confirmed':o.approvalStatus||o.status,cents:Number(o.cents)||0,room:o.room,vessel:o.schedule?.vessel||'',separateVessel:!!o.separateVessel,buggyRequested:true,canCancel:!['Departed','Completed','Cancelled'].includes(o.status),canChangeDate:!['Departed','Completed','Cancelled'].includes(o.status),checkIn:bookingStay?.checkIn||'',checkOut:bookingStay?.checkOut||'',createdAt:o.createdAt};
  }).sort((a:any,b:any)=>(String(a.date)+String(a.time)).localeCompare(String(b.date)+String(b.time)));
  return Response.json({date,stays:eligibleStays,schedules:enriched,myBookings},{headers:{'Cache-Control':'no-store'}});
 }catch{return Response.json({error:'Could not load scheduled excursions.'},{status:503});}
}

export async function POST(r:Request){
 const user=await currentUser();
 if(!user||user.role!=='guest'||!sameOrigin(r))return Response.json({error:'Guest login required.'},{status:403});
 try{
  const b=await r.json();
  const scheduleId=String(b.scheduleId||'').slice(0,100),menuItemId=String(b.menuItemId||'').slice(0,100),date=String(b.date||''),stayId=String(b.stayId||''),token=String(b.token||'');
  const quantity=Number(b.quantity),buggyRequested=true,notes=String(b.notes||'').trim().slice(0,1000);
  if((!scheduleId&&!menuItemId)||!validDate(date)||!stayId||!/^[-a-zA-Z0-9]{12,80}$/.test(token)||!Number.isInteger(quantity)||quantity<1||quantity>20)throw Error('Check the excursion, date, room and number of guests.');
  const {state,revision}=await loadStays();
  const old=(state.orders||[]).find((o:any)=>o.token===token&&o.accountId===user.userId);
  if(old)return Response.json({booking:{id:old.id,status:old.approvalStatus==='Approved'?'Confirmed':old.approvalStatus||old.status,requiresApproval:old.approvalStatus==='Pending',requiresScheduling:!old.scheduleId}});
  const stay=(state.stays||[]).find((s:any)=>s.id===stayId&&s.accountId===user.userId&&s.status==='In House');
  if(!stay)throw Error('This room is not available for excursion booking.');
  if(date<islandToday()||date<stay.checkIn||date>=stay.checkOut)throw Error('Choose an excursion date during your current stay.');

  if(menuItemId&&!scheduleId){
   const menu=await loadExcursionMenu();
   const item=menu.find((x:any)=>x.id===menuItemId&&x.kind==='excursion');
   if(!item)throw Error('This excursion is no longer available in the menu.');
   const minGuests=Math.max(1,Number(item.minGuests)||1);
   if(quantity<minGuests)throw Error('This excursion requires at least '+minGuests+' guest'+(minGuests===1?'':'s')+'.');

   await ensureStandardDailyExcursions(date);
   const allSchedules=(await schedulesForDate(date)).filter((s:any)=>s.status==='Open');
   const orders=Array.isArray(state.orders)?state.orders:[];
   const candidates=allSchedules
    .filter((s:any)=>scheduleCanServe(item.name,s.name))
    .map((s:any)=>({schedule:s,...candidateLoad(s,allSchedules,orders),rank:scheduleRank(item.name,s)}))
    .sort((a:any,b:any)=>(a.remaining>=quantity?0:1)-(b.remaining>=quantity?0:1)||a.rank-b.rank||b.remaining-a.remaining||String(a.schedule.time).localeCompare(String(b.schedule.time)));

   const chosen=candidates[0];
   const unitPriceCents=Math.max(0,Number(item.cents)||0),pricingUnit=item.pricingUnit==='couple'?'couple':'guest',quotedCents=pricingUnit==='couple'?unitPriceCents*Math.ceil(quantity/2):unitPriceCents*quantity,id='EXC-'+crypto.randomUUID().slice(0,8).toUpperCase();
   state.orders??=[];

   if(chosen){
    const schedule=chosen.schedule,requiresApproval=chosen.confirmedPax+quantity>chosen.capacity;
    const resources=excursionResources(state),vessel=resources.vessels.find((v:any)=>v.id===schedule.vesselId),crew=resources.crew.filter((c:any)=>schedule.crewIds?.includes(c.id));
    state.orders.push({
     id,token,accountId:user.userId,stayId:stay.id,guest:stay.guest,room:stay.room,kind:'excursion',menuItemId:item.id,name:item.name,quantity,pricingUnit,buggyRequested,
     cents:requiresApproval?0:quotedCents,quotedCents,unitPriceCents,notes,date,time:schedule.time,scheduleId:schedule.id,
     seatRequest:requiresApproval,approvalStatus:requiresApproval?'Pending':'Approved',status:requiresApproval?'Awaiting scheduling':'Scheduled',
     requestedOverCapacity:requiresApproval,autoConfirmed:!requiresApproval,matchedFromMenu:true,matchedScheduleName:schedule.name,
     schedule:requiresApproval?undefined:{date:schedule.date,time:schedule.time,vesselId:schedule.vesselId,vessel:vessel?.name||'',crewIds:schedule.crewIds||[],crew:crew.map((c:any)=>c.name)},
     guestNotified:requiresApproval?undefined:false,createdAt:new Date().toISOString(),source:'Guest menu'
    });
    const saved=await saveStayAccess(state,revision,user.userId);
    if(!saved)return Response.json({error:'Another booking was saved at the same time. Please try again.'},{status:409});
    return Response.json({booking:{id,status:requiresApproval?'Pending':'Confirmed',requiresApproval,requiresScheduling:false,matchedScheduleId:schedule.id,matchedScheduleName:schedule.name,time:schedule.time,remainingBefore:chosen.remaining,chargedCents:requiresApproval?0:quotedCents}},{status:201});
   }

   state.orders.push({id,token,accountId:user.userId,stayId:stay.id,guest:stay.guest,room:stay.room,kind:'excursion',menuItemId:item.id,name:item.name,quantity,pricingUnit,buggyRequested,cents:0,quotedCents,unitPriceCents,notes,date,time:'',status:'Awaiting scheduling',approvalStatus:'Pending',seatRequest:true,unscheduledRequest:true,autoConfirmed:false,guestNotified:false,createdAt:new Date().toISOString(),source:'Guest menu'});
   const saved=await saveStayAccess(state,revision,user.userId);
   if(!saved)return Response.json({error:'Another booking was saved at the same time. Please try again.'},{status:409});
   return Response.json({booking:{id,status:'Pending',requiresApproval:true,requiresScheduling:true,noMatchingSchedule:true,chargedCents:0}},{status:201});
  }

  const row=await authDb().prepare('SELECT payload FROM operation_records WHERE key=?').bind(prefix+date+':'+scheduleId).first<any>();
  if(!row)throw Error('This excursion is no longer scheduled.');
  const schedule=JSON.parse(row.payload);
  if(schedule.status!=='Open')throw Error('This excursion is closed for bookings.');
  const allSchedules=await schedulesForDate(date);
  const key=sharedKey(schedule);
  const groupSchedules=key?allSchedules.filter((s:any)=>sharedKey(s)===key):[schedule];
  const groupIds=new Set(groupSchedules.map((s:any)=>s.id));
  const capacity=Math.min(...groupSchedules.map((s:any)=>Number(s.capacity)||1));
  const confirmedPax=(state.orders||[]).filter((o:any)=>o.kind==='excursion'&&!o.separateVessel&&o.status!=='Cancelled'&&o.approvalStatus!=='Pending'&&o.approvalStatus!=='Declined'&&o.approvalStatus!=='Cancelled'&&(groupIds.has(o.scheduleId)||groupSchedules.some((s:any)=>matches(o,s)))).reduce((n:number,o:any)=>n+Math.max(0,Number(o.quantity)||0),0);
  const requiresApproval=confirmedPax+quantity>capacity;
  const unitPriceCents=priceForSchedule(schedule),quotedCents=unitPriceCents*quantity;
  const id='EXC-'+crypto.randomUUID().slice(0,8).toUpperCase();
  const resources=excursionResources(state),vessel=resources.vessels.find((v:any)=>v.id===schedule.vesselId),crew=resources.crew.filter((c:any)=>schedule.crewIds?.includes(c.id));
  state.orders??=[];
  state.orders.push({
   id,token,accountId:user.userId,stayId:stay.id,guest:stay.guest,room:stay.room,kind:'excursion',name:schedule.name,quantity,buggyRequested,cents:requiresApproval?0:quotedCents,quotedCents,unitPriceCents,notes,date,time:schedule.time,scheduleId:schedule.id,
   seatRequest:requiresApproval,approvalStatus:requiresApproval?'Pending':'Approved',status:requiresApproval?'Awaiting scheduling':'Scheduled',requestedOverCapacity:requiresApproval,autoConfirmed:!requiresApproval,
   schedule:requiresApproval?undefined:{date:schedule.date,time:schedule.time,vesselId:schedule.vesselId,vessel:vessel?.name||'',crewIds:schedule.crewIds||[],crew:crew.map((c:any)=>c.name)},
   guestNotified:requiresApproval?undefined:false,createdAt:new Date().toISOString(),source:'Guest schedule'
  });
  const saved=await saveStayAccess(state,revision,user.userId);
  if(!saved)return Response.json({error:'Another booking was saved at the same time. Please try again.'},{status:409});
  return Response.json({booking:{id,status:requiresApproval?'Pending':'Confirmed',requiresApproval,overCapacity:requiresApproval,remainingBefore:Math.max(0,capacity-confirmedPax),chargedCents:requiresApproval?0:quotedCents}},{status:201});
 }catch(e){return Response.json({error:e instanceof Error?e.message:'Could not book excursion seats.'},{status:400});}
}

export async function PATCH(r:Request){
 const user=await currentUser();
 if(!user||user.role!=='guest'||!sameOrigin(r))return Response.json({error:'Guest login required.'},{status:403});
 try{
  const b=await r.json(),bookingId=String(b.bookingId||'').slice(0,100),newDate=String(b.date||'');
  if(!bookingId||!validDate(newDate))throw Error('Choose a valid new excursion date.');
  const {state,revision}=await loadStays();
  const order=(state.orders||[]).find((o:any)=>o.id===bookingId&&o.kind==='excursion'&&o.accountId===user.userId);
  if(!order)throw Error('Excursion booking not found.');
  if(['Departed','Completed','Cancelled'].includes(order.status)||order.approvalStatus==='Cancelled')throw Error('This excursion date can no longer be changed online.');
  const stay=(state.stays||[]).find((s:any)=>s.id===order.stayId&&s.accountId===user.userId&&s.status==='In House');
  if(!stay)throw Error('This room is not available for excursion changes.');
  if(Number(order.cents)>0&&stay.paidBills?.['Excursions:'+order.id]===Number(order.cents))throw Error('This excursion has already been paid. Please contact reception to change the date.');
  if(newDate<islandToday()||newDate<stay.checkIn||newDate>=stay.checkOut)throw Error('Choose a date during your current stay, before checkout.');
  if(newDate===order.date)return Response.json({ok:true,status:order.approvalStatus==='Approved'?'Confirmed':order.approvalStatus||order.status,date:order.date,time:order.time||order.schedule?.time||''});

  await ensureStandardDailyExcursions(newDate);
  const allSchedules=(await schedulesForDate(newDate)).filter((s:any)=>s.status==='Open');
  const menu=await loadExcursionMenu();
  const menuItem=order.menuItemId?menu.find((x:any)=>x.id===order.menuItemId&&x.kind==='excursion'):undefined;
  const requestedName=menuItem?.name||order.name;
  const quantity=Math.max(1,Number(order.quantity)||1);
  const candidates=allSchedules
   .filter((s:any)=>scheduleCanServe(requestedName,s.name))
   .map((s:any)=>({schedule:s,...candidateLoad(s,allSchedules,state.orders||[]),rank:scheduleRank(requestedName,s)}))
   .sort((a:any,b:any)=>(a.remaining>=quantity?0:1)-(b.remaining>=quantity?0:1)||a.rank-b.rank||b.remaining-a.remaining||String(a.schedule.time).localeCompare(String(b.schedule.time)));

  const chosen=candidates[0];
  const quotedCents=Math.max(0,Number(order.quotedCents)||Number(order.unitPriceCents||0)*quantity||Number(order.cents)||0);
  const resources=excursionResources(state);
  const changedAt=new Date().toISOString();
  const previous={date:order.date||'',time:order.time||order.schedule?.time||'',scheduleId:order.scheduleId||'',at:changedAt};
  order.date=newDate;
  order.dateChangeHistory=[...(order.dateChangeHistory||[]),previous];
  order.dateChangedAt=changedAt;
  order.dateChangedBy='guest';
  order.separateVessel=false;
  delete order.overflowVesselId;
  delete order.originalScheduleId;

  if(chosen){
   const schedule=chosen.schedule,requiresApproval=chosen.confirmedPax+quantity>chosen.capacity;
   const vessel=resources.vessels.find((v:any)=>v.id===schedule.vesselId),crew=resources.crew.filter((c:any)=>schedule.crewIds?.includes(c.id));
   order.time=schedule.time;
   order.scheduleId=schedule.id;
   order.matchedFromMenu=true;
   order.matchedScheduleName=schedule.name;
   order.seatRequest=requiresApproval;
   order.requestedOverCapacity=requiresApproval;
   order.approvalStatus=requiresApproval?'Pending':'Approved';
   order.status=requiresApproval?'Awaiting scheduling':'Scheduled';
   order.autoConfirmed=!requiresApproval;
   order.cents=requiresApproval?0:quotedCents;
   order.schedule=requiresApproval?undefined:{date:schedule.date,time:schedule.time,vesselId:schedule.vesselId,vessel:vessel?.name||'',crewIds:schedule.crewIds||[],crew:crew.map((c:any)=>c.name)};
   order.guestNotified=requiresApproval?undefined:false;
   if(requiresApproval){delete order.guestNotifiedAt;delete order.guestNotifiedBy;}
  }else{
   order.time='';
   delete order.scheduleId;
   delete order.schedule;
   order.seatRequest=true;
   order.unscheduledRequest=true;
   order.requestedOverCapacity=false;
   order.approvalStatus='Pending';
   order.status='Awaiting scheduling';
   order.autoConfirmed=false;
   order.cents=0;
   order.guestNotified=undefined;
   delete order.matchedScheduleName;
  }

  const saved=await saveStayAccess(state,revision,user.userId);
  if(!saved)return Response.json({error:'Another update was saved at the same time. Please try again.'},{status:409});
  return Response.json({ok:true,date:newDate,time:order.time||'',status:order.approvalStatus==='Approved'?'Confirmed':order.approvalStatus||order.status,requiresApproval:order.approvalStatus==='Pending',noMatchingSchedule:!chosen});
 }catch(e){return Response.json({error:e instanceof Error?e.message:'Could not change excursion date.'},{status:400});}
}

export async function DELETE(r:Request){
 const user=await currentUser();
 if(!user||user.role!=='guest'||!sameOrigin(r))return Response.json({error:'Guest login required.'},{status:403});
 try{
  const b=await r.json(),bookingId=String(b.bookingId||'').slice(0,100);
  if(!bookingId)throw Error('Choose a booking to cancel.');
  const {state,revision}=await loadStays();
  const order=(state.orders||[]).find((o:any)=>o.id===bookingId&&o.kind==='excursion'&&o.accountId===user.userId);
  if(!order)throw Error('Excursion booking not found.');
  if(['Departed','Completed'].includes(order.status))throw Error('This excursion can no longer be cancelled online. Please contact reception.');
  if(order.status==='Cancelled'||order.approvalStatus==='Cancelled')return Response.json({ok:true,status:'Cancelled'});
  order.status='Cancelled';order.approvalStatus='Cancelled';order.cents=0;order.cancelledAt=new Date().toISOString();order.cancelledBy='guest';
  const saved=await saveStayAccess(state,revision,user.userId);
  if(!saved)return Response.json({error:'Another update was saved. Please try again.'},{status:409});
  return Response.json({ok:true,status:'Cancelled'});
 }catch(e){return Response.json({error:e instanceof Error?e.message:'Could not cancel excursion.'},{status:400});}
}
