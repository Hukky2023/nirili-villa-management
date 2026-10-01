import type {Metadata} from 'next';
import OperatorPortal from './portal';
import {Fonts} from '../hotel/chrome';
import '../hotel/home.css';
import './operators.css';

export const dynamic='force-dynamic';

export const metadata:Metadata={
 title:'Nirili Travels Operator Portal · Dhiffushi',
 description:'Speedboat operators and buggy owners receive Nirili Travels bookings, assign them and board guests.',
 robots:{index:false,follow:false},
};

// operators.nirilihotels.com: a working tool for speedboat companies and buggy owners, built
// for a phone at the jetty. English only, like the management system.
export default function OperatorPortalPage(){
 return <main className="nh op-portal">
  <Fonts/>
  <OperatorPortal/>
 </main>;
}
