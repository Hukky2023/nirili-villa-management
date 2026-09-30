import type {Metadata} from 'next';
import ManageBookingSite from './site';
import {Fonts,SiteFooter,SiteHeader} from '../../hotel/chrome';
import '../../hotel/home.css';
import './style.css';

export const metadata:Metadata={
 title:'Manage Booking | Nirili Villa · Dhiffushi',
 description:'View, change or cancel your Nirili Villa room booking.',
 referrer:'no-referrer',
 robots:{index:false,follow:false}
};

export default function ManageBookingPage(){
 return <main className="nh nh-manage">
  <Fonts/>
  <SiteHeader solid/>
  <ManageBookingSite/>
  <SiteFooter/>
 </main>;
}
