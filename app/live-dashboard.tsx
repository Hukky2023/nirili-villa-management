'use client';
import {useEffect,useRef,useState,type ReactNode} from 'react';
import {BedDouble,CalendarDays,CircleDollarSign,Download,House,Plane,RefreshCw,ShipWheel,ShoppingCart,Sparkles,Users,FileText} from 'lucide-react';
import {UiText} from './ui-language';
import type {DashboardData,DashboardTrip} from '../lib/dashboard-data';
import './live-dashboard.css';
import {startLiveRefresh,REFRESH_INTERVALS} from '../lib/live-refresh';
type Module='Bookings'|'Rooms'|'Guests'|'Transfers'|'Excursions'|'POS'|'Reports';
const money=(cents:number,currency='USD')=>new Intl.NumberFormat('en-US',{style:'currency',currency,maximumFractionDigits:2}).format(cents/100);
const dayLabel=(date:string)=>new Date(date+'T12:00:00+05:00').toLocaleDateString('en-GB',{timeZone:'Indian/Maldives',day:'2-digit',month:'short'});
function useDashboard(intervalMs:number=REFRESH_INTERVALS.standard){
 const [data,setData]=useState<DashboardData|null>(null),[error,setError]=useState(''),[busy,setBusy]=useState(false);
 const refresh=useRef<()=>void>(()=>{});
 useEffect(()=>{
  let disposed=false,running=false;let controller:AbortController|null=null;
  async function load(){
   if(disposed||running||document.hidden)return;
   running=true;controller=new AbortController();setBusy(true);
   const timeout=setTimeout(()=>controller?.abort(),12000);
   try{
    const response=await fetch('/api/dashboard',{cache:'no-store',credentials:'same-origin',signal:controller.signal});
    const result=await response.json();
    if(disposed)return;
    if(response.status===401||response.status===403)setData(null);
    if(!response.ok)throw Error(result.error||'Dashboard refresh failed.');
    if(!result.updatedAt||!result.stats||!result.occupancy)throw Error('The dashboard response was incomplete.');
    setData(result);setError('');
   }catch(e){if(!disposed)setError(e instanceof Error&&e.name!=='AbortError'?e.message:'The connection timed out. Retrying automatically.');}
   finally{clearTimeout(timeout);running=false;if(!disposed)setBusy(false);}
  }
  const update=()=>{void load();};
  refresh.current=update;update();
  const stopLive=startLiveRefresh(load,intervalMs);
  const offline=()=>setError('Offline — showing the last successful update.');
  window.addEventListener('offline',offline);
  return()=>{disposed=true;controller?.abort();stopLive();window.removeEventListener('offline',offline);refresh.current=()=>{};};
 },[intervalMs]);
 return {data,error,busy,intervalMs,refresh:()=>refresh.current()};
}
function LiveStatus({error,busy,refresh}:ReturnType<typeof useDashboard>){
 if(!error)return null;
 return <p className="nv-live-note" role="alert"><UiText>{error}</UiText> <button type="button" onClick={refresh} disabled={busy}><RefreshCw size={16}/><UiText>{busy?'Updating…':'Retry'}</UiText></button></p>;
}

