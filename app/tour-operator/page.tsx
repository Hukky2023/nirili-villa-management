import Site from './site';
import TourOperatorBookingManager from './booking-manager';
import {Fonts} from '../hotel/chrome';
import './style.css';

export const metadata={
 title:'Tour Operator Portal | Nirili Hotel Dhiffushi',
 description:'Nirili Hotel partner portal for tour operators to create stays, excursions and transfer packages.'
};

export default function Page(){
 return <><Fonts/><Site/><TourOperatorBookingManager/></>;
}
