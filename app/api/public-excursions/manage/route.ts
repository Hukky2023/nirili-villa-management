import {authDb,limit,sameOrigin} from '../../../../lib/auth';
import {islandToday,validDate} from '../../../../lib/guest-catalog';
import {saveStayAccess} from '../../../../lib/stay-login';
import {loadStays} from '../../../../lib/stays';
import {loadExcursionMenu} from '../../../../lib/excursion-menu';
import {excursionPriceCents} from '../../../../lib/excursion-children';
import {PRIVATE_BOAT_SURCHARGE_CENTS,isSnorkelingTrip} from '../../../../lib/excursion-operations';
import {isRomanticBeachDinner} from '../../../../lib/excursion-services';
import {externalExcursionForToken,externalExcursionPaymentCents,externalPackageOrders,excursionManageSnapshot,ensureExcursionManageState,pendingExcursionChange,validExcursionManageToken} from '../../../../lib/excursion-manage';
import {sendExternalExcursionCancelledEmail,sendExternalExcursionRequestEmail,sendExternalExcursionUpdatedEmail} from '../../../../lib/excursion-email';

const headers={'Cache-Control':'private, no-store, max-age=0'};
const phonePattern=/^\+[1-9]\d{7,14}$/;
const emailPattern=/^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const safe=(value:any,max:number)=>String(value??'').trim().replace(/\s+/g,' ').slice(0,max);
const cleanPhone=(value:any)=>String(value??'').replace(/[\s()-]/g,'');

function cleanCategories(value:any,max=20){
 if(!Array.isArray(value)||value.length<1||value.length>max)throw Error('Choose an age category for every guest.');
 const categories=value.map((item:any)=>String(item||'').trim().toLowerCase());
 if(categories.some((category:string)=>!['adult','child','infant'].includes(category)))throw Error('Choose Adult (12+), Child (3–11), or Under 3 for every guest.');
 return categories;
}
function mix(categories:string[]){return {adults:categories.filter(x=>x==='adult').length,children:categories.filter(x=>x==='child').length,infants:categories.filter(x=>x==='infant').length,total:categories.length};}
function cleanNames(value:any,quantity:number,lead:string){
 const input=Array.isArray(value)?value:[];
 const names=Array.from({length:quantity},(_,index)=>safe(input[index]||(index===0?lead:''),100));
 if(names.some(name=>!name))throw Error('Enter the name of every guest.');
 return names;
}
function roster(id:string,names:string[],categories:string[]){return names.map((name,index)=>({id:id+':'+(index+1),slot:index+1,name,ageCategory:categories[index]||'',boarded:false,boardedAt:''}));}
function cleanFootSizes(value:any,quantity:number,required:boolean){
 if(!required)return [];
 if(!Array.isArray(value)||value.length<quantity)throw Error('Enter the EU foot size for every snorkeling guest.');
 const sizes=value.slice(0,quantity).map((item:any)=>Number(item));
 if(sizes.some((size:number)=>!Number.isInteger(size)||size<15||size>50))throw Error('EU foot sizes must be whole numbers from 15 to 50.');
 return sizes;
}
async function liveSchedule(order:any){
 if(!order?.scheduleId||!order?.date)return null;
 try{
  const row=await authDb().prepare('SELECT payload FROM operation_records WHERE key=?').bind('excursion-schedule:'+order.date+':'+order.scheduleId).first<any>();
  return row?JSON.parse(row.payload||'{}'):null;
 }catch{return null;}
}
async function publicItems(){
 const menu=await loadExcursionMenu();
 return menu.filter((item:any)=>item.kind==='excursion'&&item.active!==false).map((item:any)=>({id:item.id,name:item.name,detail:item.detail||'',cents:Math.max(0,Number(item.cents)||0),pricingUnit:item.pricingUnit==='couple'?'couple':'guest',needsFootSizes:item.id==='special-package'||isSnorkelingTrip(item.name)}));
}
async function cleanProposal(body:any,items:any[]){
 const email=safe(body.email,254).toLowerCase(),phone=cleanPhone(body.phone),hotel=safe(body.hotel,150),externalRoom=safe(body.externalRoom,50),groupName=safe(body.groupName,100),notes=safe(body.notes,1000),date=String(body.date||''),menuItemId=String(body.menuItemId||'').slice(0,100);
 const categories=cleanCategories(body.guestCategories),guestMix=mix(categories),guestNames=cleanNames(body.guestNames,guestMix.total,safe(body.guest,100));
 if(!emailPattern.test(email)||!phonePattern.test(phone)||!hotel)throw Error('Enter a valid email, WhatsApp number with country code, and hotel or pickup location.');
 if(!validDate(date)||date<islandToday())throw Error('Choose a valid excursion date.');
 const item=items.find((entry:any)=>entry.id===menuItemId);if(!item)throw Error('This excursion is no longer available.');
 const footSizes=cleanFootSizes(body.footSizes,guestMix.total,item.needsFootSizes);
 const privateBoatRequested=guestMix.total>=4&&body.privateBoatRequested===true,buggyRequested=body.buggyRequested===true;
 const baseQuotedCents=excursionPriceCents(item.cents,item.pricingUnit,guestMix),privateBoatSurchargeCents=privateBoatRequested?PRIVATE_BOAT_SURCHARGE_CENTS:0,quotedCents=baseQuotedCents+privateBoatSurchargeCents;
 return {guest:guestNames[0],email,phone,hotel,pickupLocation:hotel,externalRoom,groupName,notes,date,menuItemId:item.id,name:item.name,quantity:guestMix.total,adults:guestMix.adults,children:guestMix.children,infants:guestMix.infants,guestNames,guestCategories:categories,excursionGuestRoster:roster('',guestNames,categories),footSizes,pricingUnit:item.pricingUnit,unitPriceCents:item.cents,baseQuotedCents,privateBoatRequested,privateBoatSurchargeCents,buggyRequested,quotedCents};
}
function currentRecord(order:any){const edited=Number(order.billingRevision)>0||!!order.billingEditedAt;return {guest:order.guest,email:order.email,phone:order.phone,hotel:order.hotel,externalRoom:order.externalRoom,groupName:order.groupName,date:order.date,menuItemId:order.menuItemId,name:order.name,quantity:order.quantity,adults:order.adults,children:order.children,infants:order.infants,guestNames:order.guestNames,guestCategories:order.guestCategories,footSizes:order.footSizes,privateBoatRequested:!!order.privateBoatRequested,buggyRequested:!!order.buggyRequested,notes:order.notes,quotedCents:edited?(Number(order.cents)||0):(Number(order.quotedCents)||Number(order.cents)||0),originalQuotedCents:Math.max(0,Number(order.quotedCents)||0)};}
function changeRecord(order:any,type:'change'|'cancel',proposed:any=null){return {id:'ECH-'+crypto.randomUUID().slice(0,8).toUpperCase(),bookingId:order.id,...(order.packageGroupId?{packageGroupId:order.packageGroupId}:{}),type,status:'Pending',requestedAt:new Date().toISOString(),current:currentRecord(order),proposed};}
function mailFrom(order:any,eventId?:string){const edited=Number(order.billingRevision)>0||!!order.billingEditedAt;return {email:order.email,guest:order.guest,reference:order.id,excursion:order.name,date:order.date,time:order.time||order.schedule?.time||'',endTime:order.endTime||order.schedule?.endTime||'',quantity:Number(order.quantity)||0,quotedCents:edited?(Number(order.cents)||0):(Number(order.quotedCents)||Number(order.cents)||0),hotel:order.hotel,manageToken:order.manageToken,eventId};}

