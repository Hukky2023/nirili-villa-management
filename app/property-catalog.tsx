'use client';
import {useEffect,useState} from 'react';
import {Eye,ImagePlus,Plus,Pencil,Trash2,X} from 'lucide-react';
import './property-catalog.css';

const price=(cents:number)=>'$'+(cents/100).toFixed(2);
const roomAmenityOptions=[
 'Air conditioning','Free Wi-Fi','Smart TV','Mini fridge','Electric kettle','Safe','Beach towels',
 'Hair dryer','Hot water','Towels','Toiletries','Wardrobe','Desk','Balcony',
 'Sea view','Iron','Extra bed','Daily housekeeping','Snorkeling equipment'
];

async function uploadCatalogPhoto(file:File){
 if(!['image/jpeg','image/png','image/webp'].includes(file.type)||file.size>15000000)throw Error('Choose a JPG, PNG or WebP photo under 15 MB.');
 const local=URL.createObjectURL(file);
 try{
  const img=new Image();
  await new Promise<void>((resolve,reject)=>{img.onload=()=>resolve();img.onerror=()=>reject(Error('Cannot read this photo.'));img.src=local;});
  const maxSide=1200,scale=Math.min(1,maxSide/Math.max(img.naturalWidth,img.naturalHeight));
  const canvas=document.createElement('canvas');
  canvas.width=Math.max(1,Math.round(img.naturalWidth*scale));
  canvas.height=Math.max(1,Math.round(img.naturalHeight*scale));
  const ctx=canvas.getContext('2d');
  if(!ctx)throw Error('Cannot prepare this photo.');
  ctx.fillStyle='#fff';ctx.fillRect(0,0,canvas.width,canvas.height);ctx.drawImage(img,0,0,canvas.width,canvas.height);
  let quality=.82,blob:Blob|null=null;
  for(let attempt=0;attempt<6;attempt++){blob=await new Promise<Blob|null>(resolve=>canvas.toBlob(resolve,'image/jpeg',quality));if(blob&&blob.size<=500000)break;quality-=.1;}
  if(!blob)throw Error('Photo upload failed.');
  const response=await fetch('/api/menu-images',{method:'POST',headers:{'Content-Type':'image/jpeg'},body:blob});
  const result=await response.json();
  if(!response.ok||!result.url)throw Error(result.error||'Photo upload failed.');
  return String(result.url);
 }finally{URL.revokeObjectURL(local);}
}

function CatalogPhotoField({label,value,onChange,onBusy}:{label:string;value:string;onChange:(value:string)=>void;onBusy:(busy:boolean)=>void}){
 const [error,setError]=useState(''),[uploading,setUploading]=useState(false);
 async function choose(files:FileList|null){
  const file=files?.[0];if(!file)return;
  setError('');setUploading(true);onBusy(true);
  try{onChange(await uploadCatalogPhoto(file));}catch(e){setError(e instanceof Error?e.message:'Photo upload failed.');}
  finally{setUploading(false);onBusy(false);}
 }
 return <div className="catalog-photo-field">
  <div className="catalog-photo-label"><strong>{label}</strong><small>JPG, PNG or WebP. Recommended 1200 × 1200 px.</small></div>
  {value&&<div className="catalog-photo-preview"><img src={value} alt={label}/><button type="button" onClick={()=>onChange('')}>Remove</button></div>}
  <label className="catalog-photo-upload"><ImagePlus size={18}/><span>{uploading?'Uploading…':value?'Replace photo':'Upload photo'}</span><input type="file" accept="image/jpeg,image/png,image/webp" disabled={uploading} onChange={e=>{void choose(e.target.files);e.target.value='';}}/></label>
  {error&&<small className="catalog-photo-error">{error}</small>}
 </div>;
}

