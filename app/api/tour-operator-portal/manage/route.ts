import {sameOrigin,limit} from '../../../../lib/auth';
import {islandToday,nightly,plans,validDate} from '../../../../lib/guest-catalog';
import {loadStays} from '../../../../lib/stays';
import {saveStayAccess} from '../../../../lib/stay-login';
import {loadExcursionMenu} from '../../../../lib/excursion-menu';
import {assertBookingDatesOpen,bookingClosureForStay} from '../../../../lib/booking-closures';
import {emitAdminNotification} from '../../../../lib/admin-notifications';
import {discountedCents,tourOperatorFromRequest} from '../../../../lib/tour-operators';
import {deleteBooking} from '../../../../lib/booking-admin';
import {cancelLinkedTransportBookings} from '../../../../lib/linked-transport-bookings';

const headers={'Cache-Control':'private, no-store'};
const AIRPORT_TRANSFER_CENTS=3000;
const phonePattern=/^\+[1-9]\d{7,14}$/;
const emailPattern=/^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const cleanPhone=(v:any)=>String(v||'').replace(/[\s()-]/g,'');
const text=(v:any,max:number)=>String(v??'').trim().replace(/\s+/g,' ').slice(0,max);
const nights=(a:string,b:string)=>(Date.parse(b)-Date.parse(a))/86400000;
const SPECIAL_PACKAGE_INCLUDED=[
 'Turtle Snorkeling',
 'Shark Snorkeling (Nurse Shark)',
 'Sandbank Trip',
 'Coral Garden Snorkeling',
 'Dolphin Watching',
 'Fishing with Dinner'
];
const specialIncluded=(item:any)=>String(item?.category||'').toLowerCase()==='special'||String(item?.group||'').toLowerCase().includes('special')||String(item?.name||'').toLowerCase().includes('special package')
 ?SPECIAL_PACKAGE_INCLUDED.map((name,index)=>({id:'special-'+(index+1),name}))
 :[];

function availableRooms(state:any,checkIn:string,checkOut:string,pax:number,roomType:string,excludeStayId=''){
 return (state.rooms||[]).filter((room:any)=>{
  if(room.status==='Maintenance'||Number(room.capacity||3)<pax)return false;
  if(roomType&&String(room.type)!==roomType)return false;
  if(bookingClosureForStay(state,checkIn,checkOut,String(room.number)))return false;
  return !(state.stays||[]).some((stay:any)=>stay.id!==excludeStayId&&stay.room===room.number&&!['Checked Out','Cancelled'].includes(stay.status)&&stay.checkIn<checkOut&&stay.checkOut>checkIn);
 });
}

function rows(state:any,operatorId:string){
 const today=islandToday();
 return (state.requests||[]).filter((q:any)=>q.tourOperatorId===operatorId).slice().sort((a:any,b:any)=>String(b.createdAt||'').localeCompare(String(a.createdAt||''))).slice(0,100).map((q:any)=>{
  const stay=q.stayId?(state.stays||[]).find((s:any)=>s.id===q.stayId):null;
  const status=stay?.status||q.status;
  return {
   id:q.id,guest:q.guest,phone:q.whatsapp||'',email:q.email||'',checkIn:q.checkIn,checkOut:q.checkOut,pax:q.pax,adults:q.adults??q.pax,children:q.children??0,
   meal:q.meal,status:q.status,stayStatus:stay?.status||'',estimate:q.estimate,notes:q.notes||'',packageName:q.packageName||'',roomType:q.tourOperatorRoomType||'',room:q.room||'',
   excursionIds:Array.isArray(q.packageExcursions)?q.packageExcursions.map((x:any)=>String(x.id)):[],
   excursions:Array.isArray(q.packageExcursions)?q.packageExcursions.map((x:any)=>({id:String(x.id||''),name:String(x.name||x.id||'')})):[],
   transfer:q.packageIncludeTransfer?(String(q.packageTransferLabel||'').toLowerCase().includes('return')?'return':'arrival'):'none',
   canManage:!['Cancelled','Declined','Checked Out','In House'].includes(String(status||''))&&String(q.checkIn||'')>=today
  };
 });
}

