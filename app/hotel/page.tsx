import type {Metadata} from 'next';
import HotelHome from './site';
import SiteTranslator from '../site-translator';
import './home.css';

export const dynamic='force-dynamic';

export const metadata:Metadata={
 title:'Nirili Hotel Dhiffushi | Stay, Dine & Explore the Maldives',
 description:'Discover Nirili Hotel in Dhiffushi, Maldives. Book your stay direct, arrange transfers, enjoy island dining and explore turtles, reefs, sandbanks, sharks, dolphins and more with Nirili Tours.',
 metadataBase:new URL('https://nirilihotels.com'),
 alternates:{canonical:'https://nirilihotels.com/'},
 openGraph:{url:'https://nirilihotels.com/',siteName:'Nirili Hotels',type:'website'},
};

export default function HotelHomePage(){
 return <><HotelHome/><SiteTranslator/></>;
}
