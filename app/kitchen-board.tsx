'use client';

import {useEffect,useMemo,useState} from 'react';
import {ChefHat,RefreshCw} from 'lucide-react';
import {startLiveRefresh} from '../lib/live-refresh';
import {tabNavigate} from '../lib/tab-navigation';
import {tableLabel} from '../lib/restaurant-tables';
import './restaurant-pos.css';
import './kitchen-board.css';

const money=(n:number)=>'$'+((Number(n)||0)/100).toFixed(2);
const nextStatus:Record<string,string>={Sent:'Preparing',Preparing:'Ready',Ready:'Served'};

export default function KitchenBoard(){
 const [data,setData]=useState<any>(null),[loading,setLoading]=useState(true),[error,setError]=useState(''),[busy,setBusy]=useState(''),[message,setMessage]=useState('');
 async function refresh(background=false){
  if(!background)setLoading(true);
  try{
   const r=await fetch('/api/pos',{cache:'no-store'}),d=await r.json();
   if(r.status===401||r.status===403){tabNavigate('/restaurant/login?portal=staff',true);return;}
   if(!r.ok)throw Error(d.error||'Could not load kitchen orders.');
   setData(d);setError('');
  }catch(e){setError(e instanceof Error?e.message:'Could not load kitchen orders.');}
  finally{if(!background)setLoading(false);}
 }
 useEffect(()=>{void refresh();const stop=startLiveRefresh(()=>refresh(true));const onUpdate=()=>refresh(true);window.addEventListener('pos-updated',onUpdate);window.addEventListener('services-updated',onUpdate);return()=>{stop();window.removeEventListener('pos-updated',onUpdate);window.removeEventListener('services-updated',onUpdate)}},[]);

 async function advance(order:any,guest=false){
  const status=nextStatus[order.kitchen];if(!status||busy)return;
  setBusy(order.id);setMessage('');
  try{
   const r=await fetch('/api/pos',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:guest?'guestkitchen':'kitchen',id:order.id,status,revision:data?.revision})}),d=await r.json();
   if(!r.ok)throw Error(d.error||'Could not update kitchen status.');
   setData(d);window.dispatchEvent(new Event('pos-updated'));
   setMessage(order.id+' marked '+status+'.');
  }catch(e){setError(e instanceof Error?e.message:'Could not update kitchen status.');await refresh(true);}
  finally{setBusy('');}
 }

 const orders=useMemo(()=>[
  ...((data?.orders||[]).filter((o:any)=>['Sent','Preparing','Ready'].includes(o.kitchen)).map((o:any)=>({...o,guestOrder:false}))),
  ...((data?.guestOrders||[]).filter((o:any)=>['Sent','Preparing','Ready'].includes(o.kitchen)).map((o:any)=>({...o,guestOrder:true,items:[{name:o.name,quantity:o.quantity,cents:0}]})))
 ].sort((a:any,b:any)=>String(a.createdAt||'').localeCompare(String(b.createdAt||''))),[data]);

 return <section className="kitchen-only till">
  <div className="kitchen-only-heading">
   <div><small>NIRILI VILLA</small><h1><ChefHat size={27}/> Kitchen</h1><p>Only active kitchen orders are shown here.</p></div>
   <button type="button" disabled={loading} onClick={()=>refresh()}><RefreshCw size={17}/>{loading?'Loading…':'Refresh'}</button>
  </div>
  {(error||message)&&<p className={error?'kitchen-message error':'kitchen-message'} role="status">{error||message}</p>}
  {!loading&&!orders.length&&<div className="kitchen-empty"><ChefHat size={34}/><strong>No active kitchen orders</strong><span>Orders appear here after the cashier sends them to the kitchen.</span></div>}
  <div className="kitchen-order-grid">
   {orders.map((o:any)=><article key={o.id} className={'kitchen-order-card '+String(o.kitchen).toLowerCase()}>
    <header><strong>{o.id}</strong><span>{o.kitchen}</span></header>
    <h2>{o.customer||'Guest'}</h2>
    {o.table&&<div className="pos-table-badge">{tableLabel(o.table)}</div>}
    {o.room&&<p className="kitchen-room">Room {o.room}</p>}
    <p className="kitchen-time">{o.createdAt?new Date(o.createdAt).toLocaleString():''}</p>
    <div className="kitchen-lines">{(o.items||[]).map((item:any,index:number)=><p key={index}><span><b>{item.quantity}×</b> {item.name}</span>{!o.guestOrder&&<strong>{money(item.cents)}</strong>}</p>)}</div>
    {o.notes&&<div className="kitchen-notes"><b>Kitchen notes</b><span>{o.notes}</span></div>}
    {!o.guestOrder&&<div className="kitchen-total"><span>Total USD</span><strong>{money(o.cents)}</strong><em>{o.paymentStatus||'Unpaid'}</em></div>}
    <button type="button" className="kitchen-next" disabled={busy===o.id} onClick={()=>advance(o,o.guestOrder)}>{busy===o.id?'Updating…':o.kitchen==='Sent'?'Mark Preparing':o.kitchen==='Preparing'?'Mark Ready':'Mark Served'}</button>
   </article>)}
  </div>
 </section>;
}
