import WebsiteChat from '../website-chat';
import {ArrowRight,BedDouble,Bike,MapPin,Menu,Plane,ShipWheel,UtensilsCrossed,Waves} from 'lucide-react';

const services=[
 {
  title:'Nirili Stay',
  eyebrow:'ROOMS · PACKAGES',
  copy:'Check live room availability, choose your meal plan and book Nirili stay packages created by our management team.',
  href:'https://booking.nirilihotels.com/#packages',
  icon:BedDouble,
  className:'hub-stay'
 },
 {
  title:'Book Excursions',
  eyebrow:'NIRILI TOURS',
  copy:'Book snorkeling, sharks, turtles, sandbanks, dolphins, fishing and other Nirili experiences directly into our excursion system.',
  href:'https://booking.nirilihotels.com/book/excursions',
  icon:ShipWheel,
  className:'hub-excursions'
 },
 {
  title:'Airport Transfer',
  eyebrow:'VELANA ↔ DHIFFUSHI',
  copy:'Choose your transfer date and launch. Your reservation goes directly into Nirili Villa Transport management.',
  href:'https://booking.nirilihotels.com/book/transfers',
  icon:Plane,
  className:'hub-transfer'
 },
 {
  title:'Nirili Ride',
  eyebrow:'RIDE · RENT · EXPLORE',
  copy:'Open Nirili Ride for island transport and vehicle rental services.',
  href:'https://ride.nirilihotels.com',
  icon:Bike,
  className:'hub-ride'
 },
 {
  title:'Nirili Restaurant',
  eyebrow:'MENU · WALK-IN ORDER',
  copy:'See our live restaurant menu, location and service times, then order as a walk-in guest directly into Nirili POS.',
  href:'https://booking.nirilihotels.com/book/restaurant',
  icon:UtensilsCrossed,
  className:'hub-restaurant'
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
   <nav className="desktop-nav" aria-label="Guest services">
    <a href="#services">Services</a>
    <a href="#dhiffushi">Dhiffushi</a>
    <a href="https://booking.nirilihotels.com/#packages">Stay</a>
   </nav>
   <a className="header-book" href="https://booking.nirilihotels.com/#packages">Book stay <ArrowRight/></a>
   <details className="mobile-menu">
    <summary aria-label="Open menu"><Menu/></summary>
    <div>
     <a href="#services">Guest services</a>
     <a href="https://booking.nirilihotels.com/#packages">Nirili Stay</a>
     <a href="https://booking.nirilihotels.com/book/excursions">Excursions</a>
     <a href="https://booking.nirilihotels.com/book/transfers">Airport Transfer</a>
     <a href="https://ride.nirilihotels.com">Nirili Ride</a>
     <a href="https://booking.nirilihotels.com/book/restaurant">Restaurant</a>
    </div>
   </details>
  </header>

  <section className="service-hero">
   <div className="service-hero-copy">
    <span>DHIFFUSHI · MALDIVES</span>
    <h1>Everything Nirili.<br/><em>One island.</em></h1>
    <p>Stay, explore, transfer, ride and dine with one connected local team. Choose what you need and go straight to the booking experience.</p>
    <a href="#services">Choose a Nirili service <ArrowRight/></a>
   </div>
   <div className="service-hero-note">
    <MapPin/>
    <strong>Dhiffushi</strong>
    <small>Kaafu Atoll · Maldives</small>
   </div>
  </section>

  <section className="service-hub" id="services">
   <div className="hub-heading">
    <span>WHAT WOULD YOU LIKE TO DO?</span>
    <h2>Choose your Nirili experience.</h2>
    <p>Each service is connected to the relevant Nirili management module, so your booking reaches the right team immediately.</p>
   </div>
   <div className="hub-grid">
    {services.map(({title,eyebrow,copy,href,icon:Icon,className},index)=><a className={'hub-card '+className+(index===0?' hub-primary':'')} href={href} key={title}>
     <div className="hub-icon"><Icon/></div>
     <span>{eyebrow}</span>
     <h3>{title}</h3>
     <p>{copy}</p>
     <b>Open <ArrowRight/></b>
    </a>)}
   </div>
  </section>

  <section className="connection-strip">
   <article><strong>Stay</strong><span>Live rooms, meal plans and packages</span></article>
   <article><strong>Explore</strong><span>Excursions connected to Nirili Tours</span></article>
   <article><strong>Move</strong><span>Airport transfers and Nirili Ride</span></article>
   <article><strong>Dine</strong><span>Live menu and POS-connected orders</span></article>
  </section>

  <section className="service-island" id="dhiffushi">
   <div>
    <span>DHIFFUSHI · KAAFU ATOLL</span>
    <h2>Your local island base.</h2>
    <p>Wake up close to turquoise water, spend the day across the atoll, then come back to a quieter island rhythm. Nirili connects the practical parts of your trip so you can enjoy more of it.</p>
   </div>
   <div className="island-service-links">
    <a href="https://booking.nirilihotels.com/#packages">Book a stay <ArrowRight/></a>
    <a href="https://booking.nirilihotels.com/book/excursions">Plan ocean days <ArrowRight/></a>
   </div>
  </section>

  <footer className="site-footer">
   <Brand/>
   <p>Arrive as a Guest, Leave as a Friend.</p>
   <div><a href="https://booking.nirilihotels.com/#packages">Stay</a><a href="https://booking.nirilihotels.com/book/excursions">Excursions</a><a href="https://booking.nirilihotels.com/book/transfers">Transfers</a><a href="https://booking.nirilihotels.com/book/restaurant">Restaurant</a></div>
  </footer>
  <WebsiteChat/>
 </main>;
}
