import type {Metadata} from 'next';
import {ArrowLeft,ArrowRight,CarFront,MapPin,Plane,ShipWheel,Waves} from 'lucide-react';
import './style.css';

export const metadata:Metadata={
 title:'Nirili Travels | Dhiffushi',
 description:'Nirili Travels connects local island rides with speedboat and airport transfers for Dhiffushi, Maldives.',
 alternates:{canonical:'https://travels.nirilihotels.com/'},
 robots:{index:true,follow:true}
};

export default function NiriliTravelsPage(){
 return <main className="ntv">
  <header className="ntv-nav">
   <a className="ntv-brand" href="https://www.nirilihotels.com/"><Waves/><span><strong>Nirili Travels</strong><small>DHIFFUSHI · MALDIVES</small></span></a>
   <a className="ntv-back" href="https://www.nirilihotels.com/"><ArrowLeft/> Nirili Hotel</a>
  </header>
  <section className="ntv-hero">
   <div>
    <span className="ntv-kicker"><MapPin/> DHIFFUSHI · KAAFU ATOLL</span>
    <h1>Getting here.<br/><em>Getting around.</em></h1>
    <p>Nirili Travels brings our transport services together. Choose a local island ride with Nirili Ride, or arrange your speedboat and airport transfer with Nirili Transfers.</p>
   </div>
   <ShipWheel className="ntv-hero-icon"/>
  </section>
  <section className="ntv-services">
   <a className="ntv-card" href="https://ride.nirilihotels.com">
    <span className="ntv-icon"><CarFront/></span>
    <small>NIRILI TRAVELS</small>
    <h2>Nirili Ride</h2>
    <p>Buggy and local island transport for luggage, beach trips, restaurant rides and everyday movement around Dhiffushi.</p>
    <b>Open Nirili Ride <ArrowRight/></b>
   </a>
   <a className="ntv-card" href="https://transfers.nirilihotels.com/">
    <span className="ntv-icon"><Plane/></span>
    <small>NIRILI TRAVELS</small>
    <h2>Nirili Transfers</h2>
    <p>Book speedboat and airport transfers between Velana International Airport, Dhiffushi and supported routes.</p>
    <b>Book Nirili Transfers <ArrowRight/></b>
   </a>
  </section>
  <footer className="ntv-footer">
   <span>Nirili Travels · Dhiffushi, Maldives</span>
   <a href="https://www.nirilihotels.com/">Back to Nirili Hotel</a>
  </footer>
 </main>;
}
