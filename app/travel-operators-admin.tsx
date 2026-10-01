"use client";
import {useCallback,useEffect,useState} from "react";
import {Anchor,Pencil,Plus,Printer,RefreshCw} from "lucide-react";
import {startLiveRefresh,REFRESH_INTERVALS} from "../lib/live-refresh";
import {SITES} from "../lib/public-sites";
import "./water-sports-admin.css";
import "./excursion-agents-admin.css";

// Nirili Travels marketplace: speedboat operators and buggy owners, their fleets, and the
// monthly commission statements. Operators manage their own departures, boats and rides at
// operators.nirilihotels.com.
type Tab="Operators"|"Monthly statement"|"Add operator";
const mvr=(c:number)=>"MVR "+(Math.max(0,Number(c)||0)/100).toFixed(2);
const usd=(c:number)=>"$"+(Math.max(0,Number(c)||0)/100).toFixed(2);
const empty={name:"",contactName:"",phone:"",email:"",services:["boat"],commissionPercent:10,username:"",password:""};
const host=SITES.operators.replace("https://","");

export default function TravelOperatorsAdmin(){
 const [tab,setTab]=useState<Tab>("Operators"),[month,setMonth]=useState("");
 const [data,setData]=useState<any>(null),[message,setMessage]=useState(""),[busy,setBusy]=useState(false);
 const [draft,setDraft]=useState<any>(empty),[editing,setEditing]=useState<any>(null);
 const load=useCallback(async(background=false)=>{
  try{const r=await fetch("/api/travel-operators"+(month?"?month="+month:""),{cache:"no-store"}),d:any=await r.json();if(!r.ok)throw Error(d.error||"Could not load operators.");setData(d);if(!month)setMonth(d.month);if(!background)setMessage("");}
  catch(e){setMessage((e as Error).message)}
 },[month]);
 useEffect(()=>{void load();return startLiveRefresh(()=>load(true),REFRESH_INTERVALS.live)},[load]);
 async function send(method:string,body:any,success:string){
  if(busy)return false;setBusy(true);setMessage("");
  try{const r=await fetch("/api/travel-operators",{method,headers:{"Content-Type":"application/json"},body:JSON.stringify(body)}),d:any=await r.json();if(!r.ok)throw Error(d.error||"Could not save.");setMessage(success);await load(true);return true;}
  catch(e){setMessage((e as Error).message);return false}finally{setBusy(false)}
 }
 const operators:any[]=data?.operators||[];
 const tabs:Tab[]=data?.canEdit?["Operators","Monthly statement","Add operator"]:["Operators","Monthly statement"];

 return <section className="ws-admin ag-admin">
  <header className="ws-title"><span className="ws-title-icon"><Anchor/></span><div><h1>Travel operators</h1><p>Independent speedboat operators and buggy owners who run Nirili Travels trips. Guests pay the operator; Nirili earns a commission. Room-billed transfers and rides for Nirili Villa guests are paid on to the operator. Operators work at <a href={SITES.operators} target="_blank" rel="noreferrer">{host}</a>.</p></div><button type="button" onClick={()=>load()} aria-label="Refresh"><RefreshCw/></button></header>
  <nav className="ws-tabs" aria-label="Travel operators">{tabs.map(t=><button key={t} className={tab===t?"active":""} onClick={()=>setTab(t)}>{t}</button>)}</nav>
  {message&&<p className="ws-message" role="status">{message}</p>}
  {!data?<p>Loading operators…</p>:tab==="Operators"?(!operators.length?<p className="ws-empty">No operators yet. {data.canEdit&&<button type="button" onClick={()=>setTab("Add operator")}>Add the first operator</button>}</p>:<div className="ws-list">{operators.map(o=>editing?.id===o.id?<form key={o.id} className="ws-booking ag-edit" onSubmit={async e=>{e.preventDefault();if(await send("PATCH",{...editing,commissionPercent:Number(editing.commissionPercent)},editing.name+" saved."+(editing.password?" The new password signs them out of other devices.":"")))setEditing(null);}}>
    <OperatorFields value={editing} onChange={setEditing}/>
    <label><span>New password (leave empty to keep)</span><input type="password" autoComplete="new-password" maxLength={128} value={editing.password||""} onChange={e=>setEditing({...editing,password:e.target.value})}/></label>
    <label className="ws-check"><input type="checkbox" checked={editing.active} onChange={e=>setEditing({...editing,active:e.target.checked})}/> Account active (untick to pause sign-in)</label>
    <div className="ws-actions"><button className="primary" disabled={busy}>Save</button><button type="button" onClick={()=>setEditing(null)}>Cancel</button></div>
   </form>:<article key={o.id} className={"ws-booking "+(o.active?"is-confirmed":"is-cancelled")}>
    <header><div><small>{o.id} · Username {o.username}</small><h3>{o.name}</h3></div><span className={"ws-status "+(o.active?"is-confirmed":"")}>{o.active?"Active":"Paused"}</span></header>
    <dl>
     <div><dt>Services</dt><dd>{o.services.map((s:string)=>s==="boat"?"Speedboat transfers":"Buggy rides").join(" · ")}</dd></div>
     <div><dt>Commission</dt><dd>{o.commissionPercent}%</dd></div>
     <div><dt>Contact</dt><dd>{o.contactName||"—"}<br/><a href={"https://wa.me/"+String(o.phone).replace(/\D/g,"")} target="_blank" rel="noreferrer">{o.phone}</a></dd></div>
     {o.services.includes("boat")&&<div><dt>Fleet</dt><dd>{o.boats.length} boat{o.boats.length===1?"":"s"} · {o.departures} departure{o.departures===1?"":"s"}{o.boats.length?<small style={{display:"block"}}>{o.boats.map((b:any)=>b.name+" ("+b.capacity+" seats)").join(", ")}</small>:null}</dd></div>}
     {o.services.includes("boat")&&<div><dt>Crew logins</dt><dd>{o.crew?.length?o.crew.map((c:any)=>c.name+" ("+c.role+(c.active?"":", paused")+")").join(", "):"None"}</dd></div>}
     {o.services.includes("buggy")&&<div><dt>Buggies</dt><dd>{o.buggies.length} · {o.buggyOnline?"Online now":"Offline"}{o.buggies.length?<small style={{display:"block"}}>{o.buggies.map((b:any)=>b.name+" · "+b.status).join(", ")}</small>:null}</dd></div>}
     {o.services.includes("boat")&&<div><dt>Upcoming tickets</dt><dd>{o.upcomingTickets||0}</dd></div>}
    </dl>
    {data.canEdit&&<div className="ws-actions"><button disabled={busy} onClick={()=>setEditing({...o,password:""})}><Pencil/> Edit</button><button disabled={busy} onClick={()=>void send("PATCH",{id:o.id,revision:o.revision,active:!o.active},o.name+(o.active?" paused. They can no longer sign in or take bookings.":" reactivated."))}>{o.active?"Pause account":"Reactivate"}</button></div>}
   </article>)}</div>)
  :tab==="Monthly statement"?<div className="ag-statement">
   <div className="ws-actions"><label><span>Month</span><input type="month" value={month} onChange={e=>setMonth(e.target.value)}/></label><button type="button" onClick={()=>window.print()}><Printer/> Print</button></div>
   <p className="ws-empty">Guest-paid fares are collected by the operator, who owes Nirili the commission. Room-billed fares for Nirili Villa guests are collected by Nirili, which owes the operator the fare less commission.</p>
   <div className="ag-table-wrap"><table className="ag-table">
    <thead><tr><th>Operator</th><th>Tickets / rides</th><th>Guest-paid fares</th><th>Commission owed to Nirili</th><th>Room-billed (Nirili collected)</th><th>Nirili owes operator</th></tr></thead>
    <tbody>{operators.map(o=>{const b=o.boatStatement,g=o.buggyStatement;return <tr key={o.id}><td>{o.name}<small>{o.commissionPercent}%</small></td>
     <td>{[b&&b.tickets+" tickets",g&&g.rides+" rides"].filter(Boolean).join(" · ")||"—"}</td>
     <td>{[b&&mvr(b.fareMvr),g&&usd(g.collectedByOwner)].filter(Boolean).join(" + ")||"—"}</td>
     <td><strong>{[b&&mvr(b.commissionMvr),g&&usd(g.commissionOwed)].filter(Boolean).join(" + ")||"—"}</strong></td>
     <td>{usd((b?.roomUsd||0)+(g?.collectedByNirili||0))}</td>
     <td><strong>{usd((b?.payableToOperatorUsd||0)+(g?.payableToOwner||0))}</strong></td></tr>;})}</tbody>
   </table></div>
  </div>
  :<form className="ws-form" onSubmit={async e=>{e.preventDefault();if(await send("POST",{...draft,commissionPercent:Number(draft.commissionPercent)},draft.name+" can now sign in at "+host+" with username "+draft.username+".")){setDraft(empty);setTab("Operators");}}}>
   <p className="ws-empty">Create one login per speedboat company or buggy owner and share it privately. They publish their own departures and fares, draw their boats' seat maps or add buggies, and board guests at {host}.</p>
   <OperatorFields value={draft} onChange={setDraft}/>
   <div className="ws-grid"><label><span>Username</span><input required minLength={3} maxLength={40} pattern="[a-z0-9._\-]+" autoCapitalize="none" value={draft.username} onChange={e=>setDraft({...draft,username:e.target.value.toLowerCase()})} placeholder="e.g. coralspeed"/></label><label><span>Password (8+ characters)</span><input required type="password" autoComplete="new-password" minLength={8} maxLength={128} value={draft.password} onChange={e=>setDraft({...draft,password:e.target.value})}/></label></div>
   <button className="primary" disabled={busy}><Plus/> {busy?"Creating…":"Create operator"}</button>
  </form>}
 </section>;
}

