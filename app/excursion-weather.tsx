'use client';
import {useEffect,useMemo,useState} from 'react';

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
const dayName=(date:string)=>new Date(date+'T12:00:00+05:00').toLocaleDateString('en',{weekday:'short'});

export default function ExcursionWeather(){
 const [weather,setWeather]=useState<any>(null),[error,setError]=useState(''),[loading,setLoading]=useState(true);
 async function load(){setLoading(true);setError('');try{const r=await fetch('/api/excursion-weather',{cache:'no-store'}),d=await r.json();if(!r.ok)throw Error(d.error||'Weather unavailable');setWeather(d);}catch(e){setError((e as Error).message);}finally{setLoading(false);}}
 useEffect(()=>{load();const timer=setInterval(load,15*60*1000);return()=>clearInterval(timer)},[]);
 const today=weather?.days?.[0],next=useMemo(()=>weather?.days?.slice(0,4)||[],[weather]);
 return <section className="excursion-weather-card" aria-label="Dhiffushi weather and tide forecast">
  <div className="excursion-weather-heading"><div><small>WEATHER &amp; TIDES · DHIFFUSHI</small><h3>Sea conditions for excursion operations</h3><p>Updated automatically every 15 minutes.</p></div><button type="button" onClick={load} disabled={loading}>{loading?'Updating…':'Refresh'}</button></div>
  {error&&<p className="excursion-weather-error">{error}</p>}
  {!error&&loading&&!weather&&<p>Loading Dhiffushi weather and tide forecast…</p>}
  {weather&&<>
   <div className="excursion-weather-now">
    <span className="excursion-weather-icon" aria-hidden="true">{icon(weather.current.weatherCode)}</span>
    <div><b>{round(weather.current.tempC)}°C</b><strong>{weather.current.condition}</strong><small>Feels {round(weather.current.feelsC)}°C</small></div>
    <dl><div><dt>Rain chance</dt><dd>{round(today?.rainChance)}%</dd></div><div><dt>Wind</dt><dd>{round(weather.current.windKmh)} km/h</dd></div><div><dt>Gusts</dt><dd>{round(weather.current.gustKmh)} km/h</dd></div><div><dt>Wave height</dt><dd>{round(weather.marine?.waveHeightM,1)} m</dd></div></dl>
   </div>
   <div className="excursion-tide-now"><article><small>Wave period</small><b>{round(weather.marine?.wavePeriodS,1)} s</b></article><article><small>Sea temperature</small><b>{round(weather.marine?.seaSurfaceC,1)}°C</b></article><article><small>Ocean current</small><b>{round(weather.marine?.currentKmh,1)} km/h</b></article><article><small>Today’s tides</small><b>{today?.tides?.length?today.tides.map((t:any)=>`${t.type} ${t.time} (${round(t.heightM,2)} m)`).join(' · '):'No tide extrema available'}</b></article></div>
   <div className="excursion-weather-days">{next.map((d:any,i:number)=><article key={d.date} className={i===0?'today':''}><small>{i===0?'Today':dayName(d.date)}</small><span>{icon(d.weatherCode)}</span><b>{round(d.maxC)}° / {round(d.minC)}°</b><em>{d.condition}</em><small>Rain {round(d.rainChance)}% · Wind {round(d.windKmh)} km/h</small><small className="tide-line">{d.tides?.length?d.tides.map((t:any)=>`${t.type} ${t.time}`).join(' · '):'Tide times unavailable'}</small></article>)}</div>
   <p className="excursion-weather-note">Tide heights are modelled sea-level estimates for the Dhiffushi area, not a harbor gauge. Use weather, waves and tides together when planning excursions.</p>
  </>}
 </section>;
}
