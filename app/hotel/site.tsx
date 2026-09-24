import WebsiteChat from '../website-chat';
import {
 ArrowRight, BedDouble, CheckCircle2, Compass, Heart, MapPin,
 Palmtree, Plane, ShipWheel, Sparkles, Star, Sun, UtensilsCrossed, Waves
} from 'lucide-react';

const BOOK='https://booking.nirilihotels.com/#book';

const excursionNames=[
 'Turtle Snorkeling',
 'Shark Snorkeling',
 'Coral Garden',
 'Fish Tank',
 'Dolphin Watching',
 'Fishing + BBQ',
 'Sandbank Escape',
 'Beach Dinner',
];

export default function HotelHome(){
 return <main className="hotel-home">
  <header className="hotel-nav">
   <a className="hotel-brand" href="/" aria-label="Nirili Villa home">
    <span className="brand-mark"><Sun/></span>
    <span><strong>Nirili Villa</strong><small>DHIFFUSHI · MALDIVES</small></span>
   </a>
   <nav aria-label="Main navigation">
    <a href="#stay">Stay</a>
    <a href="#dining">Dining</a>
    <a href="#experiences">Experiences</a>
    <a href="#island">Dhiffushi</a>
    <a href="#transfer">Transfers</a>
   </nav>
   <a className="nav-cta" href={BOOK}>Book direct <ArrowRight/></a>
  </header>

  <section className="hotel-hero">
   <div className="hero-glow hero-glow-one"/>
   <div className="hero-glow hero-glow-two"/>
   <div className="hero-content">
    <span className="eyebrow hero-eyebrow"><MapPin/> DHIFFUSHI ISLAND · MALDIVES</span>
    <h1>Wake up in Dhiffushi.<br/><em>Dive into the Maldives.</em></h1>
    <p>Come for the turquoise water. Stay for the people, the food, the reef days and the feeling of having one local team take care of your whole island escape.</p>
    <div className="hero-actions">
     <a className="primary hero-primary" href={BOOK}>Check dates & book <ArrowRight/></a>
     <a className="secondary" href="#experiences">See the experience</a>
    </div>
    <div className="hero-trust">
     <span><BedDouble/> 14-room island stay</span>
     <span><UtensilsCrossed/> Dining included in your plan</span>
     <span><Compass/> Nirili Tours experiences</span>
    </div>
   </div>

   <div className="hero-float">
    <span className="hero-float-kicker">WELCOME TO OUR ISLAND</span>
    <strong>Arrive as a Guest,<br/>Leave as a Friend.</strong>
    <p>Stay, dine, explore and move around Dhiffushi with one team beside you from arrival to departure.</p>
    <div className="hero-float-footer">
     <span><Heart/> Local hospitality</span>
     <span><Sparkles/> Direct booking</span>
    </div>
   </div>
  </section>

  <section className="hotel-strip" aria-label="Nirili Villa highlights">
   <article><BedDouble/><div><strong>Sleep easy</strong><span>Comfortable island rooms</span></div></article>
   <article><UtensilsCrossed/><div><strong>Taste the stay</strong><span>Breakfast, lunch & dinner</span></div></article>
   <article><Waves/><div><strong>Meet the ocean</strong><span>Reefs, turtles & sandbanks</span></div></article>
   <article><Palmtree/><div><strong>Feel Dhiffushi</strong><span>Local island life by the lagoon</span></div></article>
  </section>

  <section className="stay-section" id="stay">
   <div className="section-copy">
    <span className="eyebrow">STAY AT NIRILI VILLA</span>
    <h2>Your calm place between island days.</h2>
    <p>Nirili Villa is a 14-room guesthouse made for travellers who want a comfortable base and a more personal way to experience the Maldives. Step out for the sea, come back to a team that knows your stay.</p>
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
     <strong>Your island stay</strong>
     <span>Choose your dates to see available rates</span>
     <a href={BOOK}>View dates <ArrowRight/></a>
    </div>
    <div className="photo-caption">
     <span>ROOM TO REST</span>
     <strong>Simple comfort. Island pace.</strong>
    </div>
   </div>
  </section>

  <section className="dining-section" id="dining">
   <div className="dining-visual">
    <div className="dining-photo-main">
     <div className="dining-photo-label">
      <UtensilsCrossed/>
      <span><small>DINNER, DIFFERENTLY</small><strong>Maldives evenings taste better by the sea.</strong></span>
     </div>
    </div>
    <div className="dining-mini">
     <span className="eyebrow">FROM MORNING TO NIGHT</span>
     <strong>Good days start at breakfast and end around the table.</strong>
    </div>
   </div>

   <div className="dining-copy">
    <span className="eyebrow">THE NIRILI DINING EXPERIENCE</span>
    <h2>Eat well. Slow down. Stay a little longer.</h2>
    <p>Dining at Nirili Villa is part of the rhythm of your island stay: an easy breakfast before the sea, a relaxed lunch when you return, and dinner after a day of reefs, sandbanks and sunshine.</p>

    <div className="meal-plan-row">
     <span>Bed & Breakfast</span>
     <span>Half Board</span>
     <span>Full Board</span>
    </div>

    <div className="dining-times">
     <article>
      <Sun/>
      <div><small>BREAKFAST</small><strong>07:00 – 09:00</strong><span>Start light, then head for the lagoon.</span></div>
     </article>
     <article>
      <UtensilsCrossed/>
      <div><small>LUNCH</small><strong>12:00 – 15:00</strong><span>Friday lunch 13:30 – 15:00.</span></div>
     </article>
     <article>
      <Star/>
      <div><small>DINNER</small><strong>18:00 – 21:00</strong><span>Come back together after the day outside.</span></div>
     </article>
    </div>

    <div className="dining-note">
     <Sparkles/>
     <div><strong>Make one evening unforgettable.</strong><span>Ask our team about special beach and sandbank dining experiences.</span></div>
    </div>
   </div>
  </section>

  <section className="experience-section" id="experiences">
   <div className="section-heading experience-heading">
    <span className="eyebrow">EXPLORE WITH NIRILI TOURS</span>
    <h2>Don’t just visit the Maldives.<br/>Get into it.</h2>
    <p>Turtles below you. Dolphins beside the boat. White sand with ocean on every side. Our excursions turn the island around you into the reason you came.</p>
   </div>

   <div className="experience-showcase">
    <article className="experience-feature exp-turtle">
     <div className="experience-number">01</div>
     <div className="experience-story">
      <span>UNDERWATER</span>
      <h3>Turtle & reef days</h3>
      <p>Slip into clear water for turtle snorkeling, coral gardens and colourful reef life with our local excursion team.</p>
     </div>
    </article>

    <div className="experience-stack">
     <article className="experience-small exp-shark">
      <div className="experience-number">02</div>
      <div><span>ADRENALINE</span><h3>Shark adventure</h3><p>A bold signature ocean day with Nirili Tours.</p></div>
     </article>
     <article className="experience-small exp-sandbank">
      <div className="experience-number">03</div>
      <div><span>BAREFOOT</span><h3>Sandbank escape</h3><p>Nothing but bright sand, lagoon blue and open sky.</p></div>
     </article>
    </div>

    <article className="experience-wide exp-dolphin">
     <div className="experience-number">04</div>
     <div>
      <span>OPEN WATER</span>
      <h3>Dolphins, fishing & sunsets</h3>
      <p>Head farther across the atoll for dolphin watching, fishing and golden-hour boat rides.</p>
     </div>
    </article>
   </div>

   <div className="experience-list">
    {excursionNames.map(name=><span key={name}><Sparkles/>{name}</span>)}
   </div>

   <div className="experience-cta">
    <div><Compass/><span><strong>Build the stay around the experiences you want.</strong><small>Book direct and our team can help you plan the rest.</small></span></div>
    <a href={BOOK}>Start your island stay <ArrowRight/></a>
   </div>
  </section>

  <section className="island-section" id="island">
   <div className="island-visual">
    <div className="island-photo">
     <div className="island-pin"><MapPin/><span><strong>Dhiffushi</strong><small>Kaafu Atoll · Maldives</small></span></div>
    </div>
    <div className="island-fact">
     <span>~45 MIN</span>
     <small>by speedboat from Malé / Velana area</small>
    </div>
   </div>

   <div className="island-copy">
    <span className="eyebrow">A LITTLE ABOUT DHIFFUSHI</span>
    <h2>A local island with a resort-blue lagoon.</h2>
    <p>Dhiffushi gives you both sides of the Maldives: turquoise water, white sand and reef adventures, together with the warmth and everyday character of a real island community.</p>
    <p>Spend mornings by the lagoon, afternoons out on the atoll and evenings walking back through the island at your own pace.</p>
    <div className="island-notes">
     <article><Waves/><strong>Lagoon & reefs</strong><span>Clear water and easy access to ocean experiences.</span></article>
     <article><Palmtree/><strong>Local island life</strong><span>A more personal way to know the Maldives.</span></article>
     <article><Sun/><strong>Beach days</strong><span>Slow mornings, bright afternoons and sunset walks.</span></article>
     <article><Heart/><strong>One local team</strong><span>Stay, meals, transfers and excursions together.</span></article>
    </div>
   </div>
  </section>

  <section className="transfer-section" id="transfer">
   <div className="transfer-copy">
    <span className="eyebrow">GETTING TO DHIFFUSHI</span>
    <h2>Airport to island, without the guesswork.</h2>
    <p>We can help arrange your speedboat transfer between the Malé / Velana airport area and Dhiffushi. Add your arrival details when you book and reception can coordinate the journey with your stay.</p>
    <div className="transfer-points">
     <span><Plane/> Velana International Airport</span>
     <span><ShipWheel/> Shared speedboat options</span>
     <span><CheckCircle2/> Coordinated with your booking</span>
    </div>
    <a className="primary dark" href={BOOK}>Book your stay <ArrowRight/></a>
   </div>
   <div className="transfer-photo">
    <div className="transfer-badge"><ShipWheel/><span><small>ARRIVE EASY</small><strong>We help connect the journey.</strong></span></div>
   </div>
  </section>

  <section className="final-cta">
   <span className="eyebrow">YOUR DHIFFUSHI STORY</span>
   <h2>Stay for the room.<br/>Remember everything around it.</h2>
   <p>Choose your dates, your meal plan and your island pace. We’ll be here to help with the rest.</p>
   <a href={BOOK}>Check availability <ArrowRight/></a>
   <small>Direct booking with Nirili Villa · Dhiffushi, Maldives</small>
  </section>

  <footer className="hotel-footer">
   <div className="hotel-brand">
    <span className="brand-mark"><Sun/></span>
    <span><strong>Nirili Villa</strong><small>DHIFFUSHI · MALDIVES</small></span>
   </div>
   <p>Arrive as a Guest, Leave as a Friend.</p>
   <div className="footer-links"><a href="#stay">Stay</a><a href="#dining">Dining</a><a href="#experiences">Explore</a><a href={BOOK}>Book</a></div>
  </footer>
  <WebsiteChat/>
 </main>;
}
