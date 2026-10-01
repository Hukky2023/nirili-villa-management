import {digest,hashPassword,validPassword,verifyPassword} from './auth';
import {readRecord,readRecords,saveRecord} from './operation-records';
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
const SESSION_MS=30*24*60*60*1000;
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
type Session={agentId:string;passwordVersion:number;expiresAt:number;createdAt:string;revoked?:boolean};

export const text=(value:any,max:number)=>String(value??'').trim().replace(/\s+/g,' ').slice(0,max);
const cleanPhone=(value:any)=>String(value||'').replace(/[\s()-]/g,'');
const PHONE=/^\+[1-9]\d{7,14}$/,EMAIL=/^[^\s@]+@[^\s@]+\.[^\s@]+$/,USERNAME=/^[a-z0-9._-]{3,40}$/;

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
 const username=text(input?.username,40).toLowerCase();
 if(!USERNAME.test(username))throw Error('Choose a username of 3–40 letters, numbers, dots, dashes or underscores.');
 if(!validPassword(input?.password))throw Error('Choose a password of 8–128 characters.');
 const id='AG-'+crypto.randomUUID().replace(/-/g,'').slice(0,8).toUpperCase(),now=new Date().toISOString();
 // The username record is created only if absent, so two partners can never share a login.
 if(!await saveRecord(USERNAME_PREFIX+username,{agentId:id},0,by))throw Error('That username is already in use.');
 const {hash,salt}=await hashPassword(input.password);
 const agent:Agent={id,...details,username,passwordHash:hash,salt,passwordVersion:1,createdAt:now,updatedAt:now,createdBy:by};
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
  if(!validPassword(input.password))throw Error('Choose a password of 8–128 characters.');
  const {hash,salt}=await hashPassword(input.password);
  agent.passwordHash=hash;agent.salt=salt;agent.passwordVersion=(Number(agent.passwordVersion)||1)+1;
 }
 const next=await saveRecord(AGENT_PREFIX+id,agent,revision,by);
 return next?{agent,revision:next}:'conflict';
}

// ---- Sessions
function randomToken(){return Array.from(crypto.getRandomValues(new Uint8Array(32)),x=>x.toString(16).padStart(2,'0')).join('');}
function readCookie(request:Request,name:string){
 for(const part of (request.headers.get('cookie')||'').split(';')){
  const [key,...value]=part.trim().split('=');
  if(key===name)return value.join('=');
 }
 return '';
}
export const sessionCookie=(token:string)=>AGENT_COOKIE+'='+token+'; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age='+Math.floor(SESSION_MS/1000);
export const clearedSessionCookie=AGENT_COOKIE+'=; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=0';

export async function signIn(username:string,password:string):Promise<{agent:Agent;cookie:string}|null>{
 const login=text(username,40).toLowerCase();
 if(!USERNAME.test(login)||typeof password!=='string'||!password||password.length>128)return null;
 const index=await readRecord<{agentId:string}>(USERNAME_PREFIX+login);
 const found=index?await loadAgent(index.value.agentId):null;
 const agent=found?.agent;
 // Always run the hash so unknown usernames take as long as wrong passwords.
 const match=await verifyPassword(password,agent?.salt||'00000000000000000000000000000000',agent?.passwordHash||'0'.repeat(64));
 if(!agent||!match||!agent.active||agent.username!==login)return null;
 const token=randomToken();
 const session:Session={agentId:agent.id,passwordVersion:Number(agent.passwordVersion)||1,expiresAt:Date.now()+SESSION_MS,createdAt:new Date().toISOString()};
 if(!await saveRecord(SESSION_PREFIX+await digest(token),session,0,'agent:'+agent.id))return null;
 return {agent,cookie:sessionCookie(token)};
}

export async function agentFromRequest(request:Request):Promise<Agent|null>{
 const token=readCookie(request,AGENT_COOKIE);
 if(!/^[a-f0-9]{64}$/.test(token))return null;
 const session=await readRecord<Session>(SESSION_PREFIX+await digest(token));
 if(!session||session.value.revoked||session.value.expiresAt<Date.now())return null;
 const found=await loadAgent(session.value.agentId);
 if(!found||!found.agent.active||(Number(found.agent.passwordVersion)||1)!==session.value.passwordVersion)return null;
 return found.agent;
}

export async function signOut(request:Request){
 const token=readCookie(request,AGENT_COOKIE);
 if(!/^[a-f0-9]{64}$/.test(token))return;
 const key=SESSION_PREFIX+await digest(token),session=await readRecord<Session>(key);
 if(session&&!session.value.revoked)await saveRecord(key,{...session.value,revoked:true},session.revision,'agent:'+session.value.agentId);
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
