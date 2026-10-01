'use client';
import {fareFor,hasLocalFare} from '../lib/transport';

// Speedboat operators may sell a cheaper local fare to Maldivians (and, if they choose, expats
// living in the Maldives). Guests must say which they are before booking such a departure; the
// operator checks ID when they board.
const money=(cents:number)=>'MVR '+(Math.max(0,Number(cents)||0)/100).toFixed(2);
export const OPTIONS=[{id:'Tourist',label:'Tourist / visitor'},{id:'Local',label:'Maldivian'},{id:'Expat',label:'Expat living in the Maldives'}];

// The departure label in a picker: the tourist fare, plus the local fare when there is one.
export function fareLabel(s:any){
 return money(s.fare)+' adult'+(hasLocalFare(s)?' · Maldivians '+money(s.localFare):'');
}
export const needsType=(sailings:any[])=>sailings.some(s=>s&&hasLocalFare(s));

export default function PassengerType({sailings,value,onChange}:{sailings:any[];value:string;onChange:(v:string)=>void}){
 const list=sailings.filter(Boolean);
 if(!needsType(list))return null;
 const expat=list.some(s=>hasLocalFare(s)&&s.expatLocal);
 return <fieldset className="nh-ptype">
  <legend>Passenger type</legend>
  <div role="radiogroup" aria-label="Passenger type">{OPTIONS.map(o=><button type="button" key={o.id} role="radio" aria-checked={value===o.id} onClick={()=>onChange(o.id)}>
   <b>{o.label}</b><small>{list.map(s=>money(fareFor(s,o.id))).filter((x,i,a)=>a.indexOf(x)===i).join(' / ')} adult</small>
  </button>)}</div>
  <p className="nh-seats-help">{expat?'Maldivians and expats living in the Maldives pay the local fare.':'Maldivians pay the local fare.'} Please show your ID card or work permit when you board.</p>
 </fieldset>;
}
