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
const round=(n:any)=>Number.isFinite(Number(n))?Math.round(Number(n)):'—';
const dayName=(date:string)=>new Date(date+'T12:00:00+05:00').toLocaleDateString('en',{weekday:'short'});

export default function ExcursionWeather(){
 const [weather,setWeather]=useState<any>(null),[error,setError]=useState(''),[loading,setLoading]=useState(true);
 async function load(){setLoading(true);setError('');try{const r=await fetch('/api/excursion-weather',{cache:'no-store'}),d=await r.json();if(!r.ok)throw Error(d.error||'Weather unavailable');setWeather(d);}catch(e){setError((e as Error).message);}finally{setLoading(false);}}
 useEffect(()=>{load();const timer=setInterval(load,15*60*1000);return()=>clearInterval(timer)},[]);
 const today=weather?.days?.[0],next=useMemo(()=>weather?.days?.slice(0,4)||[],[weather]);
 return <section className="excursion-weather-card" aria-label="Dhiffushi weather forecast">
  <div className="excursion-weather-heading"><div><small>WEATHER · DHIFFUSHI</small><h3>Weather for excursion operations</h3><p>Updated automatically every 15 minutes.</p></div><button type="button" onClick={load} disabled={loading}>{loading?'Updating…':'Refresh'}</button></div>
  {error&&<p className="excursion-weather-error">{error}</p>}
  {!error&&loading&&!weather&&<p>Loading Dhiffushi weather…</p>}
  {weather&&<>
   <div className="excursion-weather-now">
    <span className="excursion-weather-icon" aria-hidden="true">{icon(weather.current.weatherCode)}</span>
    <div><b>{round(weather.current.tempC)}°C</b><strong>{weather.current.condition}</strong><small>Feels {round(weather.current.feelsC)}°C</small></div>
    <dl><div><dt>Rain chance</dt><dd>{round(today?.rainChance)}%</dd></div><div><dt>Wind</dt><dd>{round(weather.current.windKmh)} km/h</dd></div><div><dt>Gusts</dt><dd>{round(weather.current.gustKmh)} km/h</dd></div><div><dt>Today</dt><dd>{round(today?.minC)}°–{round(today?.maxC)}°C</dd></div></dl>
   </div>
   <div className="excursion-weather-days">{next.map((d:any,i:number)=><article key={d.date} className={i===0?'today':''}><small>{i===0?'Today':dayName(d.date)}</small><span>{icon(d.weatherCode)}</span><b>{round(d.maxC)}° / {round(d.minC)}°</b><em>{d.condition}</em><small>Rain {round(d.rainChance)}% · Wind {round(d.windKmh)} km/h</small></article>)}</div>
   <p className="excursion-weather-note">Use the forecast as an operational guide. Sea conditions can change quickly around the atoll.</p>
  </>}
 </section>;
}
