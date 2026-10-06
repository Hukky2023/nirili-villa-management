"use client";
import {useCallback,useEffect,useState} from "react";
import {CheckCircle2,Handshake,Pencil,Plus,Printer,RefreshCw,Trash2,XCircle} from "lucide-react";
import {startLiveRefresh,REFRESH_INTERVALS} from "../lib/live-refresh";
import {SITES} from "../lib/public-sites";
import "./water-sports-admin.css";
import "./excursion-agents-admin.css";

// Management → Partners: every outside business Nirili works with. Admin creates one login per
// business and ticks what it may do; the partner signs in at partners.nirilihotels.com. One
// monthly statement covers what each partner booked through Nirili and the trips it ran.
type Tab="Partners"|"Monthly statement"|"Add partner";
type Permission="excursions"|"transfers"|"rides"|"rooms"|"boats"|"buggies";
const PERMISSIONS:{id:Permission;label:string;hint:string}[]=[
 {id:"excursions",label:"Book excursions for guests",hint:"Guest houses: excursions at their partner rate"},
 {id:"transfers",label:"Book speedboat seats for guests",hint:"Guests pay the speedboat operator"},
 {id:"rides",label:"Book buggy rides for guests",hint:"Guests pay the driver"},
 {id:"rooms",label:"Book rooms and packages",hint:"Travel agencies: rooms, meal plans, excursions and airport transfer"},
 {id:"boats",label:"Run speedboat trips",hint:"Boats, seat maps, routes, crew, boarding and charters"},
 {id:"buggies",label:"Run buggy rides",hint:"Buggies and ride requests"},
];
const usd=(c:number)=>"$"+(Math.max(0,Number(c)||0)/100).toFixed(2);
const mvr=(c:number)=>"MVR "+(Math.max(0,Number(c)||0)/100).toFixed(2);
const host=SITES.partners.replace("https://","");
const empty={name:"",contactName:"",phone:"",email:"",pickup:"",permissions:[] as Permission[],excursionDiscountPercent:10,autoConfirm:true,roomDiscountPercent:10,transferDiscountPercent:10,commissionPercent:10,username:"",password:"",active:true};
const monthLabel=(m:string)=>/^\d{4}-\d{2}$/.test(m)?new Date(m+"-01T00:00:00Z").toLocaleDateString("en-GB",{month:"long",year:"numeric",timeZone:"UTC"}):m;
const numbers=(v:any)=>({...v,excursionDiscountPercent:Number(v.excursionDiscountPercent),roomDiscountPercent:Number(v.roomDiscountPercent),transferDiscountPercent:Number(v.transferDiscountPercent),commissionPercent:Number(v.commissionPercent)});
const has=(p:any,id:Permission)=>(p.permissions||[]).includes(id);

