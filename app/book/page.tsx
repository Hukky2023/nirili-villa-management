import GuestBookingSite from './site';
import {Fonts,SiteFooter,SiteHeader} from '../hotel/chrome';
import '../hotel/home.css';
import '../hotel/excursions/style.css';
import './style.css';

export const dynamic='force-dynamic';

export default function GuestBookingPage(){
 return <main className="nh nh-sub-page nh-book">
  <Fonts/>
  <SiteHeader action={{label:'Book your stay',href:'#book'}}/>
  <GuestBookingSite/>
  <SiteFooter/>
 </main>;
}