export async function POST(request:Request){
 if(!sameOrigin(request))return Response.json({error:'Invalid request.'},{status:403,headers});
 try{
  const body=await request.json(),token=String(body.token||''),action=String(body.action||'view');
  if(!validExcursionManageToken(token))return Response.json({error:'This manage-excursion link is invalid.'},{status:400,headers});
  const ip=request.headers.get('cf-connecting-ip')||'unknown';
  if(!await limit('public-excursion-manage:'+ip,60,3600000))return Response.json({error:'Too many requests. Please try again later.'},{status:429,headers});
  const {state,revision}=await loadStays();ensureExcursionManageState(state);
  const order=externalExcursionForToken(state,token);
  if(!order)return Response.json({error:'This manage-excursion link is no longer valid.'},{status:404,headers});
  const items=await publicItems(),schedule=await liveSchedule(order),packageOrders=externalPackageOrders(state,order),isSplitPackage=packageOrders.length>1;
  if(action==='view')return Response.json({booking:excursionManageSnapshot(state,order,schedule),items},{headers});
  if(['Departed','Completed','Cancelled'].includes(String(order.status||''))||['Cancelled','Declined'].includes(String(order.approvalStatus||'')))return Response.json({error:'This excursion can no longer be changed online. Please contact Nirili Tours.'},{status:409,headers});
  if(pendingExcursionChange(state,order.id))return Response.json({error:'A change or cancellation is already waiting for our excursions team.',booking:excursionManageSnapshot(state,order,schedule)},{status:409,headers});

  if(action==='update'){
   if(isSplitPackage)return Response.json({error:'Special Package trip changes are managed by Nirili Tours. You can request cancellation here or contact us to change individual package departures.'},{status:409,headers});
   const proposed=await cleanProposal(body,items);
   proposed.excursionGuestRoster=roster(order.id,proposed.guestNames,proposed.guestCategories);
   const pendingUnscheduled=order.approvalStatus==='Pending'&&order.unscheduledRequest===true&&!order.scheduleId;
   if(pendingUnscheduled&&externalExcursionPaymentCents(order)===0){
    Object.assign(order,proposed,{cents:0,time:'',updatedAt:new Date().toISOString(),updatedBy:'External guest'});
    delete order.preferredTime;delete order.preferredEndTime;delete order.preferredScheduleId;delete order.matchedScheduleName;delete order.serviceType;delete order.serviceRequest;delete order.dinnerTime;delete order.buggyRoundTrip;
    order.status=isRomanticBeachDinner(order)?'Awaiting confirmation':'Awaiting scheduling';order.approvalStatus='Pending';order.autoConfirmed=false;order.guestNotified=false;
    const saved=await saveStayAccess(state,revision,'public-excursion-manage');if(!saved)throw Error('The booking changed while you were editing it. Refresh and try again.');
    const email=await sendExternalExcursionUpdatedEmail({...mailFrom(order,'direct-'+Date.now()),status:'Pending'});
    return Response.json({ok:true,applied:true,email,booking:excursionManageSnapshot(state,order,null),items},{headers});
   }
   const change=changeRecord(order,'change',proposed);state.excursionChanges.push(change);
   const saved=await saveStayAccess(state,revision,'public-excursion-manage');if(!saved)throw Error('The booking changed while you were editing it. Refresh and try again.');
   const email=await sendExternalExcursionRequestEmail({...mailFrom(order,change.id),requestType:'change'});
   return Response.json({ok:true,pending:true,email,booking:excursionManageSnapshot(state,order,schedule),items},{headers});
  }

  if(action==='cancel'){
   if(isSplitPackage){
    const change=changeRecord(order,'cancel');state.excursionChanges.push(change);
    const saved=await saveStayAccess(state,revision,'public-excursion-manage');if(!saved)throw Error('The package changed while you were cancelling it. Refresh and try again.');
    const first=packageOrders[0],packageEdited=packageOrders.some((item:any)=>Number(item.billingRevision)>0||!!item.billingEditedAt),packageTotal=packageEdited?packageOrders.reduce((sum:number,item:any)=>sum+Math.max(0,Number(item.cents)||0),0):Math.max(0,Number(first.packageTotalCents)||packageOrders.reduce((sum:number,item:any)=>sum+Math.max(0,Number(item.quotedCents)||0),0));
    const email=await sendExternalExcursionRequestEmail({email:first.email,guest:first.guest,reference:first.packageGroupId,excursion:first.packageName||'Special Package',date:first.date,time:first.time||first.schedule?.time||'',quantity:Number(first.quantity)||0,quotedCents:packageTotal,hotel:first.hotel,manageToken:first.manageToken,eventId:change.id,requestType:'cancel'});
    return Response.json({ok:true,pending:true,email,booking:excursionManageSnapshot(state,order,null),items},{headers});
   }
   const paid=externalExcursionPaymentCents(order),pendingUnscheduled=order.approvalStatus==='Pending'&&order.unscheduledRequest===true&&!order.scheduleId;
   if(pendingUnscheduled&&paid===0){
    order.status='Cancelled';order.approvalStatus='Cancelled';order.cents=0;order.cancelledAt=new Date().toISOString();order.cancelledBy='External guest';order.unscheduledRequest=false;order.seatRequest=false;order.guestNotified=false;
    const saved=await saveStayAccess(state,revision,'public-excursion-manage');if(!saved)throw Error('The booking changed while you were cancelling it. Refresh and try again.');
    const email=await sendExternalExcursionCancelledEmail({...mailFrom(order,'cancel-'+Date.now()),refundRequiredCents:0});
    return Response.json({ok:true,cancelled:true,email,booking:excursionManageSnapshot(state,order,null),items},{headers});
   }
   const change=changeRecord(order,'cancel');state.excursionChanges.push(change);
   const saved=await saveStayAccess(state,revision,'public-excursion-manage');if(!saved)throw Error('The booking changed while you were cancelling it. Refresh and try again.');
   const email=await sendExternalExcursionRequestEmail({...mailFrom(order,change.id),requestType:'cancel'});
   return Response.json({ok:true,pending:true,email,booking:excursionManageSnapshot(state,order,schedule),items},{headers});
  }
  return Response.json({error:'Unknown excursion action.'},{status:400,headers});
 }catch(error){return Response.json({error:error instanceof Error?error.message:'Could not manage this excursion.'},{status:400,headers});}
}
