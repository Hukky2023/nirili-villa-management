import {authDb} from './auth';
import {loadStays} from './stays';
import {saveStayAccess} from './stay-login';
import {excursionDeparturePassed,islandToday,validDate} from './guest-catalog';
import {excursionResources} from './excursion-workflow';
import {ensureStandardDailyExcursions} from './excursion-default-schedule';
import {loadExcursionMenu} from './excursion-menu';
import {excursionPriceCents,excursionChildPolicyText} from './excursion-children';
import {isRomanticBeachDinner,ROMANTIC_BEACH_DINNER_SERVICE} from './excursion-services';
import {PRIVATE_BOAT_SURCHARGE_CENTS,isSnorkelingTrip,planSpecialPackageSchedules,scheduleCanServeRequest,scheduleMatchRank,specialPackageCoverage,suggestedTripWindow} from './excursion-operations';
import {createExcursionManageToken,excursionManageUrl} from './excursion-manage';
import {sendExternalExcursionBookedEmail,type ExcursionMail} from './excursion-email';
import {buildSpecialPackageOrders} from './special-package-booking';
import {emitAdminNotification} from './admin-notifications';

// One booking engine for every channel that books excursions on behalf of a guest who is not
// staying at Nirili: the public tours website and the partner Agent Portal. Capacity checks,
// auto-scheduling, Special Package planning and pricing stay identical across channels.
export type ExcursionBookingChannel={
 source:string;                 // stored on the order, e.g. 'External guest website' or 'Agent portal'
 createdBy:string;
 savedBy:string;                // updated_by tag for the save
 autoConfirm:boolean;           // place on a trip with free seats straight away, otherwise wait for staff
 guestContactRequired:boolean;  // the public site needs guest email + WhatsApp; agents are the contact
 guestEmail:boolean;            // email the lead guest a confirmation
 guestManageLink:boolean;       // give the guest a self-service manage link
 defaultPickup?:string;
 netPrice?:(publicCents:number)=>number;
 extra?:Record<string,any>;     // channel fields stored on every order
 notifyTitle:string;
 notifyPrefix:string;
 allow:(phone:string)=>Promise<boolean>;
};
export type ExcursionBookingResult={status:number;body:any};

const prefix='excursion-schedule:';
const phonePattern=/^\+[1-9]\d{7,14}$/;
const emailPattern=/^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const normal=(value:any)=>String(value||'').trim().replace(/\s+/g,' ').toLowerCase();

