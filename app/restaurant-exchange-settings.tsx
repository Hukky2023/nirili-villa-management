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

 async function refreshOnline(){
  if(busy)return;setBusy(true);setMessage('');
  try{
   const r=await fetch('/api/restaurant-payment-settings',{method:'POST'}),d=await r.json();
   if(!r.ok)throw Error(d.error||'Could not refresh the EUR rate.');
   setSettings(d.settings);setDraft(d.settings);setMessage('EUR rate refreshed. USD → MVR was unchanged.');
   window.dispatchEvent(new Event('pos-updated'));
  }catch(e){setMessage(e instanceof Error?e.message:'Could not refresh the EUR rate.');}
  finally{setBusy(false);}
 }
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
   <p>USD → MVR is a fixed rate set by Admin. USD → EUR continues to refresh online once each Maldives day.</p>
   <label>USD → MVR fixed exchange rate<input required type="number" min="0.01" max="100" step="0.000001" value={draft?.usdToMvrRate??15.42} onChange={e=>setDraft({...draft,usdToMvrRate:Number(e.target.value)})}/><small>Set manually by Admin. This rate will not be changed by online refresh.</small></label>
   <label>USD → EUR exchange rate<input required type="number" min="0" max="10" step="0.000001" value={draft?.usdToEurRate??0} onChange={e=>setDraft({...draft,usdToEurRate:Number(e.target.value)})}/><small>Used for EUR cash and card payments.</small></label>
   <div className="restaurant-fx-status"><strong>Daily online EUR</strong><span>Source: {draft?.fxSource||'Not fetched yet'}</span><span>Last checked: {draft?.fxCheckedDate||'—'}</span><span>EUR source date: {draft?.eurRateDate||'—'}</span><button type="button" disabled={busy} onClick={refreshOnline}>{busy?'Refreshing…':'Refresh EUR rate now'}</button></div>
   <label>Bank name<input maxLength={120} value={draft?.bankName||''} onChange={e=>setDraft({...draft,bankName:e.target.value})}/></label>
   <label>Restaurant account name<input maxLength={120} value={draft?.accountName||''} onChange={e=>setDraft({...draft,accountName:e.target.value})}/></label>
   <label>Restaurant account number<input maxLength={120} value={draft?.accountNumber||''} onChange={e=>setDraft({...draft,accountNumber:e.target.value})}/></label>
   {message&&<p role="status">{message}</p>}
   <footer><button type="button" disabled={busy} onClick={()=>setOpen(false)}>Close</button><button className="primary" disabled={busy}>{busy?'Saving…':'Save settings'}</button></footer>
  </form></div>}
 </>;
}
