'use client';
import {UiText,UiField,UiOption} from './ui-language';
import {localizedConfirm,localizedAlert} from '../lib/i18n/runtime';

import {useState} from 'react';
import DirectBookingForm from './direct-booking-form';

export default function BookingAdminActions({id,onDeleted,canDelete=false}:{id:string;onDeleted?:()=>void;canDelete?:boolean}){
 const [booking,setBooking]=useState<any>(null),[busy,setBusy]=useState(false),[error,setError]=useState('');
 async function open(remove=false){setBusy(true);setError('');try{
  const r=await fetch('/api/stays',{cache:'no-store'}),d=await r.json();if(!r.ok)throw Error(d.error);const stay=d.stays.find((s:any)=>s.id===id);if(!stay)throw Error('Booking no longer exists. Refresh the list.');
  if(!remove){setBooking({...stay,editRevision:d.revision});return;}
  if(!localizedConfirm('Delete booking '+stay.id+' for '+stay.guest+' (Room '+stay.room+')? It will be removed from active bookings and its linked orders will be archived. Any money already collected is not refunded by this action.'))return;
  const response=await fetch('/api/stays',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'deletebooking',id,confirmId:id,revision:d.revision})});const result=await response.json();if(!response.ok)throw Error(result.error);
  window.dispatchEvent(new Event('services-updated'));onDeleted?.();
 }catch(e){setError((e as Error).message);}finally{setBusy(false);}}
 const style={minHeight:44,padding:'10px 16px',borderRadius:10,border:'1px solid #bfd6e1',background:'#edf7fb',color:'#16465e',fontWeight:600,cursor:'pointer'};
 return <div style={{margin:'16px 0'}}><div style={{display:'flex',flexWrap:'wrap',gap:10}}><button type="button" style={style} disabled={busy} onClick={()=>open()}><UiText>Edit booking</UiText></button>{canDelete&&<button type="button" style={{...style,background:'#fff2f1',borderColor:'#efc7c3',color:'#a42e27'}} disabled={busy} onClick={()=>open(true)}><UiText>Delete booking</UiText></button>}</div><UiText>{error&&<p role="alert"><UiText>{error}</UiText></p>}<UiText></UiText>{booking&&<DirectBookingForm booking={booking} close={()=>setBooking(null)} onSaved={()=>{setBooking(null);setError('Booking details updated.');}}/>}</UiText></div>;
}