export default function PartnersAdmin(){
 const [tab,setTab]=useState<Tab>("Partners"),[month,setMonth]=useState("");
 const [data,setData]=useState<any>(null),[message,setMessage]=useState(""),[busy,setBusy]=useState(false);
 const [draft,setDraft]=useState<any>(empty),[editing,setEditing]=useState<any>(null);
 const load=useCallback(async(background=false)=>{
  try{const r=await fetch("/api/partners"+(month?"?month="+month:""),{cache:"no-store"}),d:any=await r.json();if(!r.ok)throw Error(d.error||"Could not load partners.");setData(d);if(!month)setMonth(d.month);if(!background)setMessage("");}
  catch(e){setMessage((e as Error).message)}
 },[month]);
 useEffect(()=>{void load();return startLiveRefresh(()=>load(true),REFRESH_INTERVALS.live)},[load]);
 async function send(method:string,body:any,success:string|((d:any)=>string)){
  if(busy)return false;setBusy(true);setMessage("");
  try{const r=await fetch("/api/partners",{method,headers:{"Content-Type":"application/json"},body:JSON.stringify(body)}),d:any=await r.json();if(!r.ok)throw Error(d.error||"Could not save.");setMessage(typeof success==="string"?success:success(d));await load(true);return true;}
  catch(e){setMessage((e as Error).message);return false}finally{setBusy(false)}
 }
 function resolve(ref:string,approve:boolean,name:string){
  if(approve&&!window.confirm("Cancel booking "+ref+" for "+name+"? Seats are released and the partner sees it as cancelled."))return;
  void send("PATCH",{action:"resolve-cancel",ref,approve},approve?ref+" cancelled.":"Cancellation request for "+ref+" declined; the booking stays confirmed.");
 }
 function remove(p:any){
  if(!window.confirm("Delete "+p.name+"’s login ("+p.username+")?\n\nThey are signed out at once and their departures and charters come off sale. Bookings and trips already made stay in the system."))return;
  void send("DELETE",{id:p.id},p.name+" deleted.");
 }
 function purge(){
  if(!window.confirm("Remove the old separate partner logins (partner agents, tour operators, travel operators and their crew) and the boats, routes, charter routes and buggies of those old operators?\n\nUse this once when moving to the combined partner accounts. Bookings already made stay as history."))return;
  void send("POST",{action:"purge-legacy"},(d:any)=>"Removed "+d.accounts+" old login records, "+d.transport+" old boats/routes and "+d.buggies+" old buggies.");
 }

 const partners:any[]=data?.partners||[];
 const requests=partners.flatMap(p=>(p.excursionBookings||[]).filter((b:any)=>b.cancelRequested).map((b:any)=>({...b,partnerName:p.name})));
 const tabs:Tab[]=data?.canEdit?["Partners","Monthly statement","Add partner"]:["Partners","Monthly statement"];
 return <section className="ws-admin ag-admin">
  <header className="ws-title"><span className="ws-title-icon"><Handshake/></span><div><h1>Partners</h1><p>Guest houses, travel agencies, speedboat operators and buggy owners. Each has one login at <a href={SITES.partners} target="_blank" rel="noreferrer">{host}</a> and sees only what you allow below.</p></div><button type="button" onClick={()=>load()} aria-label="Refresh"><RefreshCw/></button></header>
  <nav className="ws-tabs" aria-label="Partners">{tabs.map(t=><button key={t} className={tab===t?"active":""} onClick={()=>setTab(t)}>{t}{t==="Partners"&&requests.length>0&&<b>{requests.length}</b>}</button>)}</nav>
  {message&&<p className="ws-message" role="status">{message}</p>}
  {!data?<p>Loading partners…</p>:tab==="Partners"?<>
   {requests.length>0&&<section className="ag-requests"><h2>Excursion cancellation requests</h2>{requests.map(b=><article key={b.ref}>
    <div><strong>{b.partnerName} · {b.excursion}</strong><small>{b.ref} · {b.date}{b.time?" "+b.time:""} · {b.guests} guests · {b.leadGuest}</small>{b.cancelRequest?.reason&&<small>Reason: {b.cancelRequest.reason}</small>}{b.paidCents>0&&<small>Already paid: {usd(b.paidCents)}</small>}</div>
    <div className="ws-actions"><button className="ws-danger" disabled={busy} onClick={()=>resolve(b.ref,true,b.partnerName)}><XCircle/> Cancel booking</button><button disabled={busy} onClick={()=>resolve(b.ref,false,b.partnerName)}><CheckCircle2/> Keep booking</button></div>
   </article>)}</section>}
   {!partners.length?<p className="ws-empty">No partners yet. {data.canEdit&&<button type="button" onClick={()=>setTab("Add partner")}>Add the first partner</button>}</p>:<div className="ws-list">{partners.map(p=>editing?.id===p.id?<form key={p.id} className="ws-booking ag-edit" onSubmit={async e=>{e.preventDefault();if(await send("PATCH",numbers(editing),editing.name+" saved."+(editing.password?" The new password signs them out of other devices.":"")))setEditing(null);}}>
     <PartnerFields value={editing} onChange={setEditing}/>
     <label><span>New password (leave empty to keep)</span><input type="password" autoComplete="new-password" maxLength={128} value={editing.password||""} onChange={e=>setEditing({...editing,password:e.target.value})}/></label>
     <label className="ws-check"><input type="checkbox" checked={editing.active} onChange={e=>setEditing({...editing,active:e.target.checked})}/> Account active (untick to pause sign-in and take their trips off sale)</label>
     <div className="ws-actions"><button className="primary" disabled={busy}>Save</button><button type="button" onClick={()=>setEditing(null)}>Cancel</button></div>
    </form>:<PartnerCard key={p.id} p={p} month={data.month} canEdit={data.canEdit} busy={busy}
     onEdit={()=>setEditing({...p,password:""})} onToggle={()=>void send("PATCH",{id:p.id,revision:p.revision,active:!p.active},p.name+(p.active?" paused. They can no longer sign in and their trips are off sale.":" reactivated."))} onDelete={()=>remove(p)}/>)}</div>}
   {data.canEdit&&<details className="ws-history"><summary>Clean up old test logins</summary><p className="ws-empty">Before partners were combined, partner agents, tour operators and travel operators had separate logins. Those were test accounts and no longer work. Remove them, and the boats, routes, charter routes and buggies of the old operators, in one step.</p><button type="button" className="ws-danger" disabled={busy} onClick={purge}><Trash2/> Remove old test logins and their data</button></details>}
  </>:tab==="Monthly statement"?<Statement partners={partners} month={month} setMonth={setMonth}/>
  :<form className="ws-form" onSubmit={async e=>{e.preventDefault();if(await send("POST",numbers(draft),draft.name+" can now sign in at "+host+" with username "+draft.username+".")){setDraft(empty);setTab("Partners");}}}>
   <p className="ws-empty">Create one login per business and share the username and password privately. They sign in at {host}.</p>
   <PartnerFields value={draft} onChange={setDraft}/>
   <div className="ws-grid"><label><span>Username</span><input required minLength={3} maxLength={40} pattern="[a-z0-9._\-]+" autoCapitalize="none" value={draft.username} onChange={e=>setDraft({...draft,username:e.target.value.toLowerCase()})} placeholder="e.g. islandbreeze"/></label><label><span>Password (8+ characters)</span><input required type="password" autoComplete="new-password" minLength={8} maxLength={128} value={draft.password} onChange={e=>setDraft({...draft,password:e.target.value})}/></label></div>
   <button className="primary" disabled={busy||!draft.permissions.length}><Plus/> {busy?"Creating…":"Create partner"}</button>
  </form>}
 </section>;
}