export default function PropertyCatalog({expanded=false}:{expanded?:boolean}){
 const [open,setOpen]=useState(expanded),[tab,setTab]=useState('Rooms');
 const [data,setData]=useState<any>(null),[editor,setEditor]=useState<any>(null),[viewer,setViewer]=useState<any>(null);
 const [rates,setRates]=useState<Record<string,string[]>>({}),[periodFrom,setPeriodFrom]=useState(''),[periodTo,setPeriodTo]=useState(''),[periodDirection,setPeriodDirection]=useState<'increase'|'decrease'>('increase'),[periodPercent,setPeriodPercent]=useState('20'),[busy,setBusy]=useState(false),[message,setMessage]=useState('');
 const [excursions,setExcursions]=useState<any[]>([]);
 function apply(next:any){setData(next);const formatted=Object.fromEntries(Object.entries(next.rates||{}).map(([plan,amounts]:any)=>[plan,amounts.map((amount:number)=>(amount/100).toFixed(2))]));setRates(formatted);}
 async function load(){try{
  const [response,excursionResponse]=await Promise.all([fetch('/api/property-catalog',{cache:'no-store'}),fetch('/api/excursion-menu',{cache:'no-store'})]);
  const next:any=await response.json();
  if(!response.ok)throw Error(next.error||'Could not load property records.');
  apply(next);
  if(excursionResponse.ok){const excursionData:any=await excursionResponse.json();setExcursions(Array.isArray(excursionData.items)?excursionData.items.filter((item:any)=>item.active!==false):[]);}
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
 function editRoom(room?:any){setMessage('');setEditor({kind:'room',originalNumber:room?.number||'',number:room?.number||'',type:room?.type||'Double Room',bed:room?.bed||'King bed',extraBed:room?.extraBed||'',capacity:room?.capacity||3,occupancy:room?.occupancy||'',room360Photo:room?.room360Photo||'',toilet360Photo:room?.toilet360Photo||''});}
 function editPackage(item?:any){setMessage('');setEditor({kind:'package',id:item?.id||'',name:item?.name||'',nights:Number(item?.nights)||3,mealPlan:item?.mealPlan||'Full Board',excursions:Array.isArray(item?.excursions)?item.excursions:[],includeTransfer:item?.includeTransfer===true,transferLabel:item?.transferLabel||'Return airport transfer',singlePrice:((item?.singleCents??item?.cents??0)/100).toFixed(2),doublePrice:((item?.doubleCents??item?.cents??0)/100).toFixed(2),triplePrice:((item?.tripleCents??item?.cents??0)/100).toFixed(2),childPolicy:item?.childPolicy||'Maximum 3 guests per room. 1 adult + up to 2 children, or 2 adults + 1 child. Children are included within the 3-person room capacity.',roomPhoto:item?.roomPhoto||'',excursionPhoto:item?.excursionPhoto||'',youtubeUrl:item?.youtubeUrl||'',active:item?.active!==false});}
 function editPromotion(item?:any){setMessage('');setEditor({kind:'promotion',id:item?.id||'',name:item?.name||'',detail:item?.detail||'',packageIds:Array.isArray(item?.packageIds)?item.packageIds:[],roomTypes:Array.isArray(item?.roomTypes)?item.roomTypes:[],mealPlans:Array.isArray(item?.mealPlans)?item.mealPlans:(Array.isArray(item?.roomTypes)&&item.roomTypes.length?['Bed & Breakfast','Half Board','Full Board']:[]),validFrom:item?.validFrom||'',validTo:item?.validTo||'',active:item?.active!==false});}
 const field=(key:string,value:any)=>setEditor((previous:any)=>({...previous,[key]:value}));
 const excursionName=(id:string)=>excursions.find((x:any)=>x.id===id)?.name||id;

 return <section className="property-catalog">
  <header><div><h2>Rooms, prices & packages</h2><p>Manage rooms, nightly rates, packages and promotions.</p></div><button type="button" aria-expanded={open} onClick={()=>setOpen(!open)}>{open?'Close':'Manage rooms, prices & packages'}</button></header>
  {open&&<>
   <nav aria-label="Property catalog"><div>{['Rooms','Room prices','Packages','Promotions'].map(name=><button key={name} type="button" aria-pressed={tab===name} onClick={()=>setTab(name)}>{name}</button>)}</div></nav>
   {message&&<p className="catalog-message" role="status">{message}</p>}
   {!data?<p>Loading property records…</p>:<>
    {tab==='Rooms'&&<><div className="catalog-heading"><span>{data.rooms.length} rooms</span><button type="button" onClick={()=>editRoom()}><Plus size={16}/> Add room</button></div><div className="catalog-items">{data.rooms.map((room:any)=><article key={room.number}><div><strong>Room {room.number} · {room.type}</strong><p>{room.bed}{room.extraBed?' · '+room.extraBed:''}</p><small>{room.occupancy} · {room.status}</small></div><div className="catalog-actions"><button type="button" onClick={()=>editRoom(room)}><Pencil size={16}/> Edit</button><button type="button" disabled={busy} onClick={()=>{if(window.confirm('Remove room '+room.number+' from the room inventory?'))void save({action:'remove-room',number:room.number});}}><Trash2 size={16}/> Remove</button></div></article>)}</div></>}
    {tab==='Room prices'&&<div className="catalog-room-prices">
      <form onSubmit={event=>{event.preventDefault();void save({action:'save-rates',rates:Object.fromEntries(Object.entries(rates).map(([plan,amounts])=>[plan,amounts.map(amount=>Math.round(Number(amount)*100))]))});}}>
       <div className="catalog-section-heading"><div><strong>Standard room prices</strong><p className="catalog-help">Default USD price per room, per night when no special period applies.</p></div></div>
       <div className="catalog-rate-grid">{Object.entries(rates).map(([plan,amounts])=><fieldset key={plan}><legend>{plan}</legend>{amounts.map((amount,index)=><label key={index}>{index+1} guest{index?'s':''}<input required type="number" min="0" max="10000" step="0.01" value={amount} onChange={event=>setRates(previous=>({...previous,[plan]:previous[plan].map((value,i)=>i===index?event.target.value:value)}))}/></label>)}</fieldset>)}</div>
       <button className="catalog-save" type="submit" disabled={busy}>{busy?'Saving…':'Save standard prices'}</button>
      </form>
      <form className="catalog-period-pricing" onSubmit={event=>{event.preventDefault();const pct=Math.max(0,Number(periodPercent)||0)*(periodDirection==='decrease'?-1:1);void save({action:'save-rate-period',validFrom:periodFrom,validTo:periodTo,adjustmentPercent:pct});}}>
       <div className="catalog-section-heading"><div><strong>Seasonal price by percentage</strong><p className="catalog-help">Keep the standard prices above. Choose a period and apply one percentage to every room price automatically.</p></div></div>
       <div className="catalog-period-dates"><label>From date<input required type="date" value={periodFrom} onChange={event=>setPeriodFrom(event.target.value)}/></label><label>To date<input required type="date" min={periodFrom||undefined} value={periodTo} onChange={event=>setPeriodTo(event.target.value)}/></label></div>
       <div className="catalog-seasonal-adjustment">
        <label>Adjustment<select value={periodDirection} onChange={event=>setPeriodDirection(event.target.value as 'increase'|'decrease')}><option value="increase">Increase price</option><option value="decrease">Decrease price</option></select></label>
        <label>Percentage<input required type="number" min="0" max={periodDirection==='decrease'?100:1000} step="0.1" value={periodPercent} onChange={event=>setPeriodPercent(event.target.value)}/><span>%</span></label>
       </div>
       <div className="catalog-seasonal-preview"><strong>Automatically calculated seasonal prices</strong><div className="catalog-rate-grid">{Object.entries(rates).map(([plan,amounts])=><fieldset key={plan}><legend>{plan}</legend>{amounts.map((amount,index)=>{const normal=Number(amount)||0,pct=Math.max(0,Number(periodPercent)||0),factor=periodDirection==='decrease'?Math.max(0,1-pct/100):1+pct/100,seasonal=normal*factor;return <label key={index}>{index+1} guest{index?'s':''}<div className="catalog-calculated-price"><small>{'$'+normal.toFixed(2)}</small><b>→ {'$'+seasonal.toFixed(2)}</b></div></label>})}</fieldset>)}</div></div>
       <button className="catalog-save" type="submit" disabled={busy||!periodFrom||!periodTo||!periodPercent}>{busy?'Saving…':'Save seasonal percentage'}</button>
      </form>
      <section className="catalog-rate-period-list">
       <div className="catalog-section-heading"><div><strong>Saved price periods</strong><p className="catalog-help">These percentages adjust the standard room prices for their selected dates.</p></div></div>
       {!(data.ratePeriods||[]).length?<p className="catalog-help">No seasonal price periods saved.</p>:(data.ratePeriods||[]).map((item:any)=>{const pct=Number(item.adjustmentPercent);return <article key={item.id}><div><strong>{item.validFrom} → {item.validTo}</strong>{Number.isFinite(pct)?<><p className="catalog-seasonal-percent">{pct>=0?'Increase':'Decrease'} <b>{Math.abs(pct)}%</b></p><div className="catalog-rate-period-summary">{Object.entries(rates).map(([plan,amounts])=><span key={plan}><b>{plan}</b> · {amounts.map((amount,index)=>{const calculated=(Number(amount)||0)*Math.max(0,1+pct/100);return (index+1)+' guest'+(index?'s':'')+' $'+calculated.toFixed(2)}).join(' · ')}</span>)}</div></>:<div className="catalog-rate-period-summary">{Object.entries(item.rates||{}).map(([plan,amounts]:any)=><span key={plan}><b>{plan}</b> · 1 guest {price(amounts[0]||0)} · 2 guests {price(amounts[1]||0)} · 3 guests {price(amounts[2]||0)}</span>)}</div>}</div><button type="button" disabled={busy} onClick={()=>{if(window.confirm('Remove prices for '+item.validFrom+' to '+item.validTo+'?'))void save({action:'remove-rate-period',id:item.id});}}><Trash2 size={16}/> Remove</button></article>})}
      </section>
     </div>}
    {tab==='Packages'&&<><div className="catalog-heading"><span>{(data.packages||[]).length} packages</span><button type="button" onClick={()=>editPackage()}><Plus size={16}/> Create package</button></div><div className="catalog-items package-items">{(data.packages||[]).map((item:any)=><article key={item.id}><div><strong>{item.name}</strong><p>{item.nights} nights / {item.days||item.nights+1} days · {item.mealPlan}</p><p>{Array.isArray(item.excursions)&&item.excursions.length?item.excursions.map(excursionName).join(' · '):'No excursions included'}</p><small>{item.includeTransfer?(item.transferLabel||'Return airport transfer'):'Transfer not included'} · {item.active!==false?'Active':'Inactive'}</small><div className="package-price-summary"><b>Single {price(item.singleCents??item.cents??0)} pp</b><b>Double {price(item.doubleCents??item.cents??0)} pp</b><b>Triple {price(item.tripleCents??item.cents??0)} pp</b></div></div><div className="catalog-actions"><button type="button" onClick={()=>setViewer(item)}><Eye size={16}/> View details</button><button type="button" onClick={()=>editPackage(item)}><Pencil size={16}/> Edit</button><button type="button" disabled={busy} onClick={()=>{if(window.confirm('Remove package '+item.name+'?'))void save({action:'remove-package',id:item.id});}}><Trash2 size={16}/> Remove</button></div></article>)}</div></>}
    {tab==='Promotions'&&<><div className="catalog-heading"><span>{(data.promotions||[]).length} promotions</span><button type="button" onClick={()=>editPromotion()}><Plus size={16}/> Create promotion</button></div><div className="catalog-items package-items">{(data.promotions||[]).map((item:any)=><article key={item.id}><div><strong>{item.name}</strong><p>{item.detail||'No promotion details.'}</p><small>{item.packageIds?.length?'Packages: '+item.packageIds.length:''}{item.packageIds?.length&&item.roomTypes?.length?' · ':''}{item.roomTypes?.length?'Rooms: '+item.roomTypes.join(', ')+(item.mealPlans?.length?' · Meals: '+item.mealPlans.join(', '):''):''}</small><small>Applies {item.validFrom} → {item.validTo} · {item.active!==false?'Active':'Inactive'}</small></div><div className="catalog-actions"><button type="button" onClick={()=>editPromotion(item)}><Pencil size={16}/> Edit</button><button type="button" disabled={busy} onClick={()=>{if(window.confirm('Remove promotion '+item.name+'?'))void save({action:'remove-promotion',id:item.id});}}><Trash2 size={16}/> Remove</button></div></article>)}</div></>}
   </>}
  </>}

  {viewer&&<div className="catalog-overlay" onMouseDown={e=>{if(e.currentTarget===e.target)setViewer(null)}}><section className="catalog-dialog package-view-dialog" role="dialog" aria-modal="true" aria-labelledby="package-view-title">
   <header><div><small>PACKAGE DETAILS</small><h3 id="package-view-title">{viewer.name}</h3></div><button type="button" aria-label="Close details" onClick={()=>setViewer(null)}><X/></button></header>
   <div className="package-view-media">{viewer.roomPhoto&&<figure><img src={viewer.roomPhoto} alt="Room"/><figcaption>Room photo</figcaption></figure>}{viewer.excursionPhoto&&<figure><img src={viewer.excursionPhoto} alt="Excursion"/><figcaption>Excursion photo</figcaption></figure>}</div>
   <div className="package-view-grid"><p><b>Duration</b><span>{viewer.nights} nights / {viewer.days||viewer.nights+1} days</span></p><p><b>Meal plan</b><span>{viewer.mealPlan}</span></p><p><b>Transfer</b><span>{viewer.includeTransfer?(viewer.transferLabel||'Return airport transfer'):'Not included'}</span></p><p><b>Status</b><span>{viewer.active!==false?'Active':'Inactive'}</span></p></div>
   <section className="package-view-section"><strong>Excursions included</strong>{viewer.excursions?.length?<ul>{viewer.excursions.map((id:string)=><li key={id}>{excursionName(id)}</li>)}</ul>:<p>No excursions included.</p>}</section>
   <section className="package-view-section"><strong>Package prices</strong><div className="package-price-summary"><b>Single {price(viewer.singleCents??viewer.cents??0)} pp</b><b>Double {price(viewer.doubleCents??viewer.cents??0)} pp</b><b>Triple {price(viewer.tripleCents??viewer.cents??0)} pp</b></div></section>
   {viewer.childPolicy&&<section className="package-view-section"><strong>Child policy</strong><p>{viewer.childPolicy}</p></section>}
   {viewer.youtubeUrl&&<a className="package-view-youtube" href={viewer.youtubeUrl} target="_blank" rel="noopener noreferrer">Open YouTube video</a>}
   <footer><button type="button" onClick={()=>{setViewer(null);editPackage(viewer)}}><Pencil size={16}/> Edit package</button><button type="button" onClick={()=>setViewer(null)}>Close</button></footer>
  </section></div>}

  {editor&&<div className="catalog-overlay"><form className="catalog-dialog" role="dialog" aria-modal="true" aria-labelledby="catalog-editor-title" onSubmit={event=>{event.preventDefault();void save(
   editor.kind==='room'?{action:'save-room',originalNumber:editor.originalNumber,room:editor}:
   editor.kind==='package'?{action:'save-package',id:editor.id,package:{...editor,singleCents:Math.round(Number(editor.singlePrice)*100),doubleCents:Math.round(Number(editor.doublePrice)*100),tripleCents:Math.round(Number(editor.triplePrice)*100)}}:
   editor.kind==='promotion'?{action:'save-promotion',id:editor.id,promotion:editor}:{}
  );}}><header><h3 id="catalog-editor-title">{editor.kind==='room'?(editor.originalNumber?'Edit room':'Add room'):editor.kind==='package'?(editor.id?'Edit package':'Create package'):(editor.id?'Edit promotion':'Create promotion')}</h3><button type="button" disabled={busy} onClick={()=>setEditor(null)}><X/></button></header><fieldset disabled={busy}>
   {editor.kind==='room'?<><label>Room number<input required maxLength={12} pattern="[A-Za-z0-9-]+" readOnly={!!editor.originalNumber} value={editor.number} onChange={event=>field('number',event.target.value)}/></label><label>Room type<input required maxLength={80} value={editor.type} onChange={event=>field('type',event.target.value)}/></label><label>Bed<input required maxLength={120} value={editor.bed} onChange={event=>field('bed',event.target.value)}/></label><label>Extra bed<input maxLength={120} value={editor.extraBed} onChange={event=>field('extraBed',event.target.value)}/></label><label>Maximum guests<input required type="number" min={1} max={3} value={editor.capacity} onChange={event=>field('capacity',Number(event.target.value))}/></label><label>Occupancy description<input maxLength={200} value={editor.occupancy} onChange={event=>field('occupancy',event.target.value)}/></label><div className="room-360-grid"><CatalogPhotoField label="Room 360 photo" value={editor.room360Photo} onChange={value=>field('room360Photo',value)} onBusy={setBusy}/><CatalogPhotoField label="Toilet 360 photo" value={editor.toilet360Photo} onChange={value=>field('toilet360Photo',value)} onBusy={setBusy}/></div></>
   :editor.kind==='package'?<div className="package-builder">
    <label>Package name<input required maxLength={160} value={editor.name} onChange={event=>field('name',event.target.value)}/></label>
    <section><strong>Duration</strong><div className="choice-grid duration-grid">{Array.from({length:14},(_,i)=>i+1).map(n=><button key={n} type="button" aria-pressed={editor.nights===n} onClick={()=>field('nights',n)}>{n}N / {n+1}D</button>)}</div></section>
    <section><strong>Meal plan</strong><div className="choice-grid meal-grid">{['Bed & Breakfast','Half Board','Full Board'].map(plan=><button key={plan} type="button" aria-pressed={editor.mealPlan===plan} onClick={()=>field('mealPlan',plan)}>{plan}</button>)}</div></section>
    <section><strong>Excursions included</strong><div className="choice-grid excursion-choice-grid">{excursions.map((item:any)=>{const selected=editor.excursions.includes(item.id);return <button key={item.id} type="button" aria-pressed={selected} onClick={()=>field('excursions',selected?editor.excursions.filter((id:string)=>id!==item.id):[...editor.excursions,item.id])}>{selected?'✓ ':''}{item.name}</button>})}</div></section>
    <section><strong>Transfer</strong><div className="choice-grid transfer-choice-grid"><button type="button" aria-pressed={editor.includeTransfer===true} onClick={()=>field('includeTransfer',true)}>✓ Include return transfer</button><button type="button" aria-pressed={editor.includeTransfer===false} onClick={()=>field('includeTransfer',false)}>No transfer</button></div>{editor.includeTransfer&&<label>Transfer description<input maxLength={120} value={editor.transferLabel} onChange={event=>field('transferLabel',event.target.value)}/></label>}</section>
    <section className="package-pricing"><strong>Package price per person (USD)</strong><p className="catalog-help">Booking total = occupancy rate × number of guests.</p><div className="package-price-grid"><label>Single person<input required type="number" min={0} max={100000} step="0.01" value={editor.singlePrice} onChange={event=>field('singlePrice',event.target.value)}/></label><label>Double person<input required type="number" min={0} max={100000} step="0.01" value={editor.doublePrice} onChange={event=>field('doublePrice',event.target.value)}/></label><label>Triple person<input required type="number" min={0} max={100000} step="0.01" value={editor.triplePrice} onChange={event=>field('triplePrice',event.target.value)}/></label></div></section>
    <section className="package-child-policy"><strong>Child policy</strong><p>Maximum 3 guests per room. <b>1 adult + up to 2 children</b>, or <b>2 adults + 1 child</b>.</p></section>
    <section className="package-media"><strong>Package media</strong><div className="package-media-grid"><CatalogPhotoField label="Room photo" value={editor.roomPhoto} onChange={value=>field('roomPhoto',value)} onBusy={setBusy}/><CatalogPhotoField label="Excursion photo" value={editor.excursionPhoto} onChange={value=>field('excursionPhoto',value)} onBusy={setBusy}/></div><label>YouTube link<input type="url" maxLength={500} value={editor.youtubeUrl} onChange={event=>field('youtubeUrl',event.target.value)} placeholder="https://www.youtube.com/watch?v=…"/></label></section>
    <section><strong>Status</strong><div className="choice-grid status-choice-grid"><button type="button" aria-pressed={editor.active===true} onClick={()=>field('active',true)}>Active</button><button type="button" aria-pressed={editor.active===false} onClick={()=>field('active',false)}>Inactive</button></div></section>
   </div>
   :<div className="package-builder promotion-builder"><label>Promotion name<input required maxLength={160} value={editor.name} onChange={event=>field('name',event.target.value)}/></label><label>Promotion details<textarea rows={4} maxLength={2000} value={editor.detail} onChange={event=>field('detail',event.target.value)}/></label><section><strong>Packages (optional)</strong><p className="catalog-help">Select packages only when this promotion should apply to a package. You can also create a room-only promotion below.</p><div className="choice-grid promotion-package-grid">{(data.packages||[]).map((item:any)=>{const selected=editor.packageIds.includes(item.id);return <button key={item.id} type="button" aria-pressed={selected} onClick={()=>field('packageIds',selected?editor.packageIds.filter((id:string)=>id!==item.id):[...editor.packageIds,item.id])}>{selected?'✓ ':''}{item.name}</button>})}</div></section><section><strong>Room types</strong><p className="catalog-help">Select the room type(s) for a room-rate promotion.</p><div className="choice-grid promotion-room-grid">{Array.from(new Set((data.rooms||[]).map((room:any)=>room.type))).map((type:any)=>{const selected=editor.roomTypes.includes(type);return <button key={String(type)} type="button" aria-pressed={selected} onClick={()=>{const next=selected?editor.roomTypes.filter((value:string)=>value!==type):[...editor.roomTypes,type];setEditor((previous:any)=>({...previous,roomTypes:next,mealPlans:next.length?previous.mealPlans:[]}));}}>{selected?'✓ ':''}{String(type)}</button>})}</div></section>{editor.roomTypes.length>0&&<section><strong>Meal plans for selected room type(s)</strong><p className="catalog-help">Choose which nightly meal-plan rates receive this promotion.</p><div className="choice-grid meal-grid">{['Bed & Breakfast','Half Board','Full Board'].map((plan:string)=>{const selected=editor.mealPlans.includes(plan);return <button key={plan} type="button" aria-pressed={selected} onClick={()=>field('mealPlans',selected?editor.mealPlans.filter((value:string)=>value!==plan):[...editor.mealPlans,plan])}>{selected?'✓ ':''}{plan}</button>})}</div></section>}<section><strong>Promotion dates</strong><div className="package-date-grid"><label>Apply from<input required type="date" value={editor.validFrom} onChange={event=>field('validFrom',event.target.value)}/></label><label>Apply until<input required type="date" value={editor.validTo} onChange={event=>field('validTo',event.target.value)}/></label></div></section><section><strong>Status</strong><div className="choice-grid status-choice-grid"><button type="button" aria-pressed={editor.active===true} onClick={()=>field('active',true)}>Active</button><button type="button" aria-pressed={editor.active===false} onClick={()=>field('active',false)}>Inactive</button></div></section></div>}
  </fieldset>{message&&<p role="status">{message}</p>}<footer><button type="button" disabled={busy} onClick={()=>setEditor(null)}>Cancel</button><button className="catalog-save" disabled={busy} type="submit">{busy?'Saving…':'Save changes'}</button></footer></form></div>}
 </section>;
}
