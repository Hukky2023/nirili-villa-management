import {catalog} from './guest-catalog';
import {roomRates,validateRoomRates} from './room-rates';
import {updateRoomInventory} from './rooms';

export function transferServices(state:any){
 return (Array.isArray(state.transferServices)?state.transferServices:catalog.filter(item=>item.kind==='transfer')).filter((item:any)=>item.active!==false);
}
export function propertyCatalog(state:any,revision:number){
 updateRoomInventory(state);
 return {rooms:state.rooms,rates:roomRates(state.roomRates),services:transferServices(state),revision};
}
const text=(value:any,max:number)=>typeof value==='string'?value.trim().slice(0,max):'';
export function changePropertyCatalog(state:any,body:any,by:string){
 updateRoomInventory(state);
 const at=new Date().toISOString();
 let detail='';
 if(body.action==='save-rates'){
  state.roomRates=validateRoomRates(body.rates);
  detail='Room nightly rates updated';
 }else if(body.action==='save-room'){
  const raw=body.room||{},number=text(raw.number,12),original=text(body.originalNumber,12);
  if(!/^[A-Za-z0-9-]{1,12}$/.test(number)||!text(raw.type,80)||!text(raw.bed,120)||!Number.isInteger(raw.capacity)||raw.capacity<1||raw.capacity>3)throw Error('Enter a room number, type, bed and capacity from 1 to 3 guests.');
  const existing=state.rooms.find((room:any)=>room.number===original);
  if(original&&!existing)throw Error('Room not found. Refresh and try again.');
  if(state.rooms.some((room:any)=>room.number===number&&room!==existing))throw Error('That room number already exists.');
  // Room numbers identify bills and account access. Keep an existing number stable.
  if(existing&&original!==number)throw Error('Existing room numbers cannot be changed. Add a new room instead.');
  const liveStays=(state.stays||[]).filter((stay:any)=>stay.room===number&&!['Checked Out','Cancelled'].includes(stay.status));
  if(liveStays.some((stay:any)=>Number(stay.pax)>raw.capacity))throw Error('Move the booking with more guests before reducing this room’s capacity.');
  const next={...existing,number,type:text(raw.type,80),bed:text(raw.bed,120),extraBed:text(raw.extraBed,120),capacity:raw.capacity,occupancy:text(raw.occupancy,200)||'Up to '+raw.capacity+' guests',status:existing?.status||'Available',note:existing?.note||''};
  state.rooms=existing?state.rooms.map((room:any)=>room.number===number?next:room):[...state.rooms,next];
  state.roomCatalogManaged=true;
  detail=(existing?'Updated room ':'Added room ')+number;
 }else if(body.action==='remove-room'){
  const room=state.rooms.find((room:any)=>room.number===body.number);
  if(!room)throw Error('Room not found. Refresh and try again.');
  if((state.stays||[]).some((stay:any)=>stay.room===room.number&&!['Checked Out','Cancelled'].includes(stay.status)))throw Error('Move or close this room’s active bookings before removing it.');
  state.removedRooms??=[];
  state.removedRooms.push({...room,removedAt:at,removedBy:by});
  state.rooms=state.rooms.filter((item:any)=>item.number!==room.number);
  state.roomCatalogManaged=true;
  detail='Removed room '+room.number+' from available inventory';
 }else if(body.action==='save-service'||body.action==='remove-service'){
  const services=transferServices(state).map((item:any)=>({...item}));
  const id=text(body.id,100),index=services.findIndex((item:any)=>item.id===id);
  if(id&&index<0)throw Error('Transfer service not found. Refresh and try again.');
  if(body.action==='remove-service'){
   if(index<0)throw Error('Choose a transfer service.');
   detail='Removed transfer service '+services[index].name;
   services.splice(index,1);
  }else{
   const raw=body.service||{};
   if(!text(raw.name,120)||!Number.isInteger(raw.cents)||raw.cents<0||raw.cents>1000000)throw Error('Enter a transfer service name and price between $0 and $10,000.');
   const item={id:id||'transfer-'+crypto.randomUUID(),kind:'transfer',name:text(raw.name,120),detail:text(raw.detail,1000),cents:raw.cents,active:true};
   if(index<0)services.push(item);else services[index]=item;
   detail=(id?'Updated transfer service ':'Added transfer service ')+item.name;
  }
  state.transferServices=services;
 }else throw Error('Unknown catalog action.');
 state.catalogHistory??=[];
 state.catalogHistory.push({at,by,detail});
 return detail;
}
