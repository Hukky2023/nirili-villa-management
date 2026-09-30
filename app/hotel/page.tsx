import HotelHome from './site';
import {hotelIdentity,hotelMetadata} from './seo';
import './home.css';

export const dynamic='force-dynamic';
export const metadata=hotelMetadata(
 'Nirili Villa Dhiffushi | Maldives Stays, Transfers & Tours',
 'Plan your Dhiffushi holiday with Nirili Villa and Nirili Tours. Explore room packages, airport speedboat transfers, snorkelling, sandbanks and fishing trips.',
 '/'
);
export default function HotelHomePage(){
 return <><script type="application/ld+json" dangerouslySetInnerHTML={{__html:JSON.stringify(hotelIdentity).replace(/</g,'\\u003c')}}/><HotelHome/></>;
}
