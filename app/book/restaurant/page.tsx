import DiningMenu from '../../restaurant/guest/menu';
import './style.css';

export const dynamic='force-dynamic';

export default function PublicRestaurantPage(){
 return <main className="nirili-public-restaurant">
  <section className="restaurant-intro">
   <div>
    <span>NIRILI RESTAURANT · DHIFFUSHI</span>
    <h1>Island dining,<br/>connected to Nirili POS.</h1>
    <p>View the live Nirili menu, choose your table and send your walk-in order directly to the cashier and kitchen.</p>
    <div className="restaurant-meta">
     <article><b>Location</b><small>Nirili Villa, Dhiffushi, Kaafu Atoll, Maldives</small></article>
     <article><b>Breakfast</b><small>07:00–09:00</small></article>
     <article><b>Lunch</b><small>12:00–15:00 · Friday 13:30–15:00</small></article>
     <article><b>Dinner</b><small>18:00–21:00</small></article>
    </div>
   </div>
   <div className="restaurant-mark">NIRILI<br/>RESTAURANT</div>
  </section>
  <section className="restaurant-order">
   <div className="restaurant-order-head"><span>LIVE MENU & WALK-IN ORDER</span><h2>Choose your table and order.</h2><p>The menu and prices below come from the Nirili POS system.</p></div>
   <DiningMenu mode="walkin" embedded/>
  </section>
 </main>;
}
