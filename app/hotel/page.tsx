import type {Metadata} from 'next';
import HotelHome from './site';
import './style.css';

export const dynamic='force-dynamic';

export const metadata:Metadata={
 title:'Nirili Villa Dhiffushi | Stay, Dine & Explore the Maldives',
 description:'Stay at Nirili Villa in Dhiffushi, Maldives. Discover island dining, turtle and reef excursions, sandbanks, dolphin trips, speedboat transfers and direct room booking.',
};

export default function HotelHomePage(){
 return <HotelHome/>;
}
