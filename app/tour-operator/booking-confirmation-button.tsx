'use client';

import {useState} from 'react';
import {Share2} from 'lucide-react';
import {createBookingConfirmationPdf} from '../../lib/booking-confirmation-pdf';

export default function BookingConfirmationButton({booking}:{booking:any}){
 const [busy,setBusy]=useState(false),[message,setMessage]=useState('');
 async function share(){
  if(busy)return;setBusy(true);setMessage('');
  try{
   const file=createBookingConfirmationPdf(booking);
   if(navigator.canShare?.({files:[file]})){
    await navigator.share({files:[file],title:'Booking Confirmation'});
    setMessage('Booking confirmation ready to share.');
   }else{
    const url=URL.createObjectURL(file),a=document.createElement('a');
    a.href=url;a.download=file.name;document.body.appendChild(a);a.click();a.remove();
    setTimeout(()=>URL.revokeObjectURL(url),60000);
    setMessage('PDF saved. You can send it to the guest.');
   }
  }catch(error){if((error as any)?.name!=='AbortError')setMessage(error instanceof Error?error.message:'Could not share booking confirmation.');}
  finally{setBusy(false);}
 }
 return <span className="to-confirmation-share">
  <button type="button" className="to-share-guest" disabled={busy} onClick={()=>void share()}><Share2/>{busy?'Preparing…':'Share with guest'}</button>
  {message&&<small role="status">{message}</small>}
 </span>;
}
