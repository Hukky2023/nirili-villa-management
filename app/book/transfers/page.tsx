import type {Metadata} from 'next';
import TransferBookingSite from './site';
import {SITES} from '../../../lib/public-sites';
import {Fonts,SiteFooter,SiteHeader,img} from '../../hotel/chrome';
import '../../hotel/home.css';
import '../../hotel/excursions/style.css';
import './style.css';

export const dynamic='force-dynamic';

export const metadata:Metadata={
 title:'Nirili Transfers | Speedboats & Private Charters · Dhiffushi',
 description:'Find and book speedboats and private charters around the Maldives, from Velana Airport to Dhiffushi and beyond, with local, expat and tourist fares.',
 alternates:{canonical:SITES.transfers+'/'},
};

export default function TransferBookingPage(){
 return <main className="nh nh-sub-page nh-transfers">
  <Fonts/>
  <SiteHeader action={{label:'Book a transfer',href:'#book'}}/>
  <section className="nh-page-hero" style={{backgroundImage:`url("${img('1530809355496-bac53698afe3',2200)}")`}}>
   <div className="nh-page-hero-inner">
    <p className="nh-kicker nh-kicker-light">Nirili Transfers · Speedboats &amp; private charters</p>
    <h1>Find your sea transport <em>in the Maldives.</em></h1>
    <p>Choose where you&rsquo;re going and who&rsquo;s travelling, pick a speedboat and your seats, or charter a whole boat.</p>
   </div>
  </section>
  <TransferBookingSite/>
  <SiteFooter/>
 </main>;
}
