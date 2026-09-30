"use client";
import {useCallback,useEffect,useMemo,useState} from "react";
import {CheckCircle2,ClipboardCopy,Plus,RefreshCw,Send,Trash2,Waves,XCircle} from "lucide-react";
import {startLiveRefresh,REFRESH_INTERVALS} from "../lib/live-refresh";
import {UiText,UiField,UiOption} from "./ui-language";
import TimeField24 from "./time-field-24";
import "./water-sports-admin.css";

type Tab="Bookings"|"New booking"|"Activities & partner";
type Filter="Open"|"New"|"Forwarded"|"Confirmed"|"Completed"|"Cancelled"|"All";
const OPEN=["New","Forwarded","Confirmed"];
const money=(cents:number)=>cents?"$"+(cents/100).toFixed(2):"Price on request";
const emptyBooking={activityId:"",date:"",time:"",participants:1,name:"",phone:"",email:"",hotel:"",room:"",notes:""};

export default function WaterSportsAdmin(){
 const [tab,setTab]=useState<Tab>("Bookings"),[filter,setFilter]=useState<Filter>("Open");
 const [data,setData]=useState<any>(null),[message,setMessage]=useState(""),[busy,setBusy]=useState("");
 const [settingsDraft,setSettingsDraft]=useState<any>(null),[newBooking,setNewBooking]=useState<any>(emptyBooking);
 const load=useCallback(async(background=false)=>{
  try{const r=await fetch("/api/water-sports",{cache:"no-store"}),d:any=await r.json();if(!r.ok)throw Error(d.error||"Could not load water sports.");setData(d);if(!background)setSettingsDraft(structuredClone(d.settings));if(!background)setMessage("");}
  catch(e){setMessage((e as Error).message)}
 },[]);
 useEffect(()=>{void load();return startLiveRefresh(()=>load(true),REFRESH_INTERVALS.live)},[load]);

 async function act(b:any,body:any,success:string){
  if(busy)return;setBusy(b.id+body.action);setMessage("");
  try{const r=await fetch("/api/water-sports",{method:"PATCH",headers:{"Content-Type":"application/json"},body:JSON.stringify({id:b.id,revision:b.revision,...body})}),d:any=await r.json();if(!r.ok)throw Error(d.error||"Could not update booking.");setMessage(success);await load(true);}
  catch(e){setMessage((e as Error).message)}finally{setBusy("")}
 }
 function forward(b:any){
  if(!data?.settings?.partner?.whatsapp){setMessage("Add the partner's WhatsApp number under Activities & partner first, or copy the message and send it yourself.");return;}
  window.open(b.partnerWhatsappLink,"_blank","noopener");
  void act(b,{action:"forward"},b.id+" marked as forwarded to "+(data.settings.partner.name||"the partner")+".");
 }
 async function copy(b:any){try{await navigator.clipboard.writeText(b.partnerMessage);setMessage("Booking details copied. Paste them into a message to the partner, then press Mark forwarded.");}catch{setMessage("Could not copy. Select the details and copy them manually.")}}
 function confirm(b:any){
  const ref=window.prompt("Partner's booking reference (optional):",b.partnerReference||"");if(ref===null)return;
  const time=window.prompt("Confirmed time (HH:mm, leave as is if unchanged):",b.time||"");if(time===null)return;
  void act(b,{action:"confirm",partnerReference:ref,time},b.id+" confirmed.");
 }
 function cancel(b:any){const reason=window.prompt("Reason for cancelling "+b.id+":","");if(reason===null)return;void act(b,{action:"cancel",reason},b.id+" cancelled. Let the guest"+(b.status!=="New"?" and the partner":"")+" know.");}
 function note(b:any){const text=window.prompt("Add a note to "+b.id+":","");if(!text)return;void act(b,{action:"note",note:text},"Note added.");}

 async function addBooking(e:React.FormEvent){
  e.preventDefault();if(busy)return;setBusy("new");setMessage("");
  try{const r=await fetch("/api/water-sports",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({...newBooking,participants:Number(newBooking.participants)})}),d:any=await r.json();if(!r.ok)throw Error(d.error||"Could not add booking.");setNewBooking(emptyBooking);setTab("Bookings");setFilter("Open");setMessage(d.booking.id+" added. Forward it to the partner when ready.");await load(true);}
  catch(err){setMessage((err as Error).message)}finally{setBusy("")}
 }
 async function saveSettings(){
  if(busy)return;setBusy("settings");setMessage("");
  try{const r=await fetch("/api/water-sports",{method:"PUT",headers:{"Content-Type":"application/json"},body:JSON.stringify({settings:settingsDraft,revision:data.settingsRevision})}),d:any=await r.json();if(!r.ok)throw Error(d.error||"Could not save settings.");setMessage("Water sports settings saved.");await load();}
  catch(e){setMessage((e as Error).message)}finally{setBusy("")}
 }
 const setActivity=(i:number,patch:any)=>setSettingsDraft((s:any)=>({...s,activities:s.activities.map((a:any,j:number)=>j===i?{...a,...patch}:a)}));

 const bookings:any[]=data?.bookings||[];
 const counts=useMemo(()=>Object.fromEntries(["New","Forwarded","Confirmed","Completed","Cancelled"].map(s=>[s,bookings.filter(b=>b.status===s).length])),[bookings]);
 const shown=bookings.filter(b=>filter==="All"||(filter==="Open"?OPEN.includes(b.status):b.status===filter));
 const activities:any[]=(data?.settings?.activities||[]).filter((a:any)=>a.active);
 const tabs:Tab[]=data?.canEditSettings?["Bookings","New booking","Activities & partner"]:["Bookings","New booking"];

 return <section className="ws-admin">
  <header className="ws-title"><span className="ws-title-icon"><Waves/></span><div><h1><UiText>Nirili Water Sports</UiText></h1><p><UiText>Bookings from the website and reception. Until Nirili runs its own water sports, forward each booking to the partner and record their confirmation here.</UiText></p></div><button type="button" onClick={()=>load()} aria-label="Refresh"><RefreshCw/></button></header>
  {data&&!data.settings.partner.whatsapp&&<p className="ws-warning"><UiText>No partner WhatsApp number is set yet.</UiText> {data.canEditSettings?<button type="button" onClick={()=>setTab("Activities & partner")}><UiText>Add partner details</UiText></button>:<UiText>Ask Admin to add the partner details.</UiText>}</p>}
  <UiField as="nav" className="ws-tabs" aria-label="Water sports">{tabs.map(t=><button key={t} className={tab===t?"active":""} onClick={()=>setTab(t)}><UiText>{t}</UiText>{t==="Bookings"&&counts.New>0&&<b>{counts.New}</b>}</button>)}</UiField>
  {message&&<p className="ws-message" role="status"><UiText>{message}</UiText></p>}
  {!data?<p><UiText>Loading water sports…</UiText></p>:tab==="Bookings"?<>
   <div className="ws-filters">{(["Open","New","Forwarded","Confirmed","Completed","Cancelled","All"] as Filter[]).map(f=><button key={f} className={filter===f?"active":""} onClick={()=>setFilter(f)}><UiText>{f}</UiText>{f!=="Open"&&f!=="All"&&<small>{counts[f]||0}</small>}</button>)}</div>
   {!shown.length?<p className="ws-empty"><UiText>No bookings here.</UiText></p>:<div className="ws-list">{shown.map(b=><article key={b.id} className={"ws-booking is-"+b.status.toLowerCase()}>
    <header><div><small>{b.id} · <UiText>{b.source}</UiText></small><h3><UiText>{b.activityName}</UiText></h3></div><span className={"ws-status is-"+b.status.toLowerCase()}><UiText>{b.status}</UiText></span></header>
    <dl>
     <div><dt><UiText>When</UiText></dt><dd>{b.date}{b.time?" · "+b.time:""}</dd></div>
     <div><dt><UiText>People</UiText></dt><dd>{b.participants}</dd></div>
     <div><dt><UiText>Guest</UiText></dt><dd>{b.name}</dd></div>
     <div><dt><UiText>WhatsApp</UiText></dt><dd><a href={"https://wa.me/"+String(b.phone).replace(/^\+/,"")} target="_blank" rel="noreferrer">{b.phone}</a></dd></div>
     <div><dt><UiText>Staying at</UiText></dt><dd>{b.hotel||"—"}{b.room?" · "+b.room:""}</dd></div>
     <div><dt><UiText>Quoted</UiText></dt><dd><UiText>{money(b.quotedCents)}</UiText></dd></div>
     {b.partnerName&&<div><dt><UiText>Partner</UiText></dt><dd>{b.partnerName}{b.partnerReference?" · Ref "+b.partnerReference:""}</dd></div>}
     {b.email&&<div><dt><UiText>Email</UiText></dt><dd>{b.email}</dd></div>}
    </dl>
    {b.notes&&<p className="ws-notes">{b.notes}</p>}
    {b.status==="Cancelled"&&b.cancelReason&&<p className="ws-notes"><UiText>Cancelled:</UiText> {b.cancelReason}</p>}
    <div className="ws-actions">
     {OPEN.includes(b.status)&&b.status!=="Confirmed"&&<button className="primary" disabled={!!busy} onClick={()=>forward(b)}><Send/> <UiText>{b.status==="Forwarded"?"Send to partner again":"Forward to partner"}</UiText></button>}
     {OPEN.includes(b.status)&&<button disabled={!!busy} onClick={()=>copy(b)}><ClipboardCopy/> <UiText>Copy details</UiText></button>}
     {b.status==="New"&&<button disabled={!!busy} onClick={()=>act(b,{action:"forward"},b.id+" marked as forwarded.")}><UiText>Mark forwarded</UiText></button>}
     {["New","Forwarded"].includes(b.status)&&<button disabled={!!busy} onClick={()=>confirm(b)}><CheckCircle2/> <UiText>Partner confirmed</UiText></button>}
     {b.status==="Confirmed"&&<button className="primary" disabled={!!busy} onClick={()=>act(b,{action:"complete"},b.id+" completed.")}><CheckCircle2/> <UiText>Mark completed</UiText></button>}
     {OPEN.includes(b.status)&&<button className="ws-danger" disabled={!!busy} onClick={()=>cancel(b)}><XCircle/> <UiText>Cancel</UiText></button>}
     <button disabled={!!busy} onClick={()=>note(b)}><UiText>Add note</UiText></button>
    </div>
    <details className="ws-history"><summary><UiText>History</UiText> ({(b.history||[]).length})</summary><ul>{(b.history||[]).slice().reverse().map((h:any,i:number)=><li key={i}><b><UiText>{h.action}</UiText></b>{h.detail?" · "+h.detail:""}<small>{new Date(h.at).toLocaleString("en-GB",{timeZone:"Indian/Maldives",hour12:false})} · {h.by}</small></li>)}</ul></details>
   </article>)}</div>}
  </>:tab==="New booking"?<form className="ws-form" onSubmit={addBooking}>
   <label><span><UiText>Activity</UiText></span><select required value={newBooking.activityId} onChange={e=>setNewBooking({...newBooking,activityId:e.target.value})}><UiOption value="">Choose activity</UiOption>{activities.map(a=><option key={a.id} value={a.id}>{a.name}</option>)}</select></label>
   <div className="ws-grid"><label><span><UiText>Date</UiText></span><input required type="date" min={data.today} value={newBooking.date} onChange={e=>setNewBooking({...newBooking,date:e.target.value})}/></label><label><span><UiText>Preferred time (optional)</UiText></span><TimeField24 value={newBooking.time} onChange={e=>setNewBooking({...newBooking,time:e.target.value})} aria-label="Preferred time"/></label><label><span><UiText>People</UiText></span><input required type="number" min={1} max={20} value={newBooking.participants} onChange={e=>setNewBooking({...newBooking,participants:e.target.value})}/></label></div>
   <div className="ws-grid"><label><span><UiText>Guest name</UiText></span><input required maxLength={100} value={newBooking.name} onChange={e=>setNewBooking({...newBooking,name:e.target.value})}/></label><label><span><UiText>WhatsApp (with country code)</UiText></span><input required maxLength={30} value={newBooking.phone} onChange={e=>setNewBooking({...newBooking,phone:e.target.value})} placeholder="+960…"/></label><label><span><UiText>Email (optional)</UiText></span><input type="email" maxLength={254} value={newBooking.email} onChange={e=>setNewBooking({...newBooking,email:e.target.value})}/></label></div>
   <div className="ws-grid"><label><span><UiText>Hotel / guesthouse</UiText></span><input maxLength={150} value={newBooking.hotel} onChange={e=>setNewBooking({...newBooking,hotel:e.target.value})} placeholder="Nirili Villa"/></label><label><span><UiText>Room (optional)</UiText></span><input maxLength={40} value={newBooking.room} onChange={e=>setNewBooking({...newBooking,room:e.target.value})}/></label></div>
   <label><span><UiText>Notes</UiText></span><textarea rows={3} maxLength={1000} value={newBooking.notes} onChange={e=>setNewBooking({...newBooking,notes:e.target.value})}/></label>
   <button className="primary" disabled={busy==="new"}><Plus/> <UiText>{busy==="new"?"Adding…":"Add booking"}</UiText></button>
  </form>:settingsDraft&&<div className="ws-settings">
   <section><h2><UiText>Partner company</UiText></h2><p><UiText>Bookings are forwarded here by WhatsApp until Nirili runs its own water sports.</UiText></p>
    <div className="ws-grid"><label><span><UiText>Company name</UiText></span><input maxLength={100} value={settingsDraft.partner.name} onChange={e=>setSettingsDraft({...settingsDraft,partner:{...settingsDraft.partner,name:e.target.value}})}/></label><label><span><UiText>WhatsApp (with country code)</UiText></span><input maxLength={30} value={settingsDraft.partner.whatsapp} onChange={e=>setSettingsDraft({...settingsDraft,partner:{...settingsDraft.partner,whatsapp:e.target.value}})} placeholder="+960…"/></label><label><span><UiText>Email (optional)</UiText></span><input type="email" maxLength={254} value={settingsDraft.partner.email} onChange={e=>setSettingsDraft({...settingsDraft,partner:{...settingsDraft.partner,email:e.target.value}})}/></label></div>
   </section>
   <section><h2><UiText>Activities</UiText></h2><p><UiText>Shown on watersports.nirilihotels.com. Leave the price at 0 to show &ldquo;confirmed when we book you in&rdquo;.</UiText></p>
    <div className="ws-activities">{settingsDraft.activities.map((a:any,i:number)=><article key={a.id+i} className={a.active?"":"is-off"}>
     <div className="ws-grid"><label><span><UiText>Name</UiText></span><input maxLength={80} value={a.name} onChange={e=>setActivity(i,{name:e.target.value})}/></label><label><span><UiText>Price (USD)</UiText></span><input type="number" min={0} step="0.01" value={(a.cents/100).toFixed(2)} onChange={e=>setActivity(i,{cents:Math.round(Number(e.target.value)*100)||0})}/></label><label><span><UiText>Priced per</UiText></span><select value={a.pricingUnit} onChange={e=>setActivity(i,{pricingUnit:e.target.value})}><UiOption value="person">Person</UiOption><UiOption value="ride">Ride / craft</UiOption></select></label><label><span><UiText>People per ride</UiText></span><input type="number" min={1} max={20} value={a.maxPeople} onChange={e=>setActivity(i,{maxPeople:Number(e.target.value)||1})}/></label><label><span><UiText>Minutes</UiText></span><input type="number" min={0} max={600} value={a.durationMinutes} onChange={e=>setActivity(i,{durationMinutes:Number(e.target.value)||0})}/></label></div>
     <label><span><UiText>Description</UiText></span><textarea rows={2} maxLength={400} value={a.detail} onChange={e=>setActivity(i,{detail:e.target.value})}/></label>
     <div className="ws-actions"><label className="ws-check"><input type="checkbox" checked={a.active} onChange={e=>setActivity(i,{active:e.target.checked})}/> <UiText>Show on website</UiText></label><button type="button" className="ws-danger" onClick={()=>setSettingsDraft({...settingsDraft,activities:settingsDraft.activities.filter((_:any,j:number)=>j!==i)})}><Trash2/> <UiText>Remove</UiText></button></div>
    </article>)}</div>
    <button type="button" onClick={()=>setSettingsDraft({...settingsDraft,activities:[...settingsDraft.activities,{id:"activity-"+crypto.randomUUID().slice(0,8),name:"",detail:"",durationMinutes:30,cents:0,pricingUnit:"person",maxPeople:1,active:true}]})}><Plus/> <UiText>Add activity</UiText></button>
   </section>
   <button className="primary" disabled={busy==="settings"} onClick={saveSettings}><UiText>{busy==="settings"?"Saving…":"Save settings"}</UiText></button>
  </div>}
 </section>;
}
