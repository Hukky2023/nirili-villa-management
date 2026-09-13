'use client';
import {Waves, Video, Sparkles} from 'lucide-react';
import './excursion-catalog.css';

export default function ExcursionCatalog({items,onBook,canBook=true}:{items:any[];onBook?:(item:any)=>void;canBook?:boolean}){
 return <section className="nirili-excursions" aria-label="Nirili Tours excursion prices">
  <header className="excursion-intro"><small>NIRILI TOURS · DHIFFUSHI, MALDIVES</small><h2>Experience our island</h2><p>Explore the ocean, discover sandbanks and enjoy dinner by the sea.</p><div><span>Prices in USD per person</span><span>Minimum 2 guests</span><span><Video size={18} aria-hidden="true"/> Free underwater videos</span></div></header>
  {['Excursions','Combined packages','Special package'].map(group=><section className="excursion-group" key={group}><h3>{group}</h3><div className="excursion-grid">{items.filter(item=>(item.group||'Excursions')===group).map(item=><article className={group==='Special package'?'excursion-card excursion-special':'excursion-card'} key={item.id}><div className="excursion-icon">{group==='Special package'?<Sparkles aria-hidden="true"/>:<Waves aria-hidden="true"/>}</div><h4>{item.name}</h4><p>{item.detail}</p><div className="excursion-price"><strong>${(item.cents/100).toFixed(0)}</strong><span>/ person</span></div>{onBook&&<button type="button" disabled={!canBook} onClick={()=>onBook(item)}>{canBook?'Book excursion':'Available after check-in'}</button>}</article>)}</div></section>)}
 </section>;
}