function Weather(){
 const [weather,setWeather]=useState<any>(null),[failed,setFailed]=useState(false);
 useEffect(()=>{
  let disposed=false,running=false,last=0;let controller:AbortController|null=null;
  const load=async()=>{
   if(disposed||running||document.hidden)return;
   running=true;controller=new AbortController();const timeout=setTimeout(()=>controller?.abort(),12000);
   try{const response=await fetch('/api/excursion-weather',{cache:'no-store',signal:controller.signal});const data=await response.json();if(!response.ok||typeof data.current?.tempC!=='number')throw Error('Weather unavailable');if(!disposed){setWeather(data);setFailed(false);last=Date.now();}}
   catch{if(!disposed)setFailed(true);}finally{running=false;clearTimeout(timeout);}
  };
  const resume=()=>{if(Date.now()-last>=15*60000)void load();};
  void load();const timer=setInterval(()=>void load(),15*60000);
  window.addEventListener('online',resume);document.addEventListener('visibilitychange',resume);
  return()=>{disposed=true;controller?.abort();clearInterval(timer);window.removeEventListener('online',resume);document.removeEventListener('visibilitychange',resume);};
 },[]);
 return <aside aria-label="Dhiffushi weather"><b>{weather?Math.round(weather.current.tempC)+'°C':'—'}</b><small><UiText>{weather?weather.current.condition:failed?'Weather unavailable':'Loading weather…'}</UiText> · <UiText>Dhiffushi</UiText></small><small><UiText>{failed&&weather?'Last forecast · refresh delayed':'Forecast · updates every 15 minutes'}</UiText></small></aside>;
}
function Panel({title,icon:Icon,onView,children}:{title:string;icon:typeof BedDouble;onView?:()=>void;children:ReactNode}){
 return <section className="panel"><header><Icon/><b><UiText>{title}</UiText></b>{onView&&<button type="button" onClick={onView}><UiText>View all</UiText></button>}</header>{children}</section>;
}
function Status({value}:{value:string}){return <i className={'status '+value.toLowerCase().replace(/[^a-z0-9]+/g,'-')}><UiText>{value}</UiText></i>;}
function Trips({values,empty}:{values:DashboardTrip[]|null|undefined;empty:string}){
 if(values===undefined)return <p className="nv-live-empty"><UiText>Loading…</UiText></p>;
 if(values===null)return <p className="nv-live-empty"><UiText>Access not enabled for this account.</UiText></p>;
 if(!values.length)return <p className="nv-live-empty"><UiText>{empty}</UiText></p>;
 return <div className="nv-live-rows">{values.slice(0,5).map(row=><div key={row.id}><b>{row.time||'—'}</b><span>{row.name}{row.vessel&&<small>{row.vessel}</small>}</span><small>{row.pax} <UiText>Pax</UiText></small><Status value={row.status}/></div>)}{values.length>5&&<p className="nv-live-empty">+ {values.length-5} <UiText>more · select View all</UiText></p>}</div>;
}
function Revenue({data,table=false}:{data:DashboardData|null;table?:boolean}){
 const [currency,setCurrency]=useState<'USD'|'MVR'>('USD');
 if(!data)return <p className="nv-live-empty"><UiText>Loading payments…</UiText></p>;
 const revenue=data.revenue;if(!revenue)return <p className="nv-live-empty"><UiText>Revenue access is restricted.</UiText></p>;
 const amounts=revenue.days.map(day=>currency==='USD'?day.usdCents:day.mvrCents),min=Math.min(0,...amounts),max=Math.max(1,...amounts),range=max-min||1;
 const y=(value:number)=>110-(value-min)/range*92;
 const points=amounts.map((value,index)=>`${20+index*70},${y(value)}`).join(' ');
 const rows=<table className="nv-revenue-table"><caption><UiText>Net recorded payments by day</UiText></caption><thead><tr><th><UiText>Date</UiText></th><th>USD</th>{data.access.transfers&&<th>MVR</th>}</tr></thead><tbody>{revenue.days.map(day=><tr key={day.date}><td>{dayLabel(day.date)}</td><td>{money(day.usdCents)}</td>{data.access.transfers&&<td>{money(day.mvrCents,'MVR')}</td>}</tr>)}</tbody></table>;
 return <div className="nv-live-revenue"><div className="nv-revenue-heading"><small><UiText>Last 7 days · payments received</UiText></small>{data.access.transfers&&<div className="nv-currency-tabs">{(['USD','MVR'] as const).map(code=><button type="button" key={code} aria-pressed={currency===code} onClick={()=>setCurrency(code)}>{code}</button>)}</div>}</div><b>{money(amounts.reduce((n,value)=>n+value,0),currency)}</b><svg viewBox="0 0 460 145" role="img" aria-label={'Net recorded payments, '+currency+', last seven days'}><line x1="20" x2="440" y1={y(0)} y2={y(0)} stroke="currentColor" opacity="0.15"/><polyline points={points} fill="none" stroke="currentColor" strokeWidth="3"/>{amounts.map((amount,index)=><g key={revenue.days[index].date}><circle cx={20+index*70} cy={y(amount)} r="3"><title>{dayLabel(revenue.days[index].date)+': '+money(amount,currency)}</title></circle><text x={20+index*70} y="136" textAnchor="middle">{dayLabel(revenue.days[index].date)}</text></g>)}</svg>{table?rows:<details><summary><UiText>View daily amounts</UiText></summary>{rows}</details>}<p className="nv-live-note"><UiText>Room charges count when paid, not when added. Room-linked payments are counted once. USD uses the saved bill value; MVR transfer fares are shown separately.</UiText></p>{revenue.undated>0&&<p className="nv-live-note"><UiText>Older payments without a recorded payment date are excluded from daily totals.</UiText> ({revenue.undated})</p>}</div>;
}
export default function LiveDashboard({open}:{open:(module:Module)=>void}){
 const live=useDashboard(),data=live.data,access=data?.access;
 const stats:[string,string,typeof BedDouble,Module,string][]=[
  [data?String(data.stats.checkIns):'—','Check-ins',BedDouble,'Bookings','Scheduled today'],
  [data?String(data.stats.checkOuts):'—','Check-outs',House,'Bookings','Scheduled today'],
  [data?String(data.stats.inHouseGuests):'—','In-house Guests',Users,'Guests','Currently checked in'],
  [data?String(data.stats.newBookings):'—','New Bookings',CalendarDays,'Bookings','Created / confirmed today'],
  [data?.transfers?String(data.transfers.length):'—','Transfers Today',Plane,'Transfers','Booked journey legs'],
  [data?.excursions?String(data.excursions.trips.length):'—','Excursions Today',ShipWheel,'Excursions','Scheduled departures'],
  [data?.revenue?money(data.revenue.today.usdCents):'—','Revenue Today',CircleDollarSign,'Reports','Payments received · USD']
 ];
 const allowed=(module:Module)=>!access?false:module==='Transfers'?access.transfers:module==='Excursions'?access.excursions:module==='POS'?access.pos:module==='Reports'?access.reports:access.hotel;
 const occupancy=data?.occupancy;
 const actions:[string,typeof BedDouble,Module][]=[['New Booking',CalendarDays,'Bookings'],['Add Guest',Users,'Guests'],['New Transfer',Plane,'Transfers'],['New Excursion',ShipWheel,'Excursions'],['Open POS',ShoppingCart,'POS'],['Reports',FileText,'Reports']];
 return <div className="stack nv-live-dashboard"><section className="welcome"><div><small><UiText>WELCOME BACK</UiText></small><h1><UiText>{data?.greeting||'Welcome to Nirili Villa'}</UiText></h1><p><UiText>Here’s what’s happening at Nirili Villa today.</UiText></p></div><Weather/></section><LiveStatus {...live}/><section className="stats">{stats.map(([value,label,Icon,module,note])=><button key={label} onClick={()=>open(module)} disabled={!allowed(module)}><Icon/><span><b>{value}</b><small><UiText>{label}</UiText></small><small className="nv-stat-note"><UiText>{note}</UiText></small>{label==='Revenue Today'&&data?.revenue&&access?.transfers&&<small>{money(data.revenue.today.mvrCents,'MVR')} · <UiText>transfers</UiText></small>}</span></button>)}</section><div className="dashgrid"><Panel title="Today’s Transfers" icon={Plane} onView={allowed('Transfers')?()=>open('Transfers'):undefined}><Trips values={data?.transfers} empty="No transfers booked for today."/></Panel><Panel title="Today’s Excursions" icon={ShipWheel} onView={allowed('Excursions')?()=>open('Excursions'):undefined}><Trips values={data?.excursions===null?null:data?.excursions?.trips} empty="No excursions scheduled for today."/>{!!data?.excursions?.awaiting&&<p className="nv-live-note">{data.excursions.awaiting} <UiText>booking requests still await scheduling.</UiText></p>}</Panel><Panel title="Recent Bookings" icon={CalendarDays} onView={allowed('Bookings')?()=>open('Bookings'):undefined}>{!data?<p className="nv-live-empty"><UiText>Loading bookings…</UiText></p>:!data.recent.length?<p className="nv-live-empty"><UiText>No bookings yet.</UiText></p>:<div className="nv-live-rows">{data.recent.map(booking=><div key={booking.id}><b>{booking.guest}<small>{booking.id}</small></b><span>{booking.checkIn&&dayLabel(booking.checkIn)}{booking.checkOut&&' – '+dayLabel(booking.checkOut)}</span><small>{booking.pax} <UiText>Pax</UiText></small><Status value={booking.status}/></div>)}</div>}</Panel><Panel title="Room Occupancy" icon={BedDouble} onView={allowed('Rooms')?()=>open('Rooms'):undefined}>{occupancy?<div className="occupancy"><div className="nv-live-ring" style={{background:`conic-gradient(#1298ce ${occupancy.percent}%, #e5f0f2 0)`}}><span><b>{occupancy.percent}%</b><small><UiText>occupied</UiText></small></span></div><div><p><UiText>Occupied</UiText> <b>{occupancy.occupied}</b></p><p><UiText>Available</UiText> <b>{occupancy.available}</b></p><p><UiText>Cleaning</UiText> <b>{occupancy.cleaning}</b></p><p><UiText>Maintenance</UiText> <b>{occupancy.maintenance}</b></p>{occupancy.other>0&&<p><UiText>Other / unavailable</UiText> <b>{occupancy.other}</b></p>}<p><UiText>Total Rooms</UiText> <b>{occupancy.total}</b></p></div></div>:<p className="nv-live-empty"><UiText>Loading rooms…</UiText></p>}</Panel><Panel title="Revenue Overview" icon={CircleDollarSign} onView={allowed('Reports')?()=>open('Reports'):undefined}><Revenue data={data}/></Panel><Panel title="Quick Actions" icon={Sparkles}><div className="quick">{actions.filter(([, ,module])=>allowed(module)).map(([label,Icon,module])=><button key={label} onClick={()=>open(module)}><Icon/><small><UiText>{label}</UiText></small></button>)}</div></Panel></div></div>;
}
export function DashboardReport({initialView='overview'}:{initialView?:'overview'|'guest-details'}={}){
 const live=useDashboard(REFRESH_INTERVALS.reports),data=live.data;
 const [reportView,setReportView]=useState<'overview'|'guest-details'>(initialView);
 const guestRows=(data as any)?.guestStays||[];
 const [fromDate,setFromDate]=useState(''),[toDate,setToDate]=useState(''),[searched,setSearched]=useState(false);
 const filteredGuestRows=searched?guestRows.filter((row:any)=>{
  const from=fromDate||'0000-01-01',to=toDate||'9999-12-31';
  return String(row.checkIn||'')<=to&&String(row.checkOut||'')>=from;
 }):[];
 const csvCell=(value:any)=>'"'+String(value??'').replace(/"/g,'""')+'"';
 function searchGuestStays(){setSearched(true);}
 function clearGuestStaySearch(){setFromDate('');setToDate('');setSearched(false);}
 function downloadGuestStayReport(){
  if(!filteredGuestRows.length)return;
  const header=['Guest name','Check-in','Check-out','Passport number','Country','Room number','Room type','Booking reference','Status'];
  const rows=filteredGuestRows.map((row:any)=>[row.guestName,row.checkIn,row.checkOut,row.passportNumber||'Not added',row.country||'Not added',row.roomNumber,row.roomType,row.bookingId,row.status]);
  const csv='\uFEFF'+[header,...rows].map(row=>row.map(csvCell).join(',')).join('\r\n');
  const blob=new Blob([csv],{type:'text/csv;charset=utf-8'}),url=URL.createObjectURL(blob),a=document.createElement('a');
  a.href=url;a.download='Nirili Villa - Guest Details Report.csv';document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),60000);
 }
 return <section className="page nv-live-dashboard nv-reports-page">
  <header className="title"><FileText/><div><h1><UiText>Reports</UiText></h1><p><UiText>Revenue, occupancy and detailed guest reports.</UiText></p></div></header>
  <LiveStatus {...live}/>
  <div className="nv-report-tabs">
   <button type="button" className={reportView==='overview'?'active':''} onClick={()=>setReportView('overview')}><CircleDollarSign size={18}/><UiText>Report Overview</UiText></button>
   <button type="button" className={reportView==='guest-details'?'active':''} onClick={()=>setReportView('guest-details')}><Users size={18}/><UiText>Guest Details Report</UiText></button>
  </div>
  {reportView==='overview'?<>
   <div className="reports nv-live-report-cards"><article><small><UiText>Payments today · USD</UiText></small><b>{data?.revenue?money(data.revenue.today.usdCents):'—'}</b></article>{data?.access.transfers&&<article><small><UiText>Transfer payments today · MVR</UiText></small><b>{data?.revenue?money(data.revenue.today.mvrCents,'MVR'):'—'}</b></article>}<article><small><UiText>Current room occupancy</UiText></small><b>{data?data.occupancy.percent+'%':'—'}</b></article><article><small><UiText>Available rooms</UiText></small><b>{data?data.occupancy.available:'—'}</b></article></div>
   <section className="nv-report-link-card" onClick={()=>setReportView('guest-details')} role="button" tabIndex={0} onKeyDown={e=>{if(e.key==='Enter'||e.key===' ')setReportView('guest-details')}}><Users/><div><b><UiText>Guest Details Report</UiText></b><small><UiText>Search guest stays by date and download detailed guest information.</UiText></small></div><span>›</span></section>
   <Panel title="Revenue Overview" icon={CircleDollarSign}><Revenue data={data} table/></Panel>
  </>:<>
   <section className="panel nv-guest-stay-report"><header><Users/><div><b><UiText>Guest Details Report</UiText></b><small><UiText>Select dates and search. Guest details stay hidden until you search.</UiText></small></div></header>
    <div className="nv-guest-stay-search">
     <label><span><UiText>From date</UiText></span><input type="date" value={fromDate} onChange={e=>{setFromDate(e.target.value);setSearched(false)}}/></label>
     <label><span><UiText>To date</UiText></span><input type="date" min={fromDate||undefined} value={toDate} onChange={e=>{setToDate(e.target.value);setSearched(false)}}/></label>
     <button type="button" className="primary" disabled={!fromDate&&!toDate} onClick={searchGuestStays}><UiText>Search</UiText></button>
     <button type="button" onClick={clearGuestStaySearch}><UiText>Clear</UiText></button>
    </div>
    {!searched?<p className="nv-live-empty"><UiText>Select a From date and/or To date, then tap Search to view guest details.</UiText></p>:!data?<p className="nv-live-empty"><UiText>Loading guest details…</UiText></p>:!filteredGuestRows.length?<p className="nv-live-empty"><UiText>No guest stays found for the selected dates.</UiText></p>:<><div className="nv-guest-stay-table-wrap"><table className="nv-guest-stay-table"><thead><tr><th><UiText>Guest</UiText></th><th><UiText>Check-in</UiText></th><th><UiText>Check-out</UiText></th><th><UiText>Passport number</UiText></th><th><UiText>Country</UiText></th><th><UiText>Room number</UiText></th><th><UiText>Room type</UiText></th></tr></thead><tbody>{filteredGuestRows.map((row:any,index:number)=><tr key={row.bookingId+'-'+index}><td><b>{row.guestName}</b><small>{row.bookingId}</small></td><td>{row.checkIn}</td><td>{row.checkOut}</td><td>{row.passportNumber||<span className="nv-missing">Not added</span>}</td><td>{row.country||<span className="nv-missing">Not added</span>}</td><td>{row.roomNumber}</td><td>{row.roomType}</td></tr>)}</tbody></table></div><div className="nv-report-download-bottom"><button type="button" className="nv-download-report" onClick={downloadGuestStayReport}><Download size={17}/><UiText>Download These Results</UiText></button></div></>}
   </section>
  </>}
 </section>;
}
