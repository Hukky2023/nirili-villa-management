'use client';
import {useEffect,useMemo,useState} from 'react';
import {X} from 'lucide-react';
import {formatDateDMY} from '../lib/date-format';
import {excursionChildPolicyText,excursionPriceCents} from '../lib/excursion-children';
import {excursionDeparturePassed} from '../lib/guest-catalog';

type Props={
 schedules:any[];
 sharedBoatGroups:Record<string,any>;
 resources:any;
 stays:any[];
 menu:any[];
 date:string;
 onSaved:()=>Promise<void>|void;
 onMessage:(message:string)=>void;
};

const blankForm=()=>({scheduleId:'',menuItemId:'',guestType:'inhouse',stayId:'',guest:'',hotel:'',externalRoom:'',phone:'',quantity:1,adults:1,children:0,infants:0,notes:'',vesselId:'',buggyRequested:false});
function maldivesToday(){const p=new Intl.DateTimeFormat('en-CA',{timeZone:'Indian/Maldives',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date()),g=(t:string)=>p.find(x=>x.type===t)?.value||'';return g('year')+'-'+g('month')+'-'+g('day');}

export default function AdminExcursionBooking({schedules,sharedBoatGroups,resources,stays,menu,date,onSaved,onMessage}:Props){
 const [open,setOpen]=useState(false),[saving,setSaving]=useState(false),[loadingDay,setLoadingDay]=useState(false);
 const [bookingDate,setBookingDate]=useState(date),[daySchedules,setDaySchedules]=useState<any[]>(schedules),[dayGroups,setDayGroups]=useState<Record<string,any>>(sharedBoatGroups);
 const [form,setForm]=useState<any>(blankForm());

 useEffect(()=>{if(!open){setBookingDate(date);setDaySchedules(schedules);setDayGroups(sharedBoatGroups)}},[date,schedules,sharedBoatGroups,open]);

 async function loadDay(nextDate:string){
  setBookingDate(nextDate);setForm((x:any)=>({...x,scheduleId:'',menuItemId:'',vesselId:''}));
  if(nextDate===date){setDaySchedules(schedules);setDayGroups(sharedBoatGroups);return;}
  setLoadingDay(true);onMessage('');
  try{
   const r=await fetch('/api/excursion-schedules?date='+encodeURIComponent(nextDate),{cache:'no-store'}),d=await r.json();
   if(!r.ok)throw Error(d.error||'Could not load excursions for this date.');
   setDaySchedules(d.schedules||[]);setDayGroups(d.sharedBoatGroups||{});
  }catch(e){setDaySchedules([]);setDayGroups({});onMessage((e as Error).message)}
  finally{setLoadingDay(false)}
 }

 const bookableSchedules=useMemo(()=>daySchedules
  .filter((s:any)=>{
   if(s.status!=='Open'||excursionDeparturePassed(s.date,s.time))return false;
   const group=s.sharedBoatKey?dayGroups[s.sharedBoatKey]:null;
   const booked=Number(group?.bookedPax??s.bookedPax??0);
   const capacity=Number(group?.capacity??s.capacity??0);
   return capacity>booked;
  })
  .sort((a:any,b:any)=>String(a.time).localeCompare(String(b.time))||String(a.name).localeCompare(String(b.name))),[daySchedules,dayGroups]);
 const selected=useMemo(()=>bookableSchedules.find((s:any)=>s.id===form.scheduleId)||null,[bookableSchedules,form.scheduleId]);
 const choosingOther=form.scheduleId==='__other__';
 const excursionMenu=useMemo(()=>menu.filter((item:any)=>item.kind==='excursion'&&item.active!==false),[menu]);
 const selectedOther=useMemo(()=>choosingOther&&form.menuItemId?excursionMenu.find((item:any)=>item.id===form.menuItemId)||null:null,[choosingOther,excursionMenu,form.menuItemId]);
 const group=selected?.sharedBoatKey?dayGroups[selected.sharedBoatKey]:null;
 const booked=Number(group?.bookedPax??selected?.bookedPax??0);
 const capacity=Number(group?.capacity??selected?.capacity??0);
 const remaining=Math.max(0,capacity-booked);
 const inHouse=(stays||[]).filter((s:any)=>s.status==='In House');
 const money=(c:number)=>'$'+((Number(c)||0)/100).toFixed(2);

 function reset(){setForm(blankForm());setBookingDate(date);setDaySchedules(schedules);setDayGroups(sharedBoatGroups);}
 function close(){if(saving)return;setOpen(false);reset();}
 function setTotalSeats(raw:string){
  if(raw===''){setForm({...form,quantity:'',adults:''});return;}
  const total=Math.max(1,Math.min(100,Number(raw)||1)),children=Number(form.children)||0,infants=Number(form.infants)||0,dependents=children+infants;
  if(total<dependents){onMessage('Total seats cannot be less than children plus children under 3.');return;}
  setForm({...form,quantity:total,adults:total-dependents});
 }

 async function submit(e:React.FormEvent){
  e.preventDefault();if(saving)return;
  if(!selected&&!selectedOther){onMessage(choosingOther?'Choose an excursion from the excursion menu.':'Choose an available trip.');return;}
  const total=Number(form.quantity)||0,ageTotal=(Number(form.adults)||0)+(Number(form.children)||0)+(Number(form.infants)||0);
  if(total<1||total>100||ageTotal!==total){onMessage('Total seats must match Adults + Children + Children under 3.');return;}
  if(form.guestType==='inhouse'&&!form.stayId){onMessage('Choose an in-house guest.');return;}
  if(form.guestType==='walkin'&&(!form.guest.trim()||!form.hotel.trim()||!form.phone.trim())){onMessage('Enter the walk-in guest name, hotel and WhatsApp number.');return;}
    setSaving(true);onMessage('');
  try{
   const payload=selected?{action:'admin-booking',date:bookingDate,scheduleId:selected.id}:{action:'admin-booking-auto',date:bookingDate,menuItemId:selectedOther.id,forceUnscheduled:true};
   const r=await fetch('/api/excursion-schedules',{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify({...payload,guestType:form.guestType,stayId:form.stayId,guest:form.guest,hotel:form.hotel,externalRoom:form.externalRoom,phone:form.phone,quantity:total,adults:Number(form.adults)||0,children:Number(form.children)||0,infants:Number(form.infants)||0,notes:form.notes,buggyRequested:!!form.buggyRequested})});
   const d=await r.json();if(!r.ok)throw Error(d.error||'Could not save excursion booking.');
   onMessage(selected?'Excursion booking confirmed for '+formatDateDMY(bookingDate)+' at '+selected.time+' Maldives time.':'Excursion booking saved as Awaiting Scheduling. Admin can assign the trip later.');
   setOpen(false);reset();if(bookingDate===date)await onSaved();window.dispatchEvent(new Event('services-updated'));
  }catch(e){onMessage((e as Error).message)}finally{setSaving(false)}
 }

 return <>
  <button type="button" className="excursion-secondary-btn" onClick={()=>{setOpen(true);setBookingDate(date);setDaySchedules(schedules);setDayGroups(sharedBoatGroups)}}>+ Book guest</button>
  {open&&<div className="excursion-schedule-overlay"><form className="excursion-schedule-dialog admin-excursion-booking" onSubmit={submit}>
   <header><div><small>ADMIN BOOKING</small><h3>Book excursion on any day</h3><p>{formatDateDMY(bookingDate)} · Choose any future date, excursion and number of seats.</p></div><button type="button" className="excursion-dialog-close" aria-label="Close" onClick={close}><X/></button></header>
   <div className="excursion-schedule-form-grid">
    <label>Date<input required type="date" min={maldivesToday()} value={bookingDate} onChange={e=>loadDay(e.target.value)}/><small>Change the date to load that day's excursion schedule.</small></label>
    <label>Available trip<select required disabled={loadingDay} value={form.scheduleId} onChange={e=>setForm({...form,scheduleId:e.target.value,menuItemId:e.target.value==='__other__'?form.menuItemId:''})}><option value="">{loadingDay?'Loading trips…':'Choose available trip'}</option>{bookableSchedules.map((trip:any)=>{const tripGroup=trip.sharedBoatKey?dayGroups[trip.sharedBoatKey]:null;const tripBooked=Number(tripGroup?.bookedPax??trip.bookedPax??0);const tripCapacity=Number(tripGroup?.capacity??trip.capacity??0);const left=Math.max(0,tripCapacity-tripBooked);return <option key={trip.id} value={trip.id}>{trip.time} · {trip.name} · {left} seat{left===1?'':'s'} left</option>})}<option value="__other__">Other trip</option></select><small>{selected?selected.time+' Maldives time · '+remaining+' of '+capacity+' seats available':choosingOther?'Choose the excursion below. Admin will schedule the trip after booking.':'Choose a scheduled trip or Other trip.'}</small></label>
    {choosingOther&&<label>Excursion<select required value={form.menuItemId} onChange={e=>setForm({...form,menuItemId:e.target.value})}><option value="">Choose excursion</option>{excursionMenu.map((item:any)=><option key={item.id} value={item.id}>{item.name}</option>)}</select><small>This booking will be saved as Awaiting Scheduling. Admin can assign the trip time, vessel, crew and accessories later.</small></label>}
    <label>Guest type<select value={form.guestType} onChange={e=>setForm({...form,guestType:e.target.value,stayId:'',guest:'',hotel:'',externalRoom:'',phone:''})}><option value="inhouse">In-house guest</option><option value="walkin">Walk-in guest</option></select></label>
    <div className="full admin-child-policy"><strong>Children policy</strong><span>{excursionChildPolicyText()}</span></div>

    <label>Adults (12+)<input required type="number" min={0} max={100} value={form.adults??''} onFocus={e=>e.currentTarget.select()} onChange={e=>{const raw=e.target.value,adults=raw===''?'':Math.max(0,Math.min(100,Number(raw)||0)),children=Number(form.children)||0,infants=Number(form.infants)||0;setForm({...form,adults,quantity:(Number(adults)||0)+children+infants})}}/></label>
    <label>Children (3–11)<input required type="number" min={0} max={100} value={form.children??''} onFocus={e=>e.currentTarget.select()} onChange={e=>{const raw=e.target.value,children=raw===''?'':Math.max(0,Math.min(100,Number(raw)||0)),adults=Number(form.adults)||0,infants=Number(form.infants)||0;setForm({...form,children,quantity:adults+(Number(children)||0)+infants})}}/></label>
    <label>Children under 3<input required type="number" min={0} max={100} value={form.infants??''} onFocus={e=>e.currentTarget.select()} onChange={e=>{const raw=e.target.value,infants=raw===''?'':Math.max(0,Math.min(100,Number(raw)||0)),adults=Number(form.adults)||0,children=Number(form.children)||0;setForm({...form,infants,quantity:adults+children+(Number(infants)||0)})}}/></label>
    <label className="admin-booking-total-seats"><span>Total seats</span><input required type="number" min={1} max={100} value={form.quantity??''} onFocus={e=>e.currentTarget.select()} onChange={e=>setTotalSeats(e.target.value)}/><small>You can increase the total seats here. Adults update automatically after child seats are reserved.</small></label>

    {form.guestType==='inhouse'?<label className="full">In-house guest<select required value={form.stayId} onChange={e=>setForm({...form,stayId:e.target.value})}><option value="">Choose room / guest</option>{inHouse.map((s:any)=><option key={s.id} value={s.id}>Room {s.room} · {s.guest}</option>)}</select><small>The excursion charge will be added to the room's main bill.</small></label>:<>
     <label>Guest name<input required maxLength={100} value={form.guest} onChange={e=>setForm({...form,guest:e.target.value})}/></label>
     <label>WhatsApp<input required placeholder="+960..." maxLength={30} value={form.phone} onChange={e=>setForm({...form,phone:e.target.value})}/></label>
     <label>Hotel / accommodation<input required maxLength={150} value={form.hotel} onChange={e=>setForm({...form,hotel:e.target.value})}/></label>
     <label>Room number<input maxLength={50} value={form.externalRoom} onChange={e=>setForm({...form,externalRoom:e.target.value})}/></label>
     <label className="full guest-buggy-request"><span><input type="checkbox" checked={!!form.buggyRequested} onChange={e=>setForm({...form,buggyRequested:e.target.checked})}/> Request buggy pickup</span><small>The guest should be ready outside the hotel or meeting location 15 minutes before departure.</small></label>
    </>}

    {selected&&<div className="full admin-booking-capacity"><span>Selected trip</span><strong>{selected.time} · {selected.name}</strong><small>{booked+' / '+capacity+' confirmed · '+remaining+' seat'+(remaining===1?'':'s')+' remaining · '}{selected.priceCents?money(excursionPriceCents(selected.priceCents,'guest',{adults:Number(form.adults)||0,children:Number(form.children)||0,infants:Number(form.infants)||0,total:Number(form.quantity)||0}))+' total · ':''}Departure time is checked using Maldives time (UTC+5).</small></div>}
    {selectedOther&&<div className="full admin-booking-capacity"><span>Awaiting Scheduling</span><strong>{selectedOther.name}</strong><small>Admin will schedule this excursion after the booking is saved.</small></div>}
    <label className="full">Notes<textarea rows={3} maxLength={1000} value={form.notes} onChange={e=>setForm({...form,notes:e.target.value})}/></label>
   </div>
   <footer><button type="button" className="excursion-secondary-btn" disabled={saving} onClick={close}>Cancel</button><button type="submit" className="excursion-primary-btn" disabled={saving||loadingDay||(!selected&&!selectedOther)||!form.quantity||form.quantity<1||form.quantity>100||(selected&&Number(form.quantity)>remaining)}>{saving?'Saving…':'Confirm booking'}</button></footer>
  </form></div>}
 </>;
}
