import WebsiteChat from '../website-chat';
import {ArrowRight,BedDouble,Bike,MapPin,Menu,Plane,ShipWheel,UtensilsCrossed,Waves} from 'lucide-react';

const services=[
 {
  title:'Nirili Stay',
  eyebrow:'ROOMS · PACKAGES',
  copy:'Check live room availability, choose your meal plan and book Nirili stay packages created by our management team.',
  href:'https://booking.nirilihotels.com/#packages',
  icon:BedDouble,
  className:'hub-stay',
  cta:'Book Rooms & Packages'
 },
 {
  title:'Book Excursions',
  eyebrow:'NIRILI TOURS',
  copy:'Book snorkeling, sharks, turtles, sandbanks, dolphins, fishing and other Nirili experiences directly into our excursion system.',
  href:'https://booking.nirilihotels.com/book/excursions',
  icon:ShipWheel,
  className:'hub-excursions',
  cta:'Explore & Book Excursions'
 },
 {
  title:'Airport Transfer',
  eyebrow:'VELANA ↔ DHIFFUSHI',
  copy:'Choose your transfer date and launch. Your reservation goes directly into Nirili Villa Transport management.',
  href:'https://booking.nirilihotels.com/book/transfers',
  icon:Plane,
  className:'hub-transfer',
  cta:'Book Airport Transfer'
 },
 {
  title:'Nirili Ride',
  eyebrow:'RIDE · RENT · EXPLORE',
  copy:'Open Nirili Ride for island transport and vehicle rental services.',
  href:'https://ride.nirilihotels.com',
  icon:Bike,
  className:'hub-ride',
  cta:'Open Nirili Ride'
 },
 {
  title:'Nirili Restaurant',
  eyebrow:'MENU · WALK-IN ORDER',
  copy:'See our live restaurant menu, location and service times, then order as a walk-in guest directly into Nirili POS.',
  href:'https://booking.nirilihotels.com/book/restaurant',
  icon:UtensilsCrossed,
  className:'hub-restaurant',
  cta:'View Menu & Order'
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
    <span>WELCOME TO NIRILI · DHIFFUSHI</span>
    <h1>Stay. Explore.<br/><em>Ride. Dine.</em></h1>
    <p>Your Dhiffushi experience in one place. Book rooms and packages, ocean adventures, airport transfers, island rides and restaurant orders with the Nirili team.</p>
    <div className="service-hero-actions"><a className="hero-primary" href="#services">Explore Nirili <ArrowRight/></a><a className="hero-secondary" href="https://booking.nirilihotels.com/#packages">Book your stay</a></div>
   </div>
   <div className="service-hero-note">
    <MapPin/>
    <strong>Dhiffushi</strong>
    <small>Kaafu Atoll · Maldives</small>
   </div>
  </section>

  <section className="service-hub" id="services">
   <div className="hub-heading">
    <span>YOUR NIRILI EXPERIENCE</span>
    <h2>Everything you need,<br/>one tap away.</h2>
    <p>Choose a service below. Every booking goes directly to the relevant Nirili team and management system.</p>
   </div>
   <div className="hub-grid">
    {services.map(({title,eyebrow,copy,href,icon:Icon,className,cta},index)=><a className={'hub-card '+className+(index===0?' hub-primary':'')} href={href} key={title}>
     <div className="hub-card-top"><div className="hub-icon"><Icon/></div><span className="hub-number">0{index+1}</span></div>
     <span>{eyebrow}</span>
     <h3>{title}</h3>
     <p>{copy}</p>
     <b className="hub-cta">{cta} <ArrowRight/></b>
    </a>)}
   </div>
  </section>

  <section className="connection-strip">
   <article><strong>Stay your way</strong><span>Live rooms, meal plans and Nirili packages</span></article>
   <article><strong>Explore the ocean</strong><span>Nirili Tours excursions connected live</span></article>
   <article><strong>Move with ease</strong><span>Airport transfers and Nirili Ride</span></article>
   <article><strong>Dine with Nirili</strong><span>Live menu and POS-connected walk-in orders</span></article>
  </section>

  <section className="service-island" id="dhiffushi">
   <div>
    <span>DHIFFUSHI · KAAFU ATOLL</span>
    <h2>Dhiffushi, made easy.</h2>
    <p>Wake up close to turquoise water, explore the atoll by day and return to a relaxed local island. Nirili connects your stay, transfers, experiences, rides and dining so your trip feels effortless.</p>
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
