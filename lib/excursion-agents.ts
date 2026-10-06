import {loadPartners,partnerWith,type Partner,type Permission} from './partners';
import {walkInExcursionPaidCents} from './walkin-excursion-access';

// Partner bookings for guests (excursions, speedboat seats, buggy rides). Guest houses on
// Dhiffushi that do not run excursions send their guests' bookings to Nirili through the partner
// portal (partners.nirilihotels.com). Partner logins are kept apart from staff and guest
// accounts, so a partner can never open the management app or the in-house guest portal.
export const AGENT_SOURCE='Agent portal';
export const MAX_DISCOUNT_PERCENT=50;

export type Agent={
 id:string;name:string;contactName:string;phone:string;email:string;pickup:string;
 username:string;passwordHash:string;salt:string;passwordVersion:number;
 // Net-rate model: the guest house collects from its guest and pays Nirili the public price less this discount.
 discountPercent:number;
 // Place bookings on a trip with free seats straight away; otherwise every booking waits for staff.
 autoConfirm:boolean;
 active:boolean;createdAt:string;updatedAt:string;createdBy:string;
};
export type PublicAgent=Omit<Agent,'passwordHash'|'salt'|'passwordVersion'>;

export const text=(value:any,max:number)=>String(value??'').trim().replace(/\s+/g,' ').slice(0,max);
const cleanPhone=(value:any)=>String(value||'').replace(/[\s()-]/g,'');
const PHONE=/^\+[1-9]\d{7,14}$/,EMAIL=/^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function publicAgent(agent:Agent):PublicAgent{
 const {passwordHash,salt,passwordVersion,...rest}=agent;
 return rest;
}

export function netPriceCents(publicCents:number,discountPercent:number){
 const discount=Math.min(MAX_DISCOUNT_PERCENT,Math.max(0,Number(discountPercent)||0));
 return Math.max(0,Math.round((Math.max(0,Number(publicCents)||0)*(100-discount))/100));
}

// Agents are partner accounts (lib/partners.ts) allowed to book for their guests. This view of a
// partner keeps the booking engine and statements unchanged: discountPercent is the partner's
// excursion discount.
export function asAgent(partner:Partner):Agent{
 return {...partner,discountPercent:partner.excursionDiscountPercent,pickup:partner.pickup||partner.name,autoConfirm:partner.autoConfirm!==false};
}
// The signed-in partner as an agent, only with the permission the request needs.
export async function agentFromRequest(request:Request,permission:Permission|Permission[]='excursions'){
 const partner=await partnerWith(request,permission);
 return partner?asAgent(partner):null;
}
export async function loadAgents():Promise<{agent:Agent;revision:number}[]>{
 return (await loadPartners()).filter(r=>r.partner.permissions?.includes('excursions')).map(r=>({agent:asAgent(r.partner),revision:r.revision}));
}

// ---- Bookings
const cancelled=(order:any)=>order.status==='Cancelled'||order.approvalStatus==='Cancelled'||order.approvalStatus==='Declined';
export function agentOrderStatus(order:any){
 if(order.approvalStatus==='Declined')return 'Declined';
 if(cancelled(order))return 'Cancelled';
 if(order.approvalStatus==='Approved')return 'Confirmed';
 return 'Pending';
}
export function agentOrders(state:any,agentId:string){
 return (state?.orders||[]).filter((order:any)=>order.kind==='excursion'&&order.source===AGENT_SOURCE&&order.agentId===agentId);
}
// The amount the agent owes Nirili for an order: the billed amount once confirmed, else the net quote.
const orderNetCents=(order:any)=>Math.max(0,Number(order.approvalStatus==='Approved'?order.cents:order.quotedCents)||0);

// One row per booking reference; a Special Package is one booking made of several trips.
export function agentBookingSummaries(state:any,agentId:string){
 const groups=new Map<string,any[]>();
 for(const order of agentOrders(state,agentId)){
  const ref=order.packageGroupId||order.id;
  groups.set(ref,[...(groups.get(ref)||[]),order]);
 }
 return [...groups.entries()].map(([ref,orders])=>{
  orders.sort((a,b)=>String(a.date||'').localeCompare(String(b.date||''))||String(a.time||'').localeCompare(String(b.time||'')));
  const first=orders[0],live=orders.filter(order=>!cancelled(order));
  const statuses=orders.map(agentOrderStatus);
  const status=live.length===0?(statuses.includes('Declined')?'Declined':'Cancelled'):live.every(order=>order.approvalStatus==='Approved')?'Confirmed':'Pending';
  const netCents=live.reduce((sum,order)=>sum+orderNetCents(order),0);
  const paidCents=live.reduce((sum,order)=>sum+walkInExcursionPaidCents(order),0);
  return {
   ref,excursion:first.packageName||first.name,date:first.date||'',time:first.time||'',endTime:first.endTime||'',
   status,cancelRequested:!!first.agentCancelRequest&&live.length>0,cancelRequest:first.agentCancelRequest||null,
   leadGuest:first.guest||'',guestNames:Array.isArray(first.guestNames)?first.guestNames:[],guests:Number(first.quantity)||0,
   adults:Number(first.adults)||0,children:Number(first.children)||0,infants:Number(first.infants)||0,
   pickup:first.pickupLocation||first.hotel||'',room:first.externalRoom||'',phone:first.phone||'',agentReference:first.agentReference||'',notes:first.notes||'',
   netCents,publicCents:live.reduce((sum,order)=>sum+Math.max(0,Number(order.publicQuotedCents)||0),0)||Math.max(0,Number(first.publicQuotedCents)||0),
   paidCents,balanceCents:Math.max(0,netCents-paidCents),createdAt:first.createdAt||'',
   segments:orders.length>1?orders.map(order=>({id:order.id,name:order.packageSegmentName||order.name,date:order.date||'',time:order.time||'',status:agentOrderStatus(order)})):[],
  };
 }).sort((a,b)=>b.date.localeCompare(a.date)||b.createdAt.localeCompare(a.createdAt));
}

