import {ArrowLeft,ArrowRight,Waves} from 'lucide-react';
import {loadExcursionMenu} from '../../../lib/excursion-menu';
import WebsiteChat from '../../website-chat';
import '../style.css';
import './style.css';

export const dynamic='force-dynamic';
export const metadata={title:'Excursions | Nirili Tours · Dhiffushi',description:'Discover Nirili Tours excursions, videos and photos from Dhiffushi, Maldives.'};

export default async function HotelExcursions(){
 const items=await loadExcursionMenu();
 return <main className="nirili-site hotel-excursions"><header className="site-header"><a href="/" className="nirili-brand"><Waves/><strong>NIRILI HOTEL</strong></a><a href="/"><ArrowLeft size={18}/> Back to hotel</a></header><section className="experience-section"><div className="section-title left"><span>NIRILI TOURS · DHIFFUSHI</span><h1>Explore the ocean with us.</h1><p>Find your next island experience. Open an excursion to see its video, photos and details.</p></div><div className="hotel-excursion-grid">{items.map((item:any)=><article className="experience-card" key={item.id}>{item.galleryUrls?.[0]?<img className="hotel-excursion-cover" src={item.galleryUrls[0]} alt={item.name} loading="lazy"/>:<div className="hotel-excursion-cover hotel-excursion-placeholder"><Waves size={44}/></div>}<div className="hotel-excursion-copy"><small>{item.group}</small><h2>{item.name}</h2><p>{item.detail}</p><a className="outline-button" href={'/hotel/excursions/'+encodeURIComponent(item.id)}>View details <ArrowRight size={18}/></a></div></article>)}</div>{!items.length&&<p>Contact Nirili Tours for upcoming excursions.</p>}</section><WebsiteChat/></main>;
}