function PartnerCard({p,month,canEdit,busy,onEdit,onToggle,onDelete}:{p:any;month:string;canEdit:boolean;busy:boolean;onEdit:()=>void;onToggle:()=>void;onDelete:()=>void}){
 const ex=p.excursionStatement,rooms=p.roomStatement,boat=p.boatStatement,buggy=p.buggyStatement;
 return <article className={"ws-booking "+(p.active?"is-confirmed":"is-cancelled")}>
  <header><div><small>{p.id} · Username {p.username}</small><h3>{p.name}</h3></div><span className={"ws-status "+(p.active?"is-confirmed":"")}>{p.active?"Active":"Paused"}</span></header>
  <dl>
   <div><dt>Can</dt><dd>{PERMISSIONS.filter(x=>has(p,x.id)).map(x=>x.label).join(" · ")||"Nothing yet"}</dd></div>
   <div><dt>Contact</dt><dd>{p.contactName||"—"}{p.phone&&<><br/><a href={"https://wa.me/"+String(p.phone).replace(/\D/g,"")} target="_blank" rel="noreferrer">{p.phone}</a></>}</dd></div>
   {(has(p,"excursions")||has(p,"rooms"))&&<div><dt>Discounts</dt><dd>{[has(p,"excursions")||has(p,"rooms")?"Excursions "+p.excursionDiscountPercent+"%":"",has(p,"rooms")?"Rooms "+p.roomDiscountPercent+"%":"",has(p,"rooms")?"Airport transfer "+p.transferDiscountPercent+"%":""].filter(Boolean).join(" · ")}{has(p,"excursions")&&<small style={{display:"block"}}>{p.autoConfirm?"Excursions confirm instantly when seats are free":"Staff approve every excursion booking"} · pickup {p.pickup}</small>}</dd></div>}
   {(has(p,"boats")||has(p,"buggies"))&&<div><dt>Nirili commission</dt><dd>{p.commissionPercent}% on trips</dd></div>}
   {has(p,"boats")&&<div><dt>Fleet</dt><dd>{p.boats.length} boat{p.boats.length===1?"":"s"} · {p.departures} route{p.departures===1?"":"s"} · {p.upcomingTickets} upcoming tickets{p.crew?.length?<small style={{display:"block"}}>Crew: {p.crew.map((c:any)=>c.name+" ("+c.role+(c.active?"":", paused")+")").join(", ")}</small>:null}</dd></div>}
   {has(p,"buggies")&&<div><dt>Buggies</dt><dd>{p.buggies.length} · {p.buggyOnline?"Online now":"Offline"}</dd></div>}
   {ex&&<div><dt>Excursions {monthLabel(month)}</dt><dd>{ex.bookings||0} bookings · owes {usd(ex.owedCents)} · balance {usd(ex.balanceCents)}</dd></div>}
   {rooms&&<div><dt>Rooms {monthLabel(month)}</dt><dd>{rooms.bookings} bookings · {usd(rooms.totalCents)}</dd></div>}
   {boat&&<div><dt>Speedboats {monthLabel(month)}</dt><dd>{boat.tickets} tickets · commission {mvr(boat.commissionMvr)}{boat.payableToOperatorUsd?" · Nirili owes "+usd(boat.payableToOperatorUsd):""}</dd></div>}
   {buggy&&<div><dt>Buggies {monthLabel(month)}</dt><dd>{buggy.rides} rides · commission {usd(buggy.commissionOwed)}</dd></div>}
  </dl>
  {ex?.pending>0&&<p className="ws-notes">{ex.pending} excursion trip(s) waiting for staff confirmation in Excursions.</p>}
  {canEdit&&<div className="ws-actions"><button disabled={busy} onClick={onEdit}><Pencil/> Edit</button><button disabled={busy} onClick={onToggle}>{p.active?"Pause account":"Reactivate"}</button><button className="ws-danger" disabled={busy} onClick={onDelete}><Trash2/> Delete</button></div>}
 </article>;
}

