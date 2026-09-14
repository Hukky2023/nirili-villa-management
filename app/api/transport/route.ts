import {loadStays,stayKey} from '../../../lib/stays';
import {canTransport,isTransportAgent,transportRole} from '../../../lib/transport-access';
import {authDb,currentUser,hasPermission,sameOrigin} from '../../../lib/auth';
import {restaurantOnly} from '../../../lib/pos-access';
import {createTransfer,initialTransport,TransportState,Sailing} from '../../../lib/transport';
const key='transport-bookings-v1';
async function load(){const row=await authDb().prepare('SELECT payload,revision FROM operation_records WHERE key=?').bind(key).first<any>();return {state:row?JSON.parse(row.payload) as TransportState:initialTransport(),revision:row?.revision||0};}
async function visible(state:TransportState,revision:number,u:any){const canEdit=hasPermission(u,'edit_transfers');const hotel=await loadStays();const eligible=u.role==='guest'&&!isTransportAgent(u)?hotel.state.stays.filter((s:any)=>s.accountId===u.userId&&['In House','Confirmed'].includes(s.status)&&s.checkOut>=new Date(Date.now()+5*3600000).toISOString().slice(0,10)):[];const ownRoom=eligible.length===1?{id:eligible[0].id,room:eligible[0].room,checkIn:eligible[0].checkIn,checkOut:eligible[0].checkOut}:null;return {revision,canEdit,isAdmin:u.role==='admin',role:transportRole(u),ownRoom,sailings:canEdit?state.sailings:state.sailings.filter(s=>s.active),bookings:state.bookings.filter(b=>canEdit||b.owner===u.userId).map(({token,owner,...b})=>b),availability:state.bookings.filter(b=>b.status!=='Cancelled').flatMap(b=>b.journeys.map(j=>({scheduleId:j.scheduleId,date:j.date,seats:j.seats,pax:b.adults+b.children+b.infants}))) };}
export async function GET(){const u=await currentUser();if(!u||!canTransport(u))return Response.json({error:'Sign in to access transfers.'},{status:403});try{const {state,revision}=await load();return Response.json(await visible(state,revision,u),{headers:{'Cache-Control':'no-store'}});}catch{return Response.json({error:'Unable to load transfers. Please retry.'},{status:503});}}
export async function POST(r:Request){const u=await currentUser();if(!u||!canTransport(u)||!sameOrigin(r))return Response.json({error:'Not allowed.'},{status:403});try{
 const b=await r.json();const {state,revision}=await load();const canEdit=hasPermission(u,'edit_transfers');
 if(b.action==='book'&&state.bookings.some(x=>x.token===b.token&&x.owner===u.userId))return Response.json(await visible(state,revision,u));
 if(b.revision!==revision)return Response.json({error:'Transfers changed on another device. Refresh and review before saving.'},{status:409});
 let hotelWrite:any=null;
 if(b.action==='book'){
 const booking=createTransfer(state,b,u.userId);
 if(b.payment==='room'){
 if(u.role!=='guest'||isTransportAgent(u))return Response.json({error:'Only a linked guest login can charge transport to a room.'},{status:403});
 const hotel=await loadStays();const eligible=hotel.state.stays.filter((s:any)=>s.accountId===u.userId&&['In House','Confirmed'].includes(s.status)&&booking.journeys.every(j=>j.date>=s.checkIn&&j.date<=s.checkOut));
 if(eligible.length!==1)throw Error('An eligible room must be linked to your guest login for all travel dates. Ask reception for help.');
 const stay=eligible[0];let cents=0;
 for(const j of booking.journeys){const fare=state.sailings.find(s=>s.id===j.scheduleId)?.roomFare;if(!Number.isInteger(fare)||fare!<0)throw Error('Reception must set the USD room fare before this departure can be charged to your room.');cents+=fare!*b.adults+Math.round(fare!/2)*b.children;}
 if(cents!==b.expectedRoomCents)throw Error('The room fare changed. Review the USD total before booking.');
 booking.stayId=stay.id;booking.room=stay.room;booking.roomCents=cents;
 hotel.state.orders.push({id:booking.id,token:booking.token,accountId:u.userId,stayId:stay.id,guest:stay.guest,room:stay.room,kind:'transfer',name:booking.journeys.map(j=>j.from+' → '+j.to+' · '+j.date+' '+j.depart+' · '+j.boat+' · seats '+j.seats.join(', ')).join(' / '),quantity:1,cents,notes:booking.notes,date:booking.journeys[0].date,time:booking.journeys[0].depart,status:'Confirmed',createdAt:booking.created,transportBooking:true});
 hotelWrite=hotel;
 }else if(b.payment!==undefined&&b.payment!=='later')throw Error('Choose a payment method.');
 state.bookings.push(booking);
 }
 else if(b.action==='sailing'){
 if(!canEdit)return Response.json({error:'Transfer editing permission required.'},{status:403});const s=b.sailing;
 if(!s||['boat','from','to'].some(k=>typeof s[k]!=='string'||!s[k].trim()||s[k].length>100)||s.from===s.to||!['depart','arrive'].every(k=>/^([01]\d|2[0-3]):[0-5]\d$/.test(s[k]))||s.arrive<=s.depart||!Number.isInteger(s.capacity)||s.capacity<1||s.capacity>100||!Number.isInteger(s.fare)||s.fare<0||s.fare>10000000||typeof s.active!=='boolean')throw Error('Check route, same-day departure and arrival times, fare and capacity.');
 if(s.roomFare!==undefined&&(!Number.isInteger(s.roomFare)||s.roomFare<0||s.roomFare>10000000))throw Error('Enter a valid USD room fare.');
 const previous=state.sailings.find(x=>x.id===s.id);if(s.id&&!previous)throw Error('Departure not found.');
 if(previous&&state.bookings.some(x=>x.status!=='Cancelled'&&x.journeys.some(j=>j.scheduleId===s.id&&Date.parse(j.date+'T'+j.depart+':00+05:00')>Date.now()))&&['boat','from','to','depart','arrive','capacity'].some(k=>previous[k as keyof Sailing]!==s[k]))throw Error('This departure has future bookings. Create a new schedule to change its route, time, boat or capacity.');
 const sailing:Sailing={id:previous?.id||crypto.randomUUID(),boat:s.boat.trim(),from:s.from.trim(),to:s.to.trim(),depart:s.depart,arrive:s.arrive,capacity:s.capacity,fare:s.fare,roomFare:s.roomFare,active:s.active};state.sailings=previous?state.sailings.map(x=>x.id===s.id?sailing:x):[...state.sailings,sailing];
 }else if(b.action==='status'){
 if(!canEdit)return Response.json({error:'Transfer editing permission required.'},{status:403});const booking=state.bookings.find(x=>x.id===b.id);if(!booking)throw Error('Booking not found.');
 if(booking.stayId&&['cancel','paid'].includes(b.operation))throw Error('This ticket is charged to a room. Manage payment through the guest room bill; contact Admin for cancellation.');
 if(b.operation==='cancel'){booking.status='Cancelled';booking.checked=[];}
 else if(booking.status==='Cancelled')throw Error('This booking is cancelled.');
 else if(b.operation==='paid')booking.paid=!booking.paid;
 else if(b.operation==='checkin'&&booking.journeys.some(j=>j.scheduleId===b.scheduleId)){booking.checked=booking.checked.includes(b.scheduleId)?booking.checked.filter(x=>x!==b.scheduleId):[...booking.checked,b.scheduleId];}
 else throw Error('Invalid booking action.');
 }else throw Error('Unknown action.');
 if(hotelWrite){
 const writeToken=crypto.randomUUID();const payload=JSON.stringify({...state,writeToken});
 const transportSql=revision===0?authDb().prepare('INSERT OR IGNORE INTO operation_records(key,payload,revision,updated_by) SELECT ?,?,1,? WHERE EXISTS(SELECT 1 FROM operation_records WHERE key=? AND revision=?)').bind(key,payload,u.userId,stayKey,hotelWrite.revision):authDb().prepare('UPDATE operation_records SET payload=?,revision=revision+1,updated_by=? WHERE key=? AND revision=? AND EXISTS(SELECT 1 FROM operation_records WHERE key=? AND revision=?)').bind(payload,u.userId,key,revision,stayKey,hotelWrite.revision);
 const hotelSql=authDb().prepare("UPDATE operation_records SET payload=?,revision=revision+1,updated_by=? WHERE key=? AND revision=? AND EXISTS(SELECT 1 FROM operation_records WHERE key=? AND json_extract(payload,'$.writeToken')=?)").bind(JSON.stringify(hotelWrite.state),u.userId,stayKey,hotelWrite.revision,key,writeToken);
 const results=await authDb().batch([transportSql,hotelSql]);
 if(!results[0].meta.changes||!results[1].meta.changes)return Response.json({error:'Room or seat availability changed. Refresh and try again.'},{status:409});
 return Response.json(await visible(state,revision+1,u));
 }
 const payload=JSON.stringify(state);const result=revision===0?await authDb().prepare('INSERT OR IGNORE INTO operation_records(key,payload,revision,updated_by) VALUES(?,?,1,?)').bind(key,payload,u.userId).run():await authDb().prepare('UPDATE operation_records SET payload=?,revision=revision+1,updated_by=? WHERE key=? AND revision=?').bind(payload,u.userId,key,revision).run();
 if(!result.meta.changes)return Response.json({error:'Another booking was saved first. Refresh and review your seats.'},{status:409});
 return Response.json(await visible(state,revision+1,u));
 }catch(e){return Response.json({error:e instanceof Error?e.message:'Unable to save transfers.'},{status:400});}}
