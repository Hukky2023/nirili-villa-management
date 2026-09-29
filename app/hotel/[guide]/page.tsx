import Link from 'next/link';
import {notFound} from 'next/navigation';
import {Fonts,SiteHeader,SiteFooter,STAY,TRANSFERS,WHATSAPP,img} from '../chrome';
import {hotelMetadata} from '../seo';
import '../home.css';
import '../excursions/style.css';

const guides={
 'dhiffushi':{
  title:'Dhiffushi Island Guide | Stay & Explore with Nirili Villa',
  description:'Plan a stay on Dhiffushi in Kaafu Atoll, Maldives. Find Nirili Villa rooms, airport transfers, snorkelling excursions and tips for your island holiday.',
  heading:'Discover Dhiffushi, Maldives',
  intro:'Make Dhiffushi your base for a Maldives holiday with time for the beach, local island life and days on the water. Nirili Villa brings your stay, meals, transfers and Nirili Tours excursions together.',
  sections:[
   {heading:'Where to stay on Dhiffushi',text:'Nirili Villa is a locally run guesthouse on Dhiffushi in Kaafu Atoll. Choose your travel dates, check room availability and compare the meal plans and room packages shown in Nirili Stay. Check the included services for your selected package before booking.'},
   {heading:'Getting to Dhiffushi from the airport',text:'Arrange your arrival and return speedboat transfers between Velana International Airport and Dhiffushi. Share your flight details, number of passengers and accommodation name so the team can help plan your journey. Confirm the current departure time and meeting point for your travel date.'},
   {heading:'Things to do in Dhiffushi',text:'Explore turtle snorkelling, nurse shark snorkelling, Coral Garden, Fish Tank, sandbank trips, dolphin watching and fishing with Nirili Tours. Open each excursion to compare the experience and available details. Weather and sea conditions affect boat trips, and wildlife sightings cannot be guaranteed.'},
   {heading:'Staying at another hotel?',text:'You can book Nirili Tours excursions even if you are staying elsewhere on Dhiffushi. Tell us your hotel name and contact number when arranging your trip, and confirm the meeting point with our team. Your accommodation booking remains separate from your Nirili excursion.'}
  ],cta:'See rooms and availability',href:STAY
 },
 'dhiffushi-airport-transfer':{
  title:'Dhiffushi Airport Transfer | Speedboat Travel | Nirili',
  description:'Arrange a Velana Airport to Dhiffushi speedboat transfer with Nirili. Plan arrival and return journeys, passenger details and your island meeting point.',
  heading:'Dhiffushi airport transfers',
  intro:'Plan your speedboat journey between Velana International Airport and Dhiffushi with Nirili. Arrange both arrival and return transfers around your travel plans.',
  sections:[
   {heading:'Book your airport to Dhiffushi transfer',text:'Select your travel date and the available transfer option, then enter your passenger details. Keep your flight number and arrival time ready. Check the selected departure, fare and meeting instructions before confirming; do not assume the next boat will connect with every flight.'},
   {heading:'Plan your return to the airport',text:'Give the team your outbound flight details when arranging your return journey. Allow time for the boat trip, airport check-in and any changes caused by sea conditions. Confirm the appropriate departure with the team before finalising your travel plans.'},
   {heading:'From the harbour to your accommodation',text:'Tell us your hotel name and whether you need help getting from the harbour to your accommodation. If you need a buggy, ask about availability and charges. A harbour ride is not automatically included in every speedboat booking.'},
   {heading:'Transfer questions',text:'Travelling with children, extra luggage or a group? Share those details before booking so the team can confirm the suitable option. Current departure availability and charges should be checked in the booking page or with Nirili on WhatsApp.'}
  ],cta:'Check transfer options',href:TRANSFERS
 },
 'maldives-packages':{
  title:'Maldives Holiday Packages in Dhiffushi | Nirili Villa',
  description:'Compare Nirili Villa holiday packages in Dhiffushi, Maldives. Choose your stay and meal plan, and check included excursions and airport transfers.',
  heading:'Maldives holiday packages in Dhiffushi',
  intro:'Find a package that suits your holiday: a comfortable island stay, your preferred meal plan and time to explore Dhiffushi with Nirili Tours.',
  sections:[
   {heading:'Choose the best package for your trip',text:'The best Maldives package depends on how long you want to stay, who you are travelling with and the experiences you want. Start with your dates and guest count, then compare the available Nirili Villa packages and their total cost.'},
   {heading:'Check your meals and room arrangements',text:'Compare bed and breakfast, half-board and full-board options where available. Read the selected package details for included meals, room occupancy and accommodation arrangements. Contact the team if you need a specific bed setup or have dietary requirements.'},
   {heading:'Know which excursions are included',text:'Some stay packages combine accommodation with ocean experiences. Check the exact excursion list on the package you choose; not every package includes every tour. Browse the Nirili Tours excursion pages for details of turtle and shark snorkelling, sandbanks, coral gardens, dolphin watching and fishing.'},
   {heading:'Confirm transfers and the total before booking',text:'Check whether your selected package includes arrival and return airport transfers. Review the guest count, dates, meal plan, included activities and any additional charges before confirming. Ask Nirili for clarification if an inclusion is not explicitly listed.'}
  ],cta:'Compare available packages',href:STAY
 }
};
type GuideKey=keyof typeof guides;
function getGuide(slug:string){
 if(!Object.prototype.hasOwnProperty.call(guides,slug))notFound();
 return guides[slug as GuideKey];
}
export async function generateMetadata({params}:{params:Promise<{guide:string}>}){
 const {guide}=await params;const item=getGuide(guide);
 return hotelMetadata(item.title,item.description,'/hotel/'+guide);
}
export default async function GuidePage({params}:{params:Promise<{guide:string}>}){
 const {guide}=await params;const item=getGuide(guide);
 return <main className="nh nh-sub-page">
  <Fonts/><SiteHeader/>
  <section className="nh-page-hero" style={{backgroundImage:`url("${img('1507525428034-b723cf961d3e',1600)}")`}}>
   <div className="nh-page-hero-inner"><p className="nh-kicker nh-kicker-light">Nirili · Dhiffushi, Maldives</p><h1>{item.heading}</h1><p>{item.intro}</p></div>
  </section>
  <div className="nh-detail"><article className="nh-detail-main">
   {item.sections.map(section=><section className="nh-detail-block" key={section.heading}><h2>{section.heading}</h2><div className="nh-prose"><p>{section.text}</p></div></section>)}
   <nav aria-label="More trip planning information" className="nh-prose">
    <p><Link href="/hotel/dhiffushi">Dhiffushi island guide</Link> · <Link href="/hotel/dhiffushi-airport-transfer">Airport transfers</Link> · <Link href="/hotel/maldives-packages">Holiday packages</Link> · <Link href="/hotel/excursions">Dhiffushi excursions</Link></p>
   </nav>
  </article><aside className="nh-detail-aside"><div className="nh-facts"><h2>Plan with Nirili</h2><a className="nh-btn nh-btn-primary" href={item.href}>{item.cta}</a><a href={WHATSAPP}>Ask on WhatsApp</a></div></aside></div>
  <SiteFooter/>
 </main>;
}
