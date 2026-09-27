'use client';

import {useEffect,useMemo,useState} from 'react';
import {ExternalLink,X} from 'lucide-react';
import {startLiveRefresh,REFRESH_INTERVALS} from '../lib/live-refresh';
import './guest-chat.css';

function WhatsAppLogo({size=24}:{size?:number}){
 return <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" focusable="false"><path d="M20.52 3.48A11.91 11.91 0 0 0 12.05 0C5.46 0 .1 5.36.1 11.95c0 2.11.55 4.17 1.6 5.99L0 24l6.24-1.64a11.94 11.94 0 0 0 5.81 1.48h.01c6.58 0 11.94-5.36 11.94-11.95 0-3.19-1.24-6.19-3.48-8.41ZM12.05 21.82a9.9 9.9 0 0 1-5.04-1.38l-.36-.21-3.7.97.99-3.61-.24-.37a9.87 9.87 0 0 1-1.51-5.27c0-5.48 4.46-9.94 9.95-9.94a9.88 9.88 0 0 1 7.03 2.92 9.88 9.88 0 0 1 2.91 7.04c0 5.48-4.46 9.94-9.94 9.94Zm5.45-7.44c-.3-.15-1.77-.87-2.04-.97-.27-.1-.47-.15-.67.15-.2.3-.77.97-.94 1.17-.17.2-.35.22-.65.07-.3-.15-1.26-.46-2.39-1.47-.88-.79-1.48-1.77-1.65-2.07-.17-.3-.02-.46.13-.61.13-.13.3-.35.45-.52.15-.17.2-.3.3-.5.1-.2.05-.37-.02-.52-.08-.15-.67-1.62-.92-2.22-.24-.58-.49-.5-.67-.51h-.57c-.2 0-.52.07-.8.37-.27.3-1.04 1.02-1.04 2.49s1.07 2.89 1.22 3.09c.15.2 2.1 3.2 5.08 4.49.71.3 1.26.49 1.69.63.71.22 1.35.19 1.86.11.57-.08 1.77-.72 2.02-1.42.25-.7.25-1.3.17-1.42-.07-.12-.27-.2-.57-.35Z"/></svg>;
}

function whatsappUrl(phone:string,message:string){
 const digits=String(phone||'').replace(/\D/g,'');
 if(!digits)return '';
 return 'https://wa.me/'+digits+'?text='+encodeURIComponent(message);
}

export default function GuestChat(){
 const [data,setData]=useState<any>(null);
 const [open,setOpen]=useState(false);
 const [error,setError]=useState('');

 useEffect(()=>{
  let alive=true;
  async function refresh(){
   try{
    const response=await fetch('/api/whatsapp-directory',{cache:'no-store'});
    if(response.status===401||response.status===403){if(alive)setData(null);return;}
    const result=await response.json();
    if(!response.ok)throw Error(result.error||'Could not load WhatsApp contacts.');
    if(alive){setData(result);setError('');}
   }catch(err){if(alive)setError(err instanceof Error?err.message:'Could not load WhatsApp contacts.');}
  }
  void refresh();
  const stop=startLiveRefresh(refresh,REFRESH_INTERVALS.standard);
  return()=>{alive=false;stop();};
 },[]);

 const guestMessage=useMemo(()=>{
  const stay=data?.stay;
  const identity=stay?.guest||data?.actor?.name||'Guest';
  const room=stay?.room?' in Room '+stay.room:'';
  const ref=stay?.id?' ('+stay.id+')':'';
  return 'Hello Nirili Villa, this is '+identity+room+ref+'. I need assistance with my stay.';
 },[data]);

 if(!data)return null;

 if(data.actor?.role==='guest'){
  const href=whatsappUrl(data.hotelPhone,guestMessage);
  return <div className="nv-wa-root">
   <a className="nv-wa-launch" href={href} target="_blank" rel="noopener noreferrer" aria-label="Chat with Nirili Villa on WhatsApp" title="WhatsApp Nirili Villa">
    <WhatsAppLogo size={25}/>
   </a>
  </div>;
 }

 const contacts=Array.isArray(data.contacts)?data.contacts:[];
 return <div className="nv-wa-root">
  <button type="button" className="nv-wa-launch" aria-expanded={open} aria-label="Open guest WhatsApp contacts" title="Guest WhatsApp" onClick={()=>setOpen(value=>!value)}>
   <WhatsAppLogo size={25}/>
  </button>
  {open&&<section className="nv-wa-panel" role="dialog" aria-label="Guest WhatsApp contacts">
   <header>
    <div><strong>WhatsApp guests</strong><small>Open an in-house guest chat in WhatsApp</small></div>
    <button type="button" aria-label="Close WhatsApp contacts" onClick={()=>setOpen(false)}><X size={21}/></button>
   </header>
   <div className="nv-wa-summary"><strong>In-house guests ({contacts.length})</strong><span>Messages open in WhatsApp and are not stored in the PMS.</span></div>
   <div className="nv-wa-contacts">
    {!contacts.length&&<p className="nv-wa-empty">No in-house guests are currently available.</p>}
    {contacts.map((contact:any)=>{
     const message='Hello '+contact.guest+', this is Nirili Villa regarding your stay'+(contact.room?' in Room '+contact.room:'')+(contact.id?' ('+contact.id+')':'')+'.';
     const href=whatsappUrl(contact.phone,message);
     return <article key={contact.id||contact.room||contact.guest}>
      <div className="nv-wa-contact-copy">
       <strong>{contact.guest}</strong>
       <span>{contact.room?'Room '+contact.room:'Room not assigned'}{contact.id?' · '+contact.id:''}</span>
       <small>{contact.phone?'+ '+contact.phone:'No WhatsApp number saved'}</small>
      </div>
      {href?<a className="nv-wa-open" href={href} target="_blank" rel="noopener noreferrer"><WhatsAppLogo size={18}/><span>Open</span><ExternalLink size={15}/></a>:<button type="button" className="nv-wa-open disabled" disabled>Missing number</button>}
     </article>;
    })}
   </div>
   {error&&<p className="nv-wa-error" role="status">{error}</p>}
  </section>}
 </div>;
}
