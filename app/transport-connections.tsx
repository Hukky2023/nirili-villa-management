'use client';
import {useEffect,useState} from 'react';
import {RefreshCw,ExternalLink,Ship,CalendarDays,Users,TicketCheck,Link2} from 'lucide-react';
import './transport-connections.css';
type Status={status:string;ledger:string;revision:number;checkedAt:string;totals:{boats:number;operators:number;schedules:number;upcomingJourneys:number;reservedSeats:number};apps:{id:string;name:string;role:string;url:string}[];note:string};
export default function TransportConnections(){
 const [data,setData]=useState<Status|null>(null),[busy,setBusy]=useState(false),[error,setError]=useState('');
 async function refresh(){setBusy(true);setError('');try{const r=await fetch('/api/transport/connections',{cache:'no-store',credentials:'same-origin'});const j=await r.json();if(!r.ok)throw Error(j.error||'Unable to read transport integration');setData(j)}catch(e){setError(e instanceof Error?e.message:'Unable to check connected apps')}finally{setBusy(false)}}
 useEffect(()=>{void refresh()},[]);
 return <section className="nt-connect">
  <div className="nt-connect-head"><div><span>ONE SHARED TRANSPORT SYSTEM</span><h2>Connected Apps</h2><p>Nirili Management, Nirili Connect and NTadmin read and update one transport ledger for boats, departure schedules, bookings and seat availability.</p></div><button type="button" onClick={()=>void refresh()} disabled={busy}><RefreshCw size={17}/>{busy?'Checking…':'Refresh'}</button></div>
  {error&&<p role="alert" className="nt-connect-error">{error}</p>}
  {data&&<><p className="nt-connect-status"><Link2 size={17}/> Management ledger connected · Revision {data.revision}</p>
    <div className="nt-connect-stats">{[
     ['Active boats',data.totals.boats,Ship],
     ['Operators',data.totals.operators,Users],
     ['Active schedules',data.totals.schedules,CalendarDays],
     ['Reserved future seats',data.totals.reservedSeats,TicketCheck]
    ].map(([name,value,Icon]:any)=><div key={name}><Icon size={20}/><strong>{value}</strong><small>{name}</small></div>)}</div>
    <div className="nt-connect-apps">{data.apps.map(a=><article key={a.id}><div><h3>{a.name}</h3><p>{a.role}</p></div><a href={a.url} target="_blank" rel="noopener noreferrer">Open app <ExternalLink size={16}/></a></article>)}</div>
    <p className="nt-connect-note">Live source: {data.ledger}. Changes made in either connected app are reflected here after refresh. This screen does not confirm individual app uptime or successful ticket delivery.</p>
    <p className="nt-connect-note">Last checked: {new Intl.DateTimeFormat('en-GB',{timeZone:'Indian/Maldives',dateStyle:'medium',timeStyle:'short'}).format(new Date(data.checkedAt))}</p>
  </>}
  {!data&&!error&&<p>Checking the shared transport system…</p>}
 </section>;
}
