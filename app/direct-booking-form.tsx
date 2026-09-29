'use client';
import {UiText,UiField,UiOption} from './ui-language';

import {useEffect,useRef,useState} from 'react';
import {X} from 'lucide-react';
import TimeField24 from './time-field-24';
import './booking-guests.css';
import {islandToday,plans,nightly} from '../lib/guest-catalog';

let passportOcrPromise:Promise<any>|null=null;
function passportOcr(){
 if(typeof window==='undefined')return Promise.reject(new Error('Passport reading is only available in the browser.'));
 const ready=(window as any).Tesseract;
 if(ready?.recognize)return Promise.resolve(ready);
 if(passportOcrPromise)return passportOcrPromise;
 passportOcrPromise=new Promise((resolve,reject)=>{
  const existing=document.querySelector('script[data-nirili-passport-ocr]') as HTMLScriptElement|null;
  const finish=()=>{const api=(window as any).Tesseract;api?.recognize?resolve(api):reject(new Error('Passport name reader could not start.'));};
  if(existing){existing.addEventListener('load',finish,{once:true});existing.addEventListener('error',()=>reject(new Error('Passport name reader could not load.')),{once:true});return;}
  const script=document.createElement('script');
  script.src='https://cdn.jsdelivr.net/npm/tesseract.js@5/dist/tesseract.min.js';
  script.async=true;script.dataset.niriliPassportOcr='1';
  script.onload=finish;script.onerror=()=>reject(new Error('Passport name reader could not load.'));
  document.head.appendChild(script);
 });
 return passportOcrPromise;
}
function passportNameFromText(text:string){
 const lines=String(text||'').toUpperCase().split(/\r?\n/).map(line=>line.replace(/[^A-Z<]/g,'')).filter(Boolean);
 let mrz=lines.find(line=>line.startsWith('P<')&&line.includes('<<'));
 if(!mrz){
  const compact=lines.join('');
  const start=compact.indexOf('P<');
  if(start>=0)mrz=compact.slice(start,start+44);
 }
 if(!mrz||!mrz.includes('<<'))return '';
 const body=mrz.slice(5);
 const [surname='',given='']=body.split('<<',2);
 const clean=(value:string)=>value.replace(/<+/g,' ').replace(/\s+/g,' ').trim();
 const family=clean(surname),first=clean(given);
 return [first,family].filter(Boolean).join(' ').trim();
}