function safeText(value:any,max:number){return String(value||'').trim().replace(/\s+/g,' ').slice(0,max);}
function cleanPhone(value:any){return String(value||'').replace(/[\s()-]/g,'');}
function cleanGuestNames(value:any,quantity:number,lead:string){
 const input=Array.isArray(value)?value:[];
 const names=Array.from({length:quantity},(_,index)=>safeText(input[index]||(index===0?lead:''),100));
 if(names.some(name=>!name))throw Error('Enter the name of every guest before confirming the excursion.');
 return names;
}
function cleanGuestCategories(value:any,max=20){
 if(!Array.isArray(value)||value.length<1||value.length>max)throw Error('Choose an age category for every guest.');
 const categories=value.map((item:any)=>String(item||'').trim().toLowerCase());
 if(categories.some((category:string)=>!['adult','child','infant'].includes(category)))throw Error('Choose Adult (12+), Child (3–11), or Under 3 for every guest.');
 return categories;
}
function guestMixFromCategories(categories:string[]){
 return {
  adults:categories.filter(category=>category==='adult').length,
  children:categories.filter(category=>category==='child').length,
  infants:categories.filter(category=>category==='infant').length,
  total:categories.length
 };
}
function makeGuestRoster(orderId:string,names:string[],categories:string[]){
 return names.map((name,index)=>({id:orderId+':'+(index+1),slot:index+1,name,ageCategory:categories[index]||'',boarded:false,boardedAt:''}));
}
function cleanFootSizes(value:any,quantity:number,required:boolean){
 if(!required)return [];
 if(!Array.isArray(value)||value.length<quantity)throw Error('Enter the EU foot size for every guest so snorkeling fins can be prepared.');
 const sizes=value.slice(0,quantity).map((item:any)=>Number(item));
 if(sizes.length!==quantity||sizes.some((size:number)=>!Number.isInteger(size)||size<15||size>50))throw Error('Enter a valid EU foot size from 15 to 50 for every snorkeling guest.');
 return sizes;
}
function matches(order:any,schedule:any){
 if(order.kind!=='excursion'||order.status==='Cancelled'||order.approvalStatus==='Declined'||order.approvalStatus==='Cancelled')return false;
 if(order.scheduleId)return order.scheduleId===schedule.id&&(order.date||order.schedule?.date)===schedule.date;
 const stored=order.schedule||{};
 return (stored.date||order.date)===schedule.date&&stored.time===schedule.time&&(!schedule.vesselId||stored.vesselId===schedule.vesselId)&&normal(order.name)===normal(schedule.name);
}
const sharedKey=(schedule:any)=>schedule.sharedGroup?schedule.date+'|'+schedule.time+'|group:'+schedule.sharedGroup:schedule.vesselId?schedule.date+'|'+schedule.time+'|vessel:'+schedule.vesselId:'';
function candidateLoad(schedule:any,allSchedules:any[],orders:any[]){
 const key=sharedKey(schedule);
 const groupSchedules=key?allSchedules.filter((item:any)=>sharedKey(item)===key):[schedule];
 const groupIds=new Set(groupSchedules.map((item:any)=>item.id));
 const capacity=Math.min(...groupSchedules.map((item:any)=>Math.max(1,Number(item.capacity)||1)));
 const confirmedPax=orders.filter((order:any)=>order.kind==='excursion'&&!order.separateVessel&&order.status!=='Cancelled'&&order.approvalStatus!=='Pending'&&order.approvalStatus!=='Declined'&&order.approvalStatus!=='Cancelled'&&(groupIds.has(order.scheduleId)||groupSchedules.some((item:any)=>matches(order,item)))).reduce((sum:number,order:any)=>sum+Math.max(0,Number(order.quantity)||0),0);
 return {capacity,confirmedPax,remaining:Math.max(0,capacity-confirmedPax)};
}
const shiftDate=(date:string,days:number)=>new Date(Date.parse(date+'T00:00:00Z')+days*86400000).toISOString().slice(0,10);
async function schedulesForDate(date:string){
 const rows=await authDb().prepare('SELECT payload FROM operation_records WHERE key LIKE ?').bind(prefix+date+':%').all<any>();
 return (rows.results||[]).map((row:any)=>JSON.parse(row.payload)).sort((a:any,b:any)=>String(a.time).localeCompare(String(b.time))||String(a.name).localeCompare(String(b.name)));
}

export async function excursionBookingOptions(){
 const menu=await loadExcursionMenu();
  const items=menu.filter((item:any)=>item.kind==='excursion'&&item.active!==false).map((item:any)=>({
   id:item.id,
   name:item.name,
   detail:item.detail||'',
   longDetail:item.longDetail||'',
   youtubeUrl:item.youtubeUrl||'',
   galleryUrls:Array.isArray(item.galleryUrls)?item.galleryUrls.slice(0,10):[],
   cents:Math.max(0,Number(item.cents)||0),
   pricingUnit:item.pricingUnit==='couple'?'couple':'guest',
   category:item.category||'single',
   group:item.group||'Excursions',
   needsFootSizes:item.id==='special-package'||isSnorkelingTrip(item.scheduleName||item.name)
  }));
 return {today:islandToday(),items,childPolicy:excursionChildPolicyText(),privateBoatSurchargeCents:PRIVATE_BOAT_SURCHARGE_CENTS};
}

