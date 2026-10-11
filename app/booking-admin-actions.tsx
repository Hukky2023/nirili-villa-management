'use client';
import {UiText,UiField,UiOption} from './ui-language';
import {localizedConfirm,localizedAlert} from '../lib/i18n/runtime';

import {useState} from 'react';
import DirectBookingForm from './direct-booking-form';

export default function BookingAdminActions({id,onDeleted,canDelete=false}:{id:string;onDeleted?:()=>void;canDelete?:boolean}){
 const [booking,setBooking]=useState<any>(null),[moveData,setMoveData]=useState<any>(null),[target,setTarget]=useState(''),[busy,setBusy]=useState(false),[error,setError]=useState('');
 async function open(remove=false){setBusy(true);setError('');try{
  const r=await fetch('/api/stays',{cache:'no-store'}),d=await r.json();if(!r.ok)throw Error(d.error);const stay=d.stays.find((s:any)=>s.id===id);if(!stay)throw Error('Booking no longer exists. Refresh the list.');
  if(!remove){setBooking({...stay,editRevision:d.revision});return;}
  if(!localizedConfirm('Delete booking '+stay.id+' for '+stay.guest+' (Room '+stay.room+')? It will be removed from active bookings and its linked orders will be archived. Any money already collected is not refunded by this action.'))return;
  const response=await fetch('/api/stays',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'deletebooking',id,confirmId:id,revision:d.revision})});const result=await response.json();if(!response.ok)throw Error(result.error);
  window.dispatchEvent(new Event('services-updated'));onDeleted?.();
 }catch(e){setError((e as Error).message);}finally{setBusy(false);}}
 async function openMove(){setBusy(true);setError('');try{
  const r=await fetch('/api/stays',{cache:'no-store'});const d=await r.json();if(!r.ok)throw Error(d.error||'Could not load room availability.');
  const stay=d.stays?.find((s:any)=>s.id===id);if(!stay)throw Error('Booking no longer exists. Refresh the list.');
  if(stay.status==='Checked Out')throw Error('Checked-out bookings cannot be moved.');
  setTarget('');setMoveData({stay,revision:d.revision,rooms:d.rooms||[],stays:d.stays||[]});
 }catch(e){setError((e as Error).message);}finally{setBusy(false);}}
 async function confirmMove(){if(!moveData||!target||busy)return;
  const {stay,revision}=moveData;
  if(!localizedConfirm('Move booking '+stay.id+' from Room '+stay.room+' to Room '+target+'? The booking price and payments will remain unchanged.'))return;
  setBusy(true);setError('');
  try{const r=await fetch('/api/stays',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'move',id:stay.id,target,revision})});
   const d=await r.json();if(!r.ok)throw Error(d.error||'Could not move booking.');
   setMoveData(null);setError('Booking moved to Room '+target+'.');window.dispatchEvent(new Event('services-updated'));
  }catch(e){setError((e as Error).message);}finally{setBusy(false);}
 }
 const availableRooms=moveData?.rooms?.filter((r:any)=>r.number!==moveData.stay.room&&r.status==='Available'&&Number(r.capacity||3)>=Number(moveData.stay.pax||1)&&!moveData.stays.some((s:any)=>s.id!==moveData.stay.id&&s.room===r.number&&!['Checked Out','Cancelled'].includes(s.status)&&s.checkIn<moveData.stay.checkOut&&s.checkOut>moveData.stay.checkIn))||[];
 const style={minHeight:44,padding:'10px 16px',borderRadius:10,border:'1px solid #bfd6e1',background:'#edf7fb',color:'#16465e',fontWeight:600,cursor:'pointer'};
 return <div style={{margin:'16px 0'}}><div style={{display:'flex',flexWrap:'wrap',gap:10}}><button type="button" style={style} disabled={busy} onClick={()=>open()}><UiText>Edit booking</UiText></button>{canDelete&&<button type="button" style={{...style,background:'#e0f2fe',color:'#075985'}} disabled={busy} onClick={openMove}><UiText>Change Room</UiText></button>}{canDelete&&<button type="button" style={{...style,background:'#fff2f1',borderColor:'#efc7c3',color:'#a42e27'}} disabled={busy} onClick={()=>open(true)}><UiText>Delete booking</UiText></button>}</div>{moveData&&<div role="dialog" aria-label="Change booking room" style={{marginTop:12,padding:16,border:'1px solid #b6d7e8',borderRadius:12,background:'#f5fbff'}}>
  <strong>Change Room · {moveData.stay.id}</strong>
  <p>Current: Room {moveData.stay.room} · {moveData.stay.checkIn} → {moveData.stay.checkOut}</p>
  <label htmlFor="admin-move-room">Available destination room</label>
  <select id="admin-move-room" value={target} disabled={busy} onChange={e=>setTarget(e.target.value)} style={{display:'block',width:'100%',minHeight:44,margin:'8px 0',borderRadius:8,border:'1px solid #aac8da',padding:8}}>
    <option value="">Select available room</option>{availableRooms.map((r:any)=><option key={r.number} value={r.number}>Room {r.number}</option>)}
  </select>
  {!availableRooms.length&&<p>No other rooms available for these dates.</p>}
  <div style={{display:'flex',gap:8,flexWrap:'wrap'}}><button type="button" style={style} disabled={busy||!target} onClick={confirmMove}>Confirm Move</button><button type="button" style={style} disabled={busy} onClick={()=>setMoveData(null)}>Cancel</button></div>
 </div>}<UiText>{error&&<p role="alert"><UiText>{error}</UiText></p>}<UiText></UiText>{booking&&<DirectBookingForm booking={booking} close={()=>setBooking(null)} onSaved={()=>{setBooking(null);setError('Booking details updated.');}}/>}</UiText></div>;
}
