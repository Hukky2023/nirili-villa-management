import type {Metadata} from 'next';
import AgentPortal from './site';
import {SITES} from '../../../lib/public-sites';
import {Fonts,SiteFooter,SiteHeader,img} from '../../hotel/chrome';
import '../../hotel/home.css';
import '../../hotel/excursions/style.css';
import '../transfers/style.css';
import './style.css';

export const dynamic='force-dynamic';

export const metadata:Metadata={
 title:'Nirili Tours Partner Portal · Dhiffushi',
 description:'Partner guest houses on Dhiffushi book excursions for their guests with Nirili Tours.',
 alternates:{canonical:SITES.agents+'/'},
 robots:{index:false,follow:false},
};

export default function AgentPortalPage(){
 return <main className="nh nh-sub-page nh-agents">
  <Fonts/>
  <SiteHeader action={{label:'New booking',href:'#book'}}/>
  <section className="nh-page-hero nh-agents-hero" style={{backgroundImage:`url("${img('1650024678534-a93a8328ad46',2200)}")`}}>
   <div className="nh-page-hero-inner">
    <p className="nh-kicker nh-kicker-light">Nirili Tours · Partner portal</p>
    <h1>Book excursions <em>for your guests.</em></h1>
    <p>For guest houses on Dhiffushi. Send your guests&rsquo; trips straight to our timetable, see confirmations live, and keep track of what you owe each month.</p>
   </div>
  </section>
  <AgentPortal/>
  <SiteFooter/>
 </main>;
}
