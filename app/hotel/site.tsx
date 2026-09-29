import Link from 'next/link';
import WebsiteChat from '../website-chat';
import {loadExcursionMenu,baseExcursionMenu} from '../../lib/excursion-menu';
import {EXCURSIONS,Fonts,excursionTag,RESTAURANT,RIDE,STAY,SiteFooter,SiteHeader,TRANSFERS,WHATSAPP,excursionPhoto,img} from './chrome';
import {ArrowRight,ArrowUpRight,BedDouble,Bike,Coffee,Compass,MapPin,MessageCircle,Plane,Sailboat,Sun,UtensilsCrossed,Waves} from 'lucide-react';

const IMAGES={
 hero:img('1507525428034-b723cf961d3e',2400),
 stay:img('1582719478250-c89cae4dc85b',1400),
 evening:img('1643856555919-9787de563a5d',900),
 dining:img('1768322264423-4b0adf0cf31b',1400),
 transfer:img('1530809355496-bac53698afe3',1200),
 ride:img('1632299598724-45be3f29ff61',1200),
 sunset:img('1650024678534-a93a8328ad46',2000),
};

const FEATURED=['turtle','shark','manta','coral','sandbank','dolphin','romantic-sandbank-dinner'];

type MenuItem={id:string;name:string;detail?:string;galleryUrls?:string[]};

async function featuredExcursions(){
 let items:MenuItem[];
 try{items=await loadExcursionMenu();}catch{items=baseExcursionMenu();}
 return FEATURED.map(id=>items.find(x=>x.id===id)).filter((x):x is MenuItem=>Boolean(x)).map(x=>({
  id:x.id,
  name:String(x.name).replace(/\s*\(.*?\)\s*/g,' ').trim(),
  detail:x.detail||'',
  photo:excursionPhoto(x),
  tag:excursionTag(x.name),
 }));
}

