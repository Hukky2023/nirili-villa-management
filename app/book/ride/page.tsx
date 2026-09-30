import type {Metadata} from 'next';
import RideSite from './site';
import {SITES} from '../../../lib/public-sites';
import {Fonts,SiteFooter,SiteHeader,img} from '../../hotel/chrome';
import '../../hotel/home.css';
import '../../hotel/excursions/style.css';
import '../transfers/style.css';
import './style.css';

export const dynamic='force-dynamic';

export const metadata:Metadata={
 title:'Nirili Ride | Buggy Rides on Dhiffushi',
 description:'Request a Nirili buggy anywhere on Dhiffushi and follow your ride live.',
 alternates:{canonical:SITES.ride+'/'},
};

export default function RidePage(){
 return <main className="nh nh-sub-page nh-ride">
  <Fonts/>
  <SiteHeader action={{label:'Request a ride',href:'#ride'}}/>
  <section className="nh-page-hero" style={{backgroundImage:`url("${img('1632299598724-45be3f29ff61',2200)}")`}}>
   <div className="nh-page-hero-inner">
    <p className="nh-kicker nh-kicker-light">Nirili Ride · Dhiffushi</p>
    <h1>A buggy, <em>whenever you need one.</em></h1>
    <p>Luggage from the harbour, a trip to the beach or a lift home after dinner. Tell us where you are and where you&rsquo;re going, and follow your ride here.</p>
   </div>
  </section>
  <RideSite/>
  <SiteFooter/>
 </main>;
}
