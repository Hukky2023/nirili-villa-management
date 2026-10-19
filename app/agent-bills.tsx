"use client";
import {useCallback,useEffect,useState} from 'react';
type Payment={id:string;amountCents:number;date:string;method:string;reference:string;by:string};
type Bill={agentId:string;bookingId:string;guest:string;checkIn:string;status:string;totalCents:number;paidCents:number;balanceCents:number;payments:Payment[]};
type Agent={id:string;name:string;active:boolean};
const usd=(c:number)=>'$'+(c/100).toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2});
export default function AgentBills(){
 const [agents,setAgents]=useState<Agent[]>([]),[bills,setBills]=useState<Bill[]>([]),[error,setError]=useState(''),[loading,setLoading]=useState(true),[saving,setSaving]=useState(false);
 const [search,setSearch]=useState(''),[filter,setFilter]=useState('All'),[selected,setSelected]=useState<Bill|null>(null),[amount,setAmount]=useState(''),[method,setMethod]=useState('Bank Transfer'),[reference,setReference]=useState(''),[note,setNote]=useState('');
 const reload=useCallback(async()=>{try{const r=await fetch('/api/agent-bills',{cache:'no-store'}),d=await r.json();if(!r.ok)throw Error(d.error||'Could not load bills');setAgents(d.agents||[]);setBills(d.bills||[]);setError('')}catch(e){setError(e instanceof Error?e.message:'Unable to load bills')}finally{setLoading(false)}},[]);
 useEffect(()=>{void reload()},[reload]);
 const status=(b:Bill)=>b.balanceCents<=0?'Paid':b.paidCents>0?'Partially Paid':'Pending';
 const visible=agents.filter(a=>a.name.toLowerCase().includes(search.toLowerCase())).map(a=>({agent:a,items:bills.filter(b=>b.agentId===a.id)})).filter(({items})=>filter==='All'||items.some(b=>status(b)===filter));
 const total=bills.reduce((n,b)=>n+b.totalCents,0),paid=bills.reduce((n,b)=>n+b.paidCents,0);
 const submit=async(full=false)=>{
  if(!selected||saving)return;
  const cents=full?selected.balanceCents:Math.round(Number(amount)*100);
  if(!Number.isSafeInteger(cents)||cents<=0||cents>selected.balanceCents){setError('Enter an amount greater than zero and no more than the balance.');return}
  setSaving(true);setError('');
  try{
   const r=await fetch('/api/agent-bills',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({agentId:selected.agentId,bookingId:selected.bookingId,amountCents:cents,method,reference,note,date:new Date().toLocaleDateString('en-CA',{timeZone:'Indian/Maldives'})})});
   const d=await r.json();if(!r.ok)throw Error(d.error||'Payment failed');
   setSelected(null);setAmount('');setReference('');setNote('');await reload();
  }catch(e){setError(e instanceof Error?e.message:'Payment failed');await reload()}finally{setSaving(false)}
 };
 return <section className="page" style={{padding:'18px',maxWidth:1100,margin:'0 auto'}}>
  <h1>Agent Bills</h1><p>All registered agents, their booking invoices and payment history.</p>
  {error&&<p role="alert" style={{color:'#b91c1c'}}>{error}</p>}
  <div className="booking-kpis"><article><small>Invoiced</small><b>{usd(total)}</b></article><article><small>Collected</small><b>{usd(paid)}</b></article><article><small>Outstanding</small><b>{usd(Math.max(0,total-paid))}</b></article></div>
  <div style={{display:'flex',gap:10,flexWrap:'wrap',margin:'18px 0'}}><input aria-label="Search agent" placeholder="Search agents" value={search} onChange={e=>setSearch(e.target.value)}/><select aria-label="Filter invoices" value={filter} onChange={e=>setFilter(e.target.value)}>{['All','Pending','Partially Paid','Paid'].map(s=><option key={s}>{s}</option>)}</select><button onClick={()=>void reload()}>Refresh</button></div>
  {loading?<p>Loading agent bills…</p>:visible.length===0?<p>No matching agents.</p>:visible.map(({agent,items})=><section key={agent.id} className="panel" style={{padding:16,marginBottom:16}}>
    <h2 style={{fontSize:18}}>{agent.name}</h2><p>{items.length} invoices · Outstanding {usd(items.reduce((n,b)=>n+b.balanceCents,0))}</p>
    {items.length===0?<p>No booking invoices for this agent.</p>:<div style={{overflowX:'auto'}}><table style={{width:'100%',minWidth:610}}><thead><tr><th>Booking</th><th>Guest</th><th>Total</th><th>Paid</th><th>Balance</th><th>Status</th><th>Action</th></tr></thead><tbody>{items.filter(b=>filter==='All'||status(b)===filter).map(b=><tr key={b.bookingId}><td>{b.bookingId}</td><td>{b.guest}</td><td>{usd(b.totalCents)}</td><td>{usd(b.paidCents)}</td><td>{usd(b.balanceCents)}</td><td>{status(b)}</td><td><button onClick={()=>{setSelected(b);setAmount('');setError('')}}>View / Pay</button></td></tr>)}</tbody></table></div>}
  </section>)}
  {selected&&<div role="dialog" aria-modal="true" aria-label="Record agent payment" style={{position:'fixed',inset:0,zIndex:1000,background:'#0008',display:'grid',placeItems:'center',padding:16}}><div style={{background:'white',color:'#172b3a',padding:22,borderRadius:14,width:'min(100%,500px)',maxHeight:'90vh',overflowY:'auto'}}>
   <button style={{float:'right'}} onClick={()=>setSelected(null)}>Close</button><h2>Booking {selected.bookingId}</h2><p>Total {usd(selected.totalCents)} · Paid {usd(selected.paidCents)} · <strong>Remaining {usd(selected.balanceCents)}</strong></p>
   <h3>Payment history</h3>{selected.payments.length?selected.payments.map(p=><p key={p.id}>{p.date}: {usd(p.amountCents)} — {p.method} {p.reference&&'('+p.reference+')'}</p>):<p>No payments recorded here.</p>}
   {selected.balanceCents>0&&<><label style={{display:'block',marginTop:12}}>Amount paid (USD)<input style={{display:'block',width:'100%'}} type="number" min="0.01" step="0.01" max={(selected.balanceCents/100).toFixed(2)} value={amount} onChange={e=>setAmount(e.target.value)}/></label>
   <label style={{display:'block',marginTop:12}}>Payment method<select style={{display:'block',width:'100%'}} value={method} onChange={e=>setMethod(e.target.value)}>{['Bank Transfer','Cash','Card','Other'].map(x=><option key={x}>{x}</option>)}</select></label>
   <label style={{display:'block',marginTop:12}}>Reference<input style={{display:'block',width:'100%'}} value={reference} onChange={e=>setReference(e.target.value)}/></label><label style={{display:'block',marginTop:12}}>Notes<input style={{display:'block',width:'100%'}} value={note} onChange={e=>setNote(e.target.value)}/></label>
   <div style={{display:'flex',gap:10,flexWrap:'wrap',marginTop:16}}><button disabled={saving} onClick={()=>void submit(false)}>Record partial payment</button><button className="primary" disabled={saving} onClick={()=>void submit(true)}>Mark remaining {usd(selected.balanceCents)} as paid</button></div></>}
  </div></div>}
 </section>;
}
