"use client";
import {useEffect,useMemo,useState} from 'react';
import {CheckCircle2,ClipboardCheck,ExternalLink,FlaskConical,RefreshCw,ShieldAlert,TriangleAlert} from 'lucide-react';

export default function ChannelCertification(){
  const [data,setData]=useState<any>(null);
  const [busy,setBusy]=useState('');
  const [error,setError]=useState('');
  const [notice,setNotice]=useState('');

  async function call(action:string,extra:any={}){
    setBusy(action+(extra.scenario?'-'+extra.scenario:''));
    setError('');setNotice('');
    try{
      const response=await fetch('/api/channels/booking-com',{
        method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action,...extra})
      });
      const body=await response.json();
      if(!response.ok)throw Error(body.error||'Certification action failed.');
      setData(body);
      if(action==='cert-setup')setNotice('Certification property and mappings are ready in Channex staging.');
      if(action==='cert-run'){
        const row=body.lastRun||body.scenarios?.find((x:any)=>Number(x.scenario)===Number(extra.scenario));
        setNotice(row?.status==='passed'
          ?'Scenario '+extra.scenario+' passed. Returned task IDs are saved below.'
          :'Scenario '+extra.scenario+' recorded.');
      }
      return body;
    }catch(e){setError(e instanceof Error?e.message:'Certification action failed.');return null;}
    finally{setBusy('');}
  }

  async function load(){
    await call('cert-state');
  }
  useEffect(()=>{void load();},[]);

  const passed=useMemo(()=>data?.scenarios?.filter((x:any)=>Number(x.scenario)<=11&&x.status==='passed').length||0,[data]);
  const automated=useMemo(()=>data?.scenarios?.filter((x:any)=>Number(x.scenario)<=10&&x.status==='passed').length||0,[data]);

  if(!data)return <article className="channel-card cert-card"><header><FlaskConical/><div><h2>Channex Certification Lab</h2><p>Loading certification state…</p></div></header>{error&&<p className="channel-alert error">{error}</p>}</article>;

  return <article className="channel-card cert-card">
    <header><FlaskConical/><div><h2>Channex Certification Lab</h2><p>Run the official staging scenarios from the PMS UI and retain Channex task IDs for the certification form.</p></div></header>

    {error&&<p className="channel-alert error"><ShieldAlert/>{error}</p>}
    {notice&&<p className="channel-alert success"><CheckCircle2/>{notice}</p>}

    <div className="cert-summary">
      <div><b>{automated}/10</b><span>ARI scenarios passed</span></div>
      <div><b>{passed}/11</b><span>including booking receiving</span></div>
      <div><b>{data.property?.ready?'Ready':'Not ready'}</b><span>dedicated certification property</span></div>
    </div>

    {!data.property?.ready?<div className="cert-setup">
      <p><b>Dedicated test property required.</b> This creates “Test Property - Nirili PMS” in Channex staging with Twin Room, Double Room, and four certification rate plans in USD.</p>
      <button className="primary" disabled={!!busy||!data.stagingApiKeyConfigured} onClick={()=>call('cert-setup')}><FlaskConical/>{busy==='cert-setup'?'Creating…':'Create certification property'}</button>
    </div>:<div className="cert-property">
      <CheckCircle2/><span><b>{data.property.title}</b><small>{data.property.currency} · {data.property.propertyId}</small></span>
      <button disabled={!!busy} onClick={load}><RefreshCw/>Refresh</button>
    </div>}

    <div className="cert-scenarios">
      {(data.scenarios||[]).map((row:any)=>{
        const n=Number(row.scenario);
        const runLabel=n<=10?'Run':n===11?'Refresh evidence':'Record';
        const status=row.status||'not_started';
        const taskIds=Array.isArray(row.task_ids)?row.task_ids:[];
        return <section className="cert-row" key={n}>
          <div className="cert-number">{n}</div>
          <div className="cert-main">
            <div className="cert-row-title"><b>{row.title}</b><span className={'cert-status '+status}>{status.replace('_',' ')}</span></div>
            {n===1&&<small>500 days · exactly 2 API calls: availability + rates/restrictions.</small>}
            {n===11&&<small>Booking CRS lifecycle: new → modified → cancelled → acknowledged.</small>}
            {n===12&&<small>Channex limit: 10 restrictions/rates + 10 availability requests per minute per property.</small>}
            {n===13&&<small>Change-only ARI; no frequent full-sync timer.</small>}
            {taskIds.length>0&&<div className="cert-task"><ClipboardCheck/><code>{taskIds.join(' · ')}</code></div>}
            {row.details?.error&&<small className="cert-error">{row.details.error}</small>}
            {status==='manual'&&row.details?.note&&<small>{row.details.note}</small>}
          </div>
          <button className={status==='passed'?'cert-run passed':'cert-run'} disabled={!!busy||(!data.property?.ready&&n<=10)} onClick={()=>call('cert-run',{scenario:n})}>
            {busy==='cert-run-'+n?'Running…':runLabel}
          </button>
        </section>;
      })}
    </div>

    <div className="cert-footer">
      <TriangleAlert/><span>Run scenarios 1–10 only against the dedicated staging property. Production Booking.com sync remains separate.</span>
      <a href={data.formUrl} target="_blank" rel="noreferrer">Open Channex certification form <ExternalLink/></a>
    </div>
  </article>;
}
