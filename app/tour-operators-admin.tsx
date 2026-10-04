"use client";
import {useCallback,useEffect,useState} from "react";
import {BriefcaseBusiness,Pencil,Plus,RefreshCw,Trash2} from "lucide-react";
import {SITES} from "../lib/public-sites";
import "./water-sports-admin.css";
import "./excursion-agents-admin.css";

const empty={name:"",contactName:"",phone:"",email:"",roomDiscountPercent:10,excursionDiscountPercent:10,transferDiscountPercent:10,username:"",password:"",active:true};

export default function TourOperatorsAdmin(){
 const [data,setData]=useState<any>(null),[draft,setDraft]=useState<any>(empty),[editing,setEditing]=useState<any>(null),[message,setMessage]=useState(""),[busy,setBusy]=useState(false);
 const load=useCallback(async()=>{try{const r=await fetch("/api/tour-operators",{cache:"no-store"}),d=await r.json();if(!r.ok)throw Error(d.error);setData(d);}catch(e){setMessage((e as Error).message)}},[]);
 useEffect(()=>{void load()},[load]);
 async function send(method:string,body:any,ok:string){if(busy)return false;setBusy(true);setMessage("");try{const r=await fetch("/api/tour-operators",{method,headers:{"Content-Type":"application/json"},body:JSON.stringify(body)}),d=await r.json();if(!r.ok)throw Error(d.error);setMessage(ok);await load();return true}catch(e){setMessage((e as Error).message);return false}finally{setBusy(false)}}
 async function remove(operator:any){if(busy)return;const ok=window.confirm("Delete tour operator login "+operator.name+" ("+operator.username+")?\n\nThis removes the login immediately and signs out active sessions. Existing bookings remain in the system.");if(!ok)return;setBusy(true);setMessage("");try{const r=await fetch("/api/tour-operators",{method:"DELETE",headers:{"Content-Type":"application/json"},body:JSON.stringify({id:operator.id})}),d=await r.json();if(!r.ok)throw Error(d.error);if(editing?.id===operator.id)setEditing(null);setMessage(operator.name+" login deleted.");await load()}catch(e){setMessage((e as Error).message)}finally{setBusy(false)}}
 const items=data?.operators||[];
 return <section className="ws-admin ag-admin">
  <header className="ws-title"><span className="ws-title-icon"><BriefcaseBusiness/></span><div><h1>Tour operators</h1><p>Create tour operator logins for room, excursion and airport-transfer bookings. Portal: <a href={SITES.tourOperator} target="_blank" rel="noreferrer"><b>{SITES.tourOperator.replace("https://","")}</b></a></p></div><button onClick={load}><RefreshCw/></button></header>
  {message&&<p className="ws-message">{message}</p>}
  <form className="ws-form" onSubmit={async e=>{e.preventDefault();if(await send("POST",{...draft,roomDiscountPercent:Number(draft.roomDiscountPercent),excursionDiscountPercent:Number(draft.excursionDiscountPercent),transferDiscountPercent:Number(draft.transferDiscountPercent)},draft.name+" login created."))setDraft(empty)}}>
   <h2>Create tour operator login</h2><Fields value={draft} onChange={setDraft}/>
   <div className="ws-grid"><label><span>Username</span><input required minLength={3} maxLength={40} pattern="[a-z0-9._\-]+" value={draft.username} onChange={e=>setDraft({...draft,username:e.target.value.toLowerCase()})}/></label><label><span>Password (8+ characters)</span><input required type="password" minLength={8} maxLength={128} value={draft.password} onChange={e=>setDraft({...draft,password:e.target.value})}/></label></div>
   <button className="primary" disabled={busy}><Plus/> Create tour operator</button>
  </form>
  <div className="ws-list">{items.map((o:any)=>editing?.id===o.id?<form key={o.id} className="ws-booking ag-edit" onSubmit={async e=>{e.preventDefault();if(await send("PATCH",{...editing,roomDiscountPercent:Number(editing.roomDiscountPercent),excursionDiscountPercent:Number(editing.excursionDiscountPercent),transferDiscountPercent:Number(editing.transferDiscountPercent)},editing.name+" saved."))setEditing(null)}}>
   <Fields value={editing} onChange={setEditing}/><label><span>New password (leave blank to keep)</span><input type="password" minLength={8} maxLength={128} value={editing.password||""} onChange={e=>setEditing({...editing,password:e.target.value})}/></label><label className="ws-check"><input type="checkbox" checked={editing.active} onChange={e=>setEditing({...editing,active:e.target.checked})}/> Account active</label><div className="ws-actions"><button className="primary" disabled={busy}>Save</button><button type="button" onClick={()=>setEditing(null)}>Cancel</button></div>
  </form>:<article className={"ws-booking "+(o.active?"is-confirmed":"is-cancelled")} key={o.id}><header><div><small>{o.id} · {o.username}</small><h3>{o.name}</h3></div><span className="ws-status">{o.active?"Active":"Paused"}</span></header><dl>
   <div><dt>Room commission</dt><dd>{o.roomDiscountPercent}%</dd></div><div><dt>Excursion commission</dt><dd>{o.excursionDiscountPercent}%</dd></div><div><dt>Airport transfer commission</dt><dd>{o.transferDiscountPercent}%</dd></div><div><dt>Contact</dt><dd>{o.contactName||"—"}{o.phone?<><br/>{o.phone}</>:null}</dd></div>
  </dl><div className="ws-actions"><button onClick={()=>setEditing({...o,password:""})}><Pencil/> Edit</button><button type="button" className="danger" disabled={busy} onClick={()=>void remove(o)}><Trash2/> Delete</button></div></article>)}</div>
 </section>;
}
function Fields({value,onChange}:{value:any;onChange:(v:any)=>void}){const set=(p:any)=>onChange({...value,...p});return <>
 <div className="ws-grid"><label><span>Tour operator / company name</span><input required maxLength={120} value={value.name} onChange={e=>set({name:e.target.value})}/></label><label><span>Contact person</span><input maxLength={120} value={value.contactName} onChange={e=>set({contactName:e.target.value})}/></label></div>
 <div className="ws-grid"><label><span>WhatsApp</span><input maxLength={30} placeholder="+960..." value={value.phone} onChange={e=>set({phone:e.target.value})}/></label><label><span>Email</span><input type="email" maxLength={254} value={value.email} onChange={e=>set({email:e.target.value})}/></label></div>
 <div className="ws-grid"><label><span>Room commission %</span><input required type="number" min={0} max={100} step=".5" value={value.roomDiscountPercent} onChange={e=>set({roomDiscountPercent:e.target.value})}/></label><label><span>Excursion commission %</span><input required type="number" min={0} max={100} step=".5" value={value.excursionDiscountPercent} onChange={e=>set({excursionDiscountPercent:e.target.value})}/></label><label><span>Airport transfer commission %</span><input required type="number" min={0} max={100} step=".5" value={value.transferDiscountPercent} onChange={e=>set({transferDiscountPercent:e.target.value})}/></label></div>
 </>}