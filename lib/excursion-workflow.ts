import {catalog,validDate} from './guest-catalog';
import {scheduleExcursion} from './excursion-schedule';
export const vesselConditions=['Available','Under maintenance','Out of service'];
const norm=(s:string)=>String(s||'').trim().replace(/\s+/g,' ').toLowerCase();
function validateVesselCapacity(value:any){
 // Undefined keeps older status-only clients compatible; null clears a recorded limit.
 if(value!==undefined&&value!==null&&(!Number.isSafeInteger(value)||value<1))throw Error('Enter a positive whole number for passenger capacity, or leave it blank.');
}
export function excursionResources(state:any){
 const saved=state.excursionResources||{vessels:[],crew:[]};const vessels=[...saved.vessels],crew=[...saved.crew];
 const add=(list:any[],name:string,prefix:string)=>{if(name&&!list.some(x=>norm(x.name)===norm(name)))list.push({id:prefix+norm(name),name:name.trim()});};
 for(const o of state.orders||[]){if(o.kind!=='excursion'||!o.schedule)continue;if(!vessels.some(v=>v.id===o.schedule.vesselId)&&!(state.excursionRemovedVessels||[]).includes(norm(o.schedule.vessel)))add(vessels,o.schedule.vessel,'v:');for(const name of o.schedule.crew||[])add(crew,name,'c:');}
 return {vessels:vessels.map(v=>({...v,condition:v.condition||'Available'})),crew:crew.map(c=>({...c,active:c.active!==false&&c.active!==0}))};
}
export function excursionStage(o:any){if(['Completed','Cancelled','Departed'].includes(o.status))return o.status;return o.schedule||o.status==='Scheduled and informed'?'Scheduled':'Awaiting scheduling';}
export function excursionPaid(o:any,state:any){const stay=state.stays.find((s:any)=>s.id===o.stayId);if(stay)return !stay.markedUnpaid&&stay.paidBills?.['Excursions:'+o.id]===o.cents;return (o.excursionPayments||[]).reduce((sum:number,p:any)=>sum+p.cents,0)>=o.cents&&!!o.excursionPayments?.length;}
export function changeExcursionStatus(o:any,status:string,state:any,by:string){
 const stage=excursionStage(o);if(['Completed','Cancelled'].includes(stage))throw Error('This booking is closed.');
 const allowed:Record<string,string[]>={'Awaiting scheduling':['Cancelled'],'Scheduled':['Departed','Cancelled'],'Departed':['Completed']};
 if(!allowed[stage]?.includes(status))throw Error('Follow the excursion status sequence.');
 if(status==='Departed'){const v=excursionResources(state).vessels.find(v=>v.id===o.schedule?.vesselId||norm(v.name)===norm(o.schedule?.vessel||''));if(!v||v.condition!=='Available')throw Error('The assigned vessel is unavailable. Edit the schedule to select an available vessel.');}
 if(status==='Completed'&&!excursionPaid(o,state))throw Error('Receive full payment before completing this excursion.');
 o.statusHistory=[...(o.statusHistory||[]),{from:stage,to:status,at:new Date().toISOString(),by}];o.status=status;o.updatedBy=by;
}
export function applyExcursionAction(state:any,b:any,today:string,by:string){
 if(b.action==='excursion-resource'){
 if(!['vessels','crew'].includes(b.resourceType)||typeof b.name!=='string'||!b.name.trim()||b.name.length>100)throw Error('Enter a vessel or crew member name.');
 const resources=excursionResources(state),list=resources[b.resourceType as 'vessels'|'crew'];if(list.some(x=>norm(x.name)===norm(b.name)))throw Error('That name is already in the list.');if(b.resourceType==='vessels'&&b.condition!==undefined&&!vesselConditions.includes(b.condition))throw Error('Choose a valid vessel condition.');if(b.resourceType==='vessels')validateVesselCapacity(b.capacity);list.push({id:b.resourceId||crypto.randomUUID(),name:b.name.trim(),...(b.resourceType==='vessels'?{condition:b.condition||'Available',...(b.capacity!=null?{capacity:b.capacity}:{})}:{accountId:b.accountId||'',username:b.username||''})});state.excursionResources=resources;return;
 }
 if(b.action==='excursion-crew-update'){
 const resources=excursionResources(state),member=resources.crew.find(c=>c.id===b.crewId);if(!member)throw Error('Crew member not found.');
 const name=String(b.name===undefined?member.name:b.name).trim();
 if(!name||name.length>100)throw Error('Enter a crew member name of 1–100 characters.');
 if(resources.crew.some(c=>c.id!==member.id&&norm(c.name)===norm(name)))throw Error('That name is already in the crew list.');
 if(typeof b.active!=='boolean')throw Error('Choose whether this crew member is active or inactive.');
 const oldName=member.name;member.name=name;member.active=b.active;member.updatedBy=by;member.updatedAt=new Date().toISOString();
 for(const order of state.orders||[]){
  if(order.kind!=='excursion'||!order.schedule)continue;
  const ids=Array.isArray(order.schedule.crewIds)?order.schedule.crewIds:[];
  const names=Array.isArray(order.schedule.crew)?order.schedule.crew:[];
  if(ids.includes(member.id))order.schedule.crew=ids.map((id:string)=>resources.crew.find(c=>c.id===id)?.name||names[ids.indexOf(id)]||id);
  else if(norm(oldName)!==norm(name))order.schedule.crew=names.map((crewName:string)=>norm(crewName)===norm(oldName)?name:crewName);
 }
 state.excursionResources=resources;return;
 }
 if(['excursion-vessel-condition','excursion-vessel-remove'].includes(b.action)){
 const resources=excursionResources(state),vessel=resources.vessels.find(v=>v.id===b.vesselId);if(!vessel)throw Error('Vessel not found.');
 if(b.action==='excursion-vessel-condition'){
 if(!vesselConditions.includes(b.condition))throw Error('Choose a valid vessel condition.');
 const name=b.name===undefined?vessel.name:b.name;
 if(typeof name!=='string'||!name.trim()||name.length>100)throw Error('Enter a vessel name of 1–100 characters.');
 if(resources.vessels.some(v=>v.id!==vessel.id&&norm(v.name)===norm(name)))throw Error('That name is already in the list.');
 validateVesselCapacity(b.capacity);
 // Keep the stable vessel ID, including when old bookings only stored its name.
 // Never change passengers, billing, crew, dates or completed trip name snapshots.
 const oldName=vessel.name,newName=name.trim();
 if(newName!==oldName){
  for(const order of state.orders||[]){
   if(order.kind!=='excursion'||!order.schedule)continue;
   const assigned=order.schedule.vesselId===vessel.id||(!order.schedule.vesselId&&norm(order.schedule.vessel)===norm(oldName));
   if(!assigned)continue;
   order.schedule.vesselId=vessel.id;
   if(!['Completed','Cancelled'].includes(excursionStage(order)))order.schedule.vessel=newName;
  }
  // Historical name-only records must not recreate the previous name as a new boat.
  if(norm(oldName)!==norm(newName))state.excursionRemovedVessels=[...new Set([...(state.excursionRemovedVessels||[]),norm(oldName)])];
 }
 vessel.name=newName;
 if(b.capacity===null)delete vessel.capacity;else if(b.capacity!==undefined)vessel.capacity=b.capacity;
 vessel.condition=b.condition;vessel.updatedBy=by;vessel.updatedAt=new Date().toISOString();
 }else{
 const assigned=state.orders.some((o:any)=>o.kind==='excursion'&&o.schedule&&!['Completed','Cancelled'].includes(excursionStage(o))&&(o.schedule.vesselId===vessel.id||norm(o.schedule.vessel)===norm(vessel.name)));
 if(assigned)throw Error('This vessel has active trips. Reassign or cancel those trips before removing it.');
 resources.vessels=resources.vessels.filter(v=>v.id!==vessel.id);state.excursionRemovedVessels=[...new Set([...(state.excursionRemovedVessels||[]),norm(vessel.name)])];
 }
 state.excursionResources=resources;return;
 }
 if(b.action==='excursion-create'){
 if(typeof b.token!=='string'||!/^[-a-zA-Z0-9]{12,80}$/.test(b.token))throw Error('Reopen the booking form.');if(state.orders.some((o:any)=>o.manualToken===b.token))return;
 const item=catalog.find(i=>i.kind==='excursion'&&i.id===b.itemId);if(!item||!Number.isInteger(b.quantity)||b.quantity<1||b.quantity>100)throw Error('Select an excursion and 1–100 guests.');
 const stay=b.stayId?state.stays.find((s:any)=>s.id===b.stayId&&s.status==='In House'):null;if(b.stayId&&!stay)throw Error('Choose a checked-in room.');
 const guest=stay?.guest||b.guest,phone=String(b.phone||stay?.whatsapp||'').replace(/[ ()-]/g,'');
 if(typeof guest!=='string'||!guest.trim()||guest.length>100||!/^\+[1-9]\d{7,14}$/.test(phone)||typeof b.notes!=='string'||b.notes.length>1000||(!stay&&(typeof b.hotel!=='string'||!b.hotel.trim()||b.hotel.length>150)))throw Error('Enter guest name, contact number, hotel or meeting location, and valid notes.');
 if(b.date&&(!validDate(b.date)||b.date<today))throw Error('Choose a valid requested date.');
 state.orders.push({id:'EXC-'+crypto.randomUUID(),manualToken:b.token,kind:'excursion',itemId:item.id,name:item.name,quantity:b.quantity,cents:item.cents*b.quantity,guest:guest.trim(),phone,hotel:stay?'Nirili Villa':b.hotel.trim(),stayId:stay?.id,accountId:stay?.accountId,room:stay?.room,source:stay?'Manual':'Walk-in',createdBy:by,createdAt:new Date().toISOString(),date:b.date||'',notes:b.notes.trim(),status:'Awaiting scheduling'});return;
 }
 const o=state.orders.find((x:any)=>x.id===b.id&&x.kind==='excursion');if(!o)throw Error('Excursion booking not found.');
 if(b.action==='schedule-excursion'){
 if(excursionStage(o)==='Departed')throw Error('A departed trip cannot be rescheduled.');const resources=excursionResources(state);const vessel=resources.vessels.find(x=>x.id===b.vesselId);const crew=Array.isArray(b.crewIds)?b.crewIds.map((id:string)=>resources.crew.find(x=>x.id===id)):[];
 if(vessel&&vessel.condition!=='Available')throw Error('This vessel is unavailable. Choose an available vessel.');
 if(!vessel||!crew.length||crew.some(x=>!x)||new Set(b.crewIds).size!==crew.length)throw Error('Select a vessel and different crew members from the lists.');
 const clash=state.orders.find((x:any)=>x.id!==o.id&&x.kind==='excursion'&&x.status!=='Cancelled'&&x.schedule?.date===b.date&&x.schedule?.time===b.time&&(norm(x.schedule.vessel)===norm(vessel.name)||x.schedule.crew.some((n:string)=>crew.some(c=>norm(c.name)===norm(n)))));
 if(clash)throw Error('Vessel or crew already assigned at this date and time (booking '+clash.id+'). Choose another time or team.');
 scheduleExcursion(o,{...b,vessel:vessel.name,crew:crew.map(c=>c.name)},today,by);o.schedule.vesselId=vessel.id;o.schedule.crewIds=crew.map(c=>c.id);o.status='Scheduled';o.guestNotified=false;delete o.guestNotifiedAt;delete o.guestNotifiedBy;return;
 }
 if(b.action==='excursion-notified'){
 if(typeof b.notified!=='boolean')throw Error('Choose whether the guest has been notified.');
 if(!o.schedule||['Completed','Cancelled'].includes(excursionStage(o)))throw Error('Only active scheduled trips can be updated.');
 o.guestNotified=b.notified;o.guestNotifiedAt=b.notified?new Date().toISOString():null;o.guestNotifiedBy=b.notified?by:null;return;
 }
 if(b.action==='excursion-status'){changeExcursionStatus(o,b.status,state,by);return;}
 if(b.action==='excursion-payment'){
 if(o.stayId)throw Error('Receive and mark this payment in the room bill.');if(o.status==='Cancelled')throw Error('This booking is cancelled.');if(excursionPaid(o,state))return;
 if(!['Cash','Card','Bank transfer'].includes(b.method)||typeof b.reference!=='string'||b.reference.length>150)throw Error('Choose a payment method and valid reference.');
 const paid=(o.excursionPayments||[]).reduce((n:number,p:any)=>n+p.cents,0);o.excursionPayments=[...(o.excursionPayments||[]),{id:crypto.randomUUID(),cents:o.cents-paid,method:b.method,reference:b.reference.trim(),at:new Date().toISOString(),by}];return;
 }
 throw Error('Unknown excursion action.');
}
