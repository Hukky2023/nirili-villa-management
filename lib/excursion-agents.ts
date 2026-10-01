import {readRecord,readRecords,saveRecord} from './operation-records';
import {cleanUsername,partnerAuth} from './partner-auth';
import {walkInExcursionPaidCents} from './walkin-excursion-access';

// Partner Agent Portal. Guest houses on Dhiffushi that do not run excursions send their guests'
// bookings to Nirili through agents.nirilihotels.com. Agents are kept completely apart from staff
// and guest accounts: their logins, sessions and profiles live in their own operation records,
// so an agent login can never open the management app or the in-house guest portal.
export const AGENT_PREFIX='excursion-agent:';
export const USERNAME_PREFIX='excursion-agent-username:';
export const SESSION_PREFIX='excursion-agent-session:';
export const AGENT_COOKIE='nirili_agent_session';
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

// Validates the editable partner details. Username and password are handled separately.
export function cleanAgentDetails(input:any){
 const name=text(input?.name,100),contactName=text(input?.contactName,100),phone=cleanPhone(input?.phone),email=text(input?.email,254).toLowerCase();
 const pickup=text(input?.pickup,150)||name;
 const discountPercent=Math.round(Number(input?.discountPercent??0)*10)/10;
 if(!name)throw Error('Enter the guest house name.');
 if(phone&&!PHONE.test(phone))throw Error('Enter the WhatsApp number with country code, e.g. +960 7XX XXXX.');
 if(email&&!EMAIL.test(email))throw Error('Enter a valid email address.');
 if(!Number.isFinite(discountPercent)||discountPercent<0||discountPercent>MAX_DISCOUNT_PERCENT)throw Error('Agent discount must be between 0% and '+MAX_DISCOUNT_PERCENT+'%.');
 return {name,contactName,phone,email,pickup,discountPercent,autoConfirm:input?.autoConfirm!==false,active:input?.active!==false};
}

export async function loadAgents():Promise<{agent:Agent;revision:number}[]>{
 return (await readRecords<Agent>(AGENT_PREFIX)).map(row=>({agent:row.value,revision:row.revision}))
  .sort((a,b)=>a.agent.name.localeCompare(b.agent.name));
}
export async function loadAgent(id:string){
 const row=await readRecord<Agent>(AGENT_PREFIX+id);
 return row?{agent:row.value,revision:row.revision}:null;
}

export async function createAgent(input:any,by:string):Promise<Agent>{
 const details=cleanAgentDetails(input);
 const username=cleanUsername(input?.username);
 const id='AG-'+crypto.randomUUID().replace(/-/g,'').slice(0,8).toUpperCase(),now=new Date().toISOString();
 const secret=await auth.credentials(input?.password);
 if(!await auth.reserveUsername(username,id,by))throw Error('That username is already in use.');
 const agent:Agent={id,...details,username,...secret,passwordVersion:1,createdAt:now,updatedAt:now,createdBy:by};
 if(!await saveRecord(AGENT_PREFIX+id,agent,0,by))throw Error('Could not save the agent. Please try again.');
 return agent;
}

// Updates partner details; a new password signs the agent out everywhere.
export async function updateAgent(id:string,revision:number,input:any,by:string):Promise<{agent:Agent;revision:number}|'conflict'|null>{
 const current=await loadAgent(id);
 if(!current)return null;
 if(current.revision!==revision)return 'conflict';
 const agent:Agent={...current.agent,...cleanAgentDetails({...current.agent,...input}),updatedAt:new Date().toISOString()};
 if(input?.password!==undefined&&input.password!==''){
  Object.assign(agent,await auth.credentials(input.password));agent.passwordVersion=(Number(agent.passwordVersion)||1)+1;
 }
 const next=await saveRecord(AGENT_PREFIX+id,agent,revision,by);
 return next?{agent,revision:next}:'conflict';
}

// ---- Sessions: shared partner login system (lib/partner-auth.ts) with the agent records.
const auth=partnerAuth<Agent>({accountPrefix:AGENT_PREFIX,usernamePrefix:USERNAME_PREFIX,sessionPrefix:SESSION_PREFIX,cookie:AGENT_COOKIE});
export const sessionCookie=auth.sessionCookie;
export const clearedSessionCookie=auth.clearedCookie;
export async function signIn(username:string,password:string):Promise<{agent:Agent;cookie:string}|null>{
 const result=await auth.signIn(username,password);
 return result?{agent:result.account,cookie:result.cookie}:null;
}
export const agentFromRequest=auth.fromRequest;
export const signOut=auth.signOut;

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
