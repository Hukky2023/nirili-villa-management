import type {Metadata} from 'next';
import {ArrowUpRight,Clock,MapPin} from 'lucide-react';
import DiningMenu from '../../restaurant/guest/menu';
import {SITES} from '../../../lib/public-sites';
import {Fonts,SiteFooter,SiteHeader,img} from '../../hotel/chrome';
import '../../hotel/home.css';
import '../../hotel/excursions/style.css';
import './style.css';

export const dynamic='force-dynamic';

export const metadata:Metadata={
 title:'Nirili Restaurant | Menu, Dine-in & Delivery · Dhiffushi',
 description:'See the live Nirili Restaurant menu and order for dine-in or delivery in Dhiffushi, Maldives.',
 alternates:{canonical:SITES.dine+'/'},
};

const HOURS=[
 {meal:'Breakfast',time:'07:00–09:00'},
 {meal:'Lunch',time:'12:00–15:00',note:'Friday 13:30–15:00'},
 {meal:'Dinner',time:'18:00–22:00'},
];

export default function PublicRestaurantPage(){
 return <main className="nh nh-sub-page nh-dine">
  <Fonts/>
  <SiteHeader action={{label:'Order now',href:'#menu'}}/>
  <section className="nh-page-hero" style={{backgroundImage:`url("${img('1768322264423-4b0adf0cf31b',2200)}")`}}>
   <div className="nh-page-hero-inner">
    <p className="nh-kicker nh-kicker-light">Nirili Restaurant · Dhiffushi</p>
    <h1>Fresh from the kitchen, <em>close to the sea.</em></h1>
    <p>Curries, kottu and fresh seafood from the grill, plus pizza, pasta, mojitos and milkshakes. Eat with us or have it delivered.</p>
    <div className="nh-hero-actions"><a className="nh-btn nh-btn-light" href="#menu">See the menu</a></div>
   </div>
  </section>

  <section className="nh-dine-info" aria-label="Opening hours and location">
   {HOURS.map(h=><div key={h.meal}><Clock/><span><small>{h.meal}</small><b>{h.time}</b>{h.note&&<em>{h.note}</em>}</span></div>)}
   <a href="https://maps.app.goo.gl/NHLJpj1y72SZTDWU7?g_st=ac" target="_blank" rel="noopener noreferrer"><MapPin/><span><small>Find us</small><b>Nirili Villa, Dhiffushi</b><em>Open in Google Maps <ArrowUpRight/></em></span></a>
  </section>

  <section className="nh-dine-menu" id="menu">
   <div className="nh-exc-head">
    <h2>Order from our <em>live menu</em></h2>
    <p>Choose dine in or delivery, add your dishes, and send the order straight to our kitchen. Online orders open for lunch and dinner.</p>
   </div>
   <DiningMenu mode="walkin" embedded/>
  </section>
  <SiteFooter/>
 </main>;
}
