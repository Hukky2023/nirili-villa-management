'use client';
import {useState} from 'react';
import {UiText} from './ui-language';
export default function StayPackageDetails({stay,canArrange=false}:{stay:any;canArrange?:boolean}){
 const [busy,setBusy]=useState(false),[message,setMessage]=useState(''),[submitted,setSubmitted]=useState(false);
 if(!stay.packageId)return null;
 async function arrange(){
  setBusy(true);setMessage('');
  try{
   const current=await fetch('/api/guest-services',{cache:'no-store'});const data=await current.json();if(!current.ok)throw Error(data.error);
   const response=await fetch('/api/guest-services',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'arrange-package-excursions',id:stay.id,revision:data.revision})});
   const result=await response.json();if(!response.ok)throw Error(result.error||'Could not arrange excursions.');
   setSubmitted(true);setMessage('Included excursions added to Excursions → Awaiting scheduling. Assign their trip dates there.');
   window.dispatchEvent(new Event('services-updated'));
  }catch(e){setMessage(e instanceof Error?e.message:'Please try again.');}finally{setBusy(false);}
 }
 const requested=submitted||!!stay.packageExcursionsRequestedAt;
 return <section className="current-stay"><h3><UiText>{stay.packageName}</UiText></h3><p><UiText>Total package price</UiText>: <b>${(Number(stay.packageQuotedCents)/100).toFixed(2)}</b></p><p><UiText>Room with </UiText><UiText>{stay.packageMealPlan||stay.meal||stay.plan}</UiText></p>{stay.packageIncludeTransfer&&<p><UiText>{stay.packageTransferLabel||'Return airport transfer'}</UiText> · <UiText>Included in package</UiText></p>}<h4><UiText>Excursions included</UiText></h4><ul>{(stay.packageExcursions||[]).map((item:any)=><li key={item.id}><UiText>{item.name}</UiText></li>)}</ul><p><UiText>{requested?'Included excursions are in the scheduling list.':stay.status==='In House'?'Arrange the included excursions for this guest.':'Excursions will be arranged after check-in.'}</UiText></p>{canArrange&&stay.status==='In House'&&!requested&&(stay.packageExcursions||[]).length>0&&<button type="button" className="primary" disabled={busy} onClick={arrange}><UiText>{busy?'Adding…':'Arrange package excursions'}</UiText></button>}{message&&<p role="status"><UiText>{message}</UiText></p>}</section>;
}
