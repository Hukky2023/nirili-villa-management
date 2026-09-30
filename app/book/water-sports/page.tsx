import type {Metadata} from 'next';
import WaterSportsSite from './site';
import {SITES} from '../../../lib/public-sites';
import {Fonts,SiteFooter,SiteHeader,img} from '../../hotel/chrome';
import '../../hotel/home.css';
import '../../hotel/excursions/style.css';
import '../transfers/style.css';
import './style.css';

export const dynamic='force-dynamic';

export const metadata:Metadata={
 title:'Nirili Water Sports | Jet Ski, Parasailing & More · Dhiffushi',
 description:'Book jet ski, parasailing, banana boat, kayak and paddleboard sessions on Dhiffushi, Maldives.',
 alternates:{canonical:SITES.watersports+'/'},
};

export default function WaterSportsPage(){
 return <main className="nh nh-sub-page nh-water">
  <Fonts/>
  <SiteHeader action={{label:'Book water sports',href:'#book'}}/>
  <section className="nh-page-hero" style={{backgroundImage:`url("${img('1617059063772-34532796cdb5',2200)}")`}}>
   <div className="nh-page-hero-inner">
    <p className="nh-kicker nh-kicker-light">Nirili Water Sports · Dhiffushi</p>
    <h1>Make a splash <em>in the lagoon.</em></h1>
    <p>Jet skis, parasailing, banana boats, kayaks and paddleboards. Choose an activity and a day, and we&rsquo;ll arrange the rest.</p>
    <div className="nh-hero-actions"><a className="nh-btn nh-btn-light" href="#activities">See activities</a></div>
   </div>
  </section>
  <WaterSportsSite/>
  <SiteFooter/>
 </main>;
}