export default function DirectBookingForm({close,onSaved,booking}:{close:()=>void;onSaved:(stay:any)=>void;booking?:any}){
 const [data,setData]=useState<any>(null),[error,setError]=useState(''),[busy,setBusy]=useState(false);
 const [guest,setGuest]=useState(booking?.guest||''),[source,setSource]=useState(booking?.source||'Direct'),[checkIn,setCheckIn]=useState(booking?.checkIn||islandToday()),[checkOut,setCheckOut]=useState(()=>booking?.checkOut||new Date(Date.parse(islandToday())+86400000).toISOString().slice(0,10)),[pax,setPax]=useState(booking?.adults??booking?.pax??1),[children,setChildren]=useState(booking?.children||0),[room,setRoom]=useState(booking?.room||''),[meal,setMeal]=useState(booking?.meal||plans[0]),[rate,setRate]=useState(booking?String((booking.rateCents??Math.round(booking.base/((Date.parse(booking.checkOut)-Date.parse(booking.checkIn))/86400000)))/100):'60');
 const [transportPlan,setTransportPlan]=useState<any>(()=>booking?.transportPlan||{
  arrival:{needTransfer:'later',from:'Velana International Airport',flightNumber:'',flightTime:'',ownTransport:'',dhiffushiArrivalTime:'',buggyRequired:true},
  departure:{needTransfer:'later',destination:'Velana International Airport',flightNumber:'',flightTime:'',ownDepartureTime:'',buggyRequired:true}
 });
 function setTransport(leg:'arrival'|'departure',changes:any){setTransportPlan((old:any)=>({...old,[leg]:{...old[leg],...changes}}));}
 const [guests,setGuests]=useState<any[]>(()=>Array.from({length:booking?.pax||1},(_,i)=>booking?.guests?.[i]||{name:i===0?booking?.guest||'':'',phone:i===0?booking?.whatsapp||'':'',passportId:''})),[uploading,setUploading]=useState(false);
 function changeCounts(adults:number,childCount:number){const nextChildren=Math.min(childCount,3-adults);setGuests(old=>{const adultRows=old.slice(0,pax),childRows=old.slice(pax);return [...Array.from({length:adults},(_,i)=>adultRows[i]||{name:'',phone:'',passportId:''}),...Array.from({length:nextChildren},(_,i)=>childRows[i]||{name:'',phone:'',passportId:''})]});setPax(adults);setChildren(nextChildren);setRoom('');}
 const token=useRef(''),saving=useRef(false);
 function updateGuest(i:number,changes:any){setGuests(old=>old.map((g,n)=>n===i?{...g,...changes}:g));}
 async function photo(i:number,file:File|undefined){if(!file)return;setUploading(true);setError('');try{if(file.size>10000000)throw Error('Choose a photo smaller than 10 MB.');if(!['image/jpeg','image/png','image/webp'].includes(file.type))throw Error('Choose a JPEG, PNG or WebP photo.');const bitmap=await createImageBitmap(file);const scale=Math.min(1,1400/Math.max(bitmap.width,bitmap.height));const canvas=document.createElement('canvas');canvas.width=Math.round(bitmap.width*scale);canvas.height=Math.round(bitmap.height*scale);const ctx=canvas.getContext('2d');if(!ctx)throw Error('Unable to process photo.');ctx.fillStyle='#fff';ctx.fillRect(0,0,canvas.width,canvas.height);ctx.drawImage(bitmap,0,0,canvas.width,canvas.height);bitmap.close();let quality=.85,result=canvas.toDataURL('image/jpeg',quality);while(result.length>330000&&quality>.3){quality-=.1;result=canvas.toDataURL('image/jpeg',quality);}if(result.length>330000)throw Error('This photo is too large. Crop it to the passport page and try again.');updateGuest(i,{photo:result});
 try{
  const tesseract=await passportOcr();
  const recognized=await tesseract.recognize(result,'eng',{logger:()=>{}});
  const detected=passportNameFromText(recognized?.data?.text||'');
  if(detected)updateGuest(i,{photo:result,name:detected});
  else setError('Passport photo saved, but the name could not be read automatically. Please type the name manually.');
 }catch{
  setError('Passport photo saved, but automatic name reading is unavailable. Please type the name manually.');
 }
}catch(e){setError((e as Error).message);}finally{setUploading(false);}}
 async function refresh(){const r=await fetch('/api/stays',{cache:'no-store'});const d=await r.json();if(!r.ok)throw Error(d.error||'Could not load room availability.');setData(d);return d;}
 useEffect(()=>{token.current=crypto.randomUUID();refresh().catch(e=>setError(e.message));},[]);
 useEffect(()=>{if(!booking&&data)setRate((nightly(meal,pax+children,data.roomRates)/100).toFixed(2));},[meal,pax,children,data?.roomRates,!!data,booking]);
 const closed=(data?.bookingClosures||[]).some((c:any)=>c.start<checkOut&&c.endExclusive>checkIn)&&!(booking&&checkIn===booking.checkIn&&checkOut===booking.checkOut);
 const available=closed?[]:(data?.rooms||[]).filter((r:any)=>r.status!=='Maintenance'&&pax+children<=r.capacity&&!data.stays.some((s:any)=>s.id!==booking?.id&&s.room===r.number&&s.status!=='Checked Out'&&s.checkIn<checkOut&&s.checkOut>checkIn));
 const nights=Math.max(0,(Date.parse(checkOut)-Date.parse(checkIn))/86400000)||0;
 async function submit(e:React.FormEvent){e.preventDefault();if(saving.current||uploading||!data)return;saving.current=true;setBusy(true);setError('');try{const r=await fetch('/api/stays',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:booking?'editbooking':'create',id:booking?.id,requestId:token.current,revision:booking?booking.editRevision:data.revision,guest:guests[0]?.name||guest,guests:guests.slice(0,pax+children).map(({preview,...g},i)=>({...g,kind:i<pax?'adult':'child',phone:i<pax?g.phone:''})),source,checkIn,checkOut,pax:pax+children,adults:pax,children,room,meal,transportPlan:{arrival:{...transportPlan.arrival,date:checkIn},departure:{...transportPlan.departure,date:checkOut}},rateCents:Math.round(Number(rate)*100)})});const d=await r.json();if(!r.ok){if(r.status===409)await refresh();throw Error(d.error||'Could not save booking.');}window.dispatchEvent(new Event('services-updated'));onSaved(d.booking);}catch(e){setError((e as Error).message);}finally{saving.current=false;setBusy(false);}}
 return <div className="backdrop" style={{zIndex:10001}}><form className="modal direct-booking-dialog" role="dialog" aria-modal="true" aria-labelledby="direct-booking-title" onSubmit={submit}><header><div><small><UiText>{booking?booking.id:"NEW RESERVATION"}</UiText></small><h2 id="direct-booking-title"><UiText>{booking?"Edit booking":"Create booking"}</UiText></h2></div><UiField as="button" type="button" disabled={busy} onClick={close} aria-label="Close"><X/></UiField></header><div className="form"><label className="booking-adult-count"><UiText>Number of adults</UiText><select autoFocus disabled={busy||uploading} value={pax} onChange={e=>changeCounts(Number(e.target.value),children)}><UiText>{[1,2,3].map(x=><UiOption key={x}>{x}</UiOption>)}</UiText></select></label><label className="booking-child-count"><UiText>Number of children</UiText><select disabled={busy||uploading} value={children} onChange={e=>changeCounts(pax,Number(e.target.value))}>{Array.from({length:4-pax},(_,i)=><option key={i} value={i}>{i}</option>)}</select></label><div className="booking-adults-grid"><UiText>{guests.slice(0,pax+children).map((g,i)=><fieldset className="booking-adult" key={i} disabled={busy||uploading}><legend><UiText>{i<pax?'Adult ':'Child '}</UiText><UiText>{i<pax?i+1:i-pax+1}<UiText></UiText>{i===0?' · Lead guest':''}</UiText></legend><label><UiText>Guest name</UiText><UiField as="input" required maxLength={100} autoComplete="off" placeholder="Full name" value={g.name} onChange={e=>updateGuest(i,{name:e.target.value})}/></label>{i<pax&&<label><UiText>Contact number (optional)</UiText><UiField as="input" type="tel" maxLength={30} placeholder="+960 …" value={g.phone} onChange={e=>updateGuest(i,{phone:e.target.value})}/></label>}<label><UiText>Passport photo (optional)</UiText><input type="file" accept="image/jpeg,image/png,image/webp" onChange={e=>{photo(i,e.target.files?.[0]);e.target.value='';}}/></label><UiText>{g.photo?<UiField as="img" className="booking-passport-preview" src={g.photo} alt={'Selected passport photo for guest '+(i+1)}/>:g.passportId&&booking?<button type="button" onClick={async()=>{try{const r=await fetch('/api/guest-passport?stay='+encodeURIComponent(booking.id)+'&id='+encodeURIComponent(g.passportId));if(!r.ok)throw Error('Unable to open passport photo.');const blob=await r.blob();const reader=new FileReader();reader.onload=()=>updateGuest(i,{preview:String(reader.result)});reader.readAsDataURL(blob);}catch(e){setError((e as Error).message);}}}><UiText>View saved passport</UiText></button>:null}<UiText></UiText>{g.preview&&!g.photo&&<UiField as="img" className="booking-passport-preview" src={g.preview} alt={'Saved passport photo for guest '+(i+1)}/ >}<UiText></UiText>{(g.photo||g.passportId)&&<button type="button" onClick={()=>updateGuest(i,{photo:'',passportId:'',preview:''})}><UiText>Remove photo</UiText></button>}</UiText></fieldset>)}</UiText></div><UiText>{uploading&&<p role="status"><UiText>Preparing passport photo and reading guest name…</UiText></p>}</UiText><label><UiText>Booking source</UiText><select value={source} onChange={e=>setSource(e.target.value)}><UiText>{['Direct','Walk-in','Booking.com','Agoda','Travel agent','Guest portal'].map(x=><UiOption key={x}>{x}</UiOption>)}</UiText></select></label><label><UiText>Check-in</UiText><input required type="date" value={checkIn} onChange={e=>{setCheckIn(e.target.value);setRoom('');}}/></label><label><UiText>Check-out</UiText><input required type="date" min={checkIn?new Date(Date.parse(checkIn)+86400000).toISOString().slice(0,10):undefined} value={checkOut} onChange={e=>{setCheckOut(e.target.value);setRoom('');}}/></label><label><UiText>Room</UiText><select required disabled={!data||busy} value={room} onChange={e=>setRoom(e.target.value)}><UiOption value="">{data?'Choose an available room':'Loading rooms…'}</UiOption><UiText>{available.map((r:any)=><UiOption key={r.number} value={r.number}>Room {r.number}</UiOption>)}</UiText></select></label><UiText>{data&&!available.length&&<p><UiText>{closed?'Bookings are closed for these dates. Choose different dates.':'No rooms available for these dates and guest count.'}</UiText></p>}</UiText><label><UiText>Meal plan</UiText><select value={meal} onChange={e=>setMeal(e.target.value)}><UiText>{plans.map(x=><UiOption key={x}>{x}</UiOption>)}</UiText></select></label>
