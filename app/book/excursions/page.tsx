import type {Metadata} from 'next';
import ExternalExcursionBooking from './site';
import '../style.css';
import './style.css';

export const dynamic='force-dynamic';

export const metadata:Metadata={
 title:'Book Excursions | Nirili Tours · Dhiffushi',
 description:'Book Nirili Tours excursions in Dhiffushi even if you are staying at another hotel or guesthouse. Snorkeling, sandbanks, fishing, dolphin trips and more.',
 robots:{index:true,follow:true}
};

export default function ExternalExcursionsPage(){
 return <ExternalExcursionBooking/>;
}
