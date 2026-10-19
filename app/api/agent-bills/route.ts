import {currentUser,sameOrigin} from '../../../lib/auth';
import {loadPartners} from '../../../lib/partners';
import {loadStays} from '../../../lib/stays';
import {readRecord,saveRecord} from '../../../lib/operation-records';

const headers={'Cache-Control':'no-store'};
const key=(partnerId:string,bookingId:string)=>'agent-bill-payments:v1:'+partnerId+':'+bookingId;
type Payment={id:string;amountCents:number;createdAt:string;date:string;method:string;reference:string;note:string;by:string};
const blocked=new Set(['Cancelled','Declined','Deleted']);
async function invoices(){
 const [{state},partners]=await Promise.all([loadStays(),loadPartners()]);
 const agents=partners.map(({partner})=>({id:partner.id,name:partner.name,active:partner.active,permissions:partner.permissions}));
 const agentIds=new Set(agents.map(a=>a.id));
 const requests=(state.requests||[]).filter((r:any)=>agentIds.has(String(r.tourOperatorId||''))&&!blocked.has(String(r.status||'')));
 const bills=await Promise.all(requests.map(async (r:any)=>{
  const agentId=String(r.tourOperatorId),bookingId=String(r.id||r.ref||'');
  if(!bookingId)return null;
  const totalCents=Math.max(0,Math.round(Number(r.estimate)||0));
  const record=await readRecord<{payments:Payment[]}>(key(agentId,bookingId));
  const payments=record?.value?.payments||[];
  const paidCents=payments.reduce((sum,p)=>sum+p.amountCents,0);
  return {agentId,bookingId,guest:String(r.guest||r.guestName||r.name||'Guest'),checkIn:String(r.checkIn||''),status:String(r.status||''),totalCents,paidCents,balanceCents:Math.max(0,totalCents-paidCents),payments,revision:record?.revision||0};
 }));
 return {agents,bills:bills.filter(Boolean)};
}
export async function GET(){
 const user=await currentUser();
 if(user?.role!=='admin')return Response.json({error:'Admin only.'},{status:403,headers});
 try{return Response.json(await invoices(),{headers})}catch(e){return Response.json({error:e instanceof Error?e.message:'Could not load bills.'},{status:500,headers})}
}
export async function POST(req:Request){
 const user=await currentUser();
 if(user?.role!=='admin'||!sameOrigin(req))return Response.json({error:'Admin only.'},{status:403,headers});
 try{
  const body=await req.json();
  const agentId=String(body.agentId||''),bookingId=String(body.bookingId||'');
  if(!agentId||!bookingId)throw Error('Choose an agent invoice.');
  const amountCents=Number(body.amountCents);
  if(!Number.isSafeInteger(amountCents)||amountCents<=0)throw Error('Enter a positive payment amount.');
  const method=String(body.method||'').trim();
  if(!['Cash','Card','Bank Transfer','Other'].includes(method))throw Error('Select a valid payment method.');
  const {agents,bills}=await invoices();
  if(!agents.some(a=>a.id===agentId))throw Error('Agent not found.');
  const bill=(bills as any[]).find(b=>b.agentId===agentId&&b.bookingId===bookingId);
  if(!bill||bill.totalCents<=0)throw Error('Invoice not available.');
  if(amountCents>bill.balanceCents)throw Error('Amount exceeds outstanding balance. Refresh the invoice.');
  const date=String(body.date||'');
  if(!/^\d{4}-\d{2}-\d{2}$/.test(date)||Number.isNaN(Date.parse(date)))throw Error('Enter a valid payment date.');
  const payment:Payment={id:crypto.randomUUID(),amountCents,createdAt:new Date().toISOString(),date,method,reference:String(body.reference||'').slice(0,120),note:String(body.note||'').slice(0,300),by:String(user.username||user.displayName||'admin')};
  const revision=await saveRecord(key(agentId,bookingId),{payments:[...bill.payments,payment]},bill.revision,'agent-bills:'+payment.by);
  if(!revision)return Response.json({error:'Another payment was recorded. Refresh before saving again.'},{status:409,headers});
  return Response.json({ok:true,payment},{headers});
 }catch(e){return Response.json({error:e instanceof Error?e.message:'Could not save payment.'},{status:400,headers})}
}