// One table: what each partner owes Nirili (excursions and rooms they sold, commission on trips
// they ran) and what Nirili owes them (room-billed trips Nirili collected for them).
function Statement({partners,month,setMonth}:{partners:any[];month:string;setMonth:(m:string)=>void}){
 return <div className="ag-statement">
  <div className="ws-actions"><label><span>Month</span><input type="month" value={month} onChange={e=>setMonth(e.target.value)}/></label><button type="button" onClick={()=>window.print()}><Printer/> Print</button></div>
  <p className="ws-empty">Excursions: confirmed trips at the partner rate (record payments on the booking in Excursions). Rooms: package bookings with check-in this month. Speedboats and buggies: guests pay the operator, who owes Nirili the commission; trips Nirili Villa guests charged to their room were collected by Nirili, which owes the operator the fare less commission. Only trips already travelled count.</p>
  <div className="ag-table-wrap"><table className="ag-table">
   <thead><tr><th>Partner</th><th>Excursions owed (balance)</th><th>Rooms &amp; packages</th><th>Speedboat commission</th><th>Buggy commission</th><th>Nirili owes partner</th></tr></thead>
   <tbody>{partners.map(p=>{const ex=p.excursionStatement,rooms=p.roomStatement,boat=p.boatStatement,buggy=p.buggyStatement;return <tr key={p.id}><td>{p.name}</td>
    <td>{ex?<>{usd(ex.owedCents)}<small>{usd(ex.balanceCents)} to settle</small></>:"—"}</td>
    <td>{rooms?<>{usd(rooms.totalCents)}<small>{rooms.bookings} bookings</small></>:"—"}</td>
    <td>{boat?<>{mvr(boat.commissionMvr)}<small>{boat.tickets} tickets{boat.charters?.length?" · "+boat.charters.length+" charters":""}</small></>:"—"}</td>
    <td>{buggy?<>{usd(buggy.commissionOwed)}<small>{buggy.rides} rides</small></>:"—"}</td>
    <td><strong>{usd((boat?.payableToOperatorUsd||0)+(buggy?.payableToOwner||0))}</strong></td></tr>;})}</tbody>
  </table></div>
  {partners.filter(p=>(p.excursionBookings||[]).some((b:any)=>b.date.startsWith(month)&&b.status==="Confirmed")).map(p=><details key={p.id} className="ws-history ag-detail"><summary>{p.name} · excursion trips</summary><table className="ag-table">
   <thead><tr><th>Date</th><th>Reference</th><th>Excursion</th><th>Lead guest</th><th>Guests</th><th>Owed</th><th>Paid</th></tr></thead>
   <tbody>{p.excursionBookings.filter((b:any)=>b.date.startsWith(month)&&b.status==="Confirmed").sort((x:any,y:any)=>x.date.localeCompare(y.date)).map((b:any)=><tr key={b.ref}><td>{b.date}</td><td>{b.ref}{b.agentReference&&<small>{b.agentReference}</small>}</td><td>{b.excursion}</td><td>{b.leadGuest}</td><td>{b.guests}</td><td>{usd(b.netCents)}</td><td>{usd(b.paidCents)}</td></tr>)}</tbody>
  </table></details>)}
 </div>;
}

