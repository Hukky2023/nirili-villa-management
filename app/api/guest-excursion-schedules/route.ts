import {authDb,currentUser,sameOrigin} from '../../../lib/auth';
import {loadStays} from '../../../lib/stays';
import {saveStayAccess} from '../../../lib/stay-login';
import {catalog,excursionDeparturePassed,islandToday,validDate} from '../../../lib/guest-catalog';
import {excursionResources} from '../../../lib/excursion-workflow';
import {ensureStandardDailyExcursions} from '../../../lib/excursion-default-schedule';
import {loadExcursionMenu} from '../../../lib/excursion-menu';
import {walkInExcursionOrderPaid,walkInExcursionProfile} from '../../../lib/walkin-excursion-access';
import {excursionGuestMix,excursionPriceCents} from '../../../lib/excursion-children';
import {isRomanticBeachDinner,ROMANTIC_BEACH_DINNER_SERVICE} from '../../../lib/excursion-services';
import {PRIVATE_BOAT_SURCHARGE_CENTS,isSnorkelingTrip,scheduleCanServeRequest,scheduleMatchRank,suggestedTripWindow} from '../../../lib/excursion-operations';

const prefix='excursion-schedule:';
const MIN_EXCURSION_PAX=1;
const norm=(v:any)=>String(v||'').trim().replace(/\s+/g,' ').toLowerCase();
function cleanGuestNames(value:any,quantity:number,lead:string){
 const input=Array.isArray(value)?value:[];
 const names=Array.from({length:quantity},(_,index)=>String(input[index]||'').trim()||(index===0?String(lead||'').trim():''));
 if(names.some(name=>!name))throw Error('Enter the name of every guest before confirming the excursion.');
 return names.map(name=>name.replace(/\s+/g,' ').slice(0,100));
}
function makeGuestRoster(orderId:string,names:string[]){
 return names.map((name,index)=>({id:orderId+':'+(index+1),slot:index+1,name,boarded:false,boardedAt:''}));
}
function cleanFootSizes(value:any,quantity:number,required:boolean){
 if(!required)return [];
 if(!Array.isArray(value)||value.length<quantity)throw Error('Enter the EU foot size for every guest so snorkeling fins can be prepared.');
 const sizes=value.slice(0,quantity).map((item:any)=>Number(item));
 if(sizes.length!==quantity||sizes.some((size:number)=>!Number.isInteger(size)||size<15||size>50))throw Error('Enter a valid EU foot size from 15 to 50 for every snorkeling guest.');
 return sizes;
}

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
function scheduleCanServe(menuName:any,scheduleName:any){return scheduleCanServeRequest(menuName,scheduleName);}
function candidateLoad(schedule:any,allSchedules:any[],orders:any[]){
 const key=sharedKey(schedule);
 const groupSchedules=key?allSchedules.filter((s:any)=>sharedKey(s)===key):[schedule];
 const groupIds=new Set(groupSchedules.map((s:any)=>s.id));
 const capacity=Math.min(...groupSchedules.map((s:any)=>Math.max(1,Number(s.capacity)||1)));
 const confirmedPax=orders.filter((o:any)=>o.kind==='excursion'&&!o.separateVessel&&o.status!=='Cancelled'&&o.approvalStatus!=='Pending'&&o.approvalStatus!=='Declined'&&o.approvalStatus!=='Cancelled'&&(groupIds.has(o.scheduleId)||groupSchedules.some((s:any)=>matches(o,s)))).reduce((n:number,o:any)=>n+Math.max(0,Number(o.quantity)||0),0);
 return {capacity,confirmedPax,remaining:Math.max(0,capacity-confirmedPax)};
}
function scheduleRank(menuName:any,schedule:any){return scheduleMatchRank(menuName,schedule.name);}
const SPECIAL_PACKAGE_ID='special-package';
const specialPackageSegments=[
 {name:'Turtle Snorkeling + Shark Snorkeling',matchName:'Shark + Turtle Snorkeling',priceMenuId:'shark-turtle'},
 {name:'Sandbank + Coral Garden',matchName:'Coral Garden + Sandbank',priceMenuId:'coral-sandbank'},
 {name:'Dolphin Watching + Fishing with Dinner',matchName:'Dolphin Watching + Fishing',priceMenuId:'dolphin-fishing-dinner'}
];

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
  const walkIn=walkInExcursionProfile(state,user.userId);
  const eligibleStays=stays.map((s:any)=>({id:s.id,room:s.room,guest:s.guest,checkIn:s.checkIn,checkOut:s.checkOut,walkIn:false}));
  if(walkIn?.active){
   const checkIn=islandToday(),checkOut=String(walkIn.expiresAt||'').slice(0,10);
   eligibleStays.push({id:'walkin:'+user.userId,room:walkIn.room||'',guest:walkIn.name,checkIn,checkOut:checkOut||'2099-12-31',walkIn:true,hotel:walkIn.hotel,phone:walkIn.phone} as any);
  }
  const raw=await schedulesForDate(date);
  const orders=Array.isArray(state.orders)?state.orders:[];
  const groups:Record<string,{capacity:number,confirmedPax:number,pendingPax:number,scheduleIds:string[]}>={};
  const schedules=raw.map((s:any)=>{
   const own=orders.filter((o:any)=>o.accountId===user.userId&&o.scheduleId===s.id&&(o.date||o.schedule?.date)===s.date&&o.kind==='excursion').sort((a:any,b:any)=>String(b.createdAt||'').localeCompare(String(a.createdAt||'')))[0];
   const confirmedPax=orders.filter((o:any)=>matches(o,s)&&confirmed(o)&&!o.separateVessel).reduce((n:number,o:any)=>n+Math.max(0,Number(o.quantity)||0),0);
   const pendingPax=orders.filter((o:any)=>matches(o,s)&&pending(o)).reduce((n:number,o:any)=>n+Math.max(0,Number(o.quantity)||0),0);
   const sharedBoatKey=sharedKey(s);
   if(sharedBoatKey){const g=groups[sharedBoatKey]||(groups[sharedBoatKey]={capacity:s.capacity,confirmedPax:0,pendingPax:0,scheduleIds:[]});g.capacity=Math.min(g.capacity,s.capacity);g.confirmedPax+=confirmedPax;g.pendingPax+=pendingPax;g.scheduleIds.push(s.id);}
   return {id:s.id,date:s.date,time:s.time,endTime:s.endTime||'',name:s.name,status:s.status,isPast:excursionDeparturePassed(s.date,s.time),capacity:s.capacity,notes:s.notes||'',priceCents:priceForSchedule(s),sharedBoatKey,confirmedPax,pendingPax,ownBooking:own?{id:own.id,quantity:own.quantity,status:own.approvalStatus==='Approved'?'Confirmed':own.approvalStatus||own.status,createdAt:own.createdAt}:null};
  });
  const enriched=schedules.map((s:any)=>{const g=s.sharedBoatKey?groups[s.sharedBoatKey]:null;const capacity=g?.capacity??s.capacity,confirmedPax=g?.confirmedPax??s.confirmedPax,pendingPax=g?.pendingPax??s.pendingPax;return {...s,capacity,confirmedPax,pendingPax,remainingSeats:Math.max(0,capacity-confirmedPax),isFull:confirmedPax>=capacity,sharedBoat:!!g&&g.scheduleIds.length>1};});
  const myBookings=orders.filter((o:any)=>o.accountId===user.userId&&o.kind==='excursion'&&(o.status!=='Cancelled'||o.scheduleCancelled===true)&&o.approvalStatus!=='Declined'&&(o.approvalStatus!=='Cancelled'||o.scheduleCancelled===true)).map((o:any)=>{
   const bookingStay=(state.stays||[]).find((s:any)=>s.id===o.stayId),bookingProfile=!bookingStay?walkInExcursionProfile(state,o.accountId):undefined,isWalkIn=!!bookingProfile;
   return {id:o.id,stayId:o.stayId||('walkin:'+o.accountId),menuItemId:o.menuItemId||'',name:o.name,quantity:o.quantity,adults:Number(o.adults??o.quantity)||0,children:Number(o.children)||0,infants:Number(o.infants)||0,guestNames:Array.isArray(o.excursionGuestRoster)?o.excursionGuestRoster.map((person:any)=>String(person?.name||'').trim()):Array.isArray(o.guestNames)?o.guestNames:[],footSizes:Array.isArray(o.footSizes)?o.footSizes:[],date:o.date,time:o.time||o.schedule?.time||'',endTime:o.endTime||o.schedule?.endTime||'',returnTime:o.returnTime||o.schedule?.returnTime||'',status:o.approvalStatus==='Approved'?'Confirmed':o.approvalStatus||o.status,cents:Number(o.cents)||0,room:o.room||bookingProfile?.room||'',vessel:o.schedule?.vessel||'',separateVessel:!!o.separateVessel,privateBoatRequested:!!o.privateBoatRequested,privateBoatSurchargeCents:Number(o.privateBoatSurchargeCents)||0,serviceType:o.serviceType||'',cancellationReason:o.cancellationReason||'',scheduleCancelled:!!o.scheduleCancelled,buggyRoundTrip:!!o.buggyRoundTrip,packageGroupId:o.packageGroupId||'',packageName:o.packageName||'',packagePart:Number(o.packagePart)||0,packageParts:Number(o.packageParts)||0,buggyRequested:isWalkIn?!!o.buggyRequested:true,isWalkIn,canCancel:!['Departed','Completed','Cancelled'].includes(o.status),canChangeDate:!['Departed','Completed','Cancelled'].includes(o.status),checkIn:bookingStay?.checkIn||islandToday(),checkOut:bookingStay?.checkOut||String(bookingProfile?.expiresAt||'').slice(0,10),buggyArrivedAt:o.buggyArrivedAt||'',buggyArrivedBy:o.buggyArrivedBy||'',buggyBoardedAt:o.buggyBoardedAt||'',buggyBoardedBy:o.buggyBoardedBy||'',buggyDinnerDropoffAt:o.buggyDinnerDropoffAt||'',buggyReturnArrivedAt:o.buggyReturnArrivedAt||'',buggyReturnBoardedAt:o.buggyReturnBoardedAt||'',buggyReturnCompleteAt:o.buggyReturnCompleteAt||'',createdAt:o.createdAt};
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
  const mix=excursionGuestMix(b,Number(b.quantity)||1,20),quantity=mix.total,buggyRequestedInput=b.buggyRequested===true,privateBoatRequested=quantity>=4&&b.privateBoatRequested===true,notes=String(b.notes||'').trim().slice(0,1000);let footSizes:number[]=[],guestNames:string[]=[];
  if((!scheduleId&&!menuItemId)||!validDate(date)||!stayId||!/^[-a-zA-Z0-9]{12,80}$/.test(token))throw Error('Check the excursion, date, room and number of guests.');
  const {state,revision}=await loadStays();
  const old=(state.orders||[]).find((o:any)=>o.token===token&&o.accountId===user.userId);
  if(old)return Response.json({booking:{id:old.id,status:old.approvalStatus==='Approved'?'Confirmed':old.approvalStatus||old.status,requiresApproval:old.approvalStatus==='Pending',requiresScheduling:!old.scheduleId}});
  const stay=(state.stays||[]).find((s:any)=>s.id===stayId&&s.accountId===user.userId&&s.status==='In House');
  const walkIn=walkInExcursionProfile(state,user.userId),isWalkIn=!stay&&walkIn?.active===true&&(stayId==='walkin'||stayId==='walkin:'+user.userId);
  if(!stay&&!isWalkIn)throw Error('This excursion account is not available for booking.');
  const guest=stay?.guest||walkIn?.name||user.displayName,room=stay?.room||'',phone=stay?.whatsapp||walkIn?.phone||'',hotel=stay?'Nirili Villa':walkIn?.hotel||'',externalRoom=stay?'':walkIn?.room||'',orderStayId=stay?.id||'';
  const buggyRequested=isWalkIn?buggyRequestedInput:true;
  if(date<islandToday())throw Error('Excursion bookings cannot be created for a past date.');
  if(stay&&date<islandToday())throw Error('Choose today or a future excursion date.');
  if(isWalkIn){const expiryDate=String(walkIn?.expiresAt||'').slice(0,10);if(date<islandToday()||(expiryDate&&date>=expiryDate))throw Error('Choose a valid excursion date while your temporary login is active.');}

  if(menuItemId&&!scheduleId){
   const menu=await loadExcursionMenu();
   const item=menu.find((x:any)=>x.id===menuItemId&&x.kind==='excursion');
   if(!item)throw Error('This excursion is no longer available in the menu.');
   if(isRomanticBeachDinner(item)){
    const unitPriceCents=Math.max(0,Number(item.cents)||0),pricingUnit=item.pricingUnit==='couple'?'couple':'guest';
    const quotedCents=excursionPriceCents(unitPriceCents,pricingUnit,mix),id='EXC-'+crypto.randomUUID().slice(0,8).toUpperCase(),createdAt=new Date().toISOString();
    state.orders??=[];
    state.orders.push({
     id,token,accountId:user.userId,stayId:orderStayId,guest,room,phone,hotel,externalRoom,kind:'excursion',menuItemId:item.id,name:item.name,
     quantity,adults:mix.adults,children:mix.children,infants:mix.infants,pricingUnit,buggyRequested,buggyRoundTrip:buggyRequested,
     cents:0,quotedCents,unitPriceCents,notes,date,time:'',serviceType:ROMANTIC_BEACH_DINNER_SERVICE,serviceRequest:true,
     status:'Awaiting confirmation',approvalStatus:'Pending',seatRequest:false,unscheduledRequest:true,autoConfirmed:false,guestNotified:false,
     createdAt,source:isWalkIn?'Walk-in romantic dinner':'Guest romantic dinner'
    });
    const saved=await saveStayAccess(state,revision,user.userId);
    if(!saved)return Response.json({error:'Another booking was saved at the same time. Please try again.'},{status:409});
    return Response.json({booking:{id,status:'Pending',requiresApproval:true,requiresScheduling:false,serviceRequest:true,romanticDinner:true,chargedCents:0}},{status:201});
   }
   if(item.id===SPECIAL_PACKAGE_ID){
    guestNames=cleanGuestNames(b.guestNames,quantity,guest);
    footSizes=cleanFootSizes(b.footSizes,quantity,true);
    const dates=Array.isArray(b.packageDates)?b.packageDates.map((value:any)=>String(value||'')):[date,date,date];
    if(dates.length!==3||dates.some((value:string)=>!validDate(value)))throw Error('Choose a valid date for all three special package trips.');
    for(const value of dates){
     if(stay&&value<islandToday())throw Error('Choose today or a future date for every package trip.');
     if(isWalkIn){const expiryDate=String(walkIn?.expiresAt||'').slice(0,10);if(value<islandToday()||(expiryDate&&value>=expiryDate))throw Error('Choose package trip dates while your temporary login is active.');}
    }
    const pricingUnit=item.pricingUnit==='couple'?'couple':'guest',unitPriceCents=Math.max(0,Number(item.cents)||0);
    const packageTotalCents=excursionPriceCents(unitPriceCents,pricingUnit,mix);
    const packageGroupId='PKG-'+crypto.randomUUID().slice(0,8).toUpperCase(),createdAt=new Date().toISOString();
    const operationalPrices=specialPackageSegments.map(spec=>Math.max(0,Number(menu.find((x:any)=>x.id===spec.priceMenuId)?.cents)||0));
    const operationalTotal=operationalPrices.reduce((sum,value)=>sum+value,0)||specialPackageSegments.length;
    let allocatedSoFar=0;
    state.orders??=[];
    const orders=state.orders;
    const resources=excursionResources(state);
    const results:any[]=[];
    for(let index=0;index<specialPackageSegments.length;index++){
     const spec=specialPackageSegments[index],segmentDate=dates[index];
     await ensureStandardDailyExcursions(segmentDate);
     const allSchedules=(await schedulesForDate(segmentDate)).filter((s:any)=>s.status==='Open'&&!excursionDeparturePassed(s.date,s.time));
     const candidates=allSchedules
      .filter((s:any)=>scheduleCanServe(spec.matchName,s.name))
      .map((s:any)=>({schedule:s,...candidateLoad(s,allSchedules,orders),rank:scheduleRank(spec.matchName,s)}))
      .sort((a:any,b:any)=>(a.remaining>=quantity?0:1)-(b.remaining>=quantity?0:1)||a.rank-b.rank||b.remaining-a.remaining||String(a.schedule.time).localeCompare(String(b.schedule.time)));
     const chosen=candidates[0],id='EXC-'+crypto.randomUUID().slice(0,8).toUpperCase();
     const operationalPriceCents=operationalPrices[index]||0;
     const quotedCents=index===specialPackageSegments.length-1?packageTotalCents-allocatedSoFar:Math.round(packageTotalCents*(operationalPriceCents||1)/operationalTotal);
     allocatedSoFar+=quotedCents;
     const segmentUnitCents=quantity>0?Math.round(quotedCents/quantity):0;
     const common={id,token,accountId:user.userId,stayId:orderStayId,guest,room,phone,hotel,externalRoom,kind:'excursion',menuItemId:item.id,name:spec.name,quantity,adults:mix.adults,children:mix.children,infants:mix.infants,guestNames,excursionGuestRoster:makeGuestRoster(id,guestNames),footSizes:isSnorkelingTrip(spec.name)?footSizes:[],pricingUnit,buggyRequested,quotedCents,unitPriceCents:segmentUnitCents,operationalPriceCents,notes,date:segmentDate,packageGroupId,packageName:item.name,packagePart:index+1,packageParts:3,packageTotalCents,packageSegmentName:spec.name,specialPackage:true,createdAt,source:isWalkIn?'Walk-in special package':'Guest special package'};
     if(chosen){
      const schedule=chosen.schedule,requiresApproval=chosen.confirmedPax+quantity>chosen.capacity;
      const vessel=resources.vessels.find((v:any)=>v.id===schedule.vesselId),crew=resources.crew.filter((c:any)=>schedule.crewIds?.includes(c.id));
      orders.push({...common,cents:requiresApproval?0:quotedCents,time:schedule.time,endTime:schedule.endTime||'',scheduleId:schedule.id,seatRequest:requiresApproval,approvalStatus:requiresApproval?'Pending':'Approved',status:requiresApproval?'Awaiting scheduling':'Scheduled',requestedOverCapacity:requiresApproval,autoConfirmed:!requiresApproval,matchedFromMenu:true,matchedScheduleName:schedule.name,schedule:requiresApproval?undefined:{date:schedule.date,time:schedule.time,endTime:schedule.endTime||'',...(schedule.returnTime?{returnTime:schedule.returnTime}:{}),vesselId:schedule.vesselId,vessel:vessel?.name||'',crewIds:schedule.crewIds||[],crew:crew.map((c:any)=>c.name)},guestNotified:requiresApproval?undefined:false});
      results.push({id,name:spec.name,date:segmentDate,time:schedule.time,status:requiresApproval?'Pending':'Confirmed',requiresApproval,matchedScheduleId:schedule.id,matchedScheduleName:schedule.name});
     }else{
      orders.push({...common,cents:0,time:'',status:'Awaiting scheduling',approvalStatus:'Pending',seatRequest:true,unscheduledRequest:true,autoConfirmed:false,guestNotified:false});
      results.push({id,name:spec.name,date:segmentDate,time:'',status:'Pending',requiresApproval:true,requiresScheduling:true,noMatchingSchedule:true});
     }
    }
    const saved=await saveStayAccess(state,revision,user.userId);
    if(!saved)return Response.json({error:'Another booking was saved at the same time. Please try again.'},{status:409});
    const confirmedCount=results.filter(x=>x.status==='Confirmed').length,pendingCount=results.length-confirmedCount;
    return Response.json({package:{id:packageGroupId,name:item.name,totalCents:packageTotalCents,confirmedCount,pendingCount,segments:results},booking:{id:packageGroupId,status:pendingCount?'Partially confirmed':'Confirmed',requiresApproval:pendingCount>0}},{status:201});
   }
   guestNames=cleanGuestNames(b.guestNames,quantity,guest);
   footSizes=cleanFootSizes(b.footSizes,quantity,isSnorkelingTrip(item.name));
   await ensureStandardDailyExcursions(date);
   const allSchedules=(await schedulesForDate(date)).filter((s:any)=>s.status==='Open'&&!excursionDeparturePassed(s.date,s.time));
   const orders=Array.isArray(state.orders)?state.orders:[];
   const candidates=allSchedules
    .filter((s:any)=>scheduleCanServe(item.name,s.name))
    .map((s:any)=>({schedule:s,...candidateLoad(s,allSchedules,orders),rank:scheduleRank(item.name,s)}))
    .sort((a:any,b:any)=>(a.remaining>=quantity?0:1)-(b.remaining>=quantity?0:1)||a.rank-b.rank||b.remaining-a.remaining||String(a.schedule.time).localeCompare(String(b.schedule.time)));

   const chosen=candidates[0],fallback=suggestedTripWindow(item.name);
   const unitPriceCents=Math.max(0,Number(item.cents)||0),pricingUnit=item.pricingUnit==='couple'?'couple':'guest';
   const baseQuotedCents=excursionPriceCents(unitPriceCents,pricingUnit,mix),privateBoatSurchargeCents=privateBoatRequested?PRIVATE_BOAT_SURCHARGE_CENTS:0,quotedCents=baseQuotedCents+privateBoatSurchargeCents,id='EXC-'+crypto.randomUUID().slice(0,8).toUpperCase();
   state.orders??=[];

   if(privateBoatRequested){
    const suggestedTime=chosen?.schedule.time||fallback.time,suggestedEndTime=chosen?.schedule.endTime||fallback.endTime;
    state.orders.push({
     id,token,accountId:user.userId,stayId:orderStayId,guest,room,phone,hotel,externalRoom,kind:'excursion',menuItemId:item.id,name:item.name,quantity,adults:mix.adults,children:mix.children,infants:mix.infants,guestNames,excursionGuestRoster:makeGuestRoster(id,guestNames),footSizes,pricingUnit,buggyRequested,
     cents:0,quotedCents,baseQuotedCents,unitPriceCents,privateBoatRequested:true,privateBoatSurchargeCents,notes,date,time:'',preferredTime:suggestedTime,preferredEndTime:suggestedEndTime,
     preferredScheduleId:chosen?.schedule.id||'',matchedScheduleName:chosen?.schedule.name||'',seatRequest:false,unscheduledRequest:true,approvalStatus:'Pending',status:'Awaiting scheduling',
     requestedOverCapacity:false,autoConfirmed:false,guestNotified:false,createdAt:new Date().toISOString(),source:isWalkIn?'Walk-in private boat':'Guest private boat'
    });
    const saved=await saveStayAccess(state,revision,user.userId);
    if(!saved)return Response.json({error:'Another booking was saved at the same time. Please try again.'},{status:409});
    return Response.json({booking:{id,status:'Pending',requiresApproval:true,requiresScheduling:true,privateBoatRequested:true,privateBoatSurchargeCents,chargedCents:0,suggestedTime,suggestedEndTime}},{status:201});
   }

   if(chosen){
    const schedule=chosen.schedule,requiresApproval=chosen.confirmedPax+quantity>chosen.capacity;
    const resources=excursionResources(state),vessel=resources.vessels.find((v:any)=>v.id===schedule.vesselId),crew=resources.crew.filter((c:any)=>schedule.crewIds?.includes(c.id));
    state.orders.push({
     id,token,accountId:user.userId,stayId:orderStayId,guest,room,phone,hotel,externalRoom,kind:'excursion',menuItemId:item.id,name:item.name,quantity,adults:mix.adults,children:mix.children,infants:mix.infants,guestNames,excursionGuestRoster:makeGuestRoster(id,guestNames),footSizes,pricingUnit,buggyRequested,
     cents:requiresApproval?0:quotedCents,quotedCents,baseQuotedCents,unitPriceCents,privateBoatRequested:false,privateBoatSurchargeCents:0,notes,date,time:schedule.time,endTime:schedule.endTime||'',returnTime:schedule.returnTime||'',scheduleId:schedule.id,
     seatRequest:requiresApproval,approvalStatus:requiresApproval?'Pending':'Approved',status:requiresApproval?'Awaiting scheduling':'Scheduled',
     requestedOverCapacity:requiresApproval,autoConfirmed:!requiresApproval,matchedFromMenu:true,matchedScheduleName:schedule.name,
     schedule:requiresApproval?undefined:{date:schedule.date,time:schedule.time,endTime:schedule.endTime||'',...(schedule.returnTime?{returnTime:schedule.returnTime}:{}),vesselId:schedule.vesselId,vessel:vessel?.name||'',crewIds:schedule.crewIds||[],crew:crew.map((c:any)=>c.name)},
     guestNotified:requiresApproval?undefined:false,createdAt:new Date().toISOString(),source:isWalkIn?'Walk-in portal':'Guest menu'
    });
    const saved=await saveStayAccess(state,revision,user.userId);
    if(!saved)return Response.json({error:'Another booking was saved at the same time. Please try again.'},{status:409});
    return Response.json({booking:{id,status:requiresApproval?'Pending':'Confirmed',requiresApproval,requiresScheduling:false,matchedScheduleId:schedule.id,matchedScheduleName:schedule.name,time:schedule.time,endTime:schedule.endTime||'',remainingBefore:chosen.remaining,chargedCents:requiresApproval?0:quotedCents}},{status:201});
   }

   state.orders.push({id,token,accountId:user.userId,stayId:orderStayId,guest,room,phone,hotel,externalRoom,kind:'excursion',menuItemId:item.id,name:item.name,quantity,adults:mix.adults,children:mix.children,infants:mix.infants,guestNames,excursionGuestRoster:makeGuestRoster(id,guestNames),footSizes,pricingUnit,buggyRequested,cents:0,quotedCents,baseQuotedCents,unitPriceCents,privateBoatRequested:false,privateBoatSurchargeCents:0,notes,date,time:'',preferredTime:fallback.time,preferredEndTime:fallback.endTime,status:'Awaiting scheduling',approvalStatus:'Pending',seatRequest:true,unscheduledRequest:true,autoConfirmed:false,guestNotified:false,createdAt:new Date().toISOString(),source:isWalkIn?'Walk-in portal':'Guest menu'});
   const saved=await saveStayAccess(state,revision,user.userId);
   if(!saved)return Response.json({error:'Another booking was saved at the same time. Please try again.'},{status:409});
   return Response.json({booking:{id,status:'Pending',requiresApproval:true,requiresScheduling:true,noMatchingSchedule:true,chargedCents:0,suggestedTime:fallback.time,suggestedEndTime:fallback.endTime}},{status:201});
  }

  const row=await authDb().prepare('SELECT payload FROM operation_records WHERE key=?').bind(prefix+date+':'+scheduleId).first<any>();
  if(!row)throw Error('This excursion is no longer scheduled.');
  const schedule=JSON.parse(row.payload);
  guestNames=cleanGuestNames(b.guestNames,quantity,guest);
  footSizes=cleanFootSizes(b.footSizes,quantity,isSnorkelingTrip(schedule.name));
  if(schedule.status!=='Open')throw Error('This excursion is closed for bookings.');
  if(excursionDeparturePassed(schedule.date,schedule.time))throw Error('This excursion departure time has already passed. Choose a future excursion.');
  const allSchedules=await schedulesForDate(date);
  const key=sharedKey(schedule);
  const groupSchedules=key?allSchedules.filter((s:any)=>sharedKey(s)===key):[schedule];
  const groupIds=new Set(groupSchedules.map((s:any)=>s.id));
  const capacity=Math.min(...groupSchedules.map((s:any)=>Number(s.capacity)||1));
  const confirmedPax=(state.orders||[]).filter((o:any)=>o.kind==='excursion'&&!o.separateVessel&&o.status!=='Cancelled'&&o.approvalStatus!=='Pending'&&o.approvalStatus!=='Declined'&&o.approvalStatus!=='Cancelled'&&(groupIds.has(o.scheduleId)||groupSchedules.some((s:any)=>matches(o,s)))).reduce((n:number,o:any)=>n+Math.max(0,Number(o.quantity)||0),0);
  const requiresApproval=confirmedPax+quantity>capacity;
  const unitPriceCents=priceForSchedule(schedule),baseQuotedCents=excursionPriceCents(unitPriceCents,'guest',mix),privateBoatSurchargeCents=privateBoatRequested?PRIVATE_BOAT_SURCHARGE_CENTS:0,quotedCents=baseQuotedCents+privateBoatSurchargeCents;
  const id='EXC-'+crypto.randomUUID().slice(0,8).toUpperCase();
  const resources=excursionResources(state),vessel=resources.vessels.find((v:any)=>v.id===schedule.vesselId),crew=resources.crew.filter((c:any)=>schedule.crewIds?.includes(c.id));
  state.orders??=[];

  if(privateBoatRequested){
   state.orders.push({
    id,token,accountId:user.userId,stayId:orderStayId,guest,room,phone,hotel,externalRoom,kind:'excursion',name:schedule.name,quantity,adults:mix.adults,children:mix.children,infants:mix.infants,guestNames,excursionGuestRoster:makeGuestRoster(id,guestNames),footSizes,buggyRequested,
    cents:0,quotedCents,baseQuotedCents,unitPriceCents,privateBoatRequested:true,privateBoatSurchargeCents,notes,date,time:'',preferredTime:schedule.time,preferredEndTime:schedule.endTime||'',preferredScheduleId:schedule.id,
    seatRequest:false,unscheduledRequest:true,approvalStatus:'Pending',status:'Awaiting scheduling',requestedOverCapacity:false,autoConfirmed:false,guestNotified:false,
    createdAt:new Date().toISOString(),source:isWalkIn?'Walk-in private boat':'Guest private boat'
   });
   const saved=await saveStayAccess(state,revision,user.userId);
   if(!saved)return Response.json({error:'Another booking was saved at the same time. Please try again.'},{status:409});
   return Response.json({booking:{id,status:'Pending',requiresApproval:true,requiresScheduling:true,privateBoatRequested:true,privateBoatSurchargeCents,chargedCents:0,suggestedTime:schedule.time,suggestedEndTime:schedule.endTime||''}},{status:201});
  }

  state.orders.push({
   id,token,accountId:user.userId,stayId:orderStayId,guest,room,phone,hotel,externalRoom,kind:'excursion',name:schedule.name,quantity,adults:mix.adults,children:mix.children,infants:mix.infants,guestNames,excursionGuestRoster:makeGuestRoster(id,guestNames),footSizes,buggyRequested,
   cents:requiresApproval?0:quotedCents,quotedCents,baseQuotedCents,unitPriceCents,privateBoatRequested:false,privateBoatSurchargeCents:0,notes,date,time:schedule.time,endTime:schedule.endTime||'',returnTime:schedule.returnTime||'',scheduleId:schedule.id,
   seatRequest:requiresApproval,approvalStatus:requiresApproval?'Pending':'Approved',status:requiresApproval?'Awaiting scheduling':'Scheduled',requestedOverCapacity:requiresApproval,autoConfirmed:!requiresApproval,
   schedule:requiresApproval?undefined:{date:schedule.date,time:schedule.time,endTime:schedule.endTime||'',...(schedule.returnTime?{returnTime:schedule.returnTime}:{}),vesselId:schedule.vesselId,vessel:vessel?.name||'',crewIds:schedule.crewIds||[],crew:crew.map((c:any)=>c.name)},
   guestNotified:requiresApproval?undefined:false,createdAt:new Date().toISOString(),source:isWalkIn?'Walk-in portal':'Guest schedule'
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
  if(!bookingId||!validDate(newDate))throw Error('Choose a valid excursion date.');
  const {state,revision}=await loadStays();
  const order=(state.orders||[]).find((o:any)=>o.id===bookingId&&o.kind==='excursion'&&o.accountId===user.userId);
  if(!order)throw Error('Excursion booking not found.');
  if(['Departed','Completed','Cancelled'].includes(order.status)||order.approvalStatus==='Cancelled')throw Error('This excursion booking can no longer be edited online.');

  const stay=(state.stays||[]).find((s:any)=>s.id===order.stayId&&s.accountId===user.userId&&s.status==='In House'),
    walkIn=walkInExcursionProfile(state,user.userId),isWalkIn=!stay&&walkIn?.active===true;
  if(!stay&&!isWalkIn)throw Error('This excursion account is not available for changes.');
  if(stay&&Number(order.cents)>0&&stay.paidBills?.['Excursions:'+order.id]===Number(order.cents))throw Error('This excursion has already been paid. Please contact reception to edit the booking.');
  if(isWalkIn&&walkInExcursionOrderPaid(order)&&Number(order.cents)>0)throw Error('This excursion has already been paid. Please contact reception to edit the booking.');

  if(stay&&newDate<islandToday())throw Error('Choose today or a future excursion date.');
  if(isWalkIn){const expiryDate=String(walkIn?.expiresAt||'').slice(0,10);if(newDate<islandToday()||(expiryDate&&newDate>=expiryDate))throw Error('Choose a valid excursion date while your temporary login is active.');}

  const mix=excursionGuestMix(b,Number(order.quantity)||1,20),quantity=mix.total;
  const guestNames=cleanGuestNames(b.guestNames,quantity,order.guest||'');
  const footSizes=cleanFootSizes(b.footSizes,quantity,isSnorkelingTrip(order.name));
  const buggyRequested=isWalkIn?b.buggyRequested===true:true,privateBoatRequested=quantity>=4&&b.privateBoatRequested===true;
  const oldMix={adults:Number(order.adults??order.quantity)||0,children:Number(order.children)||0,infants:Number(order.infants)||0,total:Number(order.quantity)||0};
  const unchanged=newDate===order.date&&quantity===oldMix.total&&mix.adults===oldMix.adults&&mix.children===oldMix.children&&mix.infants===oldMix.infants&&JSON.stringify(guestNames)===JSON.stringify(Array.isArray(order.excursionGuestRoster)?order.excursionGuestRoster.map((person:any)=>String(person?.name||'').trim()):Array.isArray(order.guestNames)?order.guestNames:[])&&JSON.stringify(footSizes)===JSON.stringify(Array.isArray(order.footSizes)?order.footSizes:[])&&buggyRequested===!!order.buggyRequested&&privateBoatRequested===!!order.privateBoatRequested;
  if(unchanged)return Response.json({ok:true,status:order.approvalStatus==='Approved'?'Confirmed':order.approvalStatus||order.status,date:order.date,time:order.time||order.schedule?.time||'',unchanged:true});

  const pricingUnit=order.pricingUnit==='couple'?'couple':'guest';
  const unitPriceCents=Math.max(0,Number(order.unitPriceCents)||0);
  const baseQuotedCents=excursionPriceCents(unitPriceCents,pricingUnit,mix),privateBoatSurchargeCents=privateBoatRequested?PRIVATE_BOAT_SURCHARGE_CENTS:0,quotedCents=baseQuotedCents+privateBoatSurchargeCents;
  const changedAt=new Date().toISOString(),previous={date:order.date||'',time:order.time||order.schedule?.time||'',scheduleId:order.scheduleId||'',quantity:oldMix.total,adults:oldMix.adults,children:oldMix.children,infants:oldMix.infants,at:changedAt};

  order.quantity=quantity;order.adults=mix.adults;order.children=mix.children;order.infants=mix.infants;order.guestNames=guestNames;order.excursionGuestRoster=makeGuestRoster(order.id,guestNames);order.footSizes=footSizes;
  order.buggyRequested=buggyRequested;order.privateBoatRequested=privateBoatRequested;order.privateBoatSurchargeCents=privateBoatSurchargeCents;order.baseQuotedCents=baseQuotedCents;order.quotedCents=quotedCents;
  order.dateChangeHistory=[...(order.dateChangeHistory||[]),previous];
  order.dateChangedAt=changedAt;order.dateChangedBy='guest';

  if(isRomanticBeachDinner(order)){
   order.date=newDate;order.time='';order.approvalStatus='Pending';order.status='Awaiting confirmation';order.cents=0;
   order.unscheduledRequest=true;order.serviceRequest=true;order.seatRequest=false;order.autoConfirmed=false;
   order.serviceType=ROMANTIC_BEACH_DINNER_SERVICE;order.buggyRoundTrip=buggyRequested;order.guestNotified=false;
   delete order.scheduleId;delete order.schedule;delete order.vesselId;delete order.crewIds;delete order.guideIds;
   delete order.buggyArrivedAt;delete order.buggyBoardedAt;delete order.buggyDinnerDropoffAt;delete order.buggyReturnArrivedAt;delete order.buggyReturnBoardedAt;delete order.buggyReturnCompleteAt;
   const saved=await saveStayAccess(state,revision,user.userId);
   if(!saved)return Response.json({error:'Another update was saved at the same time. Please try again.'},{status:409});
   return Response.json({ok:true,date:newDate,time:'',quantity,adults:mix.adults,children:mix.children,infants:mix.infants,status:'Pending',requiresApproval:true,serviceRequest:true,romanticDinner:true});
  }

  await ensureStandardDailyExcursions(newDate);
  const allSchedules=(await schedulesForDate(newDate)).filter((s:any)=>s.status==='Open'&&!excursionDeparturePassed(s.date,s.time));
  const menu=await loadExcursionMenu();
  const menuItem=order.menuItemId?menu.find((x:any)=>x.id===order.menuItemId&&x.kind==='excursion'):undefined;
  const requestedName=menuItem?.name||order.name;
  const availabilityOrders=(state.orders||[]).filter((o:any)=>o.id!==order.id);
  const candidates=allSchedules
   .filter((s:any)=>scheduleCanServe(requestedName,s.name))
   .map((s:any)=>({schedule:s,...candidateLoad(s,allSchedules,availabilityOrders),rank:scheduleRank(requestedName,s)}))
   .sort((a:any,b:any)=>(a.remaining>=quantity?0:1)-(b.remaining>=quantity?0:1)||a.rank-b.rank||b.remaining-a.remaining||String(a.schedule.time).localeCompare(String(b.schedule.time)));

  const chosen=candidates[0],resources=excursionResources(state),fallback=suggestedTripWindow(requestedName);
  order.date=newDate;order.separateVessel=false;
  delete order.overflowVesselId;delete order.originalScheduleId;

  if(privateBoatRequested){
   order.time='';order.endTime='';order.returnTime='';delete order.scheduleId;delete order.schedule;
   order.preferredTime=chosen?.schedule.time||fallback.time;order.preferredEndTime=chosen?.schedule.endTime||fallback.endTime;order.preferredScheduleId=chosen?.schedule.id||'';
   order.seatRequest=false;order.unscheduledRequest=true;order.requestedOverCapacity=false;
   order.approvalStatus='Pending';order.status='Awaiting scheduling';order.autoConfirmed=false;order.cents=0;order.guestNotified=false;
   order.matchedScheduleName=chosen?.schedule.name||'';
  }else if(chosen){
   const schedule=chosen.schedule,requiresApproval=chosen.confirmedPax+quantity>chosen.capacity;
   const vessel=resources.vessels.find((v:any)=>v.id===schedule.vesselId),crew=resources.crew.filter((c:any)=>schedule.crewIds?.includes(c.id));
   order.time=schedule.time;order.endTime=schedule.endTime||'';order.returnTime=schedule.returnTime||'';order.scheduleId=schedule.id;
   delete order.preferredTime;delete order.preferredEndTime;delete order.preferredScheduleId;
   order.matchedFromMenu=true;order.matchedScheduleName=schedule.name;
   order.seatRequest=requiresApproval;order.unscheduledRequest=false;order.requestedOverCapacity=requiresApproval;
   order.approvalStatus=requiresApproval?'Pending':'Approved';order.status=requiresApproval?'Awaiting scheduling':'Scheduled';order.autoConfirmed=!requiresApproval;
   order.cents=requiresApproval?0:quotedCents;
   order.schedule=requiresApproval?undefined:{date:schedule.date,time:schedule.time,endTime:schedule.endTime||'',...(schedule.returnTime?{returnTime:schedule.returnTime}:{}),vesselId:schedule.vesselId,vessel:vessel?.name||'',crewIds:schedule.crewIds||[],crew:crew.map((c:any)=>c.name)};
   order.guestNotified=requiresApproval?undefined:false;
   if(requiresApproval){delete order.guestNotifiedAt;delete order.guestNotifiedBy;}
  }else{
   order.time='';order.endTime='';order.returnTime='';delete order.scheduleId;delete order.schedule;
   order.preferredTime=fallback.time;order.preferredEndTime=fallback.endTime;delete order.preferredScheduleId;
   order.seatRequest=true;order.unscheduledRequest=true;order.requestedOverCapacity=false;
   order.approvalStatus='Pending';order.status='Awaiting scheduling';order.autoConfirmed=false;order.cents=0;order.guestNotified=undefined;
   delete order.matchedScheduleName;
  }

  const saved=await saveStayAccess(state,revision,user.userId);
  if(!saved)return Response.json({error:'Another update was saved at the same time. Please try again.'},{status:409});
  return Response.json({ok:true,date:newDate,time:order.time||'',quantity,adults:mix.adults,children:mix.children,infants:mix.infants,buggyRequested,privateBoatRequested,status:order.approvalStatus==='Approved'?'Confirmed':order.approvalStatus||order.status,requiresApproval:order.approvalStatus==='Pending',noMatchingSchedule:!chosen||privateBoatRequested});
 }catch(e){return Response.json({error:e instanceof Error?e.message:'Could not edit excursion booking.'},{status:400});}
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
