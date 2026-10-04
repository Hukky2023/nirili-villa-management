import {sameOrigin,limit} from '../../../../lib/auth';
import {islandToday,nightly,plans,validDate} from '../../../../lib/guest-catalog';
import {roomRates} from '../../../../lib/room-rates';
import {loadStays} from '../../../../lib/stays';
import {saveStayAccess} from '../../../../lib/stay-login';
import {loadExcursionMenu} from '../../../../lib/excursion-menu';
import {assertBookingDatesOpen,bookingClosureForStay} from '../../../../lib/booking-closures';
import {emitAdminNotification} from '../../../../lib/admin-notifications';
import {discountedCents,publicTourOperator,tourOperatorFromRequest} from '../../../../lib/tour-operators';

const headers={'Cache-Control':'private, no-store'};
const AIRPORT_TRANSFER_CENTS=3000;
const phonePattern=/^\+[1-9]\d{7,14}$/;
const emailPattern=/^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const cleanPhone=(v:any)=>String(v||'').replace(/[\s()-]/g,'');
const text=(v:any,max:number)=>String(v??'').trim().replace(/\s+/g,' ').slice(0,max);
const cleanGuests=(value:any,adults:number,children:number)=>{
 const pax=adults+children,rows=Array.isArray(value)?value.slice(0,pax):[];
 if(rows.length!==pax)throw Error('Enter every guest name and passport number.');
 return rows.map((g:any,i:number)=>{
  const name=text(g?.name,100),passport=text(g?.passport,30).toUpperCase(),kind=i<adults?'adult':'child';
  const age=kind==='child'?Number(g?.age):null;
  if(!name||!passport)throw Error('Enter the full name and passport number for every guest.');
  if(kind==='child'&&(!Number.isInteger(age)||age<0||age>17))throw Error('Enter a valid age for every child.');
  return {name,passport,kind,...(kind==='child'?{age}: {})};
 });
};
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

function availableRooms(state:any,checkIn:string,checkOut:string,pax:number,roomType:string){
 return (state.rooms||[]).filter((room:any)=>{
  if(room.status==='Maintenance'||Number(room.capacity||3)<pax)return false;
  if(roomType&&String(room.type)!==roomType)return false;
  if(bookingClosureForStay(state,checkIn,checkOut,String(room.number)))return false;
  return !(state.stays||[]).some((stay:any)=>stay.room===room.number&&!['Checked Out','Cancelled'].includes(stay.status)&&stay.checkIn<checkOut&&stay.checkOut>checkIn);
 });
}
function bookingRows(state:any,operatorId:string){
 const today=islandToday();
 return (state.requests||[]).filter((q:any)=>q.tourOperatorId===operatorId).slice().sort((a:any,b:any)=>String(b.createdAt||'').localeCompare(String(a.createdAt||''))).slice(0,100).map((q:any)=>{
  const stay=q.stayId?(state.stays||[]).find((s:any)=>s.id===q.stayId):null;
  const status=stay?.status||q.status;
  return {
   id:q.id,guest:q.guest,guests:Array.isArray(q.guests)?q.guests:[],phone:q.whatsapp||'',email:q.email||'',checkIn:q.checkIn,checkOut:q.checkOut,pax:q.pax,adults:q.adults??q.pax,children:q.children??0,
   meal:q.meal,status:q.status,stayStatus:stay?.status||'',estimate:q.estimate,notes:q.notes||'',
   packageName:q.packageName,roomType:q.tourOperatorRoomType||'',createdAt:q.createdAt||'',stayId:q.stayId||'',room:q.room||stay?.room||'',
   excursionIds:Array.isArray(q.packageExcursions)?q.packageExcursions.map((x:any)=>String(x.id||'')):[],
   excursions:Array.isArray(q.packageExcursions)?q.packageExcursions.map((x:any)=>({id:String(x.id||''),name:String(x.name||x.id||'')})):[],
   transfer:q.packageIncludeTransfer?(String(q.packageTransferLabel||'').toLowerCase().includes('return')?'return':'arrival'):'none',
   canManage:!['Cancelled','Declined','Deleted','Checked Out','In House'].includes(String(status||''))&&String(q.checkIn||'')>=today
  };
 });
}
async function view(operator:any){
 const [{state,revision},excursions]=await Promise.all([loadStays(),loadExcursionMenu()]);
 const roomTypes=Array.from(new Set((state.rooms||[]).map((r:any)=>String(r.type||'')).filter(Boolean))).sort();
 return {
  operator:publicTourOperator(operator),revision,today:islandToday(),plans,
  roomTypes,roomRates:roomRates(state.roomRates),
  excursions:excursions.filter((x:any)=>x.active!==false).map((x:any)=>({id:x.id,name:x.name,cents:Number(x.cents)||0,pricingUnit:x.pricingUnit==='couple'?'couple':'guest',group:x.group||'',category:x.category||'',includedExcursions:specialIncluded(x)})),
  airportTransferCents:AIRPORT_TRANSFER_CENTS,
  bookings:bookingRows(state,operator.id)
 };
}