function PartnerFields({value,onChange}:{value:any;onChange:(v:any)=>void}){
 const set=(patch:any)=>onChange({...value,...patch});
 const toggle=(id:Permission,on:boolean)=>set({permissions:on?[...new Set([...value.permissions,id])]:value.permissions.filter((x:string)=>x!==id)});
 const sells=has(value,"excursions")||has(value,"rooms"),runs=has(value,"boats")||has(value,"buggies");
 return <>
  <div className="ws-grid"><label><span>Business name</span><input required maxLength={120} value={value.name} onChange={e=>set({name:e.target.value})}/></label><label><span>Contact person</span><input maxLength={120} value={value.contactName} onChange={e=>set({contactName:e.target.value})}/></label></div>
  <div className="ws-grid"><label><span>WhatsApp (with country code{runs?", required":""})</span><input required={runs} maxLength={30} value={value.phone} onChange={e=>set({phone:e.target.value})} placeholder="+960 7XX XXXX"/></label><label><span>Email</span><input type="email" maxLength={254} value={value.email} onChange={e=>set({email:e.target.value})}/></label></div>
  <fieldset className="ws-fieldset"><legend>What this partner can do</legend>
   {PERMISSIONS.map(x=><label key={x.id} className="ws-check"><input type="checkbox" checked={has(value,x.id)} onChange={e=>toggle(x.id,e.target.checked)}/> <span><b>{x.label}</b> <small>{x.hint}</small></span></label>)}
  </fieldset>
  {(has(value,"excursions")||has(value,"transfers")||has(value,"rides"))&&<div className="ws-grid"><label><span>Guest pickup point</span><input maxLength={150} value={value.pickup} onChange={e=>set({pickup:e.target.value})} placeholder="Defaults to the business name"/></label></div>}
  {sells&&<div className="ws-grid">
   <label><span>Excursion discount (% off public price)</span><input required type="number" min={0} max={50} step="0.5" value={value.excursionDiscountPercent} onChange={e=>set({excursionDiscountPercent:e.target.value})}/></label>
   {has(value,"rooms")&&<label><span>Room discount %</span><input required type="number" min={0} max={100} step="0.5" value={value.roomDiscountPercent} onChange={e=>set({roomDiscountPercent:e.target.value})}/></label>}
   {has(value,"rooms")&&<label><span>Airport transfer discount %</span><input required type="number" min={0} max={100} step="0.5" value={value.transferDiscountPercent} onChange={e=>set({transferDiscountPercent:e.target.value})}/></label>}
  </div>}
  {has(value,"excursions")&&<label className="ws-check"><input type="checkbox" checked={value.autoConfirm} onChange={e=>set({autoConfirm:e.target.checked})}/> Confirm excursions instantly when a trip has free seats (otherwise staff approve each booking)</label>}
  {runs&&<div className="ws-grid"><label><span>Nirili commission on trips they run (%)</span><input required type="number" min={0} max={50} step="0.5" value={value.commissionPercent} onChange={e=>set({commissionPercent:e.target.value})}/></label></div>}
 </>;
}
