'use client';
import {useState} from 'react';
import {formatDateDMY} from '../lib/date-format';

type Props={
 value:string;
 onChange:(value:string)=>void;
 disabled?:boolean;
 min?:string;
 max?:string;
 required?:boolean;
 ariaLabel?:string;
};

export default function DateFieldDMY({value,onChange,disabled=false,min,max,required=false,ariaLabel='Date'}:Props){
 const [focused,setFocused]=useState(false);
 return <span style={{position:'relative',display:'block',minWidth:170,maxWidth:'100%'}}>
  <span aria-hidden="true" style={{display:'flex',alignItems:'center',minHeight:44,padding:'10px 38px 10px 12px',border:'1px solid #bfd3dd',borderRadius:10,background:disabled?'#f3f7f9':'#fff',color:disabled?'#688493':'#14354a',fontWeight:700,boxShadow:focused?'0 0 0 3px rgba(8,124,173,.18)':'none'}}>{formatDateDMY(value)}</span>
  <span aria-hidden="true" style={{position:'absolute',right:12,top:'50%',transform:'translateY(-50%)',color:'#607c8b',pointerEvents:'none'}}>▾</span>
  <input aria-label={ariaLabel} type="date" value={value} min={min} max={max} required={required} disabled={disabled} onFocus={()=>setFocused(true)} onBlur={()=>setFocused(false)} onChange={e=>onChange(e.target.value)} style={{position:'absolute',inset:0,width:'100%',height:'100%',opacity:0,cursor:disabled?'not-allowed':'pointer'}}/>
 </span>;
}