<div className="booking-transport-grid">
 <fieldset className="booking-transport-card">
  <legend><UiText>Arrival transport</UiText></legend>
  <label><UiText>Airport → Dhiffushi transfer</UiText><select value={transportPlan.arrival.needTransfer} onChange={e=>setTransport('arrival',{needTransfer:e.target.value})}><UiOption value="yes">Arrange for guest</UiOption><UiOption value="no">Guest has own transport</UiOption><UiOption value="later">Confirm later</UiOption></select></label>
  {transportPlan.arrival.needTransfer==='yes'&&<><label><UiText>Flight number</UiText><input maxLength={40} value={transportPlan.arrival.flightNumber||''} onChange={e=>setTransport('arrival',{flightNumber:e.target.value})}/></label><label><UiText>Flight arrival time (24-hour)</UiText><TimeField24 value={transportPlan.arrival.flightTime||''} onChange={e=>setTransport('arrival',{flightTime:e.target.value})}/></label></>}
  {transportPlan.arrival.needTransfer==='no'&&<><label><UiText>Arrival method</UiText><select value={transportPlan.arrival.ownTransport||''} onChange={e=>setTransport('arrival',{ownTransport:e.target.value})}><UiOption value="">Choose transport</UiOption><UiOption>Private speedboat</UiOption><UiOption>Public ferry</UiOption><UiOption>Another hotel/operator boat</UiOption><UiOption>Other</UiOption></select></label><label><UiText>Dhiffushi arrival time (24-hour)</UiText><TimeField24 value={transportPlan.arrival.dhiffushiArrivalTime||''} onChange={e=>setTransport('arrival',{dhiffushiArrivalTime:e.target.value})}/></label></>}
  <small><UiText>Harbour → Nirili Villa buggy is linked automatically when timing is known.</UiText></small>
 </fieldset>
 <fieldset className="booking-transport-card">
  <legend><UiText>Departure transport</UiText></legend>
  <label><UiText>Dhiffushi departure launch</UiText><select value={transportPlan.departure.needTransfer} onChange={e=>setTransport('departure',{needTransfer:e.target.value})}><UiOption value="yes">Arrange for guest</UiOption><UiOption value="no">Guest has own transport</UiOption><UiOption value="later">Confirm later</UiOption></select></label>
  {transportPlan.departure.needTransfer==='yes'&&<><label><UiText>Destination</UiText><input maxLength={120} value={transportPlan.departure.destination||''} onChange={e=>setTransport('departure',{destination:e.target.value})}/></label><label><UiText>Flight number (if flying)</UiText><input maxLength={40} value={transportPlan.departure.flightNumber||''} onChange={e=>setTransport('departure',{flightNumber:e.target.value})}/></label><label><UiText>Flight departure time (24-hour)</UiText><TimeField24 value={transportPlan.departure.flightTime||''} onChange={e=>setTransport('departure',{flightTime:e.target.value})}/></label></>}
  {transportPlan.departure.needTransfer==='no'&&<label><UiText>Harbour departure time (24-hour)</UiText><TimeField24 value={transportPlan.departure.ownDepartureTime||''} onChange={e=>setTransport('departure',{ownDepartureTime:e.target.value})}/></label>}
  <small><UiText>Nirili Villa → harbour buggy is scheduled 15 minutes before the launch/departure time.</UiText></small>
 </fieldset>
</div>
<label><UiText>Nightly rate (USD)</UiText><input required type="number" min="0" max="10000" step="0.01" value={rate} onChange={e=>setRate(e.target.value)}/></label><p><UiText>{nights}</UiText> <UiText>{nights===1?'night':'nights'} · Accommodation total: </UiText><b>$<UiText>{(nights*Math.round(Number(rate)*100)/100).toFixed(2)}</UiText></b></p><p><UiText>{booking?"Changes update this reservation and its room assignment. Existing payments are retained.":"The booking will be confirmed for the selected room. Check the guest in when they arrive."}</UiText></p><UiText>{error&&<p role="alert"><UiText>{error}</UiText></p>}<UiText></UiText>{!data&&error&&<button type="button" onClick={()=>refresh().catch(e=>setError(e.message))}><UiText>Retry loading rooms</UiText></button>}</UiText></div><footer><button type="button" disabled={busy} onClick={close}><UiText>Cancel</UiText></button><button className="primary" disabled={busy||uploading||!data||!room||nights<1}><UiText>{busy?'Saving booking…':booking?'Save changes':'Confirm Booking'}</UiText></button></footer></form></div>;
}
