import {sameOrigin,limit} from '../../../../lib/auth';
import {islandToday,nightly,plans,validDate} from '../../../../lib/guest-catalog';
import {loadStays} from '../../../../lib/stays';
import {saveStayAccess} from '../../../../lib/stay-login';
import {loadExcursionMenu} from '../../../../lib/excursion-menu';
import {assertBookingDatesOpen} from '../../../../lib/booking-closures';
import {emitAdminNotification} from '../../../../lib/admin-notifications';
import {discountedCents,tourOperatorFromRequest} from '../../../../lib/tour-operators';

const headers={'Cache-Control':'private, no-store'};
const AIRPORT_TRANSFER_CENTS=3000;
const phonePattern=/^\+[1-9]\d{7,14}$/;
const emailPattern=/^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const cleanPhone=(v:any)=>String(v||'').replace(/[\s()-]/g,'');
const text=(v:any,max:number)=>String(v??'').trim().replace(/\s+/g,' ').slice(0,max);
const nights=(a:string,b:string)=>(Date.parse(b)-Date.parse(a))/86400000;

function availableRooms(state:any,checkIn:string,checkOut:string,pax:number,roomType:string,excludeStayId=''){
 return (state.rooms||[]).filter((room:any)=>{
  if(room.status==='Maintenance'||Number(room.capacity||3)<pax)return false;
  if(roomType&&String(room.type)!==roomType)return false;
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
   transfer:q.packageIncludeTransfer?(String(q.packageTransferLabel||'').toLowerCase().includes('return')?'return':'arrival'):'none',
   canManage:!['Cancelled','Declined','Checked Out','In House'].includes(String(status||''))&&String(q.checkIn||'')>=today
  };
 });
}

export async function GET(r:Request){
 try{
  const operator=await tourOperatorFromRequest(r);
  if(!operator)return Response.json({error:'Sign in required.'},{status:401,headers});
  const {state}=await loadStays();
  return Response.json({bookings:rows(state,operator.id)},{headers});
 }catch{return Response.json({error:'Could not load bookings.'},{status:503,headers});}
}
