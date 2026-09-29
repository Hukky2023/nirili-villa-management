import WebsiteChat from '../website-chat';
import {ArrowRight,BedDouble,Bike,MapPin,Menu,Plane,ShipWheel,UtensilsCrossed,Waves} from 'lucide-react';

const services=[
 {
  title:'Nirili Stay',
  eyebrow:'ROOMS · PACKAGES',
  copy:'Check live room availability, choose your meal plan and book Nirili stay packages created by our management team.',
  href:'https://booking.nirilihotels.com/',
  icon:BedDouble,
  className:'hub-stay',
  cta:'Book Rooms & Packages'
 },
 {
  title:'Nirili Excursions',
  eyebrow:'NIRILI TOURS',
  copy:'Book snorkeling, sharks, turtles, sandbanks, dolphins, fishing and other Nirili experiences directly into our excursion system.',
  href:'https://booking.nirilihotels.com/book/excursions',
  icon:ShipWheel,
  className:'hub-excursions',
  cta:'Explore & Book Excursions'
 },
 {
  title:'Nirili Restaurant',
  eyebrow:'MENU · DINE-IN · DELIVERY',
  copy:'See our live restaurant menu, location and service times, then order directly into Nirili POS.',
  href:'https://booking.nirilihotels.com/book/restaurant',
  icon:UtensilsCrossed,
  className:'hub-restaurant',
  cta:'View Menu & Order'
 },
 {
  title:'Nirili Travels',
  eyebrow:'RIDE · TRANSFERS',
  copy:'Your Nirili transport division for local island rides and speedboat airport transfers.',
  href:'#travels',
  icon:Plane,
  className:'hub-travels',
  cta:'Choose Ride or Transfers'
 }
];

function Brand(){
 return <a className="nirili-brand" href="/" aria-label="Nirili Hotel home">
  <span className="brand-icon"><Waves/></span>
  <span className="brand-copy"><strong>NIRILI HOTEL</strong><small>DHIFFUSHI · MALDIVES</small></span>
 </a>;
}