export default async function HotelHome(){
 const excursions=await featuredExcursions();
 return <main className="nh" id="top">
  <Fonts/>
  <SiteHeader/>

  <section className="nh-hero" style={{backgroundImage:`url("${IMAGES.hero}")`}}>
   <div className="nh-hero-inner">
    <p className="nh-kicker nh-kicker-light"><MapPin/> Dhiffushi, Kaafu Atoll</p>
    <h1>Nirili Villa, Dhiffushi.<br/><em>Your Maldives island stay.</em></h1>
    <p className="nh-hero-lede">A friendly island hotel with turquoise water at the door. Stay with us, swim with turtles, eat by the sea, and let us arrange the boat that gets you here.</p>
    <div className="nh-hero-actions">
     <a className="nh-btn nh-btn-light" href={STAY}>Check availability <ArrowRight/></a>
     <a className="nh-btn nh-btn-ghost" href="#experiences">Explore excursions</a>
    </div>
   </div>
   <nav className="nh-quick" aria-label="Plan your trip">
    <a href={STAY}><BedDouble/><span><small>Stay</small>Rooms &amp; packages</span><ArrowUpRight/></a>
    <a href={EXCURSIONS}><Sailboat/><span><small>Explore</small>Excursions</span><ArrowUpRight/></a>
    <a href={RESTAURANT}><UtensilsCrossed/><span><small>Dine</small>Menu &amp; ordering</span><ArrowUpRight/></a>
    <a href={TRANSFERS}><Plane/><span><small>Arrive</small>Airport transfers</span><ArrowUpRight/></a>
   </nav>
  </section>

  <section className="nh-intro">
   <p className="nh-kicker">Welcome to Nirili</p>
   <h2>Arrive as a guest, <em>leave as a friend.</em></h2>
   <p>Nirili Villa is a small, locally run hotel on Dhiffushi, a laid-back island in the North Malé Atoll. Everything you need is in one place: your room, days out on the reef, fresh meals and the speedboat from the airport, all arranged by the same team.</p>
   <ul className="nh-pillars">
    <li><Sun/><strong>Local island life</strong><span>Sandy lanes, a friendly village and the lagoon a short walk away.</span></li>
    <li><Compass/><strong>Our own tours</strong><span>Snorkelling, sandbanks and sunset trips run by Nirili Tours.</span></li>
    <li><Coffee/><strong>Meals your way</strong><span>Add a meal plan to your stay, or order from our kitchen.</span></li>
   </ul>
  </section>

  <section className="nh-feature" id="stay">
   <div className="nh-feature-media">
    <img src={IMAGES.stay} alt="Bright hotel room with a view" loading="lazy"/>
    <img className="nh-feature-inset" src={IMAGES.evening} alt="Sunset over the beach" loading="lazy"/>
   </div>
   <div className="nh-feature-copy">
    <p className="nh-kicker">Nirili Stay</p>
    <h2>Rooms made for slow mornings.</h2>
    <p>Wake up, walk to the water, repeat. See live availability, pick a meal plan and choose a stay package that bundles your favourite experiences.</p>
    <ul className="nh-checks">
     <li>Live room availability</li>
     <li>Bed &amp; breakfast, half board or full board</li>
     <li>Stay packages with excursions included</li>
     <li>Manage your booking online</li>
    </ul>
    <a className="nh-btn nh-btn-primary" href={STAY}>See rooms &amp; packages <ArrowRight/></a>
   </div>
  </section>

  <section className="nh-experiences" id="experiences">
   <div className="nh-section-head">
    <div>
     <p className="nh-kicker">Nirili Excursions</p>
     <h2>Days you&rsquo;ll talk about <em>for years.</em></h2>
    </div>
    <p>Turtles, nurse sharks, manta rays and sandbanks all in the waters around Dhiffushi. Our crew knows the best spots and the best time to go.</p>
   </div>
   <div className="nh-exp-grid">
    {excursions.map((x,i)=><Link className={'nh-exp'+(i===0?' is-wide':i===excursions.length-1&&excursions.length%3===1?' is-wide is-last':'')} key={x.id} href={'/hotel/excursions/'+encodeURIComponent(x.id)}>
     {x.photo?<img src={x.photo} alt={x.name} loading="lazy"/>:<span className="nh-exp-empty"><Waves/></span>}
     <span className="nh-exp-body">
      <small>{x.tag}</small>
      <strong>{x.name}</strong>
      <span>{x.detail}</span>
     </span>
    </Link>)}
   </div>
   <div className="nh-center">
    <Link className="nh-btn nh-btn-outline" href="/hotel/excursions">See all excursions <ArrowRight/></Link>
    <a className="nh-btn nh-btn-primary" href={EXCURSIONS}>Book an excursion <ArrowRight/></a>
   </div>
  </section>

  <section className="nh-dining" id="dining">
   <div className="nh-dining-copy">
    <p className="nh-kicker nh-kicker-light">Nirili Restaurant</p>
    <h2>Fresh from the kitchen, <em>close to the sea.</em></h2>
    <p>Curries, kottu and fresh seafood from the grill, plus pizza, pasta, mojitos and milkshakes. Browse the live menu, then order to your table or have it delivered.</p>
    <div className="nh-dining-tags"><span>Dine in</span><span>Delivery</span><span>Live menu</span></div>
    <a className="nh-btn nh-btn-light" href={RESTAURANT}>View menu &amp; order <ArrowRight/></a>
   </div>
   <div className="nh-dining-media"><img src={IMAGES.dining} alt="Grilled fish and octopus with salad" loading="lazy"/></div>
  </section>

  <section className="nh-travel" id="travel">
   <div className="nh-section-head">
    <div>
     <p className="nh-kicker">Nirili Travels</p>
     <h2>Getting here, <em>and getting around.</em></h2>
    </div>
    <p>From the airport to your door and around the island once you&rsquo;re here, our travel team takes care of it.</p>
   </div>
   <div className="nh-travel-grid">
    <a className="nh-travel-card" href={TRANSFERS}>
     <img src={IMAGES.transfer} alt="Speedboat crossing turquoise water" loading="lazy"/>
     <span className="nh-travel-body">
      <span className="nh-icon"><Plane/></span>
      <small>Nirili Transfers</small>
      <strong>Speedboat &amp; airport transfers</strong>
      <span>Speedboat transfers between Velana International Airport, Dhiffushi and other supported routes.</span>
      <b>Book a transfer <ArrowRight/></b>
     </span>
    </a>
    <a className="nh-travel-card" href={RIDE}>
     <img src={IMAGES.ride} alt="Buggy parked on the beach at sunset" loading="lazy"/>
     <span className="nh-travel-body">
      <span className="nh-icon"><Bike/></span>
      <small>Nirili Ride</small>
      <strong>Buggy rides on the island</strong>
      <span>Luggage, beach trips or a lift home after dinner. Request a buggy and get updates on your ride.</span>
      <b>Request a ride <ArrowRight/></b>
     </span>
    </a>
   </div>
  </section>

  <section className="nh-cta" style={{backgroundImage:`linear-gradient(180deg,rgba(6,24,28,.3),rgba(6,24,28,.6)),url("${IMAGES.sunset}")`}}>
   <h2>Your island is <em>waiting.</em></h2>
   <p>Book online in a few minutes, or message us and we&rsquo;ll help plan your whole trip.</p>
   <div className="nh-hero-actions">
    <a className="nh-btn nh-btn-light" href={STAY}>Book your stay <ArrowRight/></a>
    <a className="nh-btn nh-btn-ghost" href={WHATSAPP} target="_blank" rel="noopener noreferrer"><MessageCircle/> Chat on WhatsApp</a>
   </div>
  </section>

  <SiteFooter/>
  <WebsiteChat/>
 </main>;
}
