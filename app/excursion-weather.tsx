'use client';
import {useEffect,useState} from 'react';

function icon(code:number){
 if(code===0)return '☀️';
 if([1,2].includes(code))return '🌤️';
 if(code===3)return '☁️';
 if([45,48].includes(code))return '🌫️';
 if([95,96,99].includes(code))return '⛈️';
 if([51,53,55,56,57,61,63,65,66,67,80,81,82].includes(code))return '🌧️';
 return '🌦️';
}
const round=(n:any,d=0)=>Number.isFinite(Number(n))?Number(Number(n).toFixed(d)):'—';
const dayName=(date:string)=>new Date(date+'T12:00:00+05:00').toLocaleDateString('en-GB',{weekday:'long',day:'2-digit',month:'2-digit',year:'numeric'}).replaceAll('/','-');

export default function ExcursionWeather(){
 const [weather,setWeather]=useState<any>(null),[error,setError]=useState(''),[loading,setLoading]=useState(true),[dayIndex,setDayIndex]=useState(0);
 async function load(){setLoading(true);setError('');try{const r=await fetch('/api/excursion-weather',{cache:'no-store'}),d=await r.json();if(!r.ok)throw Error(d.error||'Weather unavailable');setWeather(d);}catch(e){setError((e as Error).message);}finally{setLoading(false);}}
 useEffect(()=>{load();const timer=setInterval(load,15*60*1000);return()=>clearInterval(timer)},[]);
 const selected=weather?.days?.[dayIndex]||weather?.days?.[0];
 const today=dayIndex===0;
 const headlineTemp=today?`${round(weather?.current?.tempC)}°C`:`${round(selected?.maxC)}° / ${round(selected?.minC)}°`;
 const headlineCondition=today?weather?.current?.condition:selected?.condition;
 const headlineNote=today?`Feels ${round(weather?.current?.feelsC)}°C`:'Forecast high / low';
 const wind=today?weather?.current?.windKmh:selected?.windKmh;
 const gust=today?weather?.current?.gustKmh:selected?.gustKmh;
 const wave=today?weather?.marine?.waveHeightM:selected?.waveMaxM;
 return <section className="excursion-weather-card" aria-label="Dhiffushi weather and tide forecast">
  <div className="excursion-weather-heading"><div><small>WEATHER &amp; TIDES · DHIFFUSHI</small><h3>Sea conditions for excursion operations</h3><p>Updated automatically every 15 minutes.</p></div><button type="button" onClick={load} disabled={loading}>{loading?'Updating…':'Refresh'}</button></div>
  <div className="excursion-weather-toolbar">
   <strong>{selected?(today?'Today · ': 'Next day · ')+dayName(selected.date):''}</strong>
   <div className="excursion-weather-day-buttons">
    <button type="button" className={dayIndex===0?'active':''} onClick={()=>setDayIndex(0)} aria-pressed={dayIndex===0}>Today</button>
    <button type="button" className={dayIndex===1?'active':''} onClick={()=>setDayIndex(1)} aria-pressed={dayIndex===1} disabled={!weather?.days?.[1]}>Next day →</button>
   </div>
  </div>
  {error&&<p className="excursion-weather-error">{error}</p>}
  {!error&&loading&&!weather&&<p>Loading Dhiffushi weather and tide forecast…</p>}
  {weather&&selected&&<>
   <div className="excursion-weather-now">
    <span className="excursion-weather-icon" aria-hidden="true">{icon(today?weather.current.weatherCode:selected.weatherCode)}</span>
    <div><b>{headlineTemp}</b><strong>{headlineCondition}</strong><small>{headlineNote}</small></div>
    <dl><div><dt>Rain chance</dt><dd>{round(selected.rainChance)}%</dd></div><div><dt>Wind</dt><dd>{round(wind)} km/h</dd></div><div><dt>Gusts</dt><dd>{round(gust)} km/h</dd></div><div><dt>Wave height</dt><dd>{round(wave,1)} m</dd></div></dl>
   </div>
   <div className="excursion-tide-now compact">
    <article><small>Ocean current now</small><b>{round(weather.marine?.currentKmh,1)} km/h</b></article>
    <article><small>{today?'Today’s tides':'Next day tides'}</small><b>{selected.tides?.length?selected.tides.map((t:any)=>`${t.type} ${t.time} (${round(t.heightM,2)} m)`).join(' · '):'No tide extrema available'}</b></article>
   </div>
   <p className="excursion-weather-note">Tide heights are modelled sea-level estimates for the Dhiffushi area, not a harbor gauge. Use weather, waves and tides together when planning excursions.</p>
  </>}
 </section>;
}
