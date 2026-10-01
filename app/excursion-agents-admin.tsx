"use client";
import {useCallback,useEffect,useState} from "react";
import {CheckCircle2,Handshake,Pencil,Plus,Printer,RefreshCw,XCircle} from "lucide-react";
import {startLiveRefresh,REFRESH_INTERVALS} from "../lib/live-refresh";
import {SITES} from "../lib/public-sites";
import {UiText,UiField} from "./ui-language";
import "./water-sports-admin.css";
import "./excursion-agents-admin.css";

type Tab="Partners"|"Monthly statement"|"Add partner";
const money=(cents:number)=>"$"+(Math.max(0,Number(cents)||0)/100).toFixed(2);
const emptyPartner={name:"",contactName:"",phone:"",email:"",pickup:"",discountPercent:10,autoConfirm:true,username:"",password:""};
const monthLabel=(m:string)=>/^\d{4}-\d{2}$/.test(m)?new Date(m+"-01T00:00:00Z").toLocaleDateString("en-GB",{month:"long",year:"numeric",timeZone:"UTC"}):m;

export default function ExcursionAgentsAdmin(){
 const [tab,setTab]=useState<Tab>("Partners"),[month,setMonth]=useState("");
 const [data,setData]=useState<any>(null),[message,setMessage]=useState(""),[busy,setBusy]=useState("");
 const [draft,setDraft]=useState<any>(emptyPartner),[editing,setEditing]=useState<any>(null);
 const load=useCallback(async(background=false)=>{
  try{const r=await fetch("/api/excursion-agents"+(month?"?month="+month:""),{cache:"no-store"}),d:any=await r.json();if(!r.ok)throw Error(d.error||"Could not load partners.");setData(d);if(!month)setMonth(d.month);if(!background)setMessage("");}
  catch(e){setMessage((e as Error).message)}
 },[month]);
 useEffect(()=>{void load();return startLiveRefresh(()=>load(true),REFRESH_INTERVALS.live)},[load]);

 async function send(method:string,body:any,success:string){
  if(busy)return false;setBusy(method+(body.id||body.ref||""));setMessage("");
  try{const r=await fetch("/api/excursion-agents",{method,headers:{"Content-Type":"application/json"},body:JSON.stringify(body)}),d:any=await r.json();if(!r.ok)throw Error(d.error||"Could not save.");setMessage(success);await load(true);return true;}
  catch(e){setMessage((e as Error).message);return false}finally{setBusy("")}
 }
 async function create(e:React.FormEvent){
  e.preventDefault();
  if(await send("POST",{...draft,discountPercent:Number(draft.discountPercent)},draft.name+" can now sign in at "+SITES.agents.replace("https://","")+" with username "+draft.username+".")){setDraft(emptyPartner);setTab("Partners");}
 }
 async function saveEdit(e:React.FormEvent){
  e.preventDefault();
  if(await send("PATCH",{...editing,discountPercent:Number(editing.discountPercent)},editing.name+" saved."+(editing.password?" The new password signs them out of other devices.":"")))setEditing(null);
 }
 function resolve(ref:string,approve:boolean,agentName:string){
  if(approve&&!window.confirm("Cancel booking "+ref+" for "+agentName+"? Seats are released and the agent sees it as cancelled."))return;
  void send("PATCH",{action:"resolve-cancel",ref,approve},approve?ref+" cancelled.":"Cancellation request for "+ref+" declined; the booking stays confirmed.");
 }

 const agents:any[]=data?.agents||[];
 const requests=agents.flatMap(a=>(a.bookings||[]).filter((b:any)=>b.cancelRequested).map((b:any)=>({...b,agentName:a.name})));
 const tabs:Tab[]=data?.canEdit?["Partners","Monthly statement","Add partner"]:["Partners","Monthly statement"];
 const totals=agents.reduce((t,a)=>({owed:t.owed+(a.statement?.owedCents||0),paid:t.paid+(a.statement?.paidCents||0),balance:t.balance+(a.statement?.balanceCents||0)}),{owed:0,paid:0,balance:0});

 return <section className="ws-admin ag-admin">
  <header className="ws-title"><span className="ws-title-icon"><Handshake/></span><div><h1><UiText>Partner agents</UiText></h1><p><UiText>Guest houses that send their guests&rsquo; excursions to Nirili through the Agent Portal. Agents collect from their guests and pay Nirili the partner rate each month.</UiText> <a href={SITES.agents} target="_blank" rel="noreferrer">{SITES.agents.replace("https://","")}</a></p></div><button type="button" onClick={()=>load()} aria-label="Refresh"><RefreshCw/></button></header>
  <UiField as="nav" className="ws-tabs" aria-label="Partner agents">{tabs.map(t=><button key={t} className={tab===t?"active":""} onClick={()=>setTab(t)}><UiText>{t}</UiText>{t==="Partners"&&requests.length>0&&<b>{requests.length}</b>}</button>)}</UiField>
  {message&&<p className="ws-message" role="status"><UiText>{message}</UiText></p>}
  {!data?<p><UiText>Loading partners…</UiText></p>:tab==="Partners"?<>
   {requests.length>0&&<section className="ag-requests"><h2><UiText>Cancellation requests</UiText></h2>{requests.map(b=><article key={b.ref}>
    <div><strong>{b.agentName} · {b.excursion}</strong><small>{b.ref} · {b.date}{b.time?" "+b.time:""} · {b.guests} <UiText>guests</UiText> · {b.leadGuest}</small>{b.cancelRequest?.reason&&<small><UiText>Reason:</UiText> {b.cancelRequest.reason}</small>}{b.paidCents>0&&<small><UiText>Already paid:</UiText> {money(b.paidCents)}</small>}</div>
    <div className="ws-actions"><button className="ws-danger" disabled={!!busy} onClick={()=>resolve(b.ref,true,b.agentName)}><XCircle/> <UiText>Cancel booking</UiText></button><button disabled={!!busy} onClick={()=>resolve(b.ref,false,b.agentName)}><CheckCircle2/> <UiText>Keep booking</UiText></button></div>
   </article>)}</section>}
   {!agents.length?<p className="ws-empty"><UiText>No partners yet.</UiText> {data.canEdit&&<button type="button" onClick={()=>setTab("Add partner")}><UiText>Add the first guest house</UiText></button>}</p>:<div className="ws-list">{agents.map(a=>editing?.id===a.id?<form key={a.id} className="ws-booking ag-edit" onSubmit={saveEdit}>
    <PartnerFields value={editing} onChange={setEditing}/>
    <label><span><UiText>New password (leave empty to keep)</UiText></span><input type="password" autoComplete="new-password" maxLength={128} value={editing.password||""} onChange={e=>setEditing({...editing,password:e.target.value})}/></label>
    <label className="ws-check"><input type="checkbox" checked={editing.active} onChange={e=>setEditing({...editing,active:e.target.checked})}/> <UiText>Account active (untick to pause sign-in)</UiText></label>
    <div className="ws-actions"><button className="primary" disabled={!!busy}><UiText>Save</UiText></button><button type="button" onClick={()=>setEditing(null)}><UiText>Cancel</UiText></button></div>
   </form>:<article key={a.id} className={"ws-booking "+(a.active?"is-confirmed":"is-cancelled")}>
    <header><div><small>{a.id} · <UiText>Username</UiText> {a.username}</small><h3>{a.name}</h3></div><span className={"ws-status "+(a.active?"is-confirmed":"")}><UiText>{a.active?"Active":"Paused"}</UiText></span></header>
    <dl>
     <div><dt><UiText>Contact</UiText></dt><dd>{a.contactName||"—"}{a.phone&&<><br/><a href={"https://wa.me/"+String(a.phone).replace(/\D/g,"")} target="_blank" rel="noreferrer">{a.phone}</a></>}</dd></div>
     <div><dt><UiText>Pickup point</UiText></dt><dd>{a.pickup}</dd></div>
     <div><dt><UiText>Partner rate</UiText></dt><dd>{a.discountPercent}% <UiText>off public prices</UiText></dd></div>
     <div><dt><UiText>Confirmation</UiText></dt><dd><UiText>{a.autoConfirm?"Instant when seats are free":"Staff approve every booking"}</UiText></dd></div>
     <div><dt>{monthLabel(data.month)}</dt><dd>{a.statement?.bookings||0} <UiText>bookings</UiText> · {a.statement?.guests||0} <UiText>guests</UiText></dd></div>
     <div><dt><UiText>Owed / still to settle</UiText></dt><dd>{money(a.statement?.owedCents)} / {money(a.statement?.balanceCents)}</dd></div>
    </dl>
    {a.statement?.pending>0&&<p className="ws-notes">{a.statement.pending} <UiText>trip(s) waiting for staff confirmation in Excursions.</UiText></p>}
    {data.canEdit&&<div className="ws-actions"><button disabled={!!busy} onClick={()=>setEditing({...a,password:""})}><Pencil/> <UiText>Edit</UiText></button><button disabled={!!busy} onClick={()=>void send("PATCH",{id:a.id,revision:a.revision,active:!a.active},a.name+(a.active?" paused. They can no longer sign in.":" reactivated."))}><UiText>{a.active?"Pause account":"Reactivate"}</UiText></button></div>}
   </article>)}</div>}
  </>:tab==="Monthly statement"?<div className="ag-statement">
   <div className="ws-actions"><label><span><UiText>Month</UiText></span><input type="month" value={month} onChange={e=>setMonth(e.target.value)}/></label><button type="button" onClick={()=>window.print()}><Printer/> <UiText>Print</UiText></button></div>
   <p className="ws-empty"><UiText>Confirmed trips in the month at each partner&rsquo;s rate. Record payments from a partner on the booking in Excursions › Confirmed excursion bookings.</UiText></p>
   <div className="ag-table-wrap"><table className="ag-table">
    <thead><tr><th><UiText>Partner</UiText></th><th><UiText>Bookings</UiText></th><th><UiText>Guests</UiText></th><th><UiText>Public value</UiText></th><th><UiText>Owed to Nirili</UiText></th><th><UiText>Paid</UiText></th><th><UiText>Balance</UiText></th></tr></thead>
    <tbody>{agents.map(a=><tr key={a.id}><td>{a.name}<small>{a.discountPercent}%</small></td><td>{a.statement?.bookings||0}</td><td>{a.statement?.guests||0}</td><td>{money(a.statement?.publicCents)}</td><td>{money(a.statement?.owedCents)}</td><td>{money(a.statement?.paidCents)}</td><td><strong>{money(a.statement?.balanceCents)}</strong></td></tr>)}</tbody>
    <tfoot><tr><td><UiText>Total</UiText></td><td colSpan={3}></td><td>{money(totals.owed)}</td><td>{money(totals.paid)}</td><td><strong>{money(totals.balance)}</strong></td></tr></tfoot>
   </table></div>
   {agents.filter(a=>(a.bookings||[]).some((b:any)=>b.date.startsWith(month)&&b.status==="Confirmed")).map(a=><details key={a.id} className="ws-history ag-detail"><summary>{a.name} · <UiText>trips</UiText></summary><table className="ag-table">
    <thead><tr><th><UiText>Date</UiText></th><th><UiText>Reference</UiText></th><th><UiText>Excursion</UiText></th><th><UiText>Lead guest</UiText></th><th><UiText>Guests</UiText></th><th><UiText>Owed</UiText></th><th><UiText>Paid</UiText></th></tr></thead>
    <tbody>{a.bookings.filter((b:any)=>b.date.startsWith(month)&&b.status==="Confirmed").sort((x:any,y:any)=>x.date.localeCompare(y.date)).map((b:any)=><tr key={b.ref}><td>{b.date}</td><td>{b.ref}{b.agentReference&&<small>{b.agentReference}</small>}</td><td>{b.excursion}</td><td>{b.leadGuest}</td><td>{b.guests}</td><td>{money(b.netCents)}</td><td>{money(b.paidCents)}</td></tr>)}</tbody>
   </table></details>)}
  </div>:<form className="ws-form" onSubmit={create}>
   <p className="ws-empty"><UiText>Create one login per guest house. Share the username and password with the guest house privately; they sign in at</UiText> {SITES.agents.replace("https://","")}.</p>
   <PartnerFields value={draft} onChange={setDraft}/>
   <div className="ws-grid"><label><span><UiText>Username</UiText></span><input required minLength={3} maxLength={40} pattern="[a-z0-9._\-]+" autoCapitalize="none" value={draft.username} onChange={e=>setDraft({...draft,username:e.target.value.toLowerCase()})} placeholder="e.g. islandbreeze"/></label><label><span><UiText>Password (8+ characters)</UiText></span><input required type="password" autoComplete="new-password" minLength={8} maxLength={128} value={draft.password} onChange={e=>setDraft({...draft,password:e.target.value})}/></label></div>
   <button className="primary" disabled={!!busy}><Plus/> <UiText>{busy?"Creating…":"Create partner"}</UiText></button>
  </form>}
 </section>;
}

