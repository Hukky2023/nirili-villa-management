'use client';
import {useEffect,useMemo,useState} from 'react';
import {X} from 'lucide-react';
import {formatDateDMY} from '../lib/date-format';
import {excursionChildPolicyText,excursionPriceCents} from '../lib/excursion-children';
import {excursionDeparturePassed} from '../lib/guest-catalog';
import {isSnorkelingTrip,PRIVATE_BOAT_SURCHARGE_CENTS} from '../lib/excursion-operations';

type Props={
 schedules:any[];
 sharedBoatGroups:Record<string,any>;
 resources:any;
 stays:any[];
 menu:any[];
 date:string;
 onSaved:()=>Promise<void>|void;
 onMessage:(message:string)=>void;
 initialScheduleId?:string;
 triggerLabel?:string;
};

const categoriesFor=(adults:number,children:number,infants:number)=>[
 ...Array.from({length:Math.max(0,adults)},()=> 'adult'),
 ...Array.from({length:Math.max(0,children)},()=> 'child'),
 ...Array.from({length:Math.max(0,infants)},()=> 'infant')
];
const blankForm=()=>({
 scheduleId:'',menuItemId:'',guestType:'inhouse',stayId:'',guest:'',hotel:'',externalRoom:'',phone:'',email:'',
 quantity:1,adults:1,children:0,infants:0,groupName:'',guestNames:[''],guestCategories:['adult'],footSizes:[''],
 notes:'',vesselId:'',buggyRequested:false,privateBoatRequested:false
});
function maldivesToday(){const p=new Intl.DateTimeFormat('en-CA',{timeZone:'Indian/Maldives',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date()),g=(t:string)=>p.find(x=>x.type===t)?.value||'';return g('year')+'-'+g('month')+'-'+g('day');}
const ageLabel=(value:string)=>value==='child'?'Child (3–11)':value==='infant'?'Under 3':'Adult (12+)';

export default function AdminExcursionBooking({schedules,sharedBoatGroups,resources,stays,menu,date,onSaved,onMessage,initialScheduleId='',triggerLabel='+ Book guest'}:Props){
 const [open,setOpen]=useState(false),[saving,setSaving]=useState(false),[loadingDay,setLoadingDay]=useState(false),[loadingMenu,setLoadingMenu]=useState(false),[formError,setFormError]=useState('');
 const [bookingDate,setBookingDate]=useState(date),[daySchedules,setDaySchedules]=useState<any[]>(schedules),[dayGroups,setDayGroups]=useState<Record<string,any>>(sharedBoatGroups);
 const [form,setForm]=useState<any>(blankForm());
 const [liveMenu,setLiveMenu]=useState<any[]>(menu||[]);

 useEffect(()=>{if(!open){setBookingDate(date);setDaySchedules(schedules);setDayGroups(sharedBoatGroups)}},[date,schedules,sharedBoatGroups,open]);
 useEffect(()=>{setLiveMenu(menu||[])},[menu]);

 async function loadExcursionMenu(){
  setLoadingMenu(true);onMessage('');
  try{
   const r=await fetch('/api/excursion-menu',{cache:'no-store'}),d=await r.json();
   if(!r.ok)throw Error(d.error||'Could not load excursion menu.');
   setLiveMenu(d.items||[]);
  }catch(e){onMessage((e as Error).message)}
  finally{setLoadingMenu(false)}
 }

 async function loadDay(nextDate:string){
  setBookingDate(nextDate);setForm((x:any)=>({...x,scheduleId:'',menuItemId:'',vesselId:'',privateBoatRequested:false}));
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
  .filter((s:any)=>s.status==='Open'&&!excursionDeparturePassed(s.date,s.time))
  .sort((a:any,b:any)=>String(a.time).localeCompare(String(b.time))||String(a.name).localeCompare(String(b.name))),[daySchedules]);
 const selected=useMemo(()=>bookableSchedules.find((s:any)=>s.id===form.scheduleId)||null,[bookableSchedules,form.scheduleId]);
 const choosingOther=form.scheduleId==='__other__';
 const excursionMenu=useMemo(()=>liveMenu.filter((item:any)=>item.kind==='excursion'&&item.active!==false),[liveMenu]);
 const selectedOther=useMemo(()=>choosingOther&&form.menuItemId?excursionMenu.find((item:any)=>item.id===form.menuItemId)||null:null,[choosingOther,excursionMenu,form.menuItemId]);
 const group=selected?.sharedBoatKey?dayGroups[selected.sharedBoatKey]:null;
 const booked=Number(group?.bookedPax??selected?.bookedPax??0);
 const capacity=Number(group?.capacity??selected?.capacity??0);
 const remaining=Math.max(0,capacity-booked);
 const inHouse=(stays||[]).filter((s:any)=>s.status==='In House');
 const totalGuests=Math.max(0,Number(form.quantity)||0);
 const excursionName=selected?.name||selectedOther?.name||'';
 const snorkeling=!!excursionName&&isSnorkelingTrip(excursionName);
 const privateBoatEligible=totalGuests>=4;
 const needsExtraVessel=!!selected&&!form.privateBoatRequested&&totalGuests>remaining;
 const availableExtraVessels=(resources?.vessels||[]).filter((v:any)=>{
  if(v.condition!=='Available'||v.id===selected?.vesselId)return false;
  const vesselCapacity=Number(v.capacity);
  return !Number.isSafeInteger(vesselCapacity)||vesselCapacity>=totalGuests;
 });
 const money=(c:number)=>'$'+((Number(c)||0)/100).toFixed(2);

 function reset(){setForm({...blankForm(),scheduleId:initialScheduleId||''});setBookingDate(date);setDaySchedules(schedules);setDayGroups(sharedBoatGroups);setFormError('');}
 function fail(message:string){setFormError(message);onMessage('');}
 function close(){if(saving)return;setOpen(false);reset();}
 function resizeGuestArrays(current:any,total:number,categories:string[]){
  const guestNames=Array.from({length:total},(_,index)=>String(current.guestNames?.[index]||''));
  const footSizes=Array.from({length:total},(_,index)=>current.footSizes?.[index]??'');
  return {...current,quantity:total,guestCategories:categories,guestNames,footSizes,privateBoatRequested:total>=4?!!current.privateBoatRequested:false};
 }
 function applyCounts(nextAdults:any,nextChildren:any,nextInfants:any){
  const adults=Math.max(0,Number(nextAdults)||0),children=Math.max(0,Number(nextChildren)||0),infants=Math.max(0,Number(nextInfants)||0),categories=categoriesFor(adults,children,infants);
  setForm((current:any)=>({...resizeGuestArrays(current,categories.length,categories),adults:nextAdults,children:nextChildren,infants:nextInfants,vesselId:''}));
 }
 function setTotalSeats(raw:string){
  if(raw===''){setForm((current:any)=>({...current,quantity:'',adults:'',guestNames:[],guestCategories:[],footSizes:[],privateBoatRequested:false,vesselId:''}));return;}
  const total=Math.max(1,Math.min(100,Number(raw)||1)),children=Number(form.children)||0,infants=Number(form.infants)||0,dependents=children+infants;
  if(total<dependents){onMessage('Total seats cannot be less than children plus children under 3.');return;}
  const adults=total-dependents,categories=categoriesFor(adults,children,infants);
  setForm((current:any)=>({...resizeGuestArrays(current,total,categories),adults,quantity:total,vesselId:''}));
 }
 function updateGuestName(index:number,value:string){
  const guestNames=[...(form.guestNames||[])];guestNames[index]=value;setForm({...form,guestNames});
 }
 function updateGuestCategory(index:number,value:string){
  const guestCategories=[...(form.guestCategories||[])];guestCategories[index]=value;
  const adults=guestCategories.filter((x:string)=>x==='adult').length,children=guestCategories.filter((x:string)=>x==='child').length,infants=guestCategories.filter((x:string)=>x==='infant').length;
  setForm({...form,guestCategories,adults,children,infants,quantity:guestCategories.length});
 }
 function updateFootSize(index:number,value:string){
  const footSizes=[...(form.footSizes||[])];footSizes[index]=value;setForm({...form,footSizes});
 }
 function selectInHouse(stayId:string){
  const stay=inHouse.find((item:any)=>item.id===stayId),guestNames=[...(form.guestNames||[])];
  if(stay&&(!guestNames[0]||guestNames[0]===form.guest))guestNames[0]=stay.guest||'';
  setForm({...form,stayId,guestNames});
 }
 function updateWalkInLead(value:string){
  const guestNames=[...(form.guestNames||[])];
  if(!guestNames[0]||guestNames[0]===form.guest)guestNames[0]=value;
  setForm({...form,guest:value,guestNames});
 }

 async function submit(e:React.FormEvent){
  e.preventDefault();if(saving)return;setFormError('');
  if(!selected&&!selectedOther){fail(choosingOther?'Choose an excursion from the excursion menu.':'Choose an available trip.');return;}
  const total=Number(form.quantity)||0,ageTotal=(Number(form.adults)||0)+(Number(form.children)||0)+(Number(form.infants)||0);
  if(total<1||total>100||ageTotal!==total){fail('Total seats must match Adults + Children + Children under 3.');return;}
  const guestNames=(form.guestNames||[]).slice(0,total).map((value:any)=>String(value||'').trim());
  const guestCategories=(form.guestCategories||[]).slice(0,total);
  if(guestNames.length!==total||guestNames.some((name:string)=>!name)){fail('Enter the name of every guest.');return;}
  if(guestCategories.length!==total||guestCategories.some((category:string)=>!['adult','child','infant'].includes(category))){fail('Choose an age category for every guest.');return;}
  const footSizes=(form.footSizes||[]).slice(0,total);
  if(snorkeling&&(footSizes.length!==total||footSizes.some((value:any)=>!Number.isInteger(Number(value))||Number(value)<15||Number(value)>50))){const missing=footSizes.findIndex((value:any)=>!Number.isInteger(Number(value))||Number(value)<15||Number(value)>50);fail('Enter an EU foot size from 15 to 50 for '+(guestNames[missing]||('Guest '+(missing+1)))+'. Foot size is required for snorkeling fins.');return;}
  if(form.guestType==='inhouse'&&!form.stayId){fail('Choose an in-house guest.');return;}
  if(form.guestType==='walkin'&&(!form.guest.trim()||!form.phone.trim()||!form.email.trim())){fail('Enter the walk-in guest name, phone number and email address.');return;}
  if(needsExtraVessel&&!form.vesselId){fail('This departure does not have enough seats. Choose an extra vessel for this booking.');return;}
  setSaving(true);onMessage('');
  try{
   const payload=selected?{action:'admin-booking',date:bookingDate,scheduleId:selected.id}:{action:'admin-booking-auto',date:bookingDate,menuItemId:selectedOther.id,forceUnscheduled:true};
   const r=await fetch('/api/excursion-schedules',{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify({
    ...payload,guestType:form.guestType,stayId:form.stayId,guest:form.guest,hotel:form.hotel,externalRoom:form.externalRoom,phone:form.phone,email:form.email,
    quantity:total,adults:Number(form.adults)||0,children:Number(form.children)||0,infants:Number(form.infants)||0,
    groupName:form.groupName,guestNames,guestCategories,footSizes:snorkeling?footSizes.map((value:any)=>Number(value)):[],
    privateBoatRequested:privateBoatEligible&&!!form.privateBoatRequested,vesselId:needsExtraVessel?form.vesselId:'',
    notes:form.notes,buggyRequested:!!form.buggyRequested
   })});
   const d=await r.json();if(!r.ok)throw Error(d.error||'Could not save excursion booking.');
   const pending=d.booking?.requiresScheduling===true||d.booking?.status==='Pending';
   onMessage(pending
    ?'Excursion booking saved as Awaiting Scheduling. Admin can now assign the vessel, crew and trip time.'
    :'Excursion booking confirmed for '+formatDateDMY(bookingDate)+' at '+(selected?.time||d.booking?.time||'the scheduled time')+' Maldives time.');
   setOpen(false);reset();if(bookingDate===date)await onSaved();window.dispatchEvent(new Event('services-updated'));
  }catch(e){onMessage((e as Error).message)}finally{setSaving(false)}
 }

 const selectedPrice=selected?.priceCents
  ?excursionPriceCents(selected.priceCents,'guest',{adults:Number(form.adults)||0,children:Number(form.children)||0,infants:Number(form.infants)||0,total:totalGuests})
  :0;
 const otherPrice=selectedOther?.cents
  ?excursionPriceCents(selectedOther.cents,selectedOther.pricingUnit,{adults:Number(form.adults)||0,children:Number(form.children)||0,infants:Number(form.infants)||0,total:totalGuests})
  :0;
 const estimatedTotal=(selectedPrice||otherPrice)+(form.privateBoatRequested?PRIVATE_BOAT_SURCHARGE_CENTS:0);

 return <>
  <button type="button" className="excursion-primary-btn admin-excursion-book-trigger" onClick={()=>{setOpen(true);setBookingDate(date);setDaySchedules(schedules);setDayGroups(sharedBoatGroups);setForm({...blankForm(),scheduleId:initialScheduleId||''});setFormError('')}}>{triggerLabel}</button>
  {open&&<div className="excursion-schedule-overlay"><form className="excursion-schedule-dialog admin-excursion-booking" onSubmit={submit} noValidate>
   <header><div><small>ADMIN BOOKING</small><h3>Book excursion on any day</h3><p>{formatDateDMY(bookingDate)} · Add every guest, then confirm a scheduled trip or send it to Awaiting Scheduling.</p></div><button type="button" className="excursion-dialog-close" aria-label="Close" onClick={close}><X/></button></header>
   <div className="excursion-schedule-form-grid">
    <label>Date<input required type="date" min={maldivesToday()} value={bookingDate} onChange={e=>loadDay(e.target.value)}/><small>Change the date to load that day's excursion schedule.</small></label>
    <label>Available trip<select required disabled={loadingDay} value={form.scheduleId} onChange={e=>{const value=e.target.value;setForm({...form,scheduleId:value,menuItemId:value==='__other__'?form.menuItemId:'',vesselId:'',privateBoatRequested:false});if(value==='__other__')void loadExcursionMenu();}}><option value="">{loadingDay?'Loading trips…':'Choose available trip'}</option>{bookableSchedules.map((trip:any)=>{const tripGroup=trip.sharedBoatKey?dayGroups[trip.sharedBoatKey]:null;const tripBooked=Number(tripGroup?.bookedPax??trip.bookedPax??0);const tripCapacity=Number(tripGroup?.capacity??trip.capacity??0);const left=Math.max(0,tripCapacity-tripBooked);return <option key={trip.id} value={trip.id}>{trip.time} · {trip.name} · {left>0?left+' seat'+(left===1?'':'s')+' left':'FULL · extra vessel required'}</option>})}<option value="__other__">Other trip</option></select><small>{selected?selected.time+' Maldives time · '+remaining+' of '+capacity+' seats available':choosingOther?'Choose the excursion below. Admin will schedule the trip after booking.':'Choose a scheduled trip or Other trip.'}</small></label>
    {choosingOther&&<label>Excursion<select required disabled={loadingMenu} value={form.menuItemId} onChange={e=>setForm({...form,menuItemId:e.target.value,privateBoatRequested:false})}><option value="">{loadingMenu?'Loading excursion menu…':'Choose excursion'}</option>{excursionMenu.map((item:any)=><option key={item.id} value={item.id}>{item.name}</option>)}</select><small>{loadingMenu?'Loading the latest excursion menu…':'All active excursions come directly from the Excursion menu. Other trip bookings go to Awaiting Scheduling.'}</small></label>}
    <label>Guest type<select value={form.guestType} onChange={e=>setForm({...form,guestType:e.target.value,stayId:'',guest:'',hotel:'',externalRoom:'',phone:'',email:'',buggyRequested:false})}><option value="inhouse">In-house guest</option><option value="walkin">Walk-in guest</option></select></label>
    <label>Family / group name<input maxLength={100} placeholder="Optional" value={form.groupName} onChange={e=>setForm({...form,groupName:e.target.value})}/><small>One booking and one combined payment can cover the whole family/group.</small></label>
    <div className="full admin-child-policy"><strong>Children policy</strong><span>{excursionChildPolicyText()}</span></div>

    <label>Adults (12+)<input required type="number" min={0} max={100} value={form.adults??''} onFocus={e=>e.currentTarget.select()} onChange={e=>{const raw=e.target.value;applyCounts(raw===''?'':Math.max(0,Math.min(100,Number(raw)||0)),form.children,form.infants)}}/></label>
    <label>Children (3–11)<input required type="number" min={0} max={100} value={form.children??''} onFocus={e=>e.currentTarget.select()} onChange={e=>{const raw=e.target.value;applyCounts(form.adults,raw===''?'':Math.max(0,Math.min(100,Number(raw)||0)),form.infants)}}/></label>
    <label>Children under 3<input required type="number" min={0} max={100} value={form.infants??''} onFocus={e=>e.currentTarget.select()} onChange={e=>{const raw=e.target.value;applyCounts(form.adults,form.children,raw===''?'':Math.max(0,Math.min(100,Number(raw)||0)))}}/></label>
    <label className="admin-booking-total-seats"><span>Total seats</span><input required type="number" min={1} max={100} value={form.quantity??''} onFocus={e=>e.currentTarget.select()} onChange={e=>setTotalSeats(e.target.value)}/><small>Changing total seats adjusts the adult count after child seats are reserved.</small></label>

    {form.guestType==='inhouse'?<label className="full">In-house guest<select required value={form.stayId} onChange={e=>selectInHouse(e.target.value)}><option value="">Choose room / guest</option>{inHouse.map((s:any)=><option key={s.id} value={s.id}>Room {s.room} · {s.guest}</option>)}</select><small>The excursion charge will be added to the room's main bill. Buggy pickup is included automatically.</small></label>:<>
     <label>Lead guest<input required maxLength={100} value={form.guest} onChange={e=>updateWalkInLead(e.target.value)}/></label>
     <label>Phone / WhatsApp<input required placeholder="+960..." maxLength={30} value={form.phone} onChange={e=>setForm({...form,phone:e.target.value})}/></label>
     <label>Email<input required type="email" maxLength={200} placeholder="guest@example.com" value={form.email||''} onChange={e=>setForm({...form,email:e.target.value})}/><small>Booking confirmation is sent automatically after the excursion is saved.</small></label>
     <label>Hotel / accommodation<input maxLength={150} placeholder="Optional" value={form.hotel} onChange={e=>setForm({...form,hotel:e.target.value})}/></label>
     <label>Room number<input maxLength={50} value={form.externalRoom} onChange={e=>setForm({...form,externalRoom:e.target.value})}/></label>
     <label className="full guest-buggy-request"><span><input type="checkbox" checked={!!form.buggyRequested} onChange={e=>setForm({...form,buggyRequested:e.target.checked})}/> Request buggy pickup</span><small>The guest should be ready outside the hotel or meeting location 15 minutes before departure.</small></label>
    </>}

    {totalGuests>0&&<div className="full admin-guest-roster">
     <div className="admin-guest-roster-head"><div><strong>Guest details</strong><small>Names and age category are required for every passenger.{snorkeling?' EU foot size is also required for snorkeling fins.':''}</small></div><span>{totalGuests} guest{totalGuests===1?'':'s'}</span></div>
     <div className="admin-guest-roster-list">{Array.from({length:totalGuests},(_,index)=><div className="admin-guest-row" key={index}>
      <span className="admin-guest-number">{index+1}</span>
      <label>Guest name<input required maxLength={100} value={form.guestNames?.[index]||''} onChange={e=>updateGuestName(index,e.target.value)} placeholder={'Guest '+(index+1)+' name'}/></label>
      <label>Age category<select required value={form.guestCategories?.[index]||'adult'} onChange={e=>updateGuestCategory(index,e.target.value)}><option value="adult">Adult (12+)</option><option value="child">Child (3–11)</option><option value="infant">Under 3</option></select><small>{ageLabel(form.guestCategories?.[index]||'adult')}</small></label>
      {snorkeling&&<label>EU foot size<input aria-invalid={!!formError&&(!Number.isInteger(Number(form.footSizes?.[index]))||Number(form.footSizes?.[index])<15||Number(form.footSizes?.[index])>50)} type="number" inputMode="numeric" min={15} max={50} step={1} value={form.footSizes?.[index]??''} onChange={e=>{setFormError('');updateFootSize(index,e.target.value)}} placeholder="e.g. 42"/><small>Required for snorkeling fins · EU size 15–50</small></label>}
     </div>)}</div>
    </div>}

    {privateBoatEligible&&<label className="full admin-private-boat"><span><input type="checkbox" checked={!!form.privateBoatRequested} onChange={e=>setForm({...form,privateBoatRequested:e.target.checked,vesselId:''})}/> Private boat for this group <strong>+{money(PRIVATE_BOAT_SURCHARGE_CENTS)}</strong></span><small>Available for 4+ guests. The booking will go to Awaiting Scheduling so Admin can assign a dedicated vessel and crew.</small></label>}

    {needsExtraVessel&&<label className="full admin-extra-vessel">Extra vessel<select required value={form.vesselId} onChange={e=>setForm({...form,vesselId:e.target.value})}><option value="">Choose extra vessel</option>{availableExtraVessels.map((v:any)=><option key={v.id} value={v.id}>{v.name}{Number.isSafeInteger(Number(v.capacity))?' · '+v.capacity+' pax':''}</option>)}</select><small>This trip only has {remaining} seat{remaining===1?'':'s'} left. The selected extra vessel will carry this booking at the same departure time.</small>{!availableExtraVessels.length&&<strong>No available vessel has enough recorded capacity. Update vessel capacity or choose Private boat to schedule it separately.</strong>}</label>}

    {formError&&<div className="full admin-booking-form-error" role="alert"><strong>Booking needs attention</strong><span>{formError}</span></div>}

    {selected&&<div className="full admin-booking-capacity"><span>{form.privateBoatRequested?'Private boat request':needsExtraVessel?'Extra vessel booking':'Selected trip'}</span><strong>{selected.time} · {selected.name}</strong><small>{booked+' / '+capacity+' confirmed · '+remaining+' seat'+(remaining===1?'':'s')+' remaining · '}{estimatedTotal?money(estimatedTotal)+' estimated total · ':''}{form.privateBoatRequested?'Awaiting Scheduling after save.':needsExtraVessel?'Separate vessel will be recorded for this booking.':'Departure time is checked using Maldives time (UTC+5).'}</small></div>}
    {selectedOther&&<div className="full admin-booking-capacity"><span>Awaiting Scheduling</span><strong>{selectedOther.name}</strong><small>{estimatedTotal?money(estimatedTotal)+' estimated total · ':''}Admin will assign the departure time, vessel and crew after the booking is saved.</small></div>}
    <label className="full">Notes<textarea rows={3} maxLength={1000} value={form.notes} onChange={e=>setForm({...form,notes:e.target.value})}/></label>
   </div>
   <footer><button type="button" className="excursion-secondary-btn" disabled={saving} onClick={close}>Cancel</button><button type="submit" className="excursion-primary-btn" disabled={saving||loadingDay||(!selected&&!selectedOther)||!form.quantity||form.quantity<1||form.quantity>100||(needsExtraVessel&&!form.vesselId)}>{saving?'Saving…':form.privateBoatRequested||selectedOther?'Save booking request':'Confirm booking'}</button></footer>
  </form></div>}
 </>;
}
