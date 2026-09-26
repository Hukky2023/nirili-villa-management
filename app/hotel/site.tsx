import WebsiteChat from '../website-chat';
import {
 ArrowRight, BedDouble, CheckCircle2, Clock3, Compass, MapPin, Menu,
 Palmtree, Plane, ShipWheel, Sparkles, Star, UtensilsCrossed, Waves
} from 'lucide-react';

const BOOK='https://booking.nirilihotels.com/#book';
const EXCURSIONS='https://booking.nirilihotels.com/book/excursions';
const excursionDetails=(id:string)=>EXCURSIONS+'/details/'+encodeURIComponent(id);

const experiences=[
 {id:'turtle',title:'Turtle Snorkeling',tag:'UNDERWATER',className:'exp-turtle',copy:'Swim clear reefs and meet one of the Maldives’ most loved ocean residents.'},
 {id:'shark',title:'Shark Snorkeling',tag:'ADRENALINE',className:'exp-shark',copy:'A bold open-water experience with nurse sharks and the Nirili Tours team.'},
 {id:'sandbank',title:'Sandbank Escape',tag:'BAREFOOT',className:'exp-sandbank',copy:'White sand, lagoon blue and nothing else competing for your attention.'},
 {id:'dolphin',title:'Dolphin Watching',tag:'OPEN WATER',className:'exp-dolphin',copy:'Cruise the atoll for dolphins, golden-hour skies and wide-open ocean.'},
];

function Brand(){
 return <a className="nirili-brand" href="#top" aria-label="Nirili Hotel home">
  <span className="brand-icon"><Waves/></span>
  <span className="brand-copy"><strong>NIRILI HOTEL</strong><small>DHIFFUSHI · MALDIVES</small></span>
 </a>;
}

