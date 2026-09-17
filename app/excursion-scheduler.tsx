'use client';
import './excursion-scheduler.css';
import ExcursionWeather from './excursion-weather';
import {useState} from 'react';

type ExcursionTab='Schedule'|'Excursion menu'|'Crew members'|'Vehicles';

export default function ExcursionScheduler({data}:{data?:any}){
 const [tab,setTab]=useState<ExcursionTab>('Schedule');
 const resources=data?.resources||{vessels:[],crew:[]};
 const menu=(data?.catalog||[]).filter((item:any)=>item.kind==='excursion');
 const tabs:ExcursionTab[]=['Schedule','Excursion menu','Crew members','Vehicles'];
 const money=(cents:number)=>'$'+((Number(cents)||0)/100).toFixed(2);
 return <section className="booking-review excursion-scheduler excursion-operations">
  <ExcursionWeather/>

  <div className="excursion-admin-shell">
   <header className="excursion-admin-header">
    <small>EXCURSION OPERATIONS</small>
    <h2>Excursion management</h2>
    <p>Build the operating schedule first. Guests will book from trips that admin has made available.</p>
   </header>

   <nav className="excursion-admin-tabs" aria-label="Excursion management sections">
    {tabs.map(name=><button key={name} type="button" className={tab===name?'active':''} aria-pressed={tab===name} onClick={()=>setTab(name)}>{name}</button>)}
   </nav>

   {tab==='Schedule'&&<section className="excursion-panel">
    <div className="excursion-panel-head"><div><h3>Schedule</h3><p>Create excursion trips in advance and manage each day's operating plan.</p></div><button type="button" className="excursion-primary-btn">+ Create schedule</button></div>
    <div className="excursion-schedule-tools"><button type="button">← Previous day</button><label>Date<input type="date"/></label><button type="button">Next day →</button></div>
    <div className="excursion-empty-state"><strong>No scheduled trips for this date</strong><p>Create a trip by choosing an excursion, departure time, vehicle and available crew members.</p></div>
   </section>}

   {tab==='Excursion menu'&&<section className="excursion-panel">
    <div className="excursion-panel-head"><div><h3>Excursion menu</h3><p>Manage the excursions that can be added to the schedule.</p></div><button type="button" className="excursion-primary-btn">+ Add excursion</button></div>
    {menu.length?<div className="excursion-menu-grid">{menu.map((item:any)=><article className="excursion-menu-card" key={item.id}>
     <div className="excursion-menu-card-top"><div><h4>{item.name}</h4><p>Available for scheduling</p></div><span className="excursion-price-pill">{money(item.cents)} / guest</span></div>
     <div className="excursion-menu-card-actions"><button type="button" className="excursion-secondary-btn">Edit</button></div>
    </article>)}</div>:<div className="excursion-empty-state"><strong>No excursions added yet</strong><p>Add excursion names, prices, duration and operating details here.</p></div>}
   </section>}

   {tab==='Crew members'&&<section className="excursion-panel">
    <div className="excursion-panel-head"><div><h3>Crew members</h3><p>Manage excursion crew accounts, availability and assignments.</p></div><button type="button" className="excursion-primary-btn">+ Add crew member</button></div>
    {resources.crew?.length?<div className="excursion-menu-grid">{resources.crew.map((crew:any)=><article className="excursion-menu-card" key={crew.id}><div className="excursion-menu-card-top"><div><h4>{crew.name}</h4><p>Crew member</p></div><span className="excursion-price-pill">Active</span></div><div className="excursion-menu-card-actions"><button type="button" className="excursion-secondary-btn">Manage</button></div></article>)}</div>:<div className="excursion-empty-state"><strong>No crew members added yet</strong><p>Add crew users here. Crew availability and leave will be used when assigning the daily schedule.</p></div>}
   </section>}

   {tab==='Vehicles'&&<section className="excursion-panel">
    <div className="excursion-panel-head"><div><h3>Vehicles</h3><p>Manage boats and other vehicles used for excursion trips.</p></div><button type="button" className="excursion-primary-btn">+ Add vehicle</button></div>
    {resources.vessels?.length?<div className="excursion-menu-grid">{resources.vessels.map((vehicle:any)=><article className="excursion-menu-card" key={vehicle.id}><div className="excursion-menu-card-top"><div><h4>{vehicle.name}</h4><p>Excursion vehicle</p></div><span className="excursion-price-pill">{vehicle.condition||'Available'}</span></div><div className="excursion-menu-card-actions"><button type="button" className="excursion-secondary-btn">Manage</button></div></article>)}</div>:<div className="excursion-empty-state"><strong>No vehicles added yet</strong><p>Add excursion boats and vehicles here, including capacity and availability status.</p></div>}
   </section>}
  </div>
 </section>;
}
