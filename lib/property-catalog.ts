import {catalog} from './guest-catalog';
import {roomRates,validateRoomRates} from './room-rates';
import {updateRoomInventory} from './rooms';

export function transferServices(state:any){
 return (Array.isArray(state.transferServices)?state.transferServices:catalog.filter(item=>item.kind==='transfer')).filter((item:any)=>item.active!==false);
}
export function propertyPackages(state:any){
 return (Array.isArray(state.propertyPackages)?state.propertyPackages:[])
  .filter((item:any)=>item&&item.removed!==true)
  .sort((a:any,b:any)=>String(a.name||'').localeCompare(String(b.name||'')));
}
export function propertyPromotions(state:any){
 return (Array.isArray(state.propertyPromotions)?state.propertyPromotions:[])
  .filter((item:any)=>item&&item.removed!==true)
  .sort((a:any,b:any)=>String(a.name||'').localeCompare(String(b.name||'')));
}
export function propertyCatalog(state:any,revision:number){
 updateRoomInventory(state);
 return {
  rooms:state.rooms,
  rates:roomRates(state.roomRates),
  services:transferServices(state),
  packages:propertyPackages(state),
  promotions:propertyPromotions(state),
  revision
 };
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
 }else if(body.action==='save-package'||body.action==='remove-package'){
  const packages=propertyPackages(state).map((item:any)=>({...item,excursions:Array.isArray(item.excursions)?[...item.excursions]:[]}));
  const id=text(body.id,100),index=packages.findIndex((item:any)=>item.id===id);
  if(id&&index<0)throw Error('Package not found. Refresh and try again.');
  if(body.action==='remove-package'){
   if(index<0)throw Error('Choose a package.');
   detail='Removed package '+packages[index].name;
   packages.splice(index,1);
  }else{
   const raw=body.package||{};
   const name=text(raw.name,160);
   const nights=Number(raw.nights);
   const mealPlan=text(raw.mealPlan,80);
   const allowedMeals=['Bed & Breakfast','Half Board','Full Board'];
   const excursions=Array.isArray(raw.excursions)?Array.from(new Set(raw.excursions.map((value:any)=>text(value,100)).filter(Boolean))).slice(0,30):[];
   const includeTransfer=raw.includeTransfer===true;
   const singleCents=Number(raw.singleCents??raw.cents??0);
   const doubleCents=Number(raw.doubleCents??raw.cents??0);
   const tripleCents=Number(raw.tripleCents??raw.cents??0);
   if(!name)throw Error('Enter a package name.');
   if(!Number.isInteger(nights)||nights<1||nights>30)throw Error('Choose package duration from 1 to 30 nights.');
   if(!allowedMeals.includes(mealPlan))throw Error('Choose a valid meal plan.');
   if([singleCents,doubleCents,tripleCents].some(value=>!Number.isInteger(value)||value<0||value>10000000))throw Error('Enter Single, Double and Triple package prices between $0 and $100,000.');
   const item={
    id:id||'package-'+crypto.randomUUID(),
    kind:'package',
    name,
    nights,
    days:nights+1,
    mealPlan,
    excursions,
    includeTransfer,
    transferLabel:includeTransfer?(text(raw.transferLabel,120)||'Return airport transfer'):'',
    singleCents,
    doubleCents,
    tripleCents,
    // Keep cents for older consumers; double occupancy is the default package headline price.
    cents:doubleCents,
    childPolicy:'Maximum 3 guests per room. 1 adult + up to 2 children, or 2 adults + 1 child. Children are included within the 3-person room capacity.',
    active:raw.active!==false,
    updatedAt:at,
    updatedBy:by
   };
   if(index<0)packages.push(item);else packages[index]=item;
   detail=(id?'Updated package ':'Added package ')+item.name;
  }
  state.propertyPackages=packages;
 }else if(body.action==='save-promotion'||body.action==='remove-promotion'){
  const promotions=propertyPromotions(state).map((item:any)=>({...item,packageIds:Array.isArray(item.packageIds)?[...item.packageIds]:[],roomTypes:Array.isArray(item.roomTypes)?[...item.roomTypes]:[]}));
  const id=text(body.id,100),index=promotions.findIndex((item:any)=>item.id===id);
  if(id&&index<0)throw Error('Promotion not found. Refresh and try again.');
  if(body.action==='remove-promotion'){
   if(index<0)throw Error('Choose a promotion.');
   detail='Removed promotion '+promotions[index].name;
   promotions.splice(index,1);
  }else{
   const raw=body.promotion||{};
   const name=text(raw.name,160);
   const detailText=text(raw.detail,2000);
   const validFrom=text(raw.validFrom,10),validTo=text(raw.validTo,10);
   const packageIds=Array.isArray(raw.packageIds)?Array.from(new Set(raw.packageIds.map((value:any)=>text(value,100)).filter(Boolean))).slice(0,100):[];
   const roomTypes=Array.isArray(raw.roomTypes)?Array.from(new Set(raw.roomTypes.map((value:any)=>text(value,80)).filter(Boolean))).slice(0,50):[];
   const packageSet=new Set(propertyPackages(state).map((item:any)=>item.id));
   const roomTypeSet=new Set((state.rooms||[]).map((room:any)=>text(room.type,80)).filter(Boolean));
   if(!name)throw Error('Enter a promotion name.');
   if(!validFrom||!/^\d{4}-\d{2}-\d{2}$/.test(validFrom))throw Error('Choose the promotion start date.');
   if(!validTo||!/^\d{4}-\d{2}-\d{2}$/.test(validTo))throw Error('Choose the promotion end date.');
   if(validTo<validFrom)throw Error('Promotion end date must be after the start date.');
   if(!packageIds.length||packageIds.some(id=>!packageSet.has(id)))throw Error('Choose at least one valid package for this promotion.');
   if(!roomTypes.length||roomTypes.some(type=>!roomTypeSet.has(type)))throw Error('Choose at least one valid room type for this promotion.');
   const item={
    id:id||'promotion-'+crypto.randomUUID(),
    kind:'promotion',
    name,
    detail:detailText,
    packageIds,
    roomTypes,
    validFrom,
    validTo,
    active:raw.active!==false,
    updatedAt:at,
    updatedBy:by
   };
   if(index<0)promotions.push(item);else promotions[index]=item;
   detail=(id?'Updated promotion ':'Added promotion ')+item.name;
  }
  state.propertyPromotions=promotions;
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
