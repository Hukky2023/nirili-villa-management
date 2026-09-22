import {
 ArrowRight, BedDouble, CheckCircle2, Compass, Fish, Heart, MapPin,
 Palmtree, Plane, ShipWheel, Sparkles, Star, Sun, UtensilsCrossed, Waves
} from 'lucide-react';

const BOOK='https://booking.nirilihotels.com';

const experiences=[
 {title:'Turtle Snorkeling',text:'Swim over clear reefs and look for turtles with our local excursion team.',icon:<Waves/>},
 {title:'Shark Adventure',text:'A signature Maldives ocean experience arranged with Nirili Tours.',icon:<Fish/>},
 {title:'Sandbank Escape',text:'Step onto bright white sand surrounded by turquoise lagoon water.',icon:<Sun/>},
 {title:'Dolphin Cruise',text:'Head out across the atoll in search of dolphins and sunset views.',icon:<ShipWheel/>},
];

export default function HotelHome(){
 return <main className="hotel-home">
  <header className="hotel-nav">
   <a className="hotel-brand" href="/" aria-label="Nirili Villa home">
    <span className="brand-mark"><Sun/></span>
    <span><strong>Nirili Villa</strong><small>DHIFFUSHI · MALDIVES</small></span>
   </a>
   <nav>
    <a href="#stay">Stay</a>
    <a href="#experiences">Experiences</a>
    <a href="#transfer">Transfers</a>
    <a href="#island">Dhiffushi</a>
   </nav>
   <a className="nav-cta" href={BOOK}>Book direct <ArrowRight/></a>
  </header>

  <section className="hotel-hero">
   <div className="hero-content">
    <span className="eyebrow"><MapPin/> DHIFFUSHI ISLAND · MALDIVES</span>
    <h1>Your island stay,<br/><em>made simple.</em></h1>
    <p>Stay close to the beach, discover the Maldives with a local team, and arrange your room, meals, transfers and island experiences in one place.</p>
    <div className="hero-actions">
     <a className="primary" href={BOOK}>Check dates & book <ArrowRight/></a>
     <a className="secondary" href="#stay">Explore Nirili Villa</a>
    </div>
    <div className="hero-trust">
     <span><CheckCircle2/> 14-room island guesthouse</span>
     <span><Heart/> Local Dhiffushi hospitality</span>
     <span><Sparkles/> Book direct with reception</span>
    </div>
   </div>
   <div className="hero-float">
    <small>WELCOME TO DHIFFUSHI</small>
    <strong>Arrive as a Guest,<br/>Leave as a Friend.</strong>
    <div><Palmtree/><span>Island stays · Local adventures · Easy transfers</span></div>
   </div>
  </section>

  <section className="hotel-strip">
   <article><BedDouble/><div><strong>Comfortable rooms</strong><span>King bed with extra single available</span></div></article>
   <article><UtensilsCrossed/><div><strong>Flexible meal plans</strong><span>Breakfast, half board or full board</span></div></article>
   <article><Plane/><div><strong>Airport transfers</strong><span>Speedboat arrangements to Dhiffushi</span></div></article>
   <article><Compass/><div><strong>Island experiences</strong><span>Nirili Tours excursions from Dhiffushi</span></div></article>
  </section>

  <section className="stay-section" id="stay">
   <div className="section-copy">
    <span className="eyebrow">STAY AT NIRILI VILLA</span>
    <h2>A relaxed base for your Maldives trip.</h2>
    <p>Nirili Villa is a 14-room guesthouse on Dhiffushi designed for simple, comfortable island stays. Rooms can accommodate couples, solo travellers, families and small groups.</p>
    <div className="feature-list">
     <span><CheckCircle2/> Double rooms with king bed</span>
     <span><CheckCircle2/> Extra single bed available</span>
     <span><CheckCircle2/> Up to 3 adults or 2 adults + 1 child</span>
     <span><CheckCircle2/> Bed & Breakfast, Half Board and Full Board</span>
    </div>
    <a className="text-link" href={BOOK}>See live availability <ArrowRight/></a>
   </div>
   <div className="stay-visual">
    <div className="room-photo"/>
    <div className="rate-card">
     <small>DIRECT STAYS</small>
     <strong>From $50</strong>
     <span>per night · Bed & Breakfast</span>
     <a href={BOOK}>View dates <ArrowRight/></a>
    </div>
   </div>
  </section>

  <section className="experience-section" id="experiences">
   <div className="section-heading">
    <span className="eyebrow">EXPLORE WITH NIRILI TOURS</span>
    <h2>More than a room.</h2>
    <p>Build your Dhiffushi stay around the ocean, reefs, sandbanks and local experiences that make the Maldives unforgettable.</p>
   </div>
   <div className="experience-grid">
    {experiences.map((x,i)=><article key={x.title} className={'experience-card card-'+(i+1)}>
     <div className="experience-icon">{x.icon}</div>
     <div><h3>{x.title}</h3><p>{x.text}</p></div>
    </article>)}
   </div>
   <div className="experience-cta">
    <div><Sparkles/><span><strong>Want to plan excursions with your stay?</strong><small>Send your room request first and our team can help arrange the rest.</small></span></div>
    <a href={BOOK}>Start your booking <ArrowRight/></a>
   </div>
  </section>

  <section className="transfer-section" id="transfer">
   <div className="transfer-photo"/>
   <div className="transfer-copy">
    <span className="eyebrow">GETTING TO DHIFFUSHI</span>
    <h2>Airport to island, without the guesswork.</h2>
    <p>We can help arrange your speedboat transfer between Velana International Airport and Dhiffushi. Add your arrival details or transfer request when you book and reception can coordinate the journey.</p>
    <div className="transfer-points">
     <span><Plane/> Velana International Airport</span>
     <span><ShipWheel/> Shared speedboat options</span>
     <span><CheckCircle2/> Coordinated with your stay</span>
    </div>
    <a className="primary dark" href={BOOK}>Book your stay <ArrowRight/></a>
   </div>
  </section>

  <section className="island-section" id="island">
   <div className="island-copy">
    <span className="eyebrow">DHIFFUSHI · NORTH MALÉ ATOLL</span>
    <h2>Small island.<br/>Big Maldives days.</h2>
    <p>Wake up near the lagoon, spend the day snorkeling or exploring the atoll, and return to a local island community in the evening.</p>
    <div className="island-notes">
     <article><Waves/><strong>Lagoon life</strong><span>Clear water, reefs and ocean excursions.</span></article>
     <article><Palmtree/><strong>Local island</strong><span>A more personal way to experience the Maldives.</span></article>
     <article><Star/><strong>Easy planning</strong><span>Stay, meals, transfers and excursions with one local team.</span></article>
    </div>
   </div>
   <div className="island-photo"><div><MapPin/><strong>Dhiffushi</strong><span>Kaafu Atoll · Maldives</span></div></div>
  </section>

  <section className="final-cta">
   <span className="eyebrow">BOOK DIRECT</span>
   <h2>Your Dhiffushi stay starts here.</h2>
   <p>Check your dates, choose your meal plan and send your request directly to Nirili Villa reception.</p>
   <a href={BOOK}>Check availability <ArrowRight/></a>
   <small>No management account required. Your request goes directly to reception.</small>
  </section>

  <footer className="hotel-footer">
   <div className="hotel-brand">
    <span className="brand-mark"><Sun/></span>
    <span><strong>Nirili Villa</strong><small>DHIFFUSHI · MALDIVES</small></span>
   </div>
   <p>Arrive as a Guest, Leave as a Friend.</p>
   <div className="footer-links"><a href="#stay">Stay</a><a href="#experiences">Experiences</a><a href={BOOK}>Book</a></div>
  </footer>
 </main>;
}
