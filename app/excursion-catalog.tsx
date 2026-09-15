'use client';
import {UiText,UiField,UiOption} from './ui-language';

import {Waves, Video, Sparkles} from 'lucide-react';
import './excursion-catalog.css';

export default function ExcursionCatalog({items,onBook,canBook=true}:{items:any[];onBook?:(item:any)=>void;canBook?:boolean}){
 return <UiField as="section" className="nirili-excursions" aria-label="Nirili Tours excursion prices">
  <header className="excursion-intro"><small><UiText>NIRILI TOURS · DHIFFUSHI, MALDIVES</UiText></small><h2><UiText>Experience our island</UiText></h2><p><UiText>Explore the ocean, discover sandbanks and enjoy dinner by the sea.</UiText></p><div><span><UiText>Prices in USD per person</UiText></span><span><UiText>Minimum 2 guests</UiText></span><span><Video size={18} aria-hidden="true"/> <UiText>Free underwater videos</UiText></span></div></header>
  <UiText>{['Excursions','Combined packages','Special package'].map(group=><section className="excursion-group" key={group}><h3><UiText>{group}</UiText></h3><div className="excursion-grid"><UiText>{items.filter(item=>(item.group||'Excursions')===group).map(item=><article className={group==='Special package'?'excursion-card excursion-special':'excursion-card'} key={item.id}><div className="excursion-icon"><UiText>{group==='Special package'?<Sparkles aria-hidden="true"/>:<Waves aria-hidden="true"/>}</UiText></div><h4><UiText>{item.name}</UiText></h4><p><UiText>{item.detail}</UiText></p><div className="excursion-price"><strong>$<UiText>{(item.cents/100).toFixed(0)}</UiText></strong><span><UiText>/ person</UiText></span></div><UiText>{onBook&&<button type="button" disabled={!canBook} onClick={()=>onBook(item)}><UiText>{canBook?'Book excursion':'Available after check-in'}</UiText></button>}</UiText></article>)}</UiText></div></section>)}</UiText>
 </UiField>;
}