export default function HotelHome(){
 return <main className="nirili-site" id="top">
  <header className="site-header">
   <Brand/>
   <nav className="desktop-nav" aria-label="Main navigation">
    <a href="#stay">Stay</a>
    <a href="#transfers">Transfers</a>
    <a href="#experiences">Experiences</a>
    <a href="#dining">Dining</a>
    <a href="#dhiffushi">Dhiffushi</a>
   </nav>
   <a className="header-book" href={BOOK}>Book direct <ArrowRight/></a>
   <details className="mobile-menu">
    <summary aria-label="Open menu"><Menu/></summary>
    <div>
     <a href="#stay">Stay</a>
     <a href="#transfers">Transfers</a>
     <a href="#experiences">Experiences</a>
     <a href="#dining">Dining</a>
     <a href="#dhiffushi">Dhiffushi</a>
     <a className="mobile-book" href={BOOK}>Book direct</a>
    </div>
   </details>
  </header>

  <section className="hero-card">
   <div className="hero-shade"/>
   <div className="hero-bubble bubble-one"/>
   <div className="hero-bubble bubble-two"/>
   <div className="hero-copy">
    <span className="hero-kicker">DHIFFUSHI · MALDIVES</span>
    <h1>DISCOVER<br/>DHIFFUSHI<br/><em>WITH NIRILI</em></h1>
    <p>Island comfort, turquoise days and unforgettable local experiences — all connected by one team.</p>
    <div className="hero-actions">
     <a className="button-white" href={BOOK}>Book your stay <ArrowRight/></a>
     <a className="hero-link" href="#experiences">Explore experiences</a>
    </div>
   </div>
  </section>

  <section className="showcase-section" id="stay">
   <div className="section-title">
    <span>STAY WITH US</span>
    <h2>Nirili stays</h2>
   </div>

   <div className="stay-wrap">
    <article className="stay-card">
     <div className="stay-photo">
      <span className="location-pill"><MapPin/> DHIFFUSHI</span>
     </div>
     <div className="stay-body">
      <h3>Nirili Hotel</h3>
      <p>A relaxed Dhiffushi stay with comfortable rooms, flexible meal plans, transfer support and Nirili Tours experiences close at hand.</p>
      <div className="stay-highlights">
       <span><BedDouble/> Comfortable island rooms</span>
       <span><UtensilsCrossed/> Breakfast, Half Board & Full Board</span>
      </div>
      <a className="outline-button" href={BOOK}>Book Direct & Save</a>
      <a className="solid-button" href={BOOK}>View Hotel <ArrowRight/></a>
     </div>
    </article>
   </div>

   <a className="round-link" href={BOOK}><Sparkles/> Check dates & availability</a>
  </section>

  <section className="transfer-section" id="transfers">
   <div className="transfer-shell">
    <div className="transfer-banner">
     <div>
      <span>ARRIVAL MADE SIMPLE</span>
      <h2>Get here fast.<br/>Slow down later.</h2>
     </div>
    </div>
    <div className="transfer-panel">
     <div className="transfer-steps"><strong>DETAILS</strong><span/> <b>TIME</b><span/> <b>INFO</b></div>
     <div className="field-block">
      <label>TRANSPORT</label>
      <div><ShipWheel/><span><strong>Shared speedboat</strong><small>Airport / Malé area ↔ Dhiffushi</small></span></div>
     </div>
     <div className="trip-toggle"><span>One Way</span><strong>Return Trip</strong></div>
     <div className="transfer-grid">
      <div className="field-block"><label>DEPARTURE</label><div><Plane/><span><strong>Velana International Airport</strong><small>Arrival point</small></span></div></div>
      <div className="field-block"><label>DESTINATION</label><div><MapPin/><span><strong>Dhiffushi</strong><small>Nirili Hotel</small></span></div></div>
     </div>
     <div className="transfer-grid compact">
      <div className="field-block"><label>TRAVEL DATE</label><div><Clock3/><span><strong>Add with booking</strong><small>We coordinate the best departure</small></span></div></div>
      <div className="field-block"><label>PASSENGERS</label><div><Star/><span><strong>Your party</strong><small>Adults + children</small></span></div></div>
     </div>
     <a className="transfer-cta" href={BOOK}>Arrange transfer with my stay <ArrowRight/></a>
     <p className="transfer-help">Need help? WhatsApp us on +960 941 3977.</p>
    </div>
   </div>
  </section>

  <section className="moments-section">
   <div className="moments-shell">
    <div className="moments-copy">
     <span>MAKE IT YOUR MALDIVES</span>
     <h2>CREATE YOUR OWN<br/>NIRILI MOMENTS</h2>
     <p>Stay easy, explore more and build the trip around the ocean days you actually want.</p>
    </div>
    <div className="moment-collage">
     <div className="moment-main"/>
     <div className="moment-small moment-one"/>
     <div className="moment-small moment-two"/>
     <div className="moment-small moment-three"/>
    </div>
   </div>
  </section>

  <section className="experience-section" id="experiences">
   <div className="section-title left">
    <span>NIRILI TOURS</span>
    <h2>Nirili Experiences</h2>
    <p>Turtles, sharks, coral gardens, sandbanks, dolphins, fishing and more — planned around your stay in Dhiffushi.</p>
   </div>

   <div className="experience-scroll">
    {experiences.map(item=><article className="experience-card" key={item.title}>
     <div className={'experience-image '+item.className}><span>{item.tag}</span></div>
     <div className="experience-body">
      <h3>{item.title}</h3>
      <p>{item.copy}</p>
      <a className="outline-button small" href={excursionDetails(item.id)}>View details</a>
      <a className="solid-button small" href={EXCURSIONS}>Book experience <ArrowRight/></a>
     </div>
    </article>)}
   </div>

   <a className="round-link" href={EXCURSIONS}><Compass/> Explore all experiences</a>
  </section>

  <section className="dining-section" id="dining">
   <div className="dining-photo">
    <span className="photo-pill"><UtensilsCrossed/> DINE AT NIRILI</span>
   </div>
   <div className="dining-copy">
    <span className="eyebrow">FROM BREAKFAST TO DINNER</span>
    <h2>Taste the stay.</h2>
    <p>Easy breakfasts before the lagoon, relaxed lunches after the sea and dinner when the island starts to slow down.</p>
    <div className="meal-pills"><span>Bed & Breakfast</span><span>Half Board</span><span>Full Board</span></div>
    <div className="meal-times">
     <span><strong>07:00 – 09:00</strong><small>Breakfast</small></span>
     <span><strong>12:00 – 15:00</strong><small>Lunch · Friday 13:30 – 15:00</small></span>
     <span><strong>18:00 – 21:00</strong><small>Dinner</small></span>
    </div>
    <a className="solid-button dining-book" href={BOOK}>Book a stay with meals <ArrowRight/></a>
   </div>
  </section>

  <section className="island-section" id="dhiffushi">
   <div className="island-copy">
    <span className="eyebrow">DHIFFUSHI · KAAFU ATOLL</span>
    <h2>A local island with resort-blue water.</h2>
    <p>Dhiffushi brings together white sand, calm lagoon days and the character of a real island community. Stay close to the beach, head out across the atoll, then come home to a quieter pace.</p>
    <div className="island-grid">
     <span><Waves/><strong>Lagoon & reef</strong><small>Clear water and easy ocean access.</small></span>
     <span><Palmtree/><strong>Island life</strong><small>A more personal Maldives experience.</small></span>
     <span><ShipWheel/><strong>Easy transfers</strong><small>Speedboat support from arrival to departure.</small></span>
     <span><CheckCircle2/><strong>One local team</strong><small>Stay, meals, transfers and excursions together.</small></span>
    </div>
   </div>
   <div className="island-photo">
    <div className="island-badge"><MapPin/><span><strong>Dhiffushi</strong><small>Kaafu Atoll · Maldives</small></span></div>
   </div>
  </section>

  <section className="final-cta">
   <span>YOUR DHIFFUSHI STORY STARTS HERE</span>
   <h2>Stay. Explore. Remember it all.</h2>
   <p>Choose your dates and let Nirili help connect the rest of your island experience.</p>
   <a href={BOOK}>Check availability <ArrowRight/></a>
  </section>

  <footer className="site-footer">
   <Brand/>
   <p>Arrive as a Guest, Leave as a Friend.</p>
   <div><a href="#stay">Stay</a><a href="#experiences">Experiences</a><a href="#dining">Dining</a><a href={BOOK}>Book</a></div>
  </footer>

  <WebsiteChat/>
 </main>;
}
