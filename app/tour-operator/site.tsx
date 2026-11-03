"use client";
import {useEffect,useState} from "react";
import {ArrowRight,Baby,BedDouble,BriefcaseBusiness,CalendarDays,ChevronDown,ClipboardList,LockKeyhole,LogOut,MapPin,Percent,Search,UserRound,UsersRound,Waves} from "lucide-react";
import {childAge, childAges, partnerPackagePrice} from "../../lib/partner-package-pricing";
import BookingConfirmationButton from "./booking-confirmation-button";

const money=(c:number)=>"$"+(Math.max(0,Number(c)||0)/100).toFixed(2);
type RoomGuest = {kind:"adult"|"child"; name:string; passport:string; age:string|number};

function resizeGuests(guests:RoomGuest[], adults:number, children:number) {
 const rowsFor = (kind:RoomGuest["kind"], count:number) => {
  const existing = guests.filter(guest => guest.kind === kind);
  return Array.from({length:count}, (_,i) => existing[i] ?? {kind, name:"", passport:"", age:""});
 };
 return [...rowsFor("adult", adults), ...rowsFor("child", children)];
}

function ChildAgeSelect({value,onChange}:{value:unknown;onChange:(age:string)=>void}) {
 return <select name="childAge" required value={childAge(value) ?? ""} onChange={e=>onChange(e.target.value)}>
  <option value="" disabled>Select age at check-in</option>
  {childAges.map(age=><option key={age} value={age}>{age===0?"Under 1":age===1?"1 year":age+" years"}</option>)}
 </select>;
}

function packageQuote(form:any, catalog:any) {
 if(!form || !catalog || !form.meal) return null;
 const children = form.guests.slice(form.adults);
 if(children.length !== form.children || children.some((guest:RoomGuest)=>childAge(guest.age)===null)) return null;
 return partnerPackagePrice({
  adults:form.adults, childAges:children.map((guest:RoomGuest)=>Number(guest.age)),
  meal:form.meal, rates:catalog.roomRates, nights:(Date.parse(form.checkOut)-Date.parse(form.checkIn))/86400000,
  excursions:catalog.excursions.filter((item:{id:string})=>form.excursionIds.includes(item.id)),
  transfer:form.transfer, commission:catalog.operator
 });
}

