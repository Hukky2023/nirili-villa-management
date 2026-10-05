"use client";
import {useEffect,useMemo,useState} from "react";
import BookingConfirmationButton from "./booking-confirmation-button";

const money=(c:number)=>"$"+(Math.max(0,Number(c)||0)/100).toFixed(2);
const discount=(c:number,p:number)=>Math.max(0,Math.round(c*(100-Math.max(0,Math.min(100,p||0)))/100));
const empty={id:"",guest:"",phone:"",email:"",checkIn:"",checkOut:"",adults:2,children:0,roomType:"",meal:"",addExcursions:false,excursionIds:[] as string[],transfer:"none",packageName:"",notes:""};

export default function TourOperatorBookingManager(){
 const [bookings,setBookings]=useState<any[]>([]),[catalog,setCatalog]=useState<any>(null),[edit,setEdit]=useState<any>(null),[message,setMessage]=useState(""),[busy,setBusy]=useState(false);
 async function refresh(){
  try{
   const [m,c]=await Promise.all([fetch("/api/tour-operator-portal/manage",{cache:"no-store"}),fetch("/api/tour-operator-portal/catalog",{cache:"no-store"})]);
   if(!m.ok||!c.ok)return;
   const md=await m.json(),cd=await c.json();setBookings(md.bookings||[]);setCatalog(cd);
  }catch{}
 }
 useEffect(()=>{void refresh();const timer=setInterval(refresh,3000);return()=>clearInterval(timer)},[]);
 const form=edit||empty,pax=Number(form.adults||0)+Number(form.children||0),nights=form.checkIn&&form.checkOut?Math.max(0,(Date.parse(form.checkOut)-Date.parse(form.checkIn))/86400000):0;
 const rates=catalog?.roomRates||{},planRates=rates[form.meal]||[],roomPublic=nights*(Number(planRates[Math.max(0,Math.min(2,pax-1))])||0),roomNet=discount(roomPublic,catalog?.operator?.roomDiscountPercent||0);
 const chosen=(catalog?.excursions||[]).filter((x:any)=>form.excursionIds?.includes(x.id));
 const excPublic=chosen.reduce((s:number,x:any)=>s+x.cents*(x.pricingUnit==="couple"?Math.ceil(pax/2):pax),0),excNet=discount(excPublic,catalog?.operator?.excursionDiscountPercent||0);
 const legs=form.transfer==="return"?2:form.transfer==="arrival"?1:0,transferPublic=(catalog?.airportTransferCents||3000)*pax*legs,transferNet=discount(transferPublic,catalog?.operator?.transferDiscountPercent||0),total=roomNet+excNet+transferNet;
 if(!catalog)return null;
 function startEdit(b:any){setEdit({...empty,...b,addExcursions:(b.excursionIds||[]).length>0,excursionIds:[...(b.excursionIds||[])]});setMessage("");setTimeout(()=>document.querySelector(".to-manage-editor")?.scrollIntoView({behavior:"smooth",block:"start"}),50)}
 async function save(e:React.FormEvent){e.preventDefault();if(!edit||busy)return;setBusy(true);setMessage("");try{const r=await fetch("/api/tour-operator-portal/manage",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({action:"modify",...edit})}),d=await r.json();if(!r.ok)throw Error(d.error);if(Array.isArray(d.bookings))setBookings(d.bookings);setMessage("Booking updated and saved. New total: "+money(d.totalCents));setEdit(null);await refresh()}catch(e){setMessage((e as Error).message)}finally{setBusy(false)}}
 async function cancel(b:any){if(busy||!window.confirm("Cancel booking "+b.id+" for "+b.guest+"?"))return;setBusy(true);setMessage("");try{const r=await fetch("/api/tour-operator-portal/manage",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({action:"cancel",id:b.id})}),d=await r.json();if(!r.ok)throw Error(d.error);setMessage("Booking "+b.id+" cancelled.");if(edit?.id===b.id)setEdit(null);await refresh()}catch(e){setMessage((e as Error).message)}finally{setBusy(false)}}
 return <section className="to-booking-manager">
  <div className="to-manager-head"><div><small>TOUR OPERATOR PORTAL</small><h2>My bookings</h2><p>Modify or cancel a booking before the guest checks in.</p></div></div>
  {message&&<p className="to-manager-message">{message}</p>}
  <div className="to-manager-list">{!bookings.length?<p>No bookings yet.</p>:bookings.map((b:any)=><article key={b.id}>
   <div><b>{b.guest}</b><small>{b.id} · {b.checkIn} → {b.checkOut} · {b.meal}</small>{b.packageName&&<small>{b.packageName}</small>}</div>
   <div className="to-manager-side"><strong>{money(b.estimate)}</strong><span>{b.stayStatus||b.status}{b.room?" · Room "+b.room:""}</span>{String(b.stayStatus||b.status)==="Confirmed"&&<BookingConfirmationButton booking={b}/>} {b.canManage&&<div className="to-manager-actions"><button type="button" onClick={()=>startEdit(b)}>Modify</button><button type="button" className="danger" onClick={()=>cancel(b)}>Cancel</button></div>}</div>
  </article>)}</div>
  {edit&&<form className="to-manage-editor" onSubmit={save}>
   <div className="to-editor-head"><div><small>MODIFY BOOKING</small><h3>{edit.id}</h3></div><button type="button" onClick={()=>setEdit(null)}>Close</button></div>
   <div className="to-editor-grid"><label>Guest name<input required value={edit.guest} onChange={e=>setEdit({...edit,guest:e.target.value})}/></label><label>WhatsApp<input required value={edit.phone} onChange={e=>setEdit({...edit,phone:e.target.value})}/></label><label>Email<input required type="email" value={edit.email} onChange={e=>setEdit({...edit,email:e.target.value})}/></label><label>Package name<input value={edit.packageName} onChange={e=>setEdit({...edit,packageName:e.target.value})}/></label></div>
   <div className="to-editor-grid"><label>Check-in<input required type="date" min={catalog.today} value={edit.checkIn} onChange={e=>setEdit({...edit,checkIn:e.target.value})}/></label><label>Check-out<input required type="date" min={edit.checkIn||catalog.today} value={edit.checkOut} onChange={e=>setEdit({...edit,checkOut:e.target.value})}/></label><label>Adults<select value={edit.adults} onChange={e=>setEdit({...edit,adults:Number(e.target.value)})}>{[1,2,3].map(n=><option key={n}>{n}</option>)}</select></label><label>Children<select value={edit.children} onChange={e=>setEdit({...edit,children:Number(e.target.value)})}>{[0,1,2].map(n=><option key={n}>{n}</option>)}</select></label></div>
   <section><h4>Room type</h4><div className="to-editor-choices">{(catalog.roomTypes||[]).map((x:string)=><button type="button" key={x} className={edit.roomType===x?"active":""} onClick={()=>setEdit({...edit,roomType:x})}>{x}</button>)}</div></section>
   <section><h4>Meal plan</h4><div className="to-editor-choices">{(catalog.plans||[]).map((x:string)=><button type="button" key={x} className={edit.meal===x?"active":""} onClick={()=>setEdit({...edit,meal:x})}>{x}</button>)}</div></section>
   <section><h4>Excursions</h4><div className="to-editor-excursions">{(catalog.excursions||[]).map((x:any)=>{const on=edit.excursionIds.includes(x.id);return <button type="button" key={x.id} className={on?"active":""} onClick={()=>setEdit({...edit,excursionIds:on?edit.excursionIds.filter((id:string)=>id!==x.id):[...edit.excursionIds,x.id]})}><span>{on?"✓ ":""}{x.name}</span><b>{money(x.cents)}</b></button>})}</div></section>
   <section><h4>Airport transfer</h4><div className="to-editor-choices">{[["none","No transfer"],["arrival","Arrival only"],["return","Return transfer"]].map(([v,l])=><button type="button" key={v} className={edit.transfer===v?"active":""} onClick={()=>setEdit({...edit,transfer:v})}>{l}</button>)}</div></section>
   <label>Notes<textarea rows={3} value={edit.notes} onChange={e=>setEdit({...edit,notes:e.target.value})}/></label>
   <aside className="to-editor-total"><span>Updated total payable to Nirili Villa</span><strong>{money(total)}</strong></aside>
   <button className="to-editor-save" disabled={busy||!edit.roomType||!edit.meal||pax<1||pax>3}>{busy?"Saving…":"Save booking changes"}</button>
  </form>}
 </section>;
}
