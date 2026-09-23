'use client';
import {useEffect,useState} from 'react';
import {UiText} from './ui-language';
import AccountPassword from './account-password';

export default function GuestAccountForm({stayId,standalone=false,embedded=false}:{stayId?:string;standalone?:boolean;embedded?:boolean;onCreated?:()=>void}){
 const [data,setData]=useState<any>(null),[error,setError]=useState('');
 async function refresh(){
  if(!stayId){setData(null);return;}
  const r=await fetch('/api/guest-accounts?stay='+encodeURIComponent(stayId),{cache:'no-store'}),d=await r.json();
  if(!r.ok)throw Error(d.error||'Could not load guest access.');setData(d);setError('');
 }
 useEffect(()=>{refresh().catch(e=>setError((e as Error).message));const reload=()=>refresh().catch(()=>{});window.addEventListener('services-updated',reload);return()=>window.removeEventListener('services-updated',reload);},[stayId]);
 if(!stayId)return null;
 const stay=data?.stay,account=data?.account;
 return <section className={'room-notes guest-create'+(embedded?' embedded':'')}>
  <h3><UiText>{standalone?'In-house guest access':'Guest access'}</UiText></h3>
  {error&&<p role="alert"><UiText>{error}</UiText></p>}
  {!data&&!error&&<p><UiText>Loading guest access…</UiText></p>}
  {data&&account?.active&&<div><p><UiText>Portal: </UiText><a href={data.portalUrl} target="_blank" rel="noreferrer">booking.nirilihotels.com/stay</a></p><p><UiText>Username / room: </UiText><b>{account.username}</b></p><AccountPassword key={account.id} user={account} autoReveal/><p><UiText>Share the room number and one-time setup code with the guest. The guest creates their own private password on the stay portal. Access expires automatically at checkout, and a room move creates a new room login.</UiText></p></div>}
  {data&&!account?.active&&<p><UiText>{stay?.status==='Checked Out'?'Guest access expired at checkout.':stay?.status==='In House'?'No active guest access is linked. Re-run check-in only after confirming the booking state.':'Guest access will be created automatically when this booking is checked in.'}</UiText></p>}
 </section>;
}