// Partner portal → Rooms & packages: room bookings with meal plan, excursions and airport
// transfer at the partner's discounts. The portal shell handles sign-in and only shows this to
// partners allowed to book rooms and packages.
export default function RoomPackages(){
 const [operator,setOperator]=useState<any>(null),[data,setData]=useState<any>(null),[message,setMessage]=useState(""),[busy,setBusy]=useState(false);
 const [availability,setAvailability]=useState<any>(null),[availabilityBusy,setAvailabilityBusy]=useState(false),[availabilityMessage,setAvailabilityMessage]=useState("");

 const [form,setForm]=useState<any>({guest:"",phone:"",email:"",checkIn:"",checkOut:"",adults:2,children:0,guests:[{name:"",passport:"",age:"",kind:"adult"},{name:"",passport:"",age:"",kind:"adult"}],roomType:"",meal:"",addExcursions:false,excursionIds:[],transfer:"none",packageName:"",notes:""});
 const [editing,setEditing]=useState<any>(null),[manageMessage,setManageMessage]=useState("");
 const [guestDetailsOpen,setGuestDetailsOpen]=useState(false),[packageOpen,setPackageOpen]=useState(false);
 async function load(){try{const r=await fetch("/api/tour-operator-portal/catalog",{cache:"no-store"}),d:any=await r.json();if(r.status===401){setOperator(null);setData(null);return}if(!r.ok)throw Error(d.error);setOperator(d.operator);setData(d);}catch(e){setMessage((e as Error).message)}}
 useEffect(()=>{void load()},[]);


 function startEditBooking(b:any){
  const adults=Number(b.adults||b.pax||1),children=Number(b.children||0),total=adults+children;
  const guests=Array.from({length:total},(_,i)=>b.guests?.[i]||{name:i===0?b.guest||"":"",passport:"",age:"",kind:i<adults?"adult":"child"}).map((g:any,i:number)=>({...g,kind:i<adults?"adult":"child"}));
  // Older bookings allowed teenagers to be entered as children. Keep their details when editing.
  const adultGuests=guests.filter(g=>g.kind==="adult"||Number(g.age)>=13);
  const childGuests=guests.filter(g=>g.kind==="child"&&!(Number(g.age)>=13));
  setManageMessage("");setEditing({...b,adults:adultGuests.length,children:childGuests.length,
   guests:[...adultGuests.map(g=>({...g,kind:"adult"})),...childGuests],excursionIds:[...(b.excursionIds||[])],addExcursions:(b.excursionIds||[]).length>0});
 }
 async function saveBookingEdit(e:React.FormEvent){e.preventDefault();if(!editing||busy)return;setBusy(true);setManageMessage("");try{
  const r=await fetch("/api/tour-operator-portal/manage",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({action:"modify",...editing})}),d:any=await r.json();
  if(!r.ok)throw Error(d.error);setEditing(null);setManageMessage("Booking updated in the Tour Operator Portal and Nirili Management.");await load();
 }catch(e){setManageMessage((e as Error).message)}finally{setBusy(false)}}
 async function cancelBooking(b:any){if(busy||!window.confirm("Cancel booking "+b.id+" for "+b.guest+"?\n\nThis will also cancel/remove the linked booking from Nirili Management."))return;setBusy(true);setManageMessage("");try{
  const r=await fetch("/api/tour-operator-portal/manage",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({action:"cancel",id:b.id})}),d:any=await r.json();
  if(!r.ok)throw Error(d.error);setManageMessage("Booking cancelled. The linked Nirili Management booking was also cancelled.");await load();
 }catch(e){setManageMessage((e as Error).message)}finally{setBusy(false)}}
 const pax=Number(form.adults)+Number(form.children),nights=form.checkIn&&form.checkOut?Math.max(0,(Date.parse(form.checkOut)-Date.parse(form.checkIn))/86400000):0;
 const availabilityKey=[form.checkIn,form.checkOut,form.adults,form.children].join("|"),checkedAvailabilityKey=availability?.key||"";
 const availabilityByType=new Map<string,number>((availability?.availability||[]).map((x:any)=>[String(x.roomType),Number(x.availableCount)||0]));
 function changeStayField(patch:any){setForm((x:any)=>({...x,...patch,meal:""}));setAvailability(null);setAvailabilityMessage("");}
 function changeGuestCount(kind:"adults"|"children",delta:number){
  setForm((old:any)=>{
   const adults=kind==="adults"?Math.max(1,Math.min(3,old.adults+delta)):old.adults;
   const children=Math.min(3-adults,Math.max(0,old.children+(kind==="children"?delta:0)));
   return {...old,adults,children,guests:resizeGuests(old.guests,adults,children),meal:""};
  });
  setAvailability(null);
  setAvailabilityMessage("");
 }
 async function checkAvailability(){
  setAvailabilityBusy(true);setAvailabilityMessage("");setMessage("");
  try{
   const r=await fetch("/api/tour-operator-portal/catalog",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({action:"check-availability",checkIn:form.checkIn,checkOut:form.checkOut,adults:form.adults,children:form.children})}),d:any=await r.json();
   if(!r.ok)throw Error(d.error||"Could not check room availability.");
   const result={...d,key:availabilityKey};setAvailability(result);
   setAvailabilityMessage(d.totalAvailable>0?d.totalAvailable+" room"+(d.totalAvailable===1?" is":"s are")+" available for these dates.":"No rooms are available for these dates.");
  }catch(e){setAvailability(null);setAvailabilityMessage((e as Error).message)}finally{setAvailabilityBusy(false)}
 }
 const quote=packageQuote(form,data),editQuote=packageQuote(editing,data);
 async function book(e:React.FormEvent){e.preventDefault();setBusy(true);setMessage("");try{const r=await fetch("/api/tour-operator-portal/catalog",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({action:"book-package",...form})}),d:any=await r.json();if(!r.ok)throw Error(d.error);setMessage("Booking "+d.id+" sent to Nirili Villa. Total payable to hotel: "+money(d.totalCents));setForm((x:any)=>({...x,guest:"",phone:"",email:"",packageName:"",notes:"",excursionIds:[],guests:Array.from({length:Number(x.adults)+Number(x.children)},(_,i)=>({name:"",passport:"",age:"",kind:i<Number(x.adults)?"adult":"child"}))}));await load()}catch(e){setMessage((e as Error).message)}finally{setBusy(false)}}
 if(!operator)return <p className="to-message">{message||"Room and package bookings are not enabled for your account."}</p>;
 return <div className="to-shell">
  <details className="to-discount-details">
   <summary><span className="to-commission-icon"><Percent/></span><span className="to-commission-copy"><b>Commission Details</b><small>Your commission rates are applied automatically for all confirmed bookings.</small></span><span className="to-commission-toggle" aria-hidden="true"><ChevronDown/></span></summary>
   <section className="to-discounts"><article><small>Room commission</small><b>{operator.roomDiscountPercent}%</b></article><article><small>Excursion commission</small><b>{operator.excursionDiscountPercent}%</b></article><article><small>Airport transfer commission</small><b>{operator.transferDiscountPercent}%</b></article></section>
  </details>
  {message&&<p className="to-message">{message}</p>}
  <form className="to-builder" onSubmit={book}>
   <div className="to-builder-title"><span><CalendarDays/></span><div><h2>Create guest package & room booking</h2><p>Check availability, add guest details and create a booking in a few simple steps.</p></div></div>
   <section className="to-availability-first">
    <h3>Check room availability</h3>
    <div className="to-stay-grid">
     <label><span>Check-in</span><div className="to-field-icon"><CalendarDays/><input required type="date" min={data?.today} value={form.checkIn} onChange={e=>changeStayField({checkIn:e.target.value,checkOut:form.checkOut&&form.checkOut<=e.target.value?"":form.checkOut})}/></div></label>
     <label><span>Check-out</span><div className="to-field-icon"><CalendarDays/><input required type="date" min={form.checkIn||data?.today} value={form.checkOut} onChange={e=>changeStayField({checkOut:e.target.value})}/></div></label>
     <label className="to-room-type-field"><span>Room type</span><div className="to-field-icon"><BedDouble/><select value={form.roomType} onChange={e=>setForm({...form,roomType:e.target.value,meal:""})}><option value="">Select room type</option>{(data?.roomTypes||[]).map((x:string)=><option key={x} value={x}>{x}</option>)}</select></div></label>
    </div>
    <button className="to-check-button" type="button" onClick={checkAvailability} disabled={availabilityBusy||!form.checkIn||!form.checkOut||!form.roomType}><Search/><span>{availabilityBusy?"Checking…":"Check availability"}</span><ArrowRight/></button>
    {availabilityMessage&&<div className={"to-availability-result "+((availabilityByType.get(form.roomType)||0)>0?"available":"unavailable")}><strong>{(availabilityByType.get(form.roomType)||0)>0?"Available":"Availability"}</strong><span>{form.roomType?((availabilityByType.get(form.roomType)||0)>0?(availabilityByType.get(form.roomType)||0)+" "+form.roomType+" room"+((availabilityByType.get(form.roomType)||0)===1?" is":"s are")+" available.":"No "+form.roomType+" rooms are available for these dates."):availabilityMessage}</span></div>}
   </section>
   <section className="to-guest-details">
    <div className="to-guest-heading"><h3>Guest details</h3><span>Add number of adults and children</span></div>
    <div className="to-guest-counts">
     <div className="to-counter-card"><UsersRound/><div><b>Adults</b><small>13+ years</small></div><div className="to-counter-actions"><button type="button" onClick={()=>changeGuestCount("adults",-1)} disabled={Number(form.adults)<=1}>−</button><strong>{form.adults}</strong><button type="button" onClick={()=>changeGuestCount("adults",1)} disabled={Number(form.adults)>=3}>+</button></div></div>
     <div className="to-counter-card"><Baby/><div><b>Children</b><small>Under 13 years</small></div><div className="to-counter-actions"><button type="button" onClick={()=>changeGuestCount("children",-1)} disabled={Number(form.children)<=0}>−</button><strong>{form.children}</strong><button type="button" onClick={()=>changeGuestCount("children",1)} disabled={Number(form.children)>=Math.min(2,3-Number(form.adults))}>+</button></div></div>
    </div>
    {form.children>0&&<div className="to-guest-counts">
     {form.guests.slice(form.adults).map((child:RoomGuest,index:number)=>
      <label key={index}><span>Child {index+1} age</span>
       <ChildAgeSelect value={child.age} onChange={age=>
        setForm((old:any)=>({...old,guests:old.guests.map((guest:RoomGuest,i:number)=>
         i===old.adults+index?{...guest,age}:guest)}))}/>
      </label>
     )}
     <small>Under 3 is free. Ages 3–12 pay half the additional room and excursion charge after your commission.</small>
    </div>}
    <button type="button" className="to-guest-toggle" onClick={()=>setGuestDetailsOpen(v=>!v)}><ClipboardList/><span>{guestDetailsOpen?"Hide guest information":"Add guest names & passport details"}</span><ChevronDown className={guestDetailsOpen?"open":""}/></button>
    {guestDetailsOpen&&<div className="to-guest-expanded">
     <div className="to-guest-policy"><strong>Child policy</strong><span>Maximum 3 guests per room: 1 adult + up to 2 children, 2 adults + up to 1 child, or 3 adults. Passport details are required for every guest.</span></div>
     <div className="to-guest-grid">{(form.guests||[]).map((g:any,i:number)=><article key={i}><b>{g.kind==="child"?"Child ":"Adult "}{g.kind==="child"?i-Number(form.adults)+1:i+1}{i===0?" · Lead guest":""}</b><label>Full name<input required maxLength={100} value={g.name||""} onChange={e=>setForm((old:any)=>{const guests=[...(old.guests||[])];guests[i]={...guests[i],name:e.target.value};return {...old,guests,guest:i===0?e.target.value:old.guest}})}/></label><label>Passport number<input required maxLength={30} value={g.passport||""} onChange={e=>setForm((old:any)=>{const guests=[...(old.guests||[])];guests[i]={...guests[i],passport:e.target.value.toUpperCase()};return {...old,guests}})}/></label></article>)}</div>
     <div className="to-grid"><label>WhatsApp<input required placeholder="+960..." value={form.phone} onChange={e=>setForm({...form,phone:e.target.value})}/></label><label>Email<input required type="email" value={form.email} onChange={e=>setForm({...form,email:e.target.value})}/></label><label>Package name (optional)<input value={form.packageName} onChange={e=>setForm({...form,packageName:e.target.value})}/></label></div>
    </div>}
    <button type="button" className="to-continue-button" disabled={checkedAvailabilityKey!==availabilityKey||!form.roomType||(availabilityByType.get(form.roomType)||0)<1} onClick={event=>{
     const missingAge=event.currentTarget.form?.querySelector('select[name="childAge"]:invalid');
     if(missingAge instanceof HTMLSelectElement){missingAge.reportValidity();return}
     setGuestDetailsOpen(true);setPackageOpen(true);setTimeout(()=>document.querySelector(".to-package-stage")?.scrollIntoView({behavior:"smooth",block:"start"}),50)}}><span>{checkedAvailabilityKey!==availabilityKey?"Check availability first":"Continue to create package"}</span><ArrowRight/></button>
   </section>
   {packageOpen&&<div className="to-package-stage"><div className="to-package-stage-head"><span>PACKAGE BUILDER</span><h3>Complete the guest package</h3><p>Select meal plan, excursions and airport transfer. Your contracted commission is calculated automatically.</p></div><section className="to-step to-room-confirm"><h3>3. Confirm room type</h3>{checkedAvailabilityKey!==availabilityKey?<p className="to-step-note">Check room availability first.</p>:<div className="to-choices">{(data?.roomTypes||[]).map((x:string)=>{const count=availabilityByType.get(x)||0;return <button type="button" key={x} disabled={count<1} className={form.roomType===x?"active":""} onClick={()=>setForm({...form,roomType:x,meal:""})}><span>{x}</span><small>{count>0?count+" available":"Not available"}</small></button>})}</div>}</section>
   {form.roomType&&<section className="to-step"><h3>4. Select meal plan</h3><div className="to-choices">{(data?.plans||[]).map((x:string)=><button type="button" key={x} className={form.meal===x?"active":""} onClick={()=>setForm({...form,meal:x})}>{x}</button>)}</div></section>}
   {form.meal&&<section className="to-step"><h3>5. Add excursions?</h3><div className="to-choices"><button type="button" className={form.addExcursions?"active":""} onClick={()=>setForm({...form,addExcursions:true})}>Yes, add excursions</button><button type="button" className={!form.addExcursions?"active":""} onClick={()=>setForm({...form,addExcursions:false,excursionIds:[]})}>No excursions</button></div>{form.addExcursions&&<div className="to-excursions">{(data?.excursions||[]).map((x:any)=>{const on=form.excursionIds.includes(x.id);return <button type="button" className={on?"active":""} key={x.id} onClick={()=>setForm({...form,excursionIds:on?form.excursionIds.filter((id:string)=>id!==x.id):[...form.excursionIds,x.id]})}><span><strong>{on?"✓ ":""}{x.name}</strong>{Array.isArray(x.includedExcursions)&&x.includedExcursions.length>0&&<small className="to-special-includes">Includes: {x.includedExcursions.map((i:any)=>i.name).join(" · ")}</small>}</span><b>{money(x.cents)} / {x.pricingUnit}</b></button>})}</div>}</section>}
   {form.meal&&<section className="to-step"><h3>6. Airport transfer</h3><div className="to-choices"><button type="button" className={form.transfer==="none"?"active":""} onClick={()=>setForm({...form,transfer:"none"})}>No transfer</button><button type="button" className={form.transfer==="arrival"?"active":""} onClick={()=>setForm({...form,transfer:"arrival"})}>Arrival only</button><button type="button" className={form.transfer==="return"?"active":""} onClick={()=>setForm({...form,transfer:"return"})}>Return transfer</button></div></section>}
   <label>Notes<textarea rows={3} value={form.notes} onChange={e=>setForm({...form,notes:e.target.value})}/></label>
   {quote?<aside className="to-quote" aria-live="polite"><h3>Total payable to Nirili Villa</h3><div><span>Room after {operator.roomDiscountPercent}% commission</span><b>{money(quote.roomCents)}</b></div><div><span>Excursions after {operator.excursionDiscountPercent}% commission</span><b>{money(quote.excursionCents)}</b></div><div><span>Airport transfer after {operator.transferDiscountPercent}% commission</span><b>{money(quote.transferCents)}</b></div><strong><span>Total</span><b>{money(quote.totalCents)}</b></strong><small>Public value {money(quote.publicRoomCents+quote.publicExcursionCents+quote.publicTransferCents)} · {nights||0} night{nights===1?"":"s"} · {pax} guest{pax===1?"":"s"}</small></aside>:<p className="to-message">Select a meal plan and each child’s age to see your total.</p>}
   <button className="to-submit" disabled={busy||!quote||checkedAvailabilityKey!==availabilityKey||!form.roomType||!form.meal||pax>3||pax<1||(form.guests||[]).length!==pax||(form.guests||[]).some((g:any)=>!String(g.name||"").trim()||!String(g.passport||"").trim())}>{busy?"Creating booking…":"Book room & create package"}</button></div>}
  </form>
  <section className="to-bookings">
   <div className="to-bookings-head"><h2>My bookings</h2></div>
   {manageMessage&&<p className="to-manager-message">{manageMessage}</p>}
   {!(data?.bookings||[]).length?<p>No bookings yet.</p>:(data.bookings||[]).map((b:any)=><article className="to-booking-card" key={b.id}>
    <div className="to-booking-main"><b>{b.guest}</b><small>{b.id}</small><span>{b.checkIn} → {b.checkOut} · {b.meal}{b.room?" · Room "+b.room:""}</span></div>
    <div className="to-booking-side"><strong>{money(b.estimate)}</strong><span className={"to-booking-status "+String(b.stayStatus||b.status||"").toLowerCase().replace(/\s+/g,"-")}>{b.stayStatus||b.status}</span>
     <div className="to-booking-actions">
      {String(b.stayStatus||b.status)==="Confirmed"&&<BookingConfirmationButton booking={b}/>}
      {b.canManage&&<button type="button" className="to-edit-booking" onClick={()=>startEditBooking(b)}>Edit</button>}
      {b.canManage&&<button type="button" className="to-cancel-booking" disabled={busy} onClick={()=>void cancelBooking(b)}>Cancel</button>}
     </div>
    </div>
   </article>)}
  </section>
  {editing&&<div className="to-manage-overlay" onMouseDown={e=>{if(e.target===e.currentTarget&&!busy)setEditing(null)}}>
   <form className="to-manage-dialog" onSubmit={saveBookingEdit}>
    <header><div><small>EDIT BOOKING</small><h2>{editing.id}</h2><p>{editing.guest}</p></div><button type="button" disabled={busy} onClick={()=>setEditing(null)}>×</button></header>
    <section><h3>Guest details</h3><div className="to-guest-policy"><strong>Child policy</strong><span>Maximum 3 guests per room: 1 adult + up to 2 children, 2 adults + up to 1 child, or 3 adults. Passport details are required for every guest.</span></div><div className="to-guest-grid">{(editing.guests||[]).map((g:any,i:number)=><article key={i}><b>{g.kind==="child"?"Child ":"Adult "}{g.kind==="child"?i-Number(editing.adults)+1:i+1}{i===0?" · Lead guest":""}</b><label>Full name<input required value={g.name||""} onChange={e=>setEditing((old:any)=>{const guests=[...(old.guests||[])];guests[i]={...guests[i],name:e.target.value};return {...old,guests,guest:i===0?e.target.value:old.guest}})}/></label>{g.kind==="child"&&<label>Age at check-in<ChildAgeSelect value={g.age} onChange={age=>setEditing((old:any)=>({...old,guests:old.guests.map((guest:RoomGuest,index:number)=>index===i?{...guest,age}:guest)}))}/></label>}<label>Passport number<input required value={g.passport||""} onChange={e=>setEditing((old:any)=>{const guests=[...(old.guests||[])];guests[i]={...guests[i],passport:e.target.value.toUpperCase()};return {...old,guests}})}/></label></article>)}</div></section><div className="to-editor-grid"><label>WhatsApp<input required value={editing.phone||""} onChange={e=>setEditing({...editing,phone:e.target.value})}/></label><label>Email<input required type="email" value={editing.email||""} onChange={e=>setEditing({...editing,email:e.target.value})}/></label><label>Package name<input value={editing.packageName||""} onChange={e=>setEditing({...editing,packageName:e.target.value})}/></label></div>
    <div className="to-editor-grid"><label>Check-in<input required type="date" min={data?.today} value={editing.checkIn} onChange={e=>setEditing({...editing,checkIn:e.target.value})}/></label><label>Check-out<input required type="date" min={editing.checkIn||data?.today} value={editing.checkOut} onChange={e=>setEditing({...editing,checkOut:e.target.value})}/></label><label>Adults<select value={editing.adults} onChange={e=>setEditing((old:any)=>{const adults=Number(e.target.value),children=Math.min(Number(old.children||0),3-adults),guests=resizeGuests(old.guests,adults,children);return {...old,adults,children,guests,guest:guests[0]?.name||""}})}>{[1,2,3].map(n=><option key={n}>{n}</option>)}</select></label><label>Children<select value={editing.children} onChange={e=>setEditing((old:any)=>{const children=Math.min(Number(e.target.value),3-Number(old.adults||1)),adults=Number(old.adults||1),guests=resizeGuests(old.guests,adults,children);return {...old,children,guests,guest:guests[0]?.name||""}})}>{Array.from({length:4-Number(editing.adults||1)},(_,i)=><option key={i} value={i}>{i}</option>)}</select></label></div>
    <section><h3>Room type</h3><div className="to-editor-choices">{(data?.roomTypes||[]).map((x:string)=><button type="button" key={x} className={editing.roomType===x?"active":""} onClick={()=>setEditing({...editing,roomType:x})}>{x}</button>)}</div></section>
    <section><h3>Meal plan</h3><div className="to-editor-choices">{(data?.plans||[]).map((x:string)=><button type="button" key={x} className={editing.meal===x?"active":""} onClick={()=>setEditing({...editing,meal:x})}>{x}</button>)}</div></section>
    <section><h3>Excursions</h3><div className="to-editor-excursions">{(data?.excursions||[]).map((x:any)=>{const on=(editing.excursionIds||[]).includes(x.id);return <button type="button" key={x.id} className={on?"active":""} onClick={()=>setEditing({...editing,excursionIds:on?editing.excursionIds.filter((id:string)=>id!==x.id):[...(editing.excursionIds||[]),x.id]})}><span><strong>{on?"✓ ":""}{x.name}</strong>{Array.isArray(x.includedExcursions)&&x.includedExcursions.length>0&&<small className="to-special-includes">Includes: {x.includedExcursions.map((i:any)=>i.name).join(" · ")}</small>}</span><b>{money(x.cents)}</b></button>})}</div></section>
    <section><h3>Airport transfer</h3><div className="to-editor-choices">{[["none","No transfer"],["arrival","Arrival only"],["return","Return transfer"]].map(([v,l])=><button type="button" key={v} className={editing.transfer===v?"active":""} onClick={()=>setEditing({...editing,transfer:v})}>{l}</button>)}</div></section>
    <label>Notes<textarea rows={3} value={editing.notes||""} onChange={e=>setEditing({...editing,notes:e.target.value})}/></label>
    <aside className="to-editor-total" aria-live="polite"><span>Updated total payable to Nirili Villa</span><strong>{editQuote?money(editQuote.totalCents):"Select each child’s age"}</strong></aside>
    <footer><button type="button" disabled={busy} onClick={()=>setEditing(null)}>Cancel</button><button className="primary" disabled={busy||!editQuote}>{busy?"Saving…":"Save changes"}</button></footer>
   </form>
  </div>}
 </div>;
}