export async function createExcursionBooking(body:any,channel:ExcursionBookingChannel):Promise<ExcursionBookingResult>{
 try{
  const token=String(body.token||''),menuItemId=String(body.menuItemId||'').slice(0,100),date=String(body.date||'');
  const leadGuest=safeText(body.guest,100)||safeText(Array.isArray(body.guestNames)?body.guestNames[0]:'',100),phone=cleanPhone(body.phone),email=safeText(body.email,254).toLowerCase(),hotel=safeText(body.hotel,150)||safeText(channel.defaultPickup,150),externalRoom=safeText(body.externalRoom,50);
  const groupName=safeText(body.groupName,100),notes=safeText(body.notes,1000);
  if(!/^[a-f0-9-]{20,80}$/i.test(token))throw Error('Refresh the excursion page and try again.');
  if(!menuItemId||!validDate(date)||date<islandToday())throw Error('Choose an excursion and a valid date.');
  if(channel.guestContactRequired){
   if(!leadGuest||!phonePattern.test(phone)||!emailPattern.test(email)||!hotel)throw Error('Enter the lead guest name, email, WhatsApp number with country code, and hotel or pickup location.');
  }else if(!leadGuest||!hotel||(phone&&!phonePattern.test(phone))||(email&&!emailPattern.test(email)))throw Error('Enter the lead guest name and pickup location. Guest WhatsApp (with country code) and email are optional but must be valid if entered.');

  const guestCategories=cleanGuestCategories(body.guestCategories,20),mix=guestMixFromCategories(guestCategories);
  const guestNames=cleanGuestNames(body.guestNames,mix.total,leadGuest);
  const menu=await loadExcursionMenu();
  const item=menu.find((entry:any)=>entry.id===menuItemId&&entry.kind==='excursion'&&entry.active!==false);
  if(!item)throw Error('This excursion is no longer available.');
  const footSizes=cleanFootSizes(body.footSizes,mix.total,item.id==='special-package'||isSnorkelingTrip(item.scheduleName||item.name));
  const privateBoatRequested=mix.total>=4&&body.privateBoatRequested===true;
  const buggyRequested=body.buggyRequested===true;
  const pricingUnit=item.pricingUnit==='couple'?'couple':'guest';
  const unitPriceCents=Math.max(0,Number(item.cents)||0);
  const baseQuotedCents=excursionPriceCents(unitPriceCents,pricingUnit,mix);
  const privateBoatSurchargeCents=privateBoatRequested?PRIVATE_BOAT_SURCHARGE_CENTS:0;
  const publicQuotedCents=baseQuotedCents+privateBoatSurchargeCents;
  const quotedCents=channel.netPrice?Math.max(0,Math.round(channel.netPrice(publicQuotedCents))):publicQuotedCents;

  if(!await channel.allow(phone))throw Error('Too many excursion requests. Please contact Nirili Tours or try again later.');

  const {state,revision}=await loadStays();
  state.orders??=[];
  const duplicate=state.orders.find((order:any)=>order.kind==='excursion'&&order.token===token&&order.source===channel.source);
  if(duplicate){
   if(duplicate.packageGroupId){
    const siblings=state.orders.filter((order:any)=>order.kind==='excursion'&&order.packageGroupId===duplicate.packageGroupId).sort((a:any,b:any)=>String(a.date||'').localeCompare(String(b.date||''))||String(a.time||a.schedule?.time||'').localeCompare(String(b.time||b.schedule?.time||'')));
    const allConfirmed=siblings.length>0&&siblings.every((order:any)=>order.approvalStatus==='Approved'&&order.status!=='Cancelled');
    return {status:200,body:{ok:true,duplicate:true,booking:{id:duplicate.packageGroupId,status:allConfirmed?'Confirmed':'Pending',time:siblings[0]?.time||siblings[0]?.schedule?.time||'',date:siblings[0]?.date||duplicate.date,quotedCents:Number(duplicate.packageTotalCents)||siblings.reduce((sum:number,order:any)=>sum+Math.max(0,Number(order.quotedCents)||0),0),manageUrl:duplicate.manageToken?excursionManageUrl(duplicate.manageToken):'',packageSegments:siblings.map((order:any)=>({id:order.id,name:order.packageSegmentName||order.name,date:order.date,time:order.time||order.schedule?.time||'',endTime:order.endTime||order.schedule?.endTime||'',status:order.approvalStatus==='Approved'?'Confirmed':order.approvalStatus||order.status,matchedScheduleName:order.matchedScheduleName||order.schedule?.name||''}))}}};
   }
   return {status:200,body:{ok:true,duplicate:true,booking:{id:duplicate.id,status:duplicate.approvalStatus==='Approved'?'Confirmed':duplicate.approvalStatus||duplicate.status,time:duplicate.time||duplicate.schedule?.time||'',date:duplicate.date,quotedCents:Number(duplicate.quotedCents)||Number(duplicate.cents)||0,manageUrl:duplicate.manageToken?excursionManageUrl(duplicate.manageToken):''}}};
  }

  const id='EXC-'+crypto.randomUUID().slice(0,8).toUpperCase(),createdAt=new Date().toISOString(),manageToken=channel.guestManageLink?createExcursionManageToken():'',manageUrl=manageToken?excursionManageUrl(manageToken):'';
  const common={
   id,token,manageToken,guest:leadGuest,groupName,room:'',phone,email,hotel,externalRoom,pickupLocation:hotel,externalGuest:true,
   kind:'excursion',menuItemId:item.id,name:item.name,scheduleName:item.scheduleName||item.name,quantity:mix.total,adults:mix.adults,children:mix.children,infants:mix.infants,
   guestNames,guestCategories,excursionGuestRoster:makeGuestRoster(id,guestNames,guestCategories),footSizes,pricingUnit,buggyRequested,
   quotedCents,baseQuotedCents,unitPriceCents,privateBoatRequested,privateBoatSurchargeCents,notes,date,
   publicQuotedCents,createdAt,createdBy:channel.createdBy,...channel.extra,source:channel.source
  };
  const sendMail=async(mail:ExcursionMail)=>channel.guestEmail&&email?sendExternalExcursionBookedEmail(mail):{sent:false,error:'Not sent'};
  const notifyNew=async(reference:string,status:string,time='')=>{
   try{await emitAdminNotification({
    id:'excursion:new:'+reference,type:'excursion',title:channel.notifyTitle,
    detail:channel.notifyPrefix+leadGuest+' · '+item.name+' · '+date+(time?' '+time:'')+' · '+mix.total+' pax · '+status,
    ref:reference,url:'/home'
   });}catch{}
  };

  if(isRomanticBeachDinner(item)){
   state.orders.push({...common,cents:0,time:'',serviceType:ROMANTIC_BEACH_DINNER_SERVICE,serviceRequest:true,buggyRoundTrip:buggyRequested,status:'Awaiting confirmation',approvalStatus:'Pending',seatRequest:false,unscheduledRequest:true,autoConfirmed:false,guestNotified:false});
   const saved=await saveStayAccess(state,revision,channel.savedBy);
   if(!saved)return {status:409,body:{error:'Another booking was saved at the same time. Please submit again.'}};
   const emailResult=await sendMail({email,guest:leadGuest,reference:id,excursion:item.name,date,time:'',quantity:mix.total,quotedCents,hotel,manageToken,status:'Pending'});
   await notifyNew(id,'Pending');
   return {status:201,body:{ok:true,booking:{id,manageUrl:manageUrl,email:emailResult,status:'Pending',requiresApproval:true,requiresScheduling:false,date,quotedCents}}};
  }

  if(item.id==='special-package'&&privateBoatRequested){
   const packageBase={...common,privateBoatRequested:true,privateBoatSurchargeCents,source:channel.source};
   const built=buildSpecialPackageOrders({base:packageBase,totalCents:quotedCents,plan:null,resources:excursionResources(state),sourceDate:date,pendingPrivateBoat:true});
   state.orders.push(...built.orders);
   const saved=await saveStayAccess(state,revision,channel.savedBy);
   if(!saved)return {status:409,body:{error:'Another booking was saved at the same time. Please submit again.'}};
   const packageSegments=built.orders.map((order:any)=>({id:order.id,name:order.packageSegmentName,date:order.date,time:order.time||'',endTime:order.endTime||'',status:'Pending',matchedScheduleName:order.matchedScheduleName||''}));
   const emailResult=await sendMail({email,guest:leadGuest,reference:built.packageGroupId,excursion:item.name,date,time:'',quantity:mix.total,quotedCents,hotel,manageToken,status:'Pending',packageSegments});
   await notifyNew(built.packageGroupId,'Pending');
   return {status:201,body:{ok:true,booking:{id:built.packageGroupId,manageUrl:manageUrl,email:emailResult,status:'Pending',requiresApproval:true,requiresScheduling:true,date,quotedCents,privateBoatRequested:true,packageSegments}}};
  }

  // Private boats need a dedicated vessel/crew assignment.
  if(privateBoatRequested){
   const fallback=suggestedTripWindow(item.scheduleName||item.name);
   state.orders.push({...common,cents:0,time:'',preferredTime:fallback.time,preferredEndTime:fallback.endTime,status:'Awaiting scheduling',approvalStatus:'Pending',seatRequest:item.id!=='special-package',unscheduledRequest:true,autoConfirmed:false,guestNotified:false});
   const saved=await saveStayAccess(state,revision,channel.savedBy);
   if(!saved)return {status:409,body:{error:'Another booking was saved at the same time. Please submit again.'}};
   const emailResult=await sendMail({email,guest:leadGuest,reference:id,excursion:item.name,date,time:'',quantity:mix.total,quotedCents,hotel,manageToken,status:'Pending'});
   await notifyNew(id,'Pending');
   return {status:201,body:{ok:true,booking:{id,manageUrl:manageUrl,email:emailResult,status:'Pending',requiresApproval:true,requiresScheduling:true,date,quotedCents,privateBoatRequested}}};
  }

  if(item.id==='special-package'){
   const packageCandidates:any[]=[];
   for(let offset=0;offset<7;offset++){
    const candidateDate=shiftDate(date,offset);
    await ensureStandardDailyExcursions(candidateDate);
    const daySchedules=(await schedulesForDate(candidateDate)).filter((schedule:any)=>schedule.status==='Open'&&!excursionDeparturePassed(schedule.date,schedule.time));
    for(const schedule of daySchedules){
     if(normal(schedule.name)==='special package')continue;
     if(!specialPackageCoverage(schedule.name).length)continue;
     const load=candidateLoad(schedule,daySchedules,state.orders);
     if(load.remaining<mix.total)continue;
     packageCandidates.push({...schedule,date:candidateDate,endTime:schedule.endTime||suggestedTripWindow(schedule.name).endTime,remaining:load.remaining});
    }
   }
   const plan=channel.autoConfirm?planSpecialPackageSchedules(packageCandidates,mix.total):null;
   const resources=excursionResources(state);
   const built=buildSpecialPackageOrders({base:{...common,source:channel.source},totalCents:quotedCents,plan,resources,sourceDate:date});
   state.orders.push(...built.orders);
   const saved=await saveStayAccess(state,revision,channel.savedBy);
   if(!saved)return {status:409,body:{error:'Another booking was saved at the same time. Please submit again.'}};
   const packageSegments=built.orders.map((order:any)=>({id:order.id,name:order.packageSegmentName,date:order.date,time:order.time||'',endTime:order.endTime||'',status:order.approvalStatus==='Approved'?'Confirmed':'Pending',matchedScheduleName:order.matchedScheduleName||''}));
   const allConfirmed=built.orders.every((order:any)=>order.approvalStatus==='Approved');
   const first=built.orders[0];
   const emailResult=await sendMail({email,guest:leadGuest,reference:built.packageGroupId,excursion:item.name,date:first?.date||date,time:first?.time||'',quantity:mix.total,quotedCents,hotel,manageToken,status:allConfirmed?'Confirmed':'Pending',packageSegments});
   await notifyNew(built.packageGroupId,allConfirmed?'Confirmed':'Pending',first?.time||'');
   return {status:201,body:{ok:true,booking:{id:built.packageGroupId,manageUrl:manageUrl,email:emailResult,status:allConfirmed?'Confirmed':'Pending',requiresApproval:!allConfirmed,requiresScheduling:!allConfirmed,date:first?.date||date,time:first?.time||'',quotedCents,packageSegments}}};
  }

  await ensureStandardDailyExcursions(date);
  const allSchedules=(await schedulesForDate(date)).filter((schedule:any)=>schedule.status==='Open'&&!excursionDeparturePassed(schedule.date,schedule.time));
  const candidates=allSchedules
   .filter((schedule:any)=>scheduleCanServeRequest(item.scheduleName||item.name,schedule.name))
   .map((schedule:any)=>({schedule,...candidateLoad(schedule,allSchedules,state.orders),rank:scheduleMatchRank(item.scheduleName||item.name,schedule.name)}))
   .sort((a:any,b:any)=>(a.remaining>=mix.total?0:1)-(b.remaining>=mix.total?0:1)||String(a.schedule.time).localeCompare(String(b.schedule.time))||a.rank-b.rank||b.remaining-a.remaining);
  const chosen=channel.autoConfirm?candidates.find((candidate:any)=>candidate.remaining>=mix.total):undefined;

  if(chosen){
   const schedule=chosen.schedule,resources=excursionResources(state);
   const vessel=resources.vessels.find((value:any)=>value.id===schedule.vesselId);
   const crew=resources.crew.filter((value:any)=>schedule.crewIds?.includes(value.id));
   state.orders.push({
    ...common,cents:quotedCents,time:schedule.time,endTime:schedule.endTime||'',returnTime:schedule.returnTime||'',scheduleId:schedule.id,
    seatRequest:false,approvalStatus:'Approved',status:'Scheduled',requestedOverCapacity:false,autoConfirmed:true,matchedFromMenu:true,matchedScheduleName:schedule.name,
    schedule:{date:schedule.date,time:schedule.time,endTime:schedule.endTime||'',...(schedule.returnTime?{returnTime:schedule.returnTime}:{}),vesselId:schedule.vesselId,vessel:vessel?.name||'',crewIds:schedule.crewIds||[],crew:crew.map((person:any)=>person.name)},
    guestNotified:false
   });
   const saved=await saveStayAccess(state,revision,channel.savedBy);
   if(!saved)return {status:409,body:{error:'Another booking was saved at the same time. Please submit again.'}};
   const emailResult=await sendMail({email,guest:leadGuest,reference:id,excursion:item.name,date,time:schedule.time,quantity:mix.total,quotedCents,hotel,manageToken,status:'Confirmed'});
   await notifyNew(id,'Confirmed',schedule.time);
   return {status:201,body:{ok:true,booking:{id,manageUrl:manageUrl,email:emailResult,status:'Confirmed',requiresApproval:false,requiresScheduling:false,date,time:schedule.time,endTime:schedule.endTime||'',quotedCents}}};
  }

  const fallback=suggestedTripWindow(item.scheduleName||item.name);
  state.orders.push({...common,cents:0,time:'',preferredTime:fallback.time,preferredEndTime:fallback.endTime,status:'Awaiting scheduling',approvalStatus:'Pending',seatRequest:true,unscheduledRequest:true,autoConfirmed:false,guestNotified:false});
  const saved=await saveStayAccess(state,revision,channel.savedBy);
  if(!saved)return {status:409,body:{error:'Another booking was saved at the same time. Please submit again.'}};
   const emailResult=await sendMail({email,guest:leadGuest,reference:id,excursion:item.name,date,time:'',quantity:mix.total,quotedCents,hotel,manageToken,status:'Pending'});
  await notifyNew(id,'Pending');
  return {status:201,body:{ok:true,booking:{id,manageUrl:manageUrl,email:emailResult,status:'Pending',requiresApproval:true,requiresScheduling:true,date,quotedCents}}};
 }catch(error){
  const message=error instanceof Error?error.message:'Could not send your excursion booking.';
  return {status:400,body:{error:message}};
 }
}
