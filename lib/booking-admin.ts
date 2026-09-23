import {createDirectBooking} from './direct-booking';
import {mergeTransportPlanInternal,syncTransportBuggy} from './transport-plan';
export function editBooking(state:any,s:any,b:any,by:string){
 if(s.status==='Checked Out')throw Error('This stay is checked out. Its booking details are closed.');
 if(s.extensions?.length&&(b.checkIn!==s.checkIn||b.checkOut!==s.checkOut||b.rateCents!==(s.rateCents??Math.round(s.base/((Date.parse(s.checkOut)-Date.parse(s.checkIn))/86400000)))))throw Error('This booking has stay extensions. Use Extend Stay to change its dates; other details can still be edited.');
 const trial={...state,stays:state.stays.filter((x:any)=>x.id!==s.id)};
 const validated=createDirectBooking(trial,{...b,requestId:crypto.randomUUID()},by);
 if(s.status==='In House'&&b.room!==s.room){const target=state.rooms.find((r:any)=>r.number===b.room);if(target.status!=='Available'||state.stays.some((x:any)=>x.id!==s.id&&x.room===b.room&&x.status==='In House'))throw Error('The destination room must be available before moving an in-house guest.');}
 const previous={guest:s.guest,room:s.room,checkIn:s.checkIn,checkOut:s.checkOut,pax:s.pax,meal:s.meal,source:s.source,base:s.base,rateCents:s.rateCents};
 if(s.status==='In House'&&b.room!==s.room){state.rooms.find((r:any)=>r.number===s.room).status='Cleaning';state.rooms.find((r:any)=>r.number===b.room).status='Occupied';}
 const transportPlan=b.transportPlan?mergeTransportPlanInternal(s.transportPlan,validated.transportPlan):s.transportPlan;
 Object.assign(s,{guest:validated.guest,room:validated.room,checkIn:validated.checkIn,checkOut:validated.checkOut,pax:validated.pax,meal:validated.meal,source:validated.source,transportPlan,rateCents:validated.rateCents,base:s.extensions?.length?s.base:validated.base});
 if(b.transportPlan){syncTransportBuggy(state,s,'arrival',transportPlan?.arrival?.launch);syncTransportBuggy(state,s,'departure',transportPlan?.departure?.launch);}
 s.history.unshift({date:new Date().toISOString(),by,detail:'Booking details edited',previous});
 return previous;
}
export function deleteBooking(state:any,s:any,by:string){
 const orders=(state.orders||[]).filter((o:any)=>o.stayId===s.id),posOrders=(state.posOrders||[]).filter((o:any)=>o.stayId===s.id);
 state.deletedBookings??=[];
 state.deletedBookings.push({stay:s,orders,posOrders,deletedAt:new Date().toISOString(),deletedBy:by});
 state.stays=state.stays.filter((x:any)=>x.id!==s.id);
 state.orders=(state.orders||[]).filter((o:any)=>o.stayId!==s.id);
 state.posOrders=(state.posOrders||[]).filter((o:any)=>o.stayId!==s.id);
 for(const q of state.requests||[])if(q.stayId===s.id)q.status='Deleted';
 if(s.status==='In House'&&!state.stays.some((x:any)=>x.room===s.room&&x.status==='In House'))state.rooms.find((r:any)=>r.number===s.room).status='Cleaning';
}
