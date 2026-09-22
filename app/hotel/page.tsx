import type {Metadata} from 'next';
import HotelHome from './site';
import './style.css';

export const dynamic='force-dynamic';

export const metadata:Metadata={
 title:'Nirili Villa Dhiffushi | Stay, Explore & Book Direct',
 description:'Stay at Nirili Villa in Dhiffushi, Maldives. Comfortable island rooms, meal plans, airport transfers and local excursions. Book direct with Nirili Villa.',
};

export default function HotelHomePage(){
 return <HotelHome/>;
}
