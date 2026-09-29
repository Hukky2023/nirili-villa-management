import {hotelMetadata} from '../seo';
import Link from 'next/link';
import {ArrowRight,Waves} from 'lucide-react';
import {baseExcursionMenu,loadExcursionMenu} from '../../../lib/excursion-menu';
import WebsiteChat from '../../website-chat';
import {EXCURSIONS,Fonts,SiteFooter,SiteHeader,WHATSAPP,excursionPhoto,excursionTag,img} from '../chrome';
import '../home.css';
import './style.css';

export const dynamic='force-dynamic';
export const metadata=hotelMetadata('Dhiffushi Excursions | Snorkelling & Boat Trips | Nirili Tours','Explore Dhiffushi excursions with Nirili Tours: turtle and nurse shark snorkelling, coral gardens, sandbanks, dolphin watching and fishing. Guests from all hotels welcome.','/hotel/excursions');

type Excursion={id:string;name:string;detail?:string;category?:string;galleryUrls?:string[]};

const SECTIONS=[
 {category:'single',title:'Excursions',copy:'Snorkelling, sandbanks, dolphins, fishing and dinners under the stars.'},
 {category:'combined',title:'Combined trips',copy:'Two favourites in one outing, so you see more in a single day.'},
 {category:'special',title:'Special packages',copy:'Our biggest days out, with several experiences put together for you.'},
];

export default async function HotelExcursions(){
 const items:Excursion[]=await loadExcursionMenu().catch(()=>baseExcursionMenu());
 return <main className="nh nh-sub-page">
  <Fonts/>
  <SiteHeader/>
  <section className="nh-page-hero" style={{backgroundImage:`url("${img('1629267776059-e6b10c44d744',2200)}")`}}>
   <div className="nh-page-hero-inner">
    <p className="nh-kicker nh-kicker-light">Nirili Tours · Dhiffushi</p>
    <h1>Dhiffushi excursions <em>with Nirili Tours.</em></h1>
    <p>Turtles, nurse sharks, mantas and sandbanks are all a short boat ride away. Open an excursion to see its video, photos and details.</p>
   </div>
  </section>

  {SECTIONS.map(section=>{
   const list=items.filter(x=>(x.category||'single')===section.category);
   if(!list.length)return null;
   return <section className="nh-exc-section" key={section.category}>
    <div className="nh-exc-head">
     <h2>{section.title}</h2>
     <p>{section.copy}</p>
    </div>
    <div className="nh-exc-grid">
     {list.map(x=>{
      const photo=excursionPhoto(x);
      return <Link className="nh-exc-card" key={x.id} href={'/hotel/excursions/'+encodeURIComponent(x.id)}>
       <span className="nh-exc-media">{photo?<img src={photo} alt={x.name} loading="lazy"/>:<span className="nh-exc-empty"><Waves/></span>}</span>
       <span className="nh-exc-body">
        <small>{excursionTag(x.name,x.category)}</small>
        <strong>{x.name}</strong>
        <span>{x.detail}</span>
        <b>View details <ArrowRight/></b>
       </span>
      </Link>;
     })}
    </div>
   </section>;
  })}
  {!items.length&&<section className="nh-exc-section"><p className="nh-exc-none">New excursions are coming soon. Message us on WhatsApp and we&rsquo;ll tell you what&rsquo;s running.</p></section>}

  <section className="nh-cta nh-cta-compact" style={{backgroundImage:`linear-gradient(180deg,rgba(6,24,28,.3),rgba(6,24,28,.6)),url("${img('1650024678534-a93a8328ad46',2000)}")`}}>
   <h2>Found your <em>perfect day?</em></h2>
   <p>Pick a date and book online, or message us and we&rsquo;ll help you choose.</p>
   <div className="nh-hero-actions">
    <a className="nh-btn nh-btn-light" href={EXCURSIONS}>Book an excursion <ArrowRight/></a>
    <a className="nh-btn nh-btn-ghost" href={WHATSAPP} target="_blank" rel="noopener noreferrer">Ask on WhatsApp</a>
   </div>
  </section>
  <SiteFooter/>
  <WebsiteChat/>
 </main>;
}
