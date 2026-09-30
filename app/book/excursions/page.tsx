import type {Metadata} from 'next';
import ExternalExcursionBooking from './site';
import {SITES} from '../../../lib/public-sites';
import {Fonts,SiteFooter,SiteHeader} from '../../hotel/chrome';
import '../../hotel/home.css';
import '../../hotel/excursions/style.css';
import '../style.css';
import './style.css';

export const dynamic='force-dynamic';

export const metadata:Metadata={
 title:'Book Excursions | Nirili Tours · Dhiffushi',
 description:'Book Nirili Tours excursions in Dhiffushi even if you are staying at another hotel or guesthouse. Snorkeling, sandbanks, fishing, dolphin trips and more.',
 robots:{index:true,follow:true},
 alternates:{canonical:SITES.tours+'/'}
};

export default function ExternalExcursionsPage(){
 return <main className="nh nh-sub-page nh-book">
  <Fonts/>
  <SiteHeader action={{label:'Book an excursion',href:'#external-excursion-form'}}/>
  <ExternalExcursionBooking/>
  <SiteFooter/>
 </main>;
}
