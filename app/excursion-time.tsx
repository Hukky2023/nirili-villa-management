'use client';
import {useState} from 'react';

export function normalize24Hour(hour:string,minute:string){
 if(!/^([01]\d|2[0-3])$/.test(hour)||!/^([0-5]\d)$/.test(minute))return '';
 return hour+':'+minute;
}

export default function ExcursionTime({initial,onChange}:{initial:string;onChange:(value:string)=>void}){
 const valid=/^([01]\d|2[0-3]):[0-5]\d$/.test(initial||'');
 const [hour,setHour]=useState(valid?initial.slice(0,2):'');
 const [minute,setMinute]=useState(valid?initial.slice(3,5):'00');
 return <fieldset className="excursion-time"><legend>Time (Maldives, 24-hour)</legend><div>
  <label>Hour (00–23)<select required value={hour} onChange={e=>{setHour(e.target.value);onChange(normalize24Hour(e.target.value,minute));}}><option value="">Hour</option>{Array.from({length:24},(_,i)=>String(i).padStart(2,'0')).map(h=><option key={h} value={h}>{h}</option>)}</select></label>
  <label>Minute<select required value={minute} onChange={e=>{setMinute(e.target.value);onChange(normalize24Hour(hour,e.target.value));}}>{Array.from({length:60},(_,i)=>String(i).padStart(2,'0')).map(m=><option key={m}>{m}</option>)}</select></label>
 </div></fieldset>;
}
