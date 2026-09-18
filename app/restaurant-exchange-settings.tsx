'use client';

import {useEffect,useState} from 'react';

export default function RestaurantExchangeSettings(){
 const [open,setOpen]=useState(false),[canEdit,setCanEdit]=useState(false),[settings,setSettings]=useState<any>(null),[draft,setDraft]=useState<any>(null),[busy,setBusy]=useState(false),[message,setMessage]=useState('');

 async function load(){
  try{
   const r=await fetch('/api/restaurant-payment-settings',{cache:'no-store'}),d=await r.json();
   if(!r.ok)return;
   setCanEdit(!!d.canEdit);setSettings(d.settings);setDraft(d.settings);
  }catch{}
 }
 useEffect(()=>{void load()},[]);
 if(!canEdit)return null;

 async function save(e:React.FormEvent){
  e.preventDefault();if(busy)return;setBusy(true);setMessage('');
  try{
   const r=await fetch('/api/restaurant-payment-settings',{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify(draft)}),d=await r.json();
   if(!r.ok)throw Error(d.error||'Could not save settings.');
   setSettings(d.settings);setDraft(d.settings);setMessage('Exchange rate and bank details saved.');
   window.dispatchEvent(new Event('pos-updated'));
  }catch(e){setMessage(e instanceof Error?e.message:'Could not save settings.');}
  finally{setBusy(false);}
 }

 return <>
  <button type="button" onClick={()=>{setDraft(settings);setMessage('');setOpen(true)}}><span>⇄</span>Exchange</button>
  {open&&<div className="menu-overlay"><form className="menu-dialog restaurant-exchange-dialog" onSubmit={save}>
   <h2>Exchange & bank transfer</h2>
   <p>Set the restaurant cash conversion rate and bank transfer account shown during payment.</p>
   <label>USD → MVR exchange rate<input required type="number" min="0.01" max="100" step="0.0001" value={draft?.usdToMvrRate??15.42} onChange={e=>setDraft({...draft,usdToMvrRate:Number(e.target.value)})}/><small>Example: 15.42 means USD 1 = MVR 15.42.</small></label>
   <label>Bank name<input maxLength={120} value={draft?.bankName||''} onChange={e=>setDraft({...draft,bankName:e.target.value})}/></label>
   <label>Restaurant account name<input maxLength={120} value={draft?.accountName||''} onChange={e=>setDraft({...draft,accountName:e.target.value})}/></label>
   <label>Restaurant account number<input maxLength={120} value={draft?.accountNumber||''} onChange={e=>setDraft({...draft,accountNumber:e.target.value})}/></label>
   {message&&<p role="status">{message}</p>}
   <footer><button type="button" disabled={busy} onClick={()=>setOpen(false)}>Close</button><button className="primary" disabled={busy}>{busy?'Saving…':'Save settings'}</button></footer>
  </form></div>}
 </>;
}
