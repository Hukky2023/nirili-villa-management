'use client';
import {useEffect,useState} from 'react';
import {Plus,Pencil,Trash2,X} from 'lucide-react';
import './property-catalog.css';

const price=(cents:number)=>'$'+(cents/100).toFixed(2);
export default function PropertyCatalog({expanded=false}:{expanded?:boolean}){
 const [open,setOpen]=useState(expanded),[tab,setTab]=useState('Rooms');
 const [data,setData]=useState<any>(null),[editor,setEditor]=useState<any>(null);
 const [rates,setRates]=useState<Record<string,string[]>>({}),[busy,setBusy]=useState(false),[message,setMessage]=useState('');
 const [excursions,setExcursions]=useState<any[]>([]);
 function apply(next:any){setData(next);setRates(Object.fromEntries(Object.entries(next.rates||{}).map(([plan,amounts]:any)=>[plan,amounts.map((amount:number)=>(amount/100).toFixed(2))])));}
 async function load(){try{
  const [response,excursionResponse]=await Promise.all([
   fetch('/api/property-catalog',{cache:'no-store'}),
   fetch('/api/excursion-menu',{cache:'no-store'})
  ]);
  const next:any=await response.json();
  if(!response.ok)throw Error(next.error||'Could not load property records.');
  apply(next);
  if(excursionResponse.ok){
   const excursionData:any=await excursionResponse.json();
   setExcursions(Array.isArray(excursionData.items)?excursionData.items.filter((item:any)=>item.active!==false):[]);
  }
 }catch(error){setMessage((error as Error).message);}}
 useEffect(()=>{if(open)void load();},[open]);
 async function save(body:any){
  if(busy||!data)return;
  setBusy(true);setMessage('');
  try{
   const response=await fetch('/api/property-catalog',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({...body,revision:data.revision})}),next:any=await response.json();
   if(!response.ok){if(response.status===409)await load();throw Error(next.error||'Could not save changes.');}
   apply(next);setEditor(null);setMessage(next.message||'Changes saved.');window.dispatchEvent(new Event('services-updated'));
  }catch(error){setMessage((error as Error).message);}finally{setBusy(false);}
 }
 function editRoom(room?:any){setMessage('');setEditor({kind:'room',originalNumber:room?.number||'',number:room?.number||'',type:room?.type||'Double Room',bed:room?.bed||'King bed',extraBed:room?.extraBed||'',capacity:room?.capacity||3,occupancy:room?.occupancy||''});}
 function editService(service?:any){setMessage('');setEditor({kind:'service',id:service?.id||'',name:service?.name||'',detail:service?.detail||'',price:((service?.cents||0)/100).toFixed(2)});}
 function editPackage(item?:any){setMessage('');setEditor({
  kind:'package',
  id:item?.id||'',
  name:item?.name||'',
  nights:Number(item?.nights)||3,
  mealPlan:item?.mealPlan||'Full Board',
  excursions:Array.isArray(item?.excursions)?item.excursions:[],
  includeTransfer:item?.includeTransfer===true,
  transferLabel:item?.transferLabel||'Return airport transfer',
  price:((item?.cents||0)/100).toFixed(2),
  promotionTitle:item?.promotionTitle||'',
  promotionDetail:item?.promotionDetail||'',
  validFrom:item?.validFrom||'',
  validTo:item?.validTo||'',
  active:item?.active!==false
 });}
 const field=(key:string,value:any)=>setEditor((previous:any)=>({...previous,[key]:value}));
 return <section className="property-catalog">
  <header><div><h2>Rooms, prices & packages</h2><p>Manage rooms, nightly rates, packages and promotions.</p></div><button type="button" aria-expanded={open} onClick={()=>setOpen(!open)}>{open?'Close':'Manage rooms, prices & packages'}</button></header>
  {open&&<>
   <nav aria-label="Property catalog"><div>{['Rooms','Room prices','Packages & Promotions'].map(name=><button key={name} type="button" aria-pressed={tab===name} onClick={()=>setTab(name)}>{name}</button>)}</div><button type="button" disabled={busy} onClick={()=>void load()}>Reload</button></nav>
   {message&&<p className="catalog-message" role="status">{message}</p>}
   {!data?<p>Loading property records…</p>:<>
    {tab==='Rooms'&&<><div className="catalog-heading"><span>{data.rooms.length} rooms</span><button type="button" onClick={()=>editRoom()}><Plus size={16}/> Add room</button></div><div className="catalog-items">{data.rooms.map((room:any)=><article key={room.number}><div><strong>Room {room.number} · {room.type}</strong><p>{room.bed}{room.extraBed?' · '+room.extraBed:''}</p><small>{room.occupancy} · {room.status}</small></div><div className="catalog-actions"><button type="button" onClick={()=>editRoom(room)} aria-label={'Edit room '+room.number}><Pencil size={16}/> Edit</button><button type="button" disabled={busy} aria-label={'Remove room '+room.number} onClick={()=>{if(window.confirm('Remove room '+room.number+' from the room inventory? Past bookings and bills will be kept.'))void save({action:'remove-room',number:room.number});}}><Trash2 size={16}/> Remove</button></div></article>)}</div><p className="catalog-help">Move or close active bookings before removing a room. Past bookings and bills are retained.</p></>}
    {tab==='Room prices'&&<form onSubmit={event=>{event.preventDefault();void save({action:'save-rates',rates:Object.fromEntries(Object.entries(rates).map(([plan,amounts])=>[plan,amounts.map(amount=>Math.round(Number(amount)*100))]))});}}><p className="catalog-help">USD per room, per night. These prices apply to new bookings and quotes. Existing confirmed bookings keep their agreed charges.</p><div className="catalog-rate-grid">{Object.entries(rates).map(([plan,amounts])=><fieldset key={plan}><legend>{plan}</legend>{amounts.map((amount,index)=><label key={index}>{index+1} guest{index?'s':''}<input required type="number" min="0" max="10000" step="0.01" value={amount} onChange={event=>setRates(previous=>({...previous,[plan]:previous[plan].map((value,i)=>i===index?event.target.value:value)}))}/></label>)}</fieldset>)}</div><button className="catalog-save" type="submit" disabled={busy}>{busy?'Saving…':'Save room prices'}</button></form>}
    {tab==='Packages & Promotions'&&<><div className="catalog-heading"><span>{(data.packages||[]).length} packages & promotions</span><button type="button" onClick={()=>editPackage()}><Plus size={16}/> Create package</button></div><div className="catalog-items package-items">{(data.packages||[]).map((item:any)=><article key={item.id}><div><strong>{item.name}</strong><p>{item.nights} nights / {item.days||item.nights+1} days · {item.mealPlan}</p><p>{Array.isArray(item.excursions)&&item.excursions.length?item.excursions.map((id:string)=>excursions.find((x:any)=>x.id===id)?.name||id).join(' · '):'No excursions included'}</p><small>{item.includeTransfer?(item.transferLabel||'Return airport transfer'):'Transfer not included'} · {item.active!==false?'Active':'Inactive'}</small>{item.promotionTitle&&<p><b>{item.promotionTitle}</b>{item.promotionDetail?' · '+item.promotionDetail:''}</p>}<b>{price(item.cents)}</b>{(item.validFrom||item.validTo)&&<p>Valid {item.validFrom||'now'} → {item.validTo||'open'}</p>}</div><div className="catalog-actions"><button type="button" onClick={()=>editPackage(item)}><Pencil size={16}/> Edit</button><button type="button" disabled={busy} onClick={()=>{if(window.confirm('Remove package '+item.name+'?'))void save({action:'remove-package',id:item.id});}}><Trash2 size={16}/> Remove</button></div></article>)}</div>{!(data.packages||[]).length&&<p className="catalog-help">No packages yet. Tap Create package to build one by clicking the duration, meal plan, excursions and transfer options.</p>}</>}
   </>}
  </>}
  {editor&&<div className="catalog-overlay"><form className="catalog-dialog" role="dialog" aria-modal="true" aria-labelledby="catalog-editor-title" onSubmit={event=>{event.preventDefault();void save(
 editor.kind==='room'
  ?{action:'save-room',originalNumber:editor.originalNumber,room:editor}
  :editor.kind==='package'
   ?{action:'save-package',id:editor.id,package:{...editor,cents:Math.round(Number(editor.price)*100)}}
   :{action:'save-service',id:editor.id,service:{name:editor.name,detail:editor.detail,cents:Math.round(Number(editor.price)*100)}}
);}}><header><h3 id="catalog-editor-title">{editor.kind==='room'?(editor.originalNumber?'Edit room':'Add room'):editor.kind==='package'?(editor.id?'Edit package':'Create package'):(editor.id?'Edit transfer service':'Add transfer service')}</h3><button type="button" disabled={busy} aria-label="Close editor" onClick={()=>setEditor(null)}><X/></button></header><fieldset disabled={busy}>
   {editor.kind==='room'?<><label>Room number<input required maxLength={12} pattern="[A-Za-z0-9-]+" readOnly={!!editor.originalNumber} value={editor.number} onChange={event=>field('number',event.target.value)}/></label><label>Room type<input required maxLength={80} value={editor.type} onChange={event=>field('type',event.target.value)}/></label><label>Bed<input required maxLength={120} value={editor.bed} onChange={event=>field('bed',event.target.value)}/></label><label>Extra bed<input maxLength={120} value={editor.extraBed} onChange={event=>field('extraBed',event.target.value)}/></label><label>Maximum guests<input required type="number" min={1} max={3} step={1} value={editor.capacity} onChange={event=>field('capacity',Number(event.target.value))}/></label><label>Occupancy description<input maxLength={200} value={editor.occupancy} onChange={event=>field('occupancy',event.target.value)}/></label></>
   :editor.kind==='package'?<div className="package-builder">
    <label>Package name<input required maxLength={160} value={editor.name} onChange={event=>field('name',event.target.value)} placeholder="Example: 4N/5D Maldives Adventure"/></label>
    <section><strong>Duration</strong><p className="catalog-help">Tap the number of nights. Days are calculated automatically.</p><div className="choice-grid duration-grid">{Array.from({length:14},(_,i)=>i+1).map(n=><button key={n} type="button" aria-pressed={editor.nights===n} onClick={()=>field('nights',n)}>{n}N / {n+1}D</button>)}</div></section>
    <section><strong>Meal plan</strong><div className="choice-grid meal-grid">{['Bed & Breakfast','Half Board','Full Board'].map(plan=><button key={plan} type="button" aria-pressed={editor.mealPlan===plan} onClick={()=>field('mealPlan',plan)}>{plan}</button>)}</div></section>
    <section><strong>Excursions included</strong><p className="catalog-help">Tap any excursions to include or remove them from this package.</p><div className="choice-grid excursion-choice-grid">{excursions.map((item:any)=>{const selected=editor.excursions.includes(item.id);return <button key={item.id} type="button" aria-pressed={selected} onClick={()=>field('excursions',selected?editor.excursions.filter((id:string)=>id!==item.id):[...editor.excursions,item.id])}>{selected?'✓ ':''}{item.name}</button>})}</div></section>
    <section><strong>Transfer</strong><div className="choice-grid transfer-choice-grid"><button type="button" aria-pressed={editor.includeTransfer===true} onClick={()=>field('includeTransfer',true)}>✓ Include return transfer</button><button type="button" aria-pressed={editor.includeTransfer===false} onClick={()=>field('includeTransfer',false)}>No transfer</button></div>{editor.includeTransfer&&<label>Transfer description<input maxLength={120} value={editor.transferLabel} onChange={event=>field('transferLabel',event.target.value)} placeholder="Return airport transfer"/></label>}</section>
    <label>Package price (USD)<input required type="number" min={0} max={100000} step="0.01" value={editor.price} onChange={event=>field('price',event.target.value)}/></label>
    <div className="package-date-grid"><label>Valid from<input type="date" value={editor.validFrom} onChange={event=>field('validFrom',event.target.value)}/></label><label>Valid until<input type="date" value={editor.validTo} onChange={event=>field('validTo',event.target.value)}/></label></div>
    <label>Promotion heading<input maxLength={160} value={editor.promotionTitle} onChange={event=>field('promotionTitle',event.target.value)} placeholder="Example: Stay • Play • Save"/></label>
    <label>Promotion details<textarea rows={4} maxLength={2000} value={editor.promotionDetail} onChange={event=>field('promotionDetail',event.target.value)} placeholder="Describe the promotion, inclusions, free extras or conditions."/></label>
    <section><strong>Status</strong><div className="choice-grid status-choice-grid"><button type="button" aria-pressed={editor.active===true} onClick={()=>field('active',true)}>Active</button><button type="button" aria-pressed={editor.active===false} onClick={()=>field('active',false)}>Inactive</button></div></section>
   </div>
   :<><label>Service name<input required maxLength={120} value={editor.name} onChange={event=>field('name',event.target.value)}/></label><label>Price per guest (USD)<input required type="number" min={0} max={10000} step="0.01" value={editor.price} onChange={event=>field('price',event.target.value)}/></label><label>Description<textarea rows={4} maxLength={1000} value={editor.detail} onChange={event=>field('detail',event.target.value)}/></label></>}
   </fieldset>{message&&<p role="status">{message}</p>}<footer><button type="button" disabled={busy} onClick={()=>setEditor(null)}>Cancel</button><button className="catalog-save" disabled={busy} type="submit">{busy?'Saving…':'Save changes'}</button></footer></form></div>}
 </section>;
}
