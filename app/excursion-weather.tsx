'use client';
import {useEffect,useState} from 'react';
import {UiText,UiField,useLanguage} from './ui-language';

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
const localeFor=(lang:string)=>({en:'en-GB',zh:'zh-CN',it:'it-IT',es:'es-ES',bn:'bn-BD',ru:'ru-RU'} as Record<string,string>)[lang]||'en-GB';
const dayName=(date:string,lang:string)=>new Date(date+'T12:00:00+05:00').toLocaleDateString(localeFor(lang),{weekday:'long',day:'2-digit',month:'2-digit',year:'numeric'}).replaceAll('/','-');

export default function ExcursionWeather(){
 const lang=useLanguage();
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
 return <UiField as="section" className="excursion-weather-card" aria-label="Dhiffushi weather and tide forecast">
  <div className="excursion-weather-heading"><div><small><UiText>WEATHER & TIDES</UiText> · DHIFFUSHI</small><h3><UiText>Sea conditions for excursion operations</UiText></h3><p><UiText>Updated automatically every 15 minutes.</UiText></p></div><button type="button" onClick={load} disabled={loading}><UiText>{loading?'Updating…':'Refresh'}</UiText></button></div>
  <div className="excursion-weather-toolbar">
   <strong>{selected?<><UiText>{today?'Today':'Next day'}</UiText> · {dayName(selected.date,lang)}</>:''}</strong>
   <div className="excursion-weather-day-buttons">
    <button type="button" className={dayIndex===0?'active':''} onClick={()=>setDayIndex(0)} aria-pressed={dayIndex===0}><UiText>Today</UiText></button>
    <button type="button" className={dayIndex===1?'active':''} onClick={()=>setDayIndex(1)} aria-pressed={dayIndex===1} disabled={!weather?.days?.[1]}><UiText>Next day</UiText> →</button>
   </div>
  </div>
  {error&&<p className="excursion-weather-error"><UiText>{error}</UiText></p>}
  {!error&&loading&&!weather&&<p><UiText>Loading Dhiffushi weather and tide forecast…</UiText></p>}
  {weather&&selected&&<>
   <div className="excursion-weather-now">
    <span className="excursion-weather-icon" aria-hidden="true">{icon(today?weather.current.weatherCode:selected.weatherCode)}</span>
    <div><b>{headlineTemp}</b><strong><UiText>{headlineCondition}</UiText></strong><small>{today?<><UiText>Feels</UiText> {round(weather?.current?.feelsC)}°C</>:<UiText>Forecast high / low</UiText>}</small></div>
    <dl><div><dt><UiText>Rain chance</UiText></dt><dd>{round(selected.rainChance)}%</dd></div><div><dt><UiText>Wind</UiText></dt><dd>{round(wind)} km/h</dd></div><div><dt><UiText>Gusts</UiText></dt><dd>{round(gust)} km/h</dd></div><div><dt><UiText>Wave height</UiText></dt><dd>{round(wave,1)} m</dd></div></dl>
   </div>
   <div className="excursion-tide-now compact">
    <article><small><UiText>Ocean current now</UiText></small><b>{round(weather.marine?.currentKmh,1)} km/h</b></article>
    <article><small><UiText>{today?'Today’s tides':'Next day tides'}</UiText></small><b>{selected.tides?.length?selected.tides.map((t:any,i:number)=><span key={i}>{i>0?' · ':''}<UiText>{t.type}</UiText> {t.time} ({round(t.heightM,2)} m)</span>):<UiText>No tide extrema available</UiText>}</b></article>
   </div>
   <p className="excursion-weather-note"><UiText>Tide heights are modelled sea-level estimates for the Dhiffushi area, not a harbor gauge. Use weather, waves and tides together when planning excursions.</UiText></p>
  </>}
 </UiField>;
}
