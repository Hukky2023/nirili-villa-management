import {mirrorTransportState,readOperationalRecordPrimary,saveOperationalRecordPrimary} from './supabase-bridge';

const key='transport-bookings-v1';

export function staleTransportBookingIds(plan:any){
 const ids:string[]=[];
 for(const leg of ['arrival','departure']){
  const item=plan?.[leg]||{};
  for(const value of [item.previousTransportBookingId,item.cancelTransportBookingId]){
   const id=String(value||'').trim();if(id&&!ids.includes(id))ids.push(id);
  }
 }
 return ids;
}

export async function cancelLinkedTransportBookings(options:{stayId?:string;ids?:string[];by:string}){
 const ids=new Set((options.ids||[]).map(String).filter(Boolean)),stayId=String(options.stayId||'');
 if(!stayId&&!ids.size)return 0;
 const row=await readOperationalRecordPrimary(key);if(!row?.payload)return 0;
 const state=row.payload;state.bookings??=[];
 let changed=0;
 for(const booking of state.bookings){
  if(booking.status==='Cancelled')continue;
  if((stayId&&String(booking.stayId||'')===stayId)||ids.has(String(booking.id||''))){
   booking.status='Cancelled';booking.checked=[];booking.cancelledAt=new Date().toISOString();booking.cancelledBy=options.by;changed++;
  }
 }
 if(!changed)return 0;
 const revision=await saveOperationalRecordPrimary(key,state,Number(row.revision)||0,options.by);
 if(!revision)throw Error('Transport changed while the linked room booking was being updated.');
 try{await mirrorTransportState(state);}catch{}
 return changed;
}


export async function moveLinkedTransportRoom(options:{stayId:string;fromRoom:string;toRoom:string;by:string}){
 const stayId=String(options.stayId||''),fromRoom=String(options.fromRoom||''),toRoom=String(options.toRoom||'');
 if(!stayId||!toRoom||fromRoom===toRoom)return 0;
 const row=await readOperationalRecordPrimary(key);if(!row?.payload)return 0;
 const state=row.payload;state.bookings??=[];
 let changed=0;
 for(const booking of state.bookings){
  if(String(booking?.stayId||'')!==stayId)continue;
  if(String(booking?.room||'')===fromRoom||!booking?.room){booking.room=toRoom;changed++;}
  if(booking?.billRoom!==undefined&&String(booking.billRoom)===fromRoom)booking.billRoom=toRoom;
 }
 if(!changed)return 0;
 const revision=await saveOperationalRecordPrimary(key,state,Number(row.revision)||0,options.by);
 if(!revision)throw Error('Transport changed while the linked room was being moved.');
 try{await mirrorTransportState(state);}catch{}
 return changed;
}
