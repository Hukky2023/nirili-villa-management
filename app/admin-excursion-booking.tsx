'use client';
import {useMemo,useState} from 'react';
import {X} from 'lucide-react';
import {formatDateDMY} from '../lib/date-format';
import {excursionChildPolicyText,excursionPriceCents} from '../lib/excursion-children';

type Props={
 schedules:any[];
 sharedBoatGroups:Record<string,any>;
 resources:any;
 stays:any[];
 date:string;
 onSaved:()=>Promise<void>|void;
 onMessage:(message:string)=>void;
};

export default function AdminExcursionBooking({schedules,sharedBoatGroups,resources,stays,date,onSaved,onMessage}:Props){
 const [open,setOpen]=useState(false),[saving,setSaving]=useState(false);
 const [form,setForm]=useState<any>({scheduleId:'',guestType:'inhouse',stayId:'',guest:'',hotel:'',externalRoom:'',phone:'',quantity:1,adults:1,children:0,infants:0,notes:'',vesselId:''});
 const selected=useMemo(()=>schedules.find((s:any)=>s.id===form.scheduleId),[schedules,form.scheduleId]);
 const group=selected?.sharedBoatKey?sharedBoatGroups[selected.sharedBoatKey]:null;
 const booked=group?.bookedPax??selected?.bookedPax??0;
 const capacity=group?.capacity??selected?.capacity??0;
 const needsExtraVessel=!!selected&&booked+Number(form.quantity||0)>capacity;
 const inHouse=(stays||[]).filter((s:any)=>s.status==='In House');
 const availableVessels=(resources?.vessels||[]).filter((v:any)=>(v.condition||'Available')==='Available'&&v.id!==selected?.vesselId);
 const money=(c:number)=>'$'+((Number(c)||0)/100).toFixed(2);
 function reset(){setForm({scheduleId:'',guestType:'inhouse',stayId:'',guest:'',hotel:'',externalRoom:'',phone:'',quantity:1,adults:1,children:0,infants:0,notes:'',vesselId:''});}
 function close(){if(saving)return;setOpen(false);reset();}
 async function submit(e:React.FormEvent){
  e.preventDefault();if(saving)return;
  if(!selected){onMessage('Choose a scheduled excursion.');return;}
  if(form.guestType==='inhouse'&&!form.stayId){onMessage('Choose an in-house guest.');return;}
  if(form.guestType==='walkin'&&(!form.guest.trim()||!form.hotel.trim()||!form.phone.trim())){onMessage('Enter the walk-in guest name, hotel and WhatsApp number.');return;}
  if(needsExtraVessel&&!form.vesselId){onMessage('This boat is at capacity. Assign a new vessel for this booking.');return;}
  setSaving(true);onMessage('');
  try{
   const r=await fetch('/api/excursion-schedules',{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'admin-booking',date,scheduleId:selected.id,guestType:form.guestType,stayId:form.stayId,guest:form.guest,hotel:form.hotel,externalRoom:form.externalRoom,phone:form.phone,quantity:Number(form.quantity),adults:Number(form.adults)||0,children:Number(form.children)||0,infants:Number(form.infants)||0,notes:form.notes,vesselId:form.vesselId})});
   const d=await r.json();if(!r.ok)throw Error(d.error||'Could not save excursion booking.');
   onMessage(needsExtraVessel?'Excursion booking saved and assigned to a separate vessel.':'Excursion booking confirmed.');
   setOpen(false);reset();await onSaved();window.dispatchEvent(new Event('services-updated'));
  }catch(e){onMessage((e as Error).message)}finally{setSaving(false)}
 }
 return <>
  <button type="button" className="excursion-secondary-btn" onClick={()=>setOpen(true)}>+ Book guest</button>
  {open&&<div className="excursion-schedule-overlay"><form className="excursion-schedule-dialog admin-excursion-booking" onSubmit={submit}>
   <header><div><small>ADMIN BOOKING</small><h3>Book scheduled excursion</h3><p>{formatDateDMY(date)} · Book an in-house or walk-in guest.</p></div><button type="button" className="excursion-dialog-close" aria-label="Close" onClick={close}><X/></button></header>
   <div className="excursion-schedule-form-grid">
    <label className="full">Scheduled excursion<select required value={form.scheduleId} onChange={e=>setForm({...form,scheduleId:e.target.value,vesselId:''})}><option value="">Choose excursion</option>{schedules.map((s:any)=><option key={s.id} value={s.id}>{s.time} · {s.name}</option>)}</select></label>
    <label>Guest type<select value={form.guestType} onChange={e=>setForm({...form,guestType:e.target.value,stayId:'',guest:'',hotel:'',externalRoom:'',phone:''})}><option value="inhouse">In-house guest</option><option value="walkin">Walk-in guest</option></select></label>
    <div className="full admin-child-policy"><strong>Children policy</strong><span>{excursionChildPolicyText()}</span></div><label>Adults (12+)<input required type="number" min={0} max={100} value={form.adults} onChange={e=>{const adults=Math.max(0,Number(e.target.value)||0),children=Math.max(0,Number(form.children)||0),infants=Math.max(0,Number(form.infants)||0);setForm({...form,adults,quantity:adults+children+infants})}}/></label><label>Children (3–11)<input required type="number" min={0} max={100} value={form.children} onChange={e=>{const children=Math.max(0,Number(e.target.value)||0),adults=Math.max(0,Number(form.adults)||0),infants=Math.max(0,Number(form.infants)||0);setForm({...form,children,quantity:adults+children+infants})}}/></label><label>Children under 3<input required type="number" min={0} max={100} value={form.infants} onChange={e=>{const infants=Math.max(0,Number(e.target.value)||0),adults=Math.max(0,Number(form.adults)||0),children=Math.max(0,Number(form.children)||0);setForm({...form,infants,quantity:adults+children+infants})}}/></label><div className="admin-booking-total-seats"><span>Total seats</span><strong>{form.quantity}</strong></div>
    {form.guestType==='inhouse'?<label className="full">In-house guest<select required value={form.stayId} onChange={e=>setForm({...form,stayId:e.target.value})}><option value="">Choose room / guest</option>{inHouse.map((s:any)=><option key={s.id} value={s.id}>Room {s.room} · {s.guest}</option>)}</select><small>The excursion charge will be added to the room's main bill.</small></label>:<>
     <label>Guest name<input required maxLength={100} value={form.guest} onChange={e=>setForm({...form,guest:e.target.value})}/></label>
     <label>WhatsApp<input required placeholder="+960..." maxLength={30} value={form.phone} onChange={e=>setForm({...form,phone:e.target.value})}/></label>
     <label>Hotel / accommodation<input required maxLength={150} value={form.hotel} onChange={e=>setForm({...form,hotel:e.target.value})}/></label>
     <label>Room number<input maxLength={50} value={form.externalRoom} onChange={e=>setForm({...form,externalRoom:e.target.value})}/></label>
    </>}
    {selected&&<div className="full admin-booking-capacity"><span>Current capacity</span><strong>{booked} / {capacity} confirmed</strong><small>{selected.priceCents?money(excursionPriceCents(selected.priceCents,'guest',{adults:Number(form.adults)||0,children:Number(form.children)||0,infants:Number(form.infants)||0,total:Number(form.quantity)||0}))+' total · '+money(selected.priceCents)+' adult rate':'Price not set'} · {needsExtraVessel?'A separate vessel is required for this booking.':'Seats are available on the scheduled vessel.'}</small></div>}
    {needsExtraVessel&&<label className="full">New vessel<select required value={form.vesselId} onChange={e=>setForm({...form,vesselId:e.target.value})}><option value="">Assign separate vessel</option>{availableVessels.map((v:any)=><option key={v.id} value={v.id}>{v.name}</option>)}</select><small>This booking will not be counted against the already-full original vessel.</small></label>}
    <label className="full">Notes<textarea rows={3} maxLength={1000} value={form.notes} onChange={e=>setForm({...form,notes:e.target.value})}/></label>
   </div>
   <footer><button type="button" className="excursion-secondary-btn" disabled={saving} onClick={close}>Cancel</button><button type="submit" className="excursion-primary-btn" disabled={saving||!form.quantity||form.quantity<1||form.quantity>100}>{saving?'Saving…':'Confirm booking'}</button></footer>
  </form></div>}
 </>;
}
