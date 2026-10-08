/** Read-only dashboard projection. Never seeds bookings or changes stored records. */
type Row = Record<string, any>;
export type DashboardAccess = {hotel:boolean; revenue:boolean; transfers:boolean; excursions:boolean; pos:boolean; reports:boolean};
export function dashboardAccess(user:Row|null):DashboardAccess {
 const permissions=Array.isArray(user?.permissions)?user.permissions:[];
 const admin=user?.role==='admin',staff=user?.role==='staff';
 const has=(permission:string)=>admin||(staff&&permissions.includes(permission));
 return {hotel:admin||(staff&&(permissions.length===0||permissions.some((p:string)=>['guesthouse_reception','edit_bills','edit_excursions','edit_transfers'].includes(p)))),revenue:has('edit_bills'),transfers:has('edit_transfers'),excursions:has('edit_excursions')||has('excursions_manager'),pos:admin||(staff&&permissions.some((p:string)=>['waiter_pos','restaurant_pos','kitchen_pos','edit_bills'].includes(p))),reports:admin};
}
const list=(value:any):Row[]=>Array.isArray(value)?value.filter(x=>x&&typeof x==='object'):[];
const text=(value:any)=>typeof value==='string'?value:'';
const norm=(value:any)=>text(value).trim().replace(/\s+/g,' ').toLowerCase();
const cents=(value:any)=>Number.isSafeInteger(Number(value))?Number(value):0;
const count=(value:any)=>Math.max(0,cents(value));
const inactive=(row:Row)=>['cancelled','canceled','declined','rejected','deleted'].includes(norm(row.status))||['cancelled','declined','rejected'].includes(norm(row.approvalStatus))||!!row.deletedAt;
const pending=(row:Row)=>norm(row.approvalStatus)==='pending'||['pending','requested','awaiting approval'].includes(norm(row.status));
export function maldivesDate(value:string|number|Date):string {
 if(typeof value==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(value))return value;
 if(value===null||value===undefined||value==='')return '';
 const date=new Date(value);
 return Number.isNaN(date.getTime())?'':new Date(date.getTime()+5*3600000).toISOString().slice(0,10);
}
const createdAt=(row:Row)=>text(row.createdAt)||text(row.created)||list(row.history).filter(h=>/^booking (confirmed|created)|^reservation (confirmed|created)/i.test(text(h.detail))).map(h=>text(h.date)).filter(Boolean).sort()[0]||'';
const pax=(row:Row)=>row.pax!==undefined?count(row.pax):row.quantity!==undefined?count(row.quantity):row.adults!==undefined?count(row.adults)+count(row.children)+count(row.infants):list(row.guests).length;
export type DashboardTrip={id:string;time:string;name:string;pax:number;status:string;vessel?:string};
function transferRows(state:Row,transport:Row,today:string):DashboardTrip[] {
 const result:DashboardTrip[]=[];
 const tickets=list(transport.bookings);
 const ticketIds=new Set(tickets.map(b=>b.id));
 for(const booking of tickets){
  if(inactive(booking))continue;
  for(const [index,journey] of list(booking.journeys).entries()){
   if(journey.date!==today)continue;
   result.push({id:`${booking.id}:${index}`,time:text(journey.depart),name:`${text(journey.from)} → ${text(journey.to)}`,pax:pax(booking),status:Array.isArray(booking.checked)&&booking.checked.includes(journey.scheduleId)?'Checked in':text(booking.status)||'Confirmed',vessel:text(journey.boat)});
  }
 }
 // A room-linked transport ticket is also stored as an order: do not count it twice.
 for(const order of list(state.orders)){
  if(order.kind!=='transfer'||inactive(order)||ticketIds.has(order.id)||order.transportBooking||text(order.schedule?.date||order.date)!==today)continue;
  result.push({id:text(order.id),time:text(order.schedule?.time||order.time),name:text(order.name),pax:pax(order),status:text(order.status)||'Requested',vessel:text(order.schedule?.vessel)});
 }
 return result.sort((a,b)=>(a.time||'99:99').localeCompare(b.time||'99:99')||a.id.localeCompare(b.id));
}
function excursionRows(state:Row,schedules:Row[],today:string):{trips:DashboardTrip[]; awaiting:number} {
 const groups=new Map<string,{row:DashboardTrip;names:Set<string>;orders:Map<string,Row>}>();
 const bySchedule=new Map<string,string>();
 const vessels=list(state.excursionResources?.vessels);
 const make=(key:string,time:string,name:string,vessel:string)=>{
  let group=groups.get(key);
  if(!group){group={row:{id:key,time,name,pax:0,status:'Open',vessel},names:new Set(),orders:new Map()};groups.set(key,group);}
  if(name)group.names.add(name);
  return group;
 };
 for(const schedule of schedules){
  if(schedule.date!==today||inactive(schedule)||norm(schedule.status)==='closed')continue;
  // Shared products on the same assigned departure share one physical boat.
  const key=schedule.vesselId?`${today}|${schedule.time}|vessel:${schedule.vesselId}`:schedule.sharedGroup?`${today}|${schedule.time}|group:${schedule.sharedGroup}`:`schedule:${schedule.id}`;
  make(key,text(schedule.time),text(schedule.name),text(vessels.find(v=>v.id===schedule.vesselId)?.name));
  bySchedule.set(text(schedule.id),key);
 }
 let awaiting=0;
 for(const order of list(state.orders)){
  if(order.kind!=='excursion'||inactive(order)||text(order.schedule?.date||order.date)!==today)continue;
  const assigned=order.schedule||{};
  const time=text(assigned.time||order.time),vesselId=text(order.overflowVesselId||assigned.vesselId);
  let key=order.separateVessel&&vesselId?`${today}|${time}|vessel:${vesselId}`:bySchedule.get(text(order.scheduleId));
  if(!key&&assigned.date&&time)key=vesselId?`${today}|${time}|vessel:${vesselId}`:assigned.vessel?`${today}|${time}|boat:${norm(assigned.vessel)}`:`order:${order.id}`;
  if(!key){awaiting++;continue;}
  const group=make(key,time,text(order.name),text(assigned.vessel)||text(vessels.find(v=>v.id===vesselId)?.name));
  if(!pending(order))group.orders.set(text(order.id),order);
 }
 const trips=[...groups.values()].map(group=>{
  const orders=[...group.orders.values()];
  group.row.name=[...group.names].join(' + ');
  group.row.pax=orders.reduce((n,o)=>n+pax(o),0);
  group.row.status=orders.length===0?'Open':orders.every(o=>norm(o.status)==='completed')?'Completed':orders.some(o=>norm(o.status)==='departed')?'Departed':orders.every(o=>o.guestNotified||norm(o.status)==='scheduled and informed')?'Scheduled and informed':'Scheduled';
  return group.row;
 }).sort((a,b)=>(a.time||'99:99').localeCompare(b.time||'99:99')||a.id.localeCompare(b.id));
 return {trips,awaiting};
}
function receipts(state:Row,transport:Row,today:string,includeTransfers:boolean){
 const days=Array.from({length:7},(_,i)=>({date:new Date(Date.parse(today+'T00:00:00Z')-(6-i)*86400000).toISOString().slice(0,10),usdCents:0,mvrCents:0}));
 const byDate=new Map(days.map(day=>[day.date,day]));
 const seen=new Set<string>();let undated=0;
 const add=(id:string,amount:any,when:any,currency:'USD'|'MVR'='USD')=>{
  if(seen.has(id))return;seen.add(id);const value=cents(amount);if(!value)return;
  const date=maldivesDate(when);if(!date){undated++;return;}
  const day=byDate.get(date);if(day)day[currency==='USD'?'usdCents':'mvrCents']+=value;
 };
 const stayPayments=list(state.stays).flatMap(stay=>list(stay.payments));
 for(const stay of list(state.stays)){
  // Undated legacy opening balances must not be reported as today's takings.
  add(`initial:${stay.id}`,stay.initialPaid,stay.initialPaidAt);
  list(stay.payments).forEach((payment,index)=>add(`stay:${stay.id}:${payment.id||index}`,payment.cents,payment.date||payment.at));
 }
 for(const order of list(state.posOrders)){
  // Linked POS payments already appear in the room payment ledger.
  if(stayPayments.some(p=>p.reference===order.id))continue;
  const changes=list(order.history).filter(h=>/^Payment changed: /.test(text(h.detail))&&Number.isSafeInteger(h.cents));
  let recorded=false;
  for(const [index,change] of changes.entries()){
   const match=text(change.detail).match(/^Payment changed: (.+?) → (Cash|Card|Bank transfer|Room)(?: ·|$)/);
   if(!match)continue;recorded=true;
   const paid=(method:string)=>['Cash','Card','Bank transfer'].includes(method)?1:0;
   add(`pos:${order.id}:${index}`,cents(change.cents)*(paid(match[2])-paid(match[1])),change.date);
  }
  if(!recorded&&['Cash','Card','Bank transfer'].includes(order.method)&&!order.complimentary)add(`pos:${order.id}`,order.cents,order.paidAt);
 }
 for(const order of list(state.orders)){
  if(order.kind!=='excursion'||order.stayId)continue;
  list(order.excursionPayments).forEach((payment,index)=>add(`excursion:${order.id}:${payment.id||index}`,payment.cents,payment.at||payment.date));
 }
 if(includeTransfers)for(const booking of list(transport.bookings)){
  if(booking.stayId)continue; // USD room receipts already cover this ticket.
  const history=list(booking.paymentHistory);
  if(history.length){history.forEach((p,index)=>add(`transfer:${booking.id}:${p.id||index}`,p.cents,p.date||p.at,'MVR'));if(booking.undatedPaidCents)undated++;}
  else if(booking.paid)add(`transfer:${booking.id}`,booking.total,booking.paidAt,'MVR');
 }
 return {today:days[6],days,undated};
}
export function buildDashboard(state:Row,transport:Row,schedules:Row[],now:Date,access:DashboardAccess){
 const today=maldivesDate(now),stays=list(state.stays),active=stays.filter(s=>!inactive(s));
 const inHouse=active.filter(s=>norm(s.status)==='in house');
 const rooms=[...new Map(list(state.rooms).map(room=>[String(room.number),room])).values()];
 const occupied=new Set(inHouse.map(stay=>String(stay.room)));
 let available=0,cleaning=0,maintenance=0,other=0,occupiedCount=0;
 for(const room of rooms){
  if(occupied.has(String(room.number))||norm(room.status)==='occupied'){occupiedCount++;continue;}
  if(norm(room.status)==='available')available++;
  else if(norm(room.status)==='cleaning')cleaning++;
  else if(norm(room.status)==='maintenance')maintenance++;
  else other++;
 }
 const requests=list(state.requests).filter(r=>!inactive(r)&&pending(r));
 const reservations=[...active,...requests.filter(r=>!active.some(s=>s.id===r.stayId||s.id===r.bookingId||s.requestId===r.id))];
 const recent=reservations.map(s=>({id:text(s.id),guest:text(s.guest||s.name)||'Guest',checkIn:text(s.checkIn),checkOut:text(s.checkOut),room:text(s.room),pax:pax(s),status:text(s.status)||'Pending',createdAt:createdAt(s)})).sort((a,b)=>(b.createdAt||b.checkIn).localeCompare(a.createdAt||a.checkIn)||b.id.localeCompare(a.id)).slice(0,5);
 const transfers=access.transfers?transferRows(state,transport,today):null;
 const excursions=access.excursions?excursionRows(state,schedules,today):null;
 const roomByNumber=new Map(rooms.map((room:any)=>[String(room.number),room]));
 const guestStays=access.reports?active.flatMap((stay:any)=>{
  const storedGuests=list(stay.guests);
  const people=storedGuests.length?storedGuests:[{name:stay.guest||'Guest',passportNumber:stay.passportNumber||stay.passportNo||stay.passport||'',country:stay.country||stay.nationality||'',kind:'adult'}];
  return people.map((guest:any,index:number)=>({
   bookingId:text(stay.id),
   guestName:text(guest.name)||(index===0?text(stay.guest)||'Guest':'Guest '+(index+1)),
   checkIn:text(stay.checkIn),
   checkOut:text(stay.checkOut),
   passportNumber:text(guest.passportNumber||guest.passportNo||guest.passport||guest.documentNumber),
   country:text(guest.country||guest.nationality),
   roomNumber:text(stay.room),
   roomType:text(roomByNumber.get(String(stay.room))?.type||stay.roomType||'Room'),
   status:text(stay.status)||'Confirmed'
  }));
 }).sort((a:any,b:any)=>b.checkIn.localeCompare(a.checkIn)||a.roomNumber.localeCompare(b.roomNumber)||a.guestName.localeCompare(b.guestName)):null;
 const hour=new Date(now.getTime()+5*3600000).getUTCHours();
 return {updatedAt:now.toISOString(),date:today,timeZone:'Indian/Maldives',greeting:hour<12?'Good morning from Dhiffushi':hour<18?'Good afternoon from Dhiffushi':'Good evening from Dhiffushi',access,
  stats:{checkIns:active.filter(s=>!pending(s)&&s.checkIn===today).length,checkOuts:active.filter(s=>!pending(s)&&s.checkOut===today).length,inHouseGuests:inHouse.reduce((n,s)=>n+pax(s),0),newBookings:reservations.filter(s=>maldivesDate(createdAt(s))===today).length,pendingBookings:requests.length},
  occupancy:{total:rooms.length,occupied:occupiedCount,available,cleaning,maintenance,other,percent:rooms.length?Math.round(occupiedCount/rooms.length*100):0},
  recent,transfers,excursions,revenue:access.revenue?receipts(state,transport,today,access.transfers):null,guestStays};
}
export type DashboardData=ReturnType<typeof buildDashboard>;
