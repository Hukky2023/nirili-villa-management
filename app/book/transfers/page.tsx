import type {Metadata} from 'next';
import TransferBookingSite from './site';
import {SITES} from '../../../lib/public-sites';
import './style.css';

export const dynamic='force-dynamic';

export const metadata:Metadata={
 title:'Nirili Transfers | Speedboat & Airport Transfers · Dhiffushi',
 description:'Book speedboat transfers between Velana International Airport and Dhiffushi with Nirili Travels.',
 alternates:{canonical:SITES.transfers+'/'},
};

export default function TransferBookingPage(){
 return <TransferBookingSite/>;
}