export default function HotelHome(){
 return <main className="nirili-site service-home" id="top">
  <header className="site-header">
   <Brand/>
   <nav className="desktop-nav" aria-label="Nirili services">
    <a href="https://booking.nirilihotels.com/">Nirili Stay</a>
    <a href="https://booking.nirilihotels.com/book/excursions">Nirili Excursions</a>
    <a href="https://booking.nirilihotels.com/book/restaurant">Nirili Restaurant</a>
    <a href="#travels">Nirili Travels</a>
   </nav>
   <a className="header-book" href="https://booking.nirilihotels.com/">Book stay <ArrowRight/></a>
   <details className="mobile-menu">
    <summary aria-label="Open menu"><Menu/></summary>
    <div>
     <a href="https://booking.nirilihotels.com/">Nirili Stay</a>
     <a href="https://booking.nirilihotels.com/book/excursions">Nirili Excursions</a>
     <a href="https://booking.nirilihotels.com/book/restaurant">Nirili Restaurant</a>
     <a href="#travels">Nirili Travels</a>
     <a className="mobile-subservice" href="https://ride.nirilihotels.com">↳ Nirili Ride</a>
     <a className="mobile-subservice" href="https://booking.nirilihotels.com/book/transfers">↳ Nirili Transfers</a>
    </div>
   </details>
  </header>

  <section className="service-hero">
   <div className="service-hero-copy">
    <span>WELCOME TO NIRILI · DHIFFUSHI</span>
    <h1>Stay. Explore.<br/><em>Dine. Travel.</em></h1>
    <p>Nirili brings your Dhiffushi experience together through four connected services: Nirili Stay, Nirili Excursions, Nirili Restaurant and Nirili Travels.</p>
    <div className="service-hero-actions"><a className="hero-primary" href="#services">Explore Nirili <ArrowRight/></a><a className="hero-secondary" href="https://booking.nirilihotels.com/">Book your stay</a></div>
   </div>
   <div className="service-hero-note">
    <MapPin/>
    <strong>Dhiffushi</strong>
    <small>Kaafu Atoll · Maldives</small>
   </div>
  </section>

  <section className="service-hub" id="services">
   <div className="hub-heading">
    <span>THE NIRILI FAMILY</span>
    <h2>Four services.<br/>One connected experience.</h2>
    <p>Choose the Nirili service you need. Each public service connects to the same operational management system behind the scenes.</p>
   </div>
   <div className="hub-grid">
    {services.map(({title,eyebrow,copy,href,icon:Icon,className,cta})=><a className={'hub-card '+className} href={href} key={title}>
     <div className="hub-card-top"><div className="hub-icon"><Icon/></div></div>
     <span>{eyebrow}</span>
     <h3>{title}</h3>
     <p>{copy}</p>
     <b className="hub-cta">{cta} <ArrowRight/></b>
    </a>)}
   </div>
  </section>

  <section className="travel-division" id="travels">
   <div className="travel-division-copy">
    <span>NIRILI TRAVELS</span>
    <h2>One travel division.<br/>Two ways to move.</h2>
    <p>Nirili Travels is the parent transport service. Choose Nirili Ride for local island buggy transport, or Nirili Transfers for speedboat and airport transfers.</p>
   </div>
   <div className="travel-child-grid">
    <a href="https://ride.nirilihotels.com" className="travel-child-card">
     <div><Bike/></div>
     <small>NIRILI TRAVELS</small>
     <h3>Nirili Ride</h3>
     <p>Buggy and local island transport, with driver dispatch and ride status updates.</p>
     <b>Open Nirili Ride <ArrowRight/></b>
    </a>
    <a href="https://booking.nirilihotels.com/book/transfers" className="travel-child-card">
     <div><Plane/></div>
     <small>NIRILI TRAVELS</small>
     <h3>Nirili Transfers</h3>
     <p>Speedboat and airport transfers between Velana International Airport, Dhiffushi and supported routes.</p>
     <b>Book Nirili Transfers <ArrowRight/></b>
    </a>
   </div>
  </section>

  <section className="connection-strip">
   <article><strong>Nirili Stay</strong><span>Rooms, packages, meal plans and stay bookings</span></article>
   <article><strong>Nirili Excursions</strong><span>Nirili Tours experiences and excursion booking</span></article>
   <article><strong>Nirili Restaurant</strong><span>Live menu, dine-in and delivery ordering</span></article>
   <article><strong>Nirili Travels</strong><span>Nirili Ride plus speedboat airport transfers</span></article>
  </section>

  <section className="service-island" id="dhiffushi">
   <div>
    <span>DHIFFUSHI · KAAFU ATOLL</span>
    <h2>Dhiffushi, made easy.</h2>
    <p>Wake up close to turquoise water, explore the atoll by day and return to a relaxed local island. Nirili connects your stay, excursions, dining and travel so your trip feels effortless.</p>
   </div>
   <div className="island-service-links">
    <a href="https://booking.nirilihotels.com/">Book Nirili Stay <ArrowRight/></a>
    <a href="https://booking.nirilihotels.com/book/excursions">Book Nirili Excursions <ArrowRight/></a>
    <a href="#travels">Open Nirili Travels <ArrowRight/></a>
   </div>
  </section>

  <footer className="site-footer">
   <Brand/>
   <p>Arrive as a Guest, Leave as a Friend.</p>
   <div>
    <a href="https://booking.nirilihotels.com/">Nirili Stay</a>
    <a href="https://booking.nirilihotels.com/book/excursions">Nirili Excursions</a>
    <a href="https://booking.nirilihotels.com/book/restaurant">Nirili Restaurant</a>
    <a href="#travels">Nirili Travels</a>
   </div>
  </footer>
  <WebsiteChat/>
 </main>;
}
