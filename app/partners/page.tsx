import type {Metadata} from 'next';
import PartnerPortal from './portal';
import SiteTranslator from '../site-translator';
import {Fonts} from '../hotel/chrome';
import '../hotel/home.css';
import '../hotel/excursions/style.css';
import '../book/transfers/style.css';
import '../book/agents/style.css';
import '../tour-operator/style.css';
import '../operators/operators.css';
import './partners.css';

export const dynamic='force-dynamic';

export const metadata:Metadata={
 title:'Nirili Partners · Dhiffushi',
 description:'Guest houses, travel agencies, speedboat operators and buggy owners working with Nirili sign in here.',
 robots:{index:false,follow:false},
};

export default function PartnersPage(){
 return <main className="nh pp-page">
  <Fonts/>
  <PartnerPortal/>
  <SiteTranslator/>
 </main>;
}