async function quote(state:any,operator:any,b:any){
 const guest=text(b.guest,100),phone=cleanPhone(b.phone),email=text(b.email,254).toLowerCase();
 const checkIn=String(b.checkIn||''),checkOut=String(b.checkOut||''),meal=String(b.meal||''),roomType=text(b.roomType,80);
 const adults=Number(b.adults),children=Number(b.children),pax=adults+children,stayNights=nights(checkIn,checkOut),today=islandToday();
 if(!guest||!phonePattern.test(phone)||!emailPattern.test(email))throw Error('Enter guest name, WhatsApp with country code and a valid email.');
 if(!validDate(checkIn)||!validDate(checkOut)||checkIn<today||checkOut<=checkIn||!Number.isInteger(stayNights)||stayNights<1||stayNights>365)throw Error('Choose valid stay dates.');
 if(!Number.isInteger(adults)||adults<1||adults>3||!Number.isInteger(children)||children<0||children>2||pax<1||pax>3)throw Error('A room can accommodate up to 3 guests.');
 if(!plans.includes(meal))throw Error('Choose a valid meal plan.');
 if(!roomType)throw Error('Choose a room type.');
 const selectedIds=Array.isArray(b.excursionIds)?Array.from(new Set(b.excursionIds.map((x:any)=>String(x)).filter(Boolean))).slice(0,30):[];
 const transfer=String(b.transfer||'none');if(!['none','arrival','return'].includes(transfer))throw Error('Choose a valid airport transfer option.');
 assertBookingDatesOpen(state,checkIn,checkOut);
 const menu=await loadExcursionMenu(),byId=new Map(menu.filter((x:any)=>x.active!==false).map((x:any)=>[String(x.id),x]));
 if(selectedIds.some(id=>!byId.has(id)))throw Error('One or more selected excursions are no longer available. Refresh and try again.');
 const publicRoom=nightly(meal,pax,state.roomRates)*stayNights,roomNet=discountedCents(publicRoom,operator.roomDiscountPercent);
 const selectedExcursions=selectedIds.map(id=>byId.get(id));
 const publicExcursions=selectedExcursions.reduce((sum:number,item:any)=>sum+(Number(item.cents)||0)*(item.pricingUnit==='couple'?Math.ceil(pax/2):pax),0);
 const excursionNet=discountedCents(publicExcursions,operator.excursionDiscountPercent);
 const transferLegs=transfer==='none'?0:transfer==='arrival'?1:2,publicTransfer=AIRPORT_TRANSFER_CENTS*pax*transferLegs,transferNet=discountedCents(publicTransfer,operator.transferDiscountPercent);
 const total=roomNet+excursionNet+transferNet,packageName=text(b.packageName,120)||('Custom '+stayNights+'N '+meal+' package');
 return {guest,phone,email,checkIn,checkOut,meal,roomType,adults,children,pax,stayNights,transfer,total,packageName,
  packageFields:{packageName,packageQuotedCents:total,packageRatePerGuestCents:Math.round(total/pax),packageNights:stayNights,packageMealPlan:meal,packageIncludeTransfer:transfer!=='none',packageTransferLabel:transfer==='return'?'Return airport transfer':transfer==='arrival'?'Arrival airport transfer':'',packageExcursions:selectedExcursions.flatMap((x:any)=>{const included=specialIncluded(x);return included.length?included:[{id:String(x.id),name:String(x.name||x.id)}];})},
  pricing:{publicRoomCents:publicRoom,roomCents:roomNet,roomDiscountPercent:operator.roomDiscountPercent,publicExcursionCents:publicExcursions,excursionCents:excursionNet,excursionDiscountPercent:operator.excursionDiscountPercent,publicTransferCents:publicTransfer,transferCents:transferNet,transferDiscountPercent:operator.transferDiscountPercent,totalCents:total}
 };
}

export async function GET(r:Request){
 try{
  const operator=await tourOperatorFromRequest(r);
  if(!operator)return Response.json({error:'Sign in required.'},{status:401,headers});
  const {state}=await loadStays();
  return Response.json({bookings:rows(state,operator.id)},{headers});
 }catch{return Response.json({error:'Could not load bookings.'},{status:503,headers});}
}

