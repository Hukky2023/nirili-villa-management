import type {Metadata} from 'next';
import HotelHome from './site';
import './home.css';

export const dynamic='force-dynamic';

export const metadata:Metadata={
 title:'Nirili Hotel Dhiffushi | Stay, Dine & Explore the Maldives',
 description:'Discover Nirili Hotel in Dhiffushi, Maldives. Book your stay direct, arrange transfers, enjoy island dining and explore turtles, reefs, sandbanks, sharks, dolphins and more with Nirili Tours.',
 alternates:{canonical:'https://www.nirilihotels.com/'},
};

export default function HotelHomePage(){
 return <HotelHome/>;
}
