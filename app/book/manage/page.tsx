import type {Metadata} from 'next';
import ManageBookingSite from './site';
import './style.css';

export const metadata:Metadata={
 title:'Manage Booking | Nirili Villa · Dhiffushi',
 description:'View, change or cancel your Nirili Villa room booking.',
 referrer:'no-referrer',
 robots:{index:false,follow:false}
};

export default function ManageBookingPage(){return <ManageBookingSite/>}