function PartnerFields({value,onChange}:{value:any;onChange:(v:any)=>void}){
 const set=(patch:any)=>onChange({...value,...patch});
 return <>
  <div className="ws-grid"><label><span><UiText>Guest house name</UiText></span><input required maxLength={100} value={value.name} onChange={e=>set({name:e.target.value})}/></label><label><span><UiText>Contact person</UiText></span><input maxLength={100} value={value.contactName} onChange={e=>set({contactName:e.target.value})}/></label></div>
  <div className="ws-grid"><label><span><UiText>WhatsApp (with country code)</UiText></span><input maxLength={30} value={value.phone} onChange={e=>set({phone:e.target.value})} placeholder="+960 7XX XXXX"/></label><label><span><UiText>Email</UiText></span><input type="email" maxLength={254} value={value.email} onChange={e=>set({email:e.target.value})}/></label></div>
  <div className="ws-grid"><label><span><UiText>Pickup point</UiText></span><input maxLength={150} value={value.pickup} onChange={e=>set({pickup:e.target.value})} placeholder="Defaults to the guest house name"/></label><label><span><UiText>Partner rate (% off public price)</UiText></span><input required type="number" min={0} max={50} step="0.5" value={value.discountPercent} onChange={e=>set({discountPercent:e.target.value})}/></label></div>
  <label className="ws-check"><input type="checkbox" checked={value.autoConfirm} onChange={e=>set({autoConfirm:e.target.checked})}/> <UiText>Confirm instantly when a trip has free seats (otherwise staff approve each booking)</UiText></label>
 </>;
}
