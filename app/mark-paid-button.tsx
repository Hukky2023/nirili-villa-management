'use client';
import {useEffect,useState} from 'react';
import {allBillsPaid} from '../lib/bill-payment';
export default function MarkPaidButton({bookingId,paid=false,disabled=false,onPaid}:{bookingId:string;paid?:boolean;disabled?:boolean;onPaid?:()=>void}){
 const [busy,setBusy]=useState(false),[message,setMessage]=useState(''),[isPaid,setIsPaid]=useState(paid);
 useEffect(()=>{setIsPaid(paid);setMessage('');},[paid,bookingId]);
 async function mark(){
  if(busy)return;setBusy(true);setMessage('');
  try{
   const latest=await fetch('/api/stays',{cache:'no-store'});const state=await latest.json();if(!latest.ok)throw Error(state.error);
   const stay=state.stays.find((s:any)=>s.id===bookingId);if(!stay)throw Error('Booking not found.');
   const undo=allBillsPaid(stay.folio);setIsPaid(undo);
   const question=undo?'Are you sure you want to mark all bills as unpaid? Payments created by Mark as Paid will be reversed. Earlier payments will remain.':'Are you sure you want to mark all bills as paid? The remaining balance of $'+(stay.folio.balanceCents/100).toFixed(2)+' will be recorded as received.';
   if(!window.confirm(stay.guest+' · '+bookingId+'\n\n'+question))return;
   const r=await fetch('/api/stays',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:undo?'markunpaid':'markpaid',id:bookingId,revision:state.revision})});
   const d=await r.json();if(!r.ok)throw Error(d.error);
   setIsPaid(allBillsPaid(d.stays.find((s:any)=>s.id===bookingId)?.folio));setMessage(undo?'All current bills are marked unpaid.':'All current bills are paid.');
   window.dispatchEvent(new Event('services-updated'));onPaid?.();
  }catch(e){setMessage((e as Error).message||'Could not update payment status. Please retry.');}finally{setBusy(false);}
 }
 return <><button type="button" className="primary" disabled={disabled||busy} onClick={mark}>{busy?'Please wait…':isPaid?'Mark as Unpaid':'Mark as Paid'}</button>{message&&<small role="status" style={{display:'block',fontSize:14}}>{message}</small>}</>;
}
