import type {Metadata} from 'next';
import TransferBookingSite from './site';
import './style.css';

export const dynamic='force-dynamic';

export const metadata:Metadata={title:'Nirili Transfers | Airport & Speedboat Transfers',description:'Book Nirili Transfers between Velana International Airport, Dhiffushi and supported routes.',alternates:{canonical:'https://transfers.nirilihotels.com/'},robots:{index:true,follow:true}};

export default function TransferBookingPage(){
 return <TransferBookingSite/>;
}
