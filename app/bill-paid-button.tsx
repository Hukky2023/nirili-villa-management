'use client';

import {useEffect,useState} from 'react';
import {UiText} from './ui-language';
import {localizedConfirm} from '../lib/i18n/runtime';

export default function BillPaidButton({
  bookingId,department,billId,paid=false,disabled=false,onPaid,className='',
}:{
  bookingId?:string;department:'Accommodation'|'Restaurant'|'Transfer'|'Excursions';billId:string;
  paid?:boolean;disabled?:boolean;onPaid?:()=>void|Promise<void>;className?:string;
}){
  const [busy,setBusy]=useState(false),[isPaid,setIsPaid]=useState(paid),[message,setMessage]=useState('');
  useEffect(()=>{setIsPaid(paid);setMessage('');},[paid,billId,department,bookingId]);

  async function markPaid(){
    if(busy||isPaid)return;
    if(!localizedConfirm('Mark '+department+' bill '+billId+' as paid?\n\nIf this bill is connected to a room, the room folio will also be marked paid.'))return;
    setBusy(true);setMessage('');
    try{
      const response=await fetch('/api/bill-payment',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({bookingId,department,billId})});
      const result=await response.json();
      if(!response.ok)throw new Error(result.error||'Could not mark this bill paid.');
      setIsPaid(true);setMessage(result.roomLinked?'Paid · room bill updated':'Paid');
      window.dispatchEvent(new Event('services-updated'));
      window.dispatchEvent(new Event('nirili:auto-refresh'));
      await onPaid?.();
    }catch(error){setMessage(error instanceof Error?error.message:'Could not mark this bill paid.');}
    finally{setBusy(false);}
  }

  return <span className="bill-paid-action">
    <button type="button" className={className||undefined} disabled={disabled||busy||isPaid} onClick={()=>void markPaid()}>
      <UiText>{busy?'Marking…':isPaid?'Paid':'Mark as Paid'}</UiText>
    </button>
    {message&&<small role="status" style={{display:'block',fontSize:12}}><UiText>{message}</UiText></small>}
  </span>;
}
