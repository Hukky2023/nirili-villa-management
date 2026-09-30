import type {Metadata} from 'next';
import TransferBookingSite from './site';
import {SITES} from '../../../lib/public-sites';
import {Fonts,SiteFooter,SiteHeader,img} from '../../hotel/chrome';
import '../../hotel/home.css';
import '../../hotel/excursions/style.css';
import './style.css';

export const dynamic='force-dynamic';

export const metadata:Metadata={
 title:'Nirili Transfers | Speedboat & Airport Transfers · Dhiffushi',
 description:'Book speedboat transfers between Velana International Airport and Dhiffushi with Nirili Travels.',
 alternates:{canonical:SITES.transfers+'/'},
};

export default function TransferBookingPage(){
 return <main className="nh nh-sub-page nh-transfers">
  <Fonts/>
  <SiteHeader/>
  <section className="nh-page-hero" style={{backgroundImage:`url("${img('1530809355496-bac53698afe3',2200)}")`}}>
   <div className="nh-page-hero-inner">
    <p className="nh-kicker nh-kicker-light">Nirili Transfers · Velana Airport ↔ Dhiffushi</p>
    <h1>From the airport <em>to the island.</em></h1>
    <p>Pick your route and departure time, tell us who&rsquo;s travelling, and we&rsquo;ll hold your seats on the speedboat.</p>
   </div>
  </section>
  <TransferBookingSite/>
  <SiteFooter/>
 </main>;
}
