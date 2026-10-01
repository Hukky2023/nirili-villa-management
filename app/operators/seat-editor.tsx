'use client';
import {useState} from 'react';
import {Minus,Plus} from 'lucide-react';
import SeatMap from '../seat-map';
import {defaultLayout,type SeatLayout} from '../../lib/transport';

// Draw a boat's seats the way they are on board. Start from a template (2+2, 3+3 …), then tap
// cells to add or remove seats and aisles. Seats are numbered automatically from the corner
// the operator chooses, or the operator types each seat's own number.
const MAX_ROWS=30,MAX_COLS=12;
type Start='back-right'|'back-left'|'front-left'|'front-right';
const STARTS:{id:Start;label:string}[]=[{id:'back-right',label:'Back right'},{id:'back-left',label:'Back left'},{id:'front-left',label:'Front left'},{id:'front-right',label:'Front right'}];
const TEMPLATES=[{per:4,label:'2 + 2'},{per:5,label:'2 + 3'},{per:6,label:'3 + 3'},{per:3,label:'1 + 2'}];

export function renumber(layout:SeatLayout,start:Start):SeatLayout{
 const {rows,cols}=layout,cells=layout.cells.slice();
 const rowOrder=[...Array(rows).keys()],colOrder=[...Array(cols).keys()];
 if(start.startsWith('back'))rowOrder.reverse();
 if(start.endsWith('right'))colOrder.reverse();
 let n=1;
 for(const r of rowOrder)for(const c of colOrder){const i=r*cols+c;if(cells[i]>0)cells[i]=n++;}
 return {rows,cols,cells};
}
const same=(a:SeatLayout,b:SeatLayout)=>a.rows===b.rows&&a.cols===b.cols&&a.cells.every((n,i)=>n===b.cells[i]);
function detect(layout:SeatLayout):Start|'custom'{return STARTS.find(s=>same(renumber(layout,s.id),layout))?.id||'custom';}
// Resize keeping seats where they are; new rows are added at the front (top).
function resize(layout:SeatLayout,rows:number,cols:number):SeatLayout{
 const cells:number[]=[],shift=rows-layout.rows;
 for(let r=0;r<rows;r++)for(let c=0;c<cols;c++){const from=r-shift;cells.push(from>=0&&from<layout.rows&&c<layout.cols?layout.cells[from*layout.cols+c]:0);}
 return {rows,cols,cells};
}

export default function SeatEditor({value,onChange}:{value:SeatLayout;onChange:(l:SeatLayout)=>void}){
 const [count,setCount]=useState(String(value.cells.filter(n=>n>0).length||20)),[per,setPer]=useState(4);
 const [order,setOrder]=useState<Start|'custom'>(()=>detect(value)),[mode,setMode]=useState<'seats'|'numbers'>('seats');
 const [picked,setPicked]=useState(-1),[number,setNumber]=useState('');
 const seats=value.cells.filter(n=>n>0).length;
 const apply=(l:SeatLayout)=>onChange(order==='custom'?l:renumber(l,order));
 function cell(i:number){
  if(mode==='numbers'){if(value.cells[i]>0){setPicked(i);setNumber(String(value.cells[i]));}return;}
  const cells=value.cells.slice(),max=Math.max(0,...cells);
  cells[i]=cells[i]>0?0:max+1;
  apply({...value,cells});
 }
 function setSeatNumber(){
  const n=Number(number);if(picked<0||!Number.isInteger(n)||n<1||n>999)return;
  // Typing a number that another seat has swaps the two seats' numbers.
  const cells=value.cells.slice(),other=cells.indexOf(n);
  if(other>=0&&other!==picked)cells[other]=cells[picked];
  cells[picked]=n;setOrder('custom');onChange({...value,cells});setPicked(-1);
 }
 const grow=(dr:number,dc:number)=>{const rows=Math.min(MAX_ROWS,Math.max(1,value.rows+dr)),cols=Math.min(MAX_COLS,Math.max(1,value.cols+dc));apply(resize(value,rows,cols));};
 return <div className="op-seats">
  <fieldset className="op-seats-start">
   <legend>Start from a layout</legend>
   <label>Seats<input type="number" min={1} max={200} value={count} onChange={e=>setCount(e.target.value)}/></label>
   <label>Seats per row<select value={per} onChange={e=>setPer(Number(e.target.value))}>{TEMPLATES.map(t=><option key={t.per} value={t.per}>{t.label}</option>)}</select></label>
   <button type="button" onClick={()=>{const n=Math.max(1,Math.min(200,Number(count)||1)),o=order==='custom'?'back-right':order;setOrder(o);setPicked(-1);onChange(renumber(defaultLayout(n,per),o));}}>Draw this layout</button>
  </fieldset>
  <div className="op-seats-tools">
   <span>Rows <button type="button" aria-label="Remove front row" onClick={()=>grow(-1,0)} disabled={value.rows<=1}><Minus/></button><b>{value.rows}</b><button type="button" aria-label="Add a row at the front" onClick={()=>grow(1,0)} disabled={value.rows>=MAX_ROWS}><Plus/></button></span>
   <span>Columns <button type="button" aria-label="Remove right column" onClick={()=>grow(0,-1)} disabled={value.cols<=1}><Minus/></button><b>{value.cols}</b><button type="button" aria-label="Add a column on the right" onClick={()=>grow(0,1)} disabled={value.cols>=MAX_COLS}><Plus/></button></span>
   <label>Seat 1 is at<select value={order} onChange={e=>{const o=e.target.value as Start|'custom';setOrder(o);if(o!=='custom')onChange(renumber(value,o));}}>{STARTS.map(s=><option key={s.id} value={s.id}>{s.label}</option>)}<option value="custom">My own numbers</option></select></label>
  </div>
  <div className="op-seats-mode" role="radiogroup" aria-label="What tapping a cell does">
   <button type="button" aria-pressed={mode==='seats'} onClick={()=>{setMode('seats');setPicked(-1);}}>Tap to add or remove seats</button>
   <button type="button" aria-pressed={mode==='numbers'} onClick={()=>setMode('numbers')}>Tap to change a seat number</button>
  </div>
  {mode==='numbers'&&picked>=0&&<div className="op-seats-number">
   <label>Number for the highlighted seat<input autoFocus type="number" min={1} max={999} value={number} onChange={e=>setNumber(e.target.value)} onKeyDown={e=>{if(e.key==='Enter'){e.preventDefault();setSeatNumber();}}}/></label>
   <button type="button" className="op-primary" onClick={setSeatNumber}>Set number</button><button type="button" onClick={()=>setPicked(-1)}>Cancel</button>
  </div>}
  <SeatMap layout={value} onCell={cell} highlight={mode==='numbers'?picked:-1} caption="Seat map editor"/>
  <p className="op-muted"><b>{seats} passenger seats.</b> {mode==='seats'?'Dashed squares are aisles or empty space; tap one to put a seat there.':'Tap a seat, then type the number painted on it. Using a number another seat has swaps them.'}</p>
 </div>;
}
