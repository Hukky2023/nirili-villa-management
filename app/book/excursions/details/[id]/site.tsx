'use client';

import {useEffect,useMemo,useState} from 'react';
import {ArrowLeft,ArrowRight,CheckCircle2,MapPin,PlayCircle,ShieldCheck,Sparkles} from 'lucide-react';

type Excursion={
 id:string;name:string;detail:string;longDetail?:string;youtubeUrl?:string;
 cents:number;pricingUnit:'guest'|'couple';category:string;group:string;
};

const money=(cents:number)=>'$'+(Math.max(0,Number(cents)||0)/100).toFixed(2);

function youtubeEmbed(urlValue:string){
 if(!urlValue)return '';
 try{
  const url=new URL(urlValue);
  const host=url.hostname.toLowerCase().replace(/^www\./,'');
  let id='';
  if(host==='youtu.be')id=url.pathname.split('/').filter(Boolean)[0]||'';
  else if(host==='youtube.com'||host==='m.youtube.com'||host==='youtube-nocookie.com'){
   if(url.pathname==='/watch')id=url.searchParams.get('v')||'';
   else{
    const parts=url.pathname.split('/').filter(Boolean);
    const marker=parts.findIndex(part=>['embed','shorts','live'].includes(part));
    if(marker>=0)id=parts[marker+1]||'';
   }
  }
  id=id.replace(/[^a-zA-Z0-9_-]/g,'').slice(0,32);
  return id?'https://www.youtube-nocookie.com/embed/'+id:'';
 }catch{return ''}
}

export default function ExcursionDetailsSite({excursionId}:{excursionId:string}){
 const [items,setItems]=useState<Excursion[]>([]);
 const [error,setError]=useState('');
 const [loading,setLoading]=useState(true);

 useEffect(()=>{
  fetch('/api/public-excursions',{cache:'no-store'}).then(async response=>{
   const data=await response.json();
   if(!response.ok)throw Error(data.error||'Could not load excursion details.');
   setItems(data.items||[]);
  }).catch(reason=>setError(reason instanceof Error?reason.message:'Could not load excursion details.')).finally(()=>setLoading(false));
 },[]);

 const item=useMemo(()=>items.find(value=>value.id===excursionId)||null,[items,excursionId]);
 const embed=item?youtubeEmbed(item.youtubeUrl||''):'';
 const bookingHref='/book/excursions?excursion='+encodeURIComponent(excursionId)+'#external-excursion-form';

 if(loading)return <main className="excursion-detail-page"><section className="excursion-detail-loading">Loading excursion details…</section></main>;
 if(error)return <main className="excursion-detail-page"><section className="excursion-detail-loading"><strong>Could not load excursion</strong><p>{error}</p><a href="/book/excursions"><ArrowLeft/> Back to excursions</a></section></main>;
 if(!item)return <main className="excursion-detail-page"><section className="excursion-detail-loading"><strong>Excursion not found</strong><p>This excursion may no longer be available.</p><a href="/book/excursions"><ArrowLeft/> Back to excursions</a></section></main>;

 return <main className="excursion-detail-page">
  <header className="excursion-detail-nav">
   <a href="/book/excursions"><ArrowLeft/> All excursions</a>
   <span>NIRILI TOURS · DHIFFUSHI</span>
   <a className="detail-book-top" href={bookingHref}>Book now <ArrowRight/></a>
  </header>

  <section className="excursion-detail-hero">
   <div className="excursion-detail-heading">
    <span className="detail-kicker"><Sparkles/> {item.group}</span>
    <h1>{item.name}</h1>
    <p>{item.detail||'Discover this Nirili Tours experience in Dhiffushi, Maldives.'}</p>
    <div className="detail-price">
     <strong>{item.cents?money(item.cents):'Ask us'}</strong>
     {item.cents>0&&<span>{item.pricingUnit==='couple'?'/ couple':'/ adult'}</span>}
    </div>
    <a className="detail-primary" href={bookingHref}>Book this excursion <ArrowRight/></a>
   </div>
   <aside className="detail-quick">
    <MapPin/>
    <div><small>LOCATION</small><strong>Dhiffushi · Maldives</strong></div>
    <CheckCircle2/>
    <div><small>BOOKING</small><strong>Reserve now, pay later</strong></div>
    <ShieldCheck/>
    <div><small>OPERATED BY</small><strong>Nirili Tours</strong></div>
   </aside>
  </section>

  <section className="excursion-detail-content">
   <div className="detail-video-section">
    <div className="detail-section-title"><span>WATCH THE EXPERIENCE</span><h2>See what the excursion feels like.</h2></div>
    {embed?<div className="detail-video-frame"><iframe src={embed} title={item.name+' video'} allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" allowFullScreen referrerPolicy="strict-origin-when-cross-origin"/></div>:<div className="detail-video-empty"><PlayCircle/><strong>Video coming soon</strong><p>Our team can add a YouTube video for this excursion from the Excursion menu in the management system.</p></div>}
   </div>

   <div className="detail-info-section">
    <div className="detail-section-title"><span>EXCURSION DETAILS</span><h2>Everything to know before you go.</h2></div>
    <div className="detail-long-copy">
     {(item.longDetail||item.detail||'Full excursion information will be added soon.').split(/\n+/).filter(Boolean).map((paragraph,index)=><p key={index}>{paragraph}</p>)}
    </div>
   </div>
  </section>

  <section className="detail-bottom-cta">
   <span>READY TO GO?</span>
   <h2>{item.name}</h2>
   <p>Choose your preferred date and passenger details. Nirili Tours will handle the rest.</p>
   <a href={bookingHref}>Reserve this excursion <ArrowRight/></a>
  </section>
 </main>;
}