export async function POST(r:Request){
 if(!sameOrigin(r))return Response.json({error:'Invalid request.'},{status:403,headers});
 try{
  const operator=await tourOperatorFromRequest(r);
  if(!operator)return Response.json({error:'Sign in required.'},{status:401,headers});
  if(!await limit('tour-operator-manage:'+operator.id,60,3600000))return Response.json({error:'Too many requests. Please try again later.'},{status:429,headers});
  const b=await r.json(),action=String(b.action||'');
  if(!['modify','cancel'].includes(action))throw Error('Unknown action.');
  const {state,revision}=await loadStays();state.requests??=[];state.stays??=[];state.rooms??=[];
  const q=state.requests.find((x:any)=>x.id===String(b.id||'')&&x.tourOperatorId===operator.id);
  if(!q)return Response.json({error:'Booking not found.'},{status:404,headers});
  const stay=q.stayId?state.stays.find((s:any)=>s.id===q.stayId):null,status=stay?.status||q.status;
  if(['Cancelled','Declined','Checked Out','In House'].includes(String(status||''))||String(q.checkIn||'')<islandToday())throw Error('This booking can no longer be changed from the tour operator portal.');

  if(action==='cancel'){
   const at=new Date().toISOString(),actor='tour-operator:'+operator.id;
   q.status='Cancelled';q.cancelledAt=at;q.cancelledBy=actor;
   if(stay){
    // Remove the confirmed stay and its linked room/service records from active hotel management,
    // while keeping the original tour-operator request as Cancelled for history in the partner portal.
    deleteBooking(state,stay,operator.name);
    q.status='Cancelled';q.cancelledAt=at;q.cancelledBy=actor;q.stayId='';
   }
   if(!await saveStayAccess(state,revision,actor))return Response.json({error:'Booking changed. Refresh and try again.'},{status:409,headers});
   if(stay)try{await cancelLinkedTransportBookings({stayId:stay.id,by:actor});}catch{}
   try{await emitAdminNotification({id:'hotel:tour-cancel:'+q.id+':'+at,type:'hotel',title:'Tour operator cancelled booking',detail:operator.name+' · '+q.guest+' · '+q.checkIn+' → '+q.checkOut+' · Removed from active hotel bookings',ref:q.id,url:'/home'});}catch{}
   return Response.json({ok:true,managementBookingRemoved:!!stay,bookings:rows(state,operator.id)},{headers});
  }

  const x=await quote(state,operator,b);
  const available=availableRooms(state,x.checkIn,x.checkOut,x.pax,x.roomType,stay?.id||'');
  if(!available.length)return Response.json({error:'No '+x.roomType+' is available for these dates and guest count.'},{status:409,headers});
  const selectedRoom=stay?(available.find((room:any)=>room.number===stay.room)||available[0]):null,at=new Date().toISOString();
  Object.assign(q,{guest:x.guest,whatsapp:x.phone,email:x.email,checkIn:x.checkIn,checkOut:x.checkOut,pax:x.pax,adults:x.adults,children:x.children,meal:x.meal,notes:text(b.notes,1000),estimate:x.total,tourOperatorRoomType:x.roomType,...x.packageFields,tourOperatorPricing:x.pricing,modifiedAt:at,modifiedBy:'tour-operator:'+operator.id});
  if(stay){
   Object.assign(stay,{guest:x.guest,whatsapp:x.phone,email:x.email,checkIn:x.checkIn,checkOut:x.checkOut,pax:x.pax,adults:x.adults,children:x.children,meal:x.meal,notes:text(b.notes,1000),room:selectedRoom.number,base:x.total,...x.packageFields});
   q.room=selectedRoom.number;stay.history??=[];stay.history.unshift({date:at,detail:'Booking modified by tour operator before check-in',by:operator.name});
  }
  if(!await saveStayAccess(state,revision,'tour-operator:'+operator.id))return Response.json({error:'Booking changed. Refresh and try again.'},{status:409,headers});
  try{await emitAdminNotification({id:'hotel:tour-modify:'+q.id+':'+at,type:'hotel',title:'Tour operator modified booking',detail:operator.name+' · '+q.guest+' · '+x.checkIn+' → '+x.checkOut+' · $'+(x.total/100).toFixed(2),ref:q.id,url:'/home'});}catch{}
  return Response.json({ok:true,totalCents:x.total,bookings:rows(state,operator.id)},{headers});
 }catch(e){return Response.json({error:e instanceof Error?e.message:'Could not update booking.'},{status:400,headers});}
}