function OperatorFields({value,onChange}:{value:any;onChange:(v:any)=>void}){
 const set=(patch:any)=>onChange({...value,...patch});
 const toggle=(s:string,on:boolean)=>set({services:on?[...new Set([...value.services,s])]:value.services.filter((x:string)=>x!==s)});
 return <>
  <div className="ws-grid"><label><span>Company or owner name</span><input required maxLength={100} value={value.name} onChange={e=>set({name:e.target.value})}/></label><label><span>Contact person</span><input maxLength={100} value={value.contactName} onChange={e=>set({contactName:e.target.value})}/></label></div>
  <div className="ws-grid"><label><span>WhatsApp (with country code)</span><input required maxLength={30} value={value.phone} onChange={e=>set({phone:e.target.value})} placeholder="+960 7XX XXXX"/></label><label><span>Email</span><input type="email" maxLength={254} value={value.email} onChange={e=>set({email:e.target.value})}/></label></div>
  <div className="ws-grid"><label><span>Nirili commission (%)</span><input required type="number" min={0} max={50} step="0.5" value={value.commissionPercent} onChange={e=>set({commissionPercent:e.target.value})}/></label></div>
  <label className="ws-check"><input type="checkbox" checked={value.services.includes("boat")} onChange={e=>toggle("boat",e.target.checked)}/> Speedboat transfers</label>
  <label className="ws-check"><input type="checkbox" checked={value.services.includes("buggy")} onChange={e=>toggle("buggy",e.target.checked)}/> Buggy rides</label>
 </>;
}