// Pending bookings are cancelled straight away. Confirmed bookings already hold seats and crew, so
// the agent sends a cancellation request that staff review.
export function cancelAgentBooking(state:any,agentId:string,ref:string,reason:string,today:string,by:string):{mode:'cancelled'|'requested';orders:any[]}{
 const orders=agentOrders(state,agentId).filter((order:any)=>(order.packageGroupId||order.id)===ref);
 const live=orders.filter((order:any)=>!cancelled(order));
 if(!orders.length)throw Error('Booking not found.');
 if(!live.length)throw Error('This booking is already cancelled.');
 if(live.some((order:any)=>order.date&&order.date<today))throw Error('Past trips cannot be cancelled here. Please contact Nirili Tours.');
 const at=new Date().toISOString(),note=text(reason,500);
 if(live.every((order:any)=>order.approvalStatus!=='Approved')){
  for(const order of live)Object.assign(order,{status:'Cancelled',approvalStatus:'Cancelled',cents:0,cancelledAt:at,cancelledBy:by,cancellationReason:note||'Cancelled by agent'});
  return {mode:'cancelled',orders:live};
 }
 if(live[0].agentCancelRequest)throw Error('A cancellation request has already been sent for this booking.');
 for(const order of live)order.agentCancelRequest={at,by,reason:note};
 return {mode:'requested',orders:live};
}

// Monthly net-rate statement: what each guest house owes Nirili for trips in the month.
export function agentStatement(state:any,agents:Agent[],month:string){
 return agents.map(agent=>{
  const orders=agentOrders(state,agent.id).filter((order:any)=>String(order.date||'').startsWith(month));
  const live=orders.filter((order:any)=>!cancelled(order));
  const confirmed=live.filter((order:any)=>order.approvalStatus==='Approved');
  const refs=new Set(live.map((order:any)=>order.packageGroupId||order.id));
  const owedCents=confirmed.reduce((sum:number,order:any)=>sum+orderNetCents(order),0);
  const paidCents=confirmed.reduce((sum:number,order:any)=>sum+walkInExcursionPaidCents(order),0);
  return {
   agentId:agent.id,bookings:refs.size,guests:[...refs].reduce((sum:number,ref)=>sum+(Number(live.find((order:any)=>(order.packageGroupId||order.id)===ref)?.quantity)||0),0),
   pending:live.filter((order:any)=>order.approvalStatus!=='Approved').length,
   publicCents:confirmed.reduce((sum:number,order:any)=>sum+Math.max(0,Number(order.publicQuotedCents)||0),0),
   owedCents,paidCents,balanceCents:Math.max(0,owedCents-paidCents),
   cancelRequests:live.filter((order:any)=>order.agentCancelRequest).map((order:any)=>order.packageGroupId||order.id).filter((ref:string,i:number,all:string[])=>all.indexOf(ref)===i),
  };
 });
}

// Staff decide on an agent's cancellation request for a confirmed booking.
export function resolveAgentCancelRequest(state:any,ref:string,approve:boolean,by:string){
 const orders=(state?.orders||[]).filter((order:any)=>order.kind==='excursion'&&order.source===AGENT_SOURCE&&(order.packageGroupId||order.id)===ref&&!cancelled(order)&&order.agentCancelRequest);
 if(!orders.length)throw Error('There is no open cancellation request for this booking.');
 const at=new Date().toISOString();
 for(const order of orders){
  const request=order.agentCancelRequest;
  delete order.agentCancelRequest;
  if(approve)Object.assign(order,{refundRequiredCents:walkInExcursionPaidCents(order),status:'Cancelled',approvalStatus:'Cancelled',cents:0,cancelledAt:at,cancelledBy:by,cancellationReason:request?.reason||'Cancelled at agent request'});
  else order.agentCancelDeclined={...request,decidedAt:at,decidedBy:by};
 }
 return orders;
}
