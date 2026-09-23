'use client';
import type {ChangeEvent} from 'react';

type TimeEvent={target:{value:string}};
type Props={
 value?:string;
 onChange?:(event:TimeEvent)=>void;
 required?:boolean;
 disabled?:boolean;
 autoFocus?:boolean;
 className?:string;
 'aria-label'?:string;
};

const valid=/^([01]\d|2[0-3]):([0-5]\d)$/;

export default function TimeField24({value='',onChange,required=false,disabled=false,autoFocus=false,className='',...aria}:Props){
 const match=String(value||'').match(valid);
 const hour=match?.[1]||'';
 const minute=match?.[2]||'00';
 const emit=(nextHour:string,nextMinute:string)=>{
  const next=nextHour?nextHour+':'+nextMinute:'';
  onChange?.({target:{value:next}});
 };
 return <span className={'time-field-24 '+className} {...aria}>
  <select aria-label="Hour (24-hour)" required={required} disabled={disabled} autoFocus={autoFocus} value={hour} onChange={(e:ChangeEvent<HTMLSelectElement>)=>emit(e.target.value,minute)}>
   <option value="">HH</option>
   {Array.from({length:24},(_,i)=>String(i).padStart(2,'0')).map(h=><option key={h} value={h}>{h}</option>)}
  </select>
  <span aria-hidden="true">:</span>
  <select aria-label="Minute" required={required} disabled={disabled} value={minute} onChange={(e:ChangeEvent<HTMLSelectElement>)=>emit(hour,e.target.value)}>
   {Array.from({length:60},(_,i)=>String(i).padStart(2,'0')).map(m=><option key={m} value={m}>{m}</option>)}
  </select>
  <style jsx>{`
   .time-field-24{display:inline-flex;align-items:center;gap:6px;width:100%}
   .time-field-24 select{min-width:0;flex:1;height:42px;border:1px solid #cfdbe3;border-radius:8px;background:#fff;padding:0 9px;font:inherit;color:inherit}
   .time-field-24>span{font-weight:700}
  `}</style>
 </span>;
}
