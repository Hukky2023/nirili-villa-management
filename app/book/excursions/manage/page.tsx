import type {Metadata} from 'next';
import ManageExcursionSite from './site';
import {Fonts,SiteFooter,SiteHeader} from '../../../hotel/chrome';
import '../../../hotel/home.css';
import '../../manage/style.css';
import './style.css';

export const metadata:Metadata={title:'Manage Excursion | Nirili Tours · Dhiffushi',description:'View, change or cancel your Nirili Tours excursion booking.',referrer:'no-referrer',
 robots:{index:false,follow:false}};
export default function ManageExcursionPage(){
 return <main className="nh nh-manage">
  <Fonts/>
  <SiteHeader solid/>
  <ManageExcursionSite/>
  <SiteFooter/>
 </main>;
}
