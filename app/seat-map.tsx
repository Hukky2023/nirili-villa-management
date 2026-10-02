'use client';
import {defaultLayout,type SeatLayout} from '../lib/transport';
import './seat-map.css';

// A speedboat seat map in the style of the ODI and RTL ferry apps: the bow at the top, seats
// in rows with aisles, booked seats faded. Guests tap the seats they want; operators see who
// sits where. Seat numbers are the boat's own numbers from its drawn map.
export type SeatMark='booked'|'boarded'|'noshow';

// The seat map of a trip: the boat running it that day (a one-day swap or the regular boat),
// or plain rows for older departures that have no boat linked yet.
export function tripLayout(sailing:any,date:string,boats:any[]):{layout:SeatLayout;boatName:string}{
 const id=sailing?.boatOverrides?.[date]||sailing?.boatId,boat=id?(boats||[]).find((b:any)=>b.id===id):null;
 if(boat?.layout)return {layout:boat.layout,boatName:boat.name};
 return {layout:defaultLayout(Math.max(1,Number(boat?.capacity||sailing?.capacity)||1)),boatName:boat?.name||''};
}

// The first free seats, keeping a group side by side in seat-number order where possible.
export function pickSeats(layout:SeatLayout,taken:Iterable<number>,count:number){
 const used=new Set(taken),free=layout.cells.filter(n=>n>0&&!used.has(n)).sort((a,b)=>a-b);
 if(free.length<count)return [];
 for(let i=0;i+count<=free.length;i++)if(free[i+count-1]-free[i]===count-1)return free.slice(i,i+count);
 return free.slice(0,count);
}

type Props={
 layout:SeatLayout;
 taken?:Iterable<number>;
 selected?:number[];
 need?:number;
 onChange?:(seats:number[])=>void;
 // Operator view: seat state and a label (guest name) per seat.
 marks?:Record<number,SeatMark>;
 titles?:Record<number,string>;
 // Seat map editor: tap any cell, including aisles.
 onCell?:(index:number)=>void;
 highlight?:number;
 legend?:boolean;
 caption?:string;
};

export default function SeatMap({layout,taken=[],selected=[],need=0,onChange,marks,titles,onCell,highlight=-1,legend=true,caption}:Props){
 const used=new Set(taken),picking=!!onChange&&!onCell;
 const toggle=(n:number)=>{
  if(!onChange)return;
  if(selected.includes(n))onChange(selected.filter(x=>x!==n));
  else if(need>0)onChange([...selected,n].slice(-need));
 };
 const free=layout.cells.filter(n=>n>0&&!used.has(n)).length;
 return <div className="sm">
  {picking&&<div className="sm-head">
   <span className="sm-count" aria-live="polite"><b>{selected.length} / {need}</b> <span>seats selected</span></span>
   <button type="button" className="sm-auto" disabled={free<need} onClick={()=>onChange!(pickSeats(layout,used,need))}>Choose for me</button>
  </div>}
  <div className="sm-boat" role="group" aria-label={caption||'Seat map'}>
   <svg className="sm-bow" viewBox="0 0 100 60" preserveAspectRatio="none" aria-hidden="true"><path d="M1 60 C 2 34, 32 8, 50 1 C 68 8, 98 34, 99 60"/></svg>
   <span className="sm-front">Front</span>
   <div className="sm-grid" style={{gridTemplateColumns:`repeat(${layout.cols},minmax(0,1fr))`}}>
    {layout.cells.map((n,i)=>{
     if(onCell)return <button type="button" key={i} className={'sm-cell '+(n>0?'is-seat':'is-gap')+(i===highlight?' is-highlight':'')} onClick={()=>onCell(i)} aria-label={n>0?'Seat '+n:'Aisle or empty space'}>{n>0?n:'+'}</button>;
     if(n<=0)return <span key={i} className="sm-gap" aria-hidden="true"/>;
     const mark=marks?.[n],isTaken=used.has(n)&&!selected.includes(n),isSelected=selected.includes(n);
     const cls='sm-cell is-seat'+(isSelected?' is-selected':'')+(mark?' is-'+mark:isTaken?' is-taken':'');
     const title=titles?.[n];
     if(!picking)return <span key={i} className={cls} title={title?('Seat '+n+' · '+title):'Seat '+n}>{n}</span>;
     return <button type="button" key={i} className={cls} disabled={isTaken} aria-pressed={isSelected} aria-label={'Seat '+n} onClick={()=>toggle(n)}>{n}</button>;
    })}
   </div>
   <span className="sm-back">Back</span>
  </div>
  {legend&&!onCell&&<ul className="sm-legend">
   {marks?<><li><i className="sm-key"/>Free</li><li><i className="sm-key is-booked"/>Booked</li><li><i className="sm-key is-boarded"/>On board</li><li><i className="sm-key is-noshow"/>No-show</li></>
   :<><li><i className="sm-key"/>Available</li>{picking&&<li><i className="sm-key is-selected"/>Your seats</li>}<li><i className="sm-key is-taken"/>Booked</li></>}
  </ul>}
 </div>;
}

// The seat step of a booking form for one leg. Infants sit on a lap, so only adults and
// children need seats.
export function Seats({sailing,date,data,need,selected,onChange}:{sailing:any;date:string;data:any;need:number;selected:number[];onChange:(s:number[])=>void}){
 const {layout,boatName}=tripLayout(sailing,date,data?.boats||[]);
 const taken=takenSeats(sailing,date,data);
 return <div className="nh-seats">
  <p className="nh-seats-title"><b>Choose your seats</b>{boatName?<span> · {boatName}</span>:null}</p>
  <p className="nh-seats-help">Tap the seats you want, or let us seat your group together. Infants sit on a lap.</p>
  <SeatMap layout={layout} taken={taken} selected={selected} need={need} onChange={onChange}/>
 </div>;
}
// Seats still free on a trip.
export function seatsLeft(sailing:any,date:string,data:any){
 if(!sailing)return 0;
 const used=new Set(takenSeats(sailing,date,data));
 return tripLayout(sailing,date,data?.boats||[]).layout.cells.filter(n=>n>0&&!used.has(n)).length;
}
// Seats taken on a trip. For a leg of a route with stops (fromStop/toStop), only passengers on
// board for part of that stretch hold a seat; the same seat is free again after they get off.
export function takenSeats(sailing:any,date:string,data:any):number[]{
 const from=sailing?.fromStop??0,to=sailing?.toStop??99;
 return (data?.availability||[]).filter((x:any)=>x.scheduleId===sailing?.id&&x.date===date&&(x.from??0)<to&&from<(x.to??99)).flatMap((x:any)=>x.seats||[]);
}
