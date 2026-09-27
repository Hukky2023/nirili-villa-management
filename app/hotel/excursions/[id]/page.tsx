import {notFound} from 'next/navigation';
import {ArrowLeft,ArrowRight,MapPin,CheckCircle2,Sparkles} from 'lucide-react';
import {loadExcursionMenu} from '../../../../lib/excursion-menu';
import {youtubeEmbed} from '../../../../lib/youtube';
import WebsiteChat from '../../../website-chat';
import '../../../book/excursions/details/[id]/style.css';

export const dynamic='force-dynamic';
export const metadata={title:'Excursion Details | Nirili Tours · Dhiffushi',description:'Explore Nirili Tours excursion videos, photos and details in Dhiffushi, Maldives.'};

export default async function HotelExcursionPage({params}:{params:Promise<{id:string}>}){
 const {id}=await params;
 const item=(await loadExcursionMenu()).find((entry:any)=>entry.id===id);
 if(!item)notFound();
 const video=youtubeEmbed(item.youtubeUrl||'');
 const booking='https://booking.nirilihotels.com/book/excursions?excursion='+encodeURIComponent(item.id)+'#external-excursion-form';
 return <main className="excursion-detail-page">
  <header className="excursion-detail-nav"><a href="/hotel/excursions"><ArrowLeft/> All excursions</a><a href="/">NIRILI HOTEL</a><a className="detail-book-top" href={booking}>Book now <ArrowRight/></a></header>
  <section className="excursion-detail-hero"><div className="excursion-detail-heading"><span className="detail-kicker"><Sparkles/> {item.group}</span><h1>{item.name}</h1><p>{item.detail}</p><a className="detail-primary" href={booking}>Book this excursion <ArrowRight/></a></div><aside className="detail-quick"><MapPin/><div><small>LOCATION</small><strong>Dhiffushi · Maldives</strong></div><CheckCircle2/><div><small>OPERATED BY</small><strong>Nirili Tours</strong></div><CheckCircle2/><div><small>BOOKING</small><strong>Reserve now, pay later</strong></div></aside></section>
  <section className="excursion-detail-content">
   {video&&<section className="detail-video-section"><div className="detail-section-title"><span>WATCH THE EXPERIENCE</span><h2>Explore with Nirili Tours.</h2></div><div className="detail-video-frame"><iframe src={video} title={item.name+' video'} loading="lazy" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" allowFullScreen referrerPolicy="strict-origin-when-cross-origin"/></div></section>}
   <section className="detail-info-section"><div className="detail-section-title"><span>EXCURSION DETAILS</span><h2>Your island experience.</h2></div><div className="detail-long-copy">{(item.longDetail||item.detail||'Contact Nirili Tours for excursion details.').split(/\n+/).filter(Boolean).map((paragraph:string,index:number)=><p key={index}>{paragraph}</p>)}</div></section>
   {item.galleryUrls?.length>0&&<section className="detail-gallery-section"><div className="detail-section-title"><span>PHOTO GALLERY</span><h2>Moments from the experience.</h2></div><div className="detail-photo-gallery">{item.galleryUrls.map((url:string,index:number)=><img key={url} src={url} loading="lazy" alt={item.name+' photo '+(index+1)}/>)}</div></section>}
  </section>
  <section className="detail-bottom-cta"><span>READY TO GO?</span><h2>{item.name}</h2><p>Choose your date and let Nirili Tours arrange your excursion.</p><a href={booking}>Reserve this excursion <ArrowRight/></a></section>
  <WebsiteChat/>
 </main>;
}
