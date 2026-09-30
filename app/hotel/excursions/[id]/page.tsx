import {cache} from 'react';
import {hotelMetadata} from '../../seo';
import Link from 'next/link';
import {notFound} from 'next/navigation';
import {ArrowLeft,ArrowRight,CalendarCheck,MapPin,Sailboat} from 'lucide-react';
import {baseExcursionMenu,loadExcursionMenu} from '../../../../lib/excursion-menu';
import {youtubeEmbed} from '../../../../lib/youtube';
import WebsiteChat from '../../../website-chat';
import {EXCURSIONS,Fonts,SiteFooter,SiteHeader,WHATSAPP,excursionPhoto,excursionTag,img} from '../../chrome';
import '../../home.css';
import '../style.css';

export const dynamic='force-dynamic';
const getExcursions=cache(async()=>loadExcursionMenu().catch(()=>baseExcursionMenu()));
export async function generateMetadata({params}:{params:Promise<{id:string}>}){
 const {id}=await params;
 const item=(await getExcursions()).find(entry=>entry.id===id);
 if(!item)notFound();
 return hotelMetadata(
  item.name+' in Dhiffushi | Nirili Tours',
  (item.detail||('Explore '+item.name+' from Dhiffushi, Maldives with Nirili Tours. View trip details, photos and booking options.')).replace(/\\s+/g,' ').trim().slice(0,160),
  '/hotel/excursions/'+encodeURIComponent(item.id)
 );
}

type Excursion={id:string;name:string;detail?:string;longDetail?:string;category?:string;youtubeUrl?:string;galleryUrls?:string[]};

export default async function HotelExcursionPage({params}:{params:Promise<{id:string}>}){
 const {id}=await params;
 const items:Excursion[]=await getExcursions();
 const item=items.find(entry=>entry.id===id);
 if(!item)notFound();
 const video=youtubeEmbed(item.youtubeUrl||'');
 const booking=EXCURSIONS+'?excursion='+encodeURIComponent(item.id)+'#external-excursion-form';
 const cover=excursionPhoto(item)||img('1507525428034-b723cf961d3e',2200);
 const gallery=item.galleryUrls||[];
 const paragraphs=(item.longDetail||item.detail||'Message us on WhatsApp for the full details of this excursion.').split(/\n+/).filter(Boolean);
 // Suggest others from the same group, preferring ones that don't repeat a photo.
 const seen=new Set([excursionPhoto(item)]),more:Excursion[]=[];
 const siblings=items.filter(x=>x.id!==item.id&&(x.category||'single')===(item.category||'single'));
 for(const x of siblings)if(more.length<3&&!seen.has(excursionPhoto(x))){more.push(x);seen.add(excursionPhoto(x));}
 for(const x of siblings)if(more.length<3&&!more.includes(x))more.push(x);
 return <main className="nh nh-sub-page">
  <Fonts/>
  <SiteHeader/>
  <section className="nh-page-hero nh-detail-hero" style={{backgroundImage:`url("${cover}")`}}>
   <div className="nh-page-hero-inner">
    <Link className="nh-back" href="/hotel/excursions"><ArrowLeft/> All excursions</Link>
    <p className="nh-kicker nh-kicker-light">{excursionTag(item.name,item.category)}</p>
    <h1>{item.name}</h1>
    {item.detail&&<p>{item.detail}</p>}
    <div className="nh-hero-actions">
     <a className="nh-btn nh-btn-light" href={booking}>Book this excursion <ArrowRight/></a>
     <a className="nh-btn nh-btn-ghost" href={WHATSAPP} target="_blank" rel="noopener noreferrer">Ask a question</a>
    </div>
   </div>
  </section>

  <div className="nh-detail">
   <article className="nh-detail-main">
    {video&&<section className="nh-detail-block">
     <p className="nh-kicker">Watch the experience</p>
     <div className="nh-video"><iframe src={video} title={item.name+' video'} loading="lazy" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" allowFullScreen referrerPolicy="strict-origin-when-cross-origin"/></div>
    </section>}
    <section className="nh-detail-block">
     <p className="nh-kicker">About this trip</p>
     <h2>Your day <em>on the water.</em></h2>
     <div className="nh-prose">{paragraphs.map((paragraph,index)=><p key={index}>{paragraph}</p>)}</div>
    </section>
    {gallery.length>0&&<section className="nh-detail-block">
     <p className="nh-kicker">Photo gallery</p>
     <div className="nh-gallery">{gallery.map((url,index)=><img key={url} src={url} loading="lazy" alt={item.name+' photo '+(index+1)}/>)}</div>
    </section>}
   </article>
   <aside className="nh-detail-aside">
    <div className="nh-facts">
     <div><MapPin/><span><small>Location</small>Dhiffushi, Maldives</span></div>
     <div><Sailboat/><span><small>Run by</small>Nirili Tours</span></div>
     <div><CalendarCheck/><span><small>Booking</small>Reserve now, pay later</span></div>
     <a className="nh-btn nh-btn-primary" href={booking}>Choose a date <ArrowRight/></a>
    </div>
   </aside>
  </div>

  {more.length>0&&<section className="nh-exc-section nh-more">
   <div className="nh-exc-head"><h2>More to <em>explore</em></h2><p><Link href="/hotel/excursions">See all excursions <ArrowRight/></Link></p></div>
   <div className="nh-exc-grid">
    {more.map(x=>{
     const photo=excursionPhoto(x);
     return <Link className="nh-exc-card" key={x.id} href={'/hotel/excursions/'+encodeURIComponent(x.id)}>
      <span className="nh-exc-media">{photo?<img src={photo} alt={x.name} loading="lazy"/>:<span className="nh-exc-empty"><Sailboat/></span>}</span>
      <span className="nh-exc-body"><small>{excursionTag(x.name,x.category)}</small><strong>{x.name}</strong><span>{x.detail}</span><b>View details <ArrowRight/></b></span>
     </Link>;
    })}
   </div>
  </section>}
  <SiteFooter/>
  <WebsiteChat/>
 </main>;
}
