"use client";
import {useEffect,useState} from 'react';
import {CheckCircle2,CloudCog,Database,Link2,RefreshCw,RotateCw,Send,ShieldCheck,TriangleAlert,XCircle} from 'lucide-react';

const meals=['Bed & Breakfast','Half Board','Full Board'];

export default function ChannelManager(){
  const [data,setData]=useState<any>(null);
  const [draft,setDraft]=useState<any>(null);
  const [busy,setBusy]=useState('');
  const [error,setError]=useState('');
  const [notice,setNotice]=useState('');
  const [preview,setPreview]=useState<any>(null);

  async function load(){
    setError('');
    try{
      const r=await fetch('/api/channels/booking-com',{cache:'no-store'});
      const b=await r.json();if(!r.ok)throw Error(b.error||'Could not load channel.');
      setData(b);setDraft({
        enabled:!!b.connection.enabled,mode:b.connection.mode||'staging',
        propertyId:b.connection.property_id||'',channelPropertyId:b.connection.channel_property_id||'',
        dryRun:b.connection.settings?.dryRun!==false,
        autoImportReservations:b.connection.settings?.autoImportReservations!==false,
        autoPushAvailability:!!b.connection.settings?.autoPushAvailability
      });
    }catch(e){setError(e instanceof Error?e.message:'Could not load channel.');}
  }
  useEffect(()=>{void load();},[]);

  async function post(action:string,extra:any={}){
    setBusy(action);setError('');setNotice('');
    try{
      const r=await fetch('/api/channels/booking-com',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action,...extra})});
      const b=await r.json();if(!r.ok)throw Error(b.error||'Channel action failed.');
      if(b.connection){setData(b);setDraft((d:any)=>({...d,enabled:!!b.connection.enabled,mode:b.connection.mode,propertyId:b.connection.property_id||'',channelPropertyId:b.connection.channel_property_id||'',dryRun:b.connection.settings?.dryRun!==false}));}
      if(action==='preview')setPreview(b);
      if(action==='push'){setPreview(b.preview||null);setNotice(b.dryRun?'Dry-run complete. No external inventory changed.':'Availability sent to Channex.');}
      if(action==='selftest')setNotice((b.message||'PMS self-test passed.')+' Simulated '+(b.simulatedReference||'booking')+(b.simulatedRoom?' in room '+b.simulatedRoom:'')+'.');
      if(action==='bootstrap')setNotice(b.bootstrap?.message||'Nirili Villa staging property created.');
      if(action==='webhook')setNotice((b.created?'Booking webhook created.':'Booking webhook checked and repaired.')+' Event: booking.');
      if(action==='test')setNotice('Channex connection successful.');
      if(action==='discover')setNotice('Room types and rate plans loaded from Channex.');
      if(action==='mappings')setNotice('Mappings saved.');
      if(action==='pull'){setNotice('Booking feed checked: '+Number(b.received||0)+' revision(s) found.');await load();}
    }catch(e){setError(e instanceof Error?e.message:'Channel action failed.');}
    finally{setBusy('');}
  }

  async function save(){
    setBusy('save');setError('');setNotice('');
    try{
      const r=await fetch('/api/channels/booking-com',{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify(draft)});
      const b=await r.json();if(!r.ok)throw Error(b.error||'Could not save settings.');
      setData(b);setNotice('Channel settings saved.');
    }catch(e){setError(e instanceof Error?e.message:'Could not save settings.');}
    finally{setBusy('');}
  }

  const updateRoom=(id:string,p:any)=>setData((d:any)=>({...d,roomMappings:d.roomMappings.map((x:any)=>x.channel_room_id===id?{...x,...p}:x)}));
  const updateRate=(id:string,p:any)=>setData((d:any)=>({...d,rateMappings:d.rateMappings.map((x:any)=>x.channel_rate_id===id?{...x,...p}:x)}));
  if(!data||!draft)return <section className="page channel-manager"><p className={error?'channel-alert error':'channel-alert'}>{error||'Loading Booking.com channel…'}</p></section>;

  const c=data.connection,credentials=data.credentials;
  const mapped=data.roomMappings.length>0&&data.rateMappings.some((x:any)=>x.pms_meal_plan);
  const webhook=(typeof window==='undefined'?'':window.location.origin)+data.webhookPath;

  return <section className="page channel-manager">
    <header className="channel-title"><span><Link2/></span><div><small>CHANNEL MANAGER</small><h1>Booking.com</h1><p>Booking.com ↔ Channex ↔ Nirili Villa PMS</p></div><b className={'channel-state '+c.status}>{c.status}</b></header>
    {error&&<p className="channel-alert error"><XCircle/>{error}</p>}
    {notice&&<p className="channel-alert success"><CheckCircle2/>{notice}</p>}
    <div className="channel-checks">
      <em className={credentials.supabaseConfigured?'ok':''}><Database/>Supabase</em>
      <em className={credentials.apiKeyConfigured?'ok':''}><ShieldCheck/>Channex API key</em>
      <em className={credentials.webhookTokenConfigured?'ok':''}><ShieldCheck/>Webhook protection</em>
      <em className={mapped?'ok':''}><Link2/>Mappings</em>
    </div>

    <div className="channel-two">
      <article className="channel-card">
        <header><CloudCog/><div><h2>Connection</h2><p>Save IDs first, then test and discover mappings.</p></div></header>
        <label>Environment<select value={draft.mode} onChange={e=>setDraft({...draft,mode:e.target.value})}><option value="staging">Staging / test</option><option value="production">Production</option></select></label>
        <label>Channex property ID<input value={draft.propertyId} onChange={e=>setDraft({...draft,propertyId:e.target.value})} placeholder="Channex property UUID"/></label>
        <label>{draft.mode==='staging'?'Live Booking.com property ID (saved for production)':'Booking.com property ID'}<input value={draft.channelPropertyId} onChange={e=>setDraft({...draft,channelPropertyId:e.target.value})} placeholder="Booking.com hotel ID"/></label>{draft.mode==='staging'&&<p className="channel-staging-note"><b>Booking.com staging test hotel: {c.settings?.stagingBookingHotelId||'6519420'}</b><span>Channex test currency: GBP. Your live Booking.com property {draft.channelPropertyId||'5747514'} is not connected or changed during staging.</span></p>}
        <div className="channel-actions"><button className="primary" disabled={!!busy} onClick={save}>Save settings</button><button disabled={!!busy||!credentials.apiKeyConfigured} onClick={()=>post('test')}><RefreshCw/>Test Channex</button><button disabled={!!busy} onClick={()=>post('selftest')}><ShieldCheck/>Run PMS self-test</button>{draft.mode==='staging'&&!draft.propertyId&&<button disabled={!!busy||!credentials.apiKeyConfigured} onClick={()=>post('bootstrap')}><CloudCog/>Create Nirili staging property</button>}</div>
        {c.last_error&&<p className="channel-inline-error">{c.last_error}</p>}
      </article>

      <article className="channel-card">
        <header><ShieldCheck/><div><h2>Sync safety</h2><p>Dry-run remains on until staging tests pass.</p></div></header>
        <label className="channel-toggle"><span><b>Enable channel</b><small>Allows booking and inventory synchronization.</small></span><input type="checkbox" checked={draft.enabled} onChange={e=>setDraft({...draft,enabled:e.target.checked})}/></label>
        <label className="channel-toggle"><span><b>Dry-run</b><small>No PMS booking or Channex inventory changes.</small></span><input type="checkbox" checked={draft.dryRun} onChange={e=>setDraft({...draft,dryRun:e.target.checked})}/></label>
        <label className="channel-toggle"><span><b>Automatic booking import</b><small>New, modified and cancelled reservations.</small></span><input type="checkbox" checked={draft.autoImportReservations} onChange={e=>setDraft({...draft,autoImportReservations:e.target.checked})}/></label>
        <label className="channel-toggle"><span><b>Automatic availability push</b><small>Enable after certification/testing.</small></span><input type="checkbox" checked={draft.autoPushAvailability} onChange={e=>setDraft({...draft,autoPushAvailability:e.target.checked})}/></label>
        <p className={mapped?'channel-ready':'channel-ready warning'}>{mapped?<CheckCircle2/>:<TriangleAlert/>}{mapped?'Room/rate mappings are prepared.':'Discover and map room/rate plans before live sync.'}</p>
      </article>
    </div>

    <article className="channel-card">
      <header><Database/><div><h2>Booking webhook & recovery feed</h2><p>Webhook imports quickly; feed polling recovers missed delivery.</p></div></header>
      <code className="channel-code">{webhook}</code>
      <p className="channel-hint">The PMS automatically generates a private webhook credential and configures Channex to send it in the <code>X-Nirili-Channel-Secret</code> header. Only its verification hash is stored by the PMS; the secret is never displayed in the browser or placed in the callback URL.</p><div className="channel-actions"><button disabled={!!busy||!draft.propertyId||!credentials.apiKeyConfigured} onClick={()=>post('webhook')}><ShieldCheck/>Create / repair webhook</button></div><div className="channel-links"><a href="https://staging.channex.io/" target="_blank" rel="noreferrer">Open Channex staging</a><a href="https://staging.channex.io/user_profile" target="_blank" rel="noreferrer">Create / view API key</a></div>
      <div className="channel-actions"><button disabled={!!busy||!draft.enabled||!credentials.apiKeyConfigured} onClick={()=>post('pull')}><RotateCw/>Check booking feed now</button></div>
    </article>

    <article className="channel-card">
      <header><Link2/><div><h2>Room & rate mapping</h2><p>Booking.com room types map to Nirili Double Room; each rate maps to its meal plan.</p></div></header>
      <div className="channel-actions"><button disabled={!!busy||!draft.propertyId||!credentials.apiKeyConfigured} onClick={()=>post('discover')}><RefreshCw/>Discover from Channex</button><button className="primary" disabled={!!busy} onClick={()=>post('mappings',{roomMappings:data.roomMappings,rateMappings:data.rateMappings})}>Save mappings</button></div>
      <div className="channel-map-grid">
        <section><h3>Room types</h3>{data.roomMappings.length===0&&<p>No room types discovered yet.</p>}{data.roomMappings.map((x:any)=><div className="channel-map-row" key={x.channel_room_id}><span><b>{x.channel_room_name||x.channel_room_id}</b><small>{x.channel_room_id}</small></span><select value={x.pms_room_type||'Double Room'} onChange={e=>updateRoom(x.channel_room_id,{pms_room_type:e.target.value})}><option>Double Room</option></select><input aria-label="Active room mapping" type="checkbox" checked={x.active!==false} onChange={e=>updateRoom(x.channel_room_id,{active:e.target.checked})}/></div>)}</section>
        <section><h3>Rate plans</h3>{data.rateMappings.length===0&&<p>No rate plans discovered yet.</p>}{data.rateMappings.map((x:any)=><div className="channel-map-row" key={x.channel_rate_id}><span><b>{x.channel_rate_name||x.channel_rate_id}</b><small>{x.channel_rate_id}</small></span><select value={x.pms_meal_plan||''} onChange={e=>updateRate(x.channel_rate_id,{pms_meal_plan:e.target.value||null})}><option value="">Choose meal plan</option>{meals.map(m=><option key={m}>{m}</option>)}</select><input aria-label="Active rate mapping" type="checkbox" checked={x.active!==false} onChange={e=>updateRate(x.channel_rate_id,{active:e.target.checked})}/></div>)}</section>
      </div>
    </article>

    <article className="channel-card">
      <header><Send/><div><h2>Availability</h2><p>Calculated from the 14-room PMS calendar, excluding maintenance and overlapping active stays.</p></div></header>
      <div className="channel-actions"><button disabled={!!busy} onClick={()=>post('preview',{days:30})}><RefreshCw/>Preview 30 days</button><button className="primary" disabled={!!busy||!draft.enabled} onClick={()=>post('push',{days:30})}><Send/>{draft.dryRun?'Run dry-run sync':'Push to Channex'}</button></div>
      {preview&&<div className="channel-preview"><b>{preview.totalInventory} sellable rooms</b><div>{(preview.values||[]).slice(0,14).map((x:any)=><span key={x.date}><small>{x.date.slice(5)}</small><strong>{x.availability}</strong></span>)}</div></div>}
    </article>

    <div className="channel-two channel-logs">
      <article className="channel-card"><header><Database/><div><h2>Recent reservations</h2></div></header>{data.recentReservations.length===0&&<p>No Booking.com reservations yet.</p>}{data.recentReservations.map((x:any)=><div className="channel-log" key={x.id}><span><b>{x.guest_name||'Guest'}</b><small>{x.check_in||'—'} → {x.check_out||'—'} · {x.booking_reference||'not imported'}</small></span><i>{x.status}</i></div>)}</article>
      <article className="channel-card"><header><CloudCog/><div><h2>Channel events</h2></div></header>{data.recentEvents.length===0&&<p>No channel events yet.</p>}{data.recentEvents.map((x:any)=><div className="channel-log" key={x.id}><span><b>{x.event_type}</b><small>{new Date(x.created_at).toLocaleString()} · {x.error||x.direction}</small></span><i>{x.status}</i></div>)}</article>
    </div>
  </section>;
}