export async function GET(r:Request){
 try{const operator=await tourOperatorFromRequest(r);if(!operator)return Response.json({error:'Sign in required.'},{status:401,headers});return Response.json(await view(operator),{headers});}
 catch{return Response.json({error:'Could not load tour operator portal.'},{status:503,headers});}
}

export async function POST(r:Request){
 if(!sameOrigin(r))return Response.json({error:'Invalid request.'},{status:403,headers});
 try{
  const operator=await tourOperatorFromRequest(r);if(!operator)return Response.json({error:'Sign in required.'},{status:401,headers});
  if(!await limit('tour-operator-book:'+operator.id,60,3600000))return Response.json({error:'Too many booking attempts. Please try again later.'},{status:429,headers});
  const b=await r.json();
  if(b.action==='check-availability'){
   const checkIn=String(b.checkIn||''),checkOut=String(b.checkOut||''),adults=Number(b.adults),children=Number(b.children),pax=adults+children,today=islandToday();
   const stayNights=nights(checkIn,checkOut);
   if(!validDate(checkIn)||!validDate(checkOut)||checkIn<today||checkOut<=checkIn||!Number.isInteger(stayNights)||stayNights<1||stayNights>365)throw Error('Choose valid stay dates.');
   if(!Number.isInteger(adults)||adults<1||adults>3||!Number.isInteger(children)||children<0||children>2||pax<1||pax>3)throw Error('A room can accommodate up to 3 guests.');
   const {state}=await loadStays();state.stays??=[];state.rooms??=[];
   assertBookingDatesOpen(state,checkIn,checkOut);
   const roomTypes=Array.from(new Set((state.rooms||[]).map((room:any)=>String(room.type||'')).filter(Boolean))).sort();
   const availability=roomTypes.map(roomType=>({roomType,availableCount:availableRooms(state,checkIn,checkOut,pax,roomType).length}));
   const totalAvailable=availability.reduce((sum,item)=>sum+item.availableCount,0);
   return Response.json({ok:true,checkIn,checkOut,pax,totalAvailable,availability},{headers});
  }
  if(b.action!=='book-package')throw Error('Unknown action.');
  const phone=cleanPhone(b.phone),email=text(b.email,254).toLowerCase();
  const checkIn=String(b.checkIn||''),checkOut=String(b.checkOut||''),meal=String(b.meal||''),roomType=text(b.roomType,80);
  const adults=Number(b.adults),children=Number(b.children),pax=adults+children,stayNights=nights(checkIn,checkOut),today=islandToday();
  const guests=cleanGuests(b.guests,adults,children),guest=guests[0]?.name||text(b.guest,100);
  if(!guest||!phonePattern.test(phone)||!emailPattern.test(email))throw Error('Enter guest details, WhatsApp with country code and a valid email.');
  if(!validDate(checkIn)||!validDate(checkOut)||checkIn<today||checkOut<=checkIn||!Number.isInteger(stayNights)||stayNights<1||stayNights>365)throw Error('Choose valid stay dates.');
  if(!Number.isInteger(adults)||adults<1||adults>3||!Number.isInteger(children)||children<0||children>2||pax<1||pax>3)throw Error('A room can accommodate up to 3 guests.');
  if(!plans.includes(meal))throw Error('Choose a valid meal plan.');
  if(!roomType)throw Error('Choose a room type.');
  const selectedIds=Array.isArray(b.excursionIds)?Array.from(new Set(b.excursionIds.map((x:any)=>String(x)).filter(Boolean))).slice(0,30):[];
  const transfer=String(b.transfer||'none');if(!['none','arrival','return'].includes(transfer))throw Error('Choose a valid airport transfer option.');
  const {state,revision}=await loadStays();state.requests??=[];state.stays??=[];state.rooms??=[];
  assertBookingDatesOpen(state,checkIn,checkOut);
  if(!availableRooms(state,checkIn,checkOut,pax,roomType).length)return Response.json({error:'No '+roomType+' is available for these dates and guest count.'},{status:409,headers});
  const menu=await loadExcursionMenu(),byId=new Map(menu.filter((x:any)=>x.active!==false).map((x:any)=>[String(x.id),x]));
  if(selectedIds.some(id=>!byId.has(id)))throw Error('One or more selected excursions are no longer available. Refresh and try again.');
  const publicRoom=nightly(meal,pax,state.roomRates)*stayNights;
  const roomNet=discountedCents(publicRoom,operator.roomDiscountPercent);
  const selectedExcursions=selectedIds.map(id=>byId.get(id));
  const publicExcursions=selectedExcursions.reduce((sum:number,item:any)=>sum+(Number(item.cents)||0)*(item.pricingUnit==='couple'?Math.ceil(pax/2):pax),0);
  const excursionNet=discountedCents(publicExcursions,operator.excursionDiscountPercent);
  const transferLegs=transfer==='none'?0:transfer==='arrival'?1:2;
  const publicTransfer=AIRPORT_TRANSFER_CENTS*pax*transferLegs;
  const transferNet=discountedCents(publicTransfer,operator.transferDiscountPercent);
  const total=roomNet+excursionNet+transferNet;
  const id='TOR-'+crypto.randomUUID().slice(0,8).toUpperCase(),createdAt=new Date().toISOString();
  const packageName=text(b.packageName,120)||('Custom '+stayNights+'N '+meal+' package');
  const request:any={
   id,token:crypto.randomUUID(),guest,guests,whatsapp:phone,email,checkIn,checkOut,pax,adults,children,meal,notes:text(b.notes,1000),
   status:'Pending',source:'Tour operator · '+operator.name,createdAt,estimate:total,tourOperatorId:operator.id,tourOperatorName:operator.name,tourOperatorRoomType:roomType,
   packageId:'tour-package-'+operator.id+'-'+crypto.randomUUID().slice(0,8),packageName,packageQuotedCents:total,packageRatePerGuestCents:Math.round(total/pax),packageNights:stayNights,packageMealPlan:meal,
   packageIncludeTransfer:transfer!=='none',packageTransferLabel:transfer==='return'?'Return airport transfer':transfer==='arrival'?'Arrival airport transfer':'',
   packageExcursions:selectedExcursions.flatMap((x:any)=>{
    const included=specialIncluded(x);
    return included.length?included:[{id:String(x.id),name:String(x.name||x.id)}];
   }),
   tourOperatorPricing:{publicRoomCents:publicRoom,roomCents:roomNet,roomDiscountPercent:operator.roomDiscountPercent,publicExcursionCents:publicExcursions,excursionCents:excursionNet,excursionDiscountPercent:operator.excursionDiscountPercent,publicTransferCents:publicTransfer,transferCents:transferNet,transferDiscountPercent:operator.transferDiscountPercent,totalCents:total}
  };
  state.requests.push(request);
  if(!await saveStayAccess(state,revision,'tour-operator:'+operator.id))return Response.json({error:'Availability changed. Refresh and try again.'},{status:409,headers});
  try{await emitAdminNotification({id:'hotel:new:'+id,type:'hotel',title:'New tour operator room booking',detail:operator.name+' · '+guest+' · '+checkIn+' → '+checkOut+' · '+packageName+' · $'+(total/100).toFixed(2),ref:id,url:'/home'});}catch{}
  return Response.json({ok:true,id,totalCents:total,pricing:request.tourOperatorPricing,bookings:bookingRows(state,operator.id)},{status:201,headers});
 }catch(e){return Response.json({error:e instanceof Error?e.message:'Could not create booking.'},{status:400,headers});}
}
