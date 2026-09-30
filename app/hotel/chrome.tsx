import {ArrowRight,Menu,Waves,X} from 'lucide-react';
import {SITES} from '../../lib/public-sites';

// Shared header, footer and imagery for the public nirilihotels.com pages.
export const STAY=SITES.stay+'/';
export const EXCURSIONS=SITES.tours+'/';
export const RESTAURANT=SITES.dine+'/';
export const TRANSFERS=SITES.transfers+'/';
export const RIDE=SITES.ride+'/';
export const GUEST_PORTAL=SITES.my+'/';
// Absolute so the shared header and footer also work on the service subdomains.
export const EXCURSION_GUIDE=SITES.main+'/hotel/excursions';
export const WHATSAPP='https://wa.me/9609413977?text=Hello%20Nirili%2C%20I%27d%20like%20help%20planning%20my%20trip%20to%20Dhiffushi.';

export const img=(id:string,w=1400)=>`https://images.unsplash.com/photo-${id}?auto=format&fit=crop&w=${w}&q=82`;

// Stock photos shown until an excursion has its own uploaded photos. The keyword that appears
// earliest in the name wins, so combined trips pick up the photo of their first activity.
const PHOTO_BY_KEYWORD:[string,string][]=[
 ['turtle',img('1437622368342-7a3d73a34c8f')],
 ['shark',img('1560275619-4662e36fa65c')],
 ['manta',img('1618265909156-0507770ef0d0')],
 ['dolphin',img('1547382442-d17c21625a44')],
 ['sandbank dinner',img('1680956987778-205d101369fd')],
 ['vows',img('1680956987778-205d101369fd')],
 ['romantic',img('1680956987778-205d101369fd')],
 ['seafood',img('1768322264423-4b0adf0cf31b')],
 ['fishing',img('1771056511594-05e25e299812')],
 ['sandbank',img('1629267776059-e6b10c44d744')],
 ['resort',img('1540202404-a2f29016b523')],
 ['snorkel',img('1544551763-77ef2d0cfc6c')],
 ['special',img('1629267776059-e6b10c44d744')],
];
export function excursionPhoto(item:{name?:string;galleryUrls?:string[]}){
 if(item.galleryUrls?.[0])return item.galleryUrls[0];
 const name=String(item.name||'').toLowerCase();
 let best='',at=Infinity,len=0;
 for(const [keyword,photo] of PHOTO_BY_KEYWORD){
  const i=name.indexOf(keyword);
  if(i>=0&&(i<at||i===at&&keyword.length>len)){best=photo;at=i;len=keyword.length;}
 }
 return best;
}

// Short, guest-friendly label for an excursion card.
export function excursionTag(name:string,category?:string){
 if(category==='special')return 'Special package';
 if(category==='combined')return 'Combined trip';
 const n=name.toLowerCase();
 if(n.includes('dinner')||n.includes('lunch'))return 'Dining experience';
 if(n.includes('snorkel'))return 'Snorkelling';
 if(n.includes('fishing'))return 'Fishing trip';
 if(n.includes('resort'))return 'Resort day trip';
 return 'Boat trip';
}

const NAV=[
 {label:'Stay',href:STAY},
 {label:'Excursions',href:EXCURSION_GUIDE},
 {label:'Dining',href:RESTAURANT},
 {label:'Travel',href:SITES.main+'/#travel'},
];

export function Fonts(){
 return <>
  <link rel="preconnect" href="https://fonts.googleapis.com"/>
  <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous"/>
  <link rel="stylesheet" precedence="default" href="https://fonts.googleapis.com/css2?family=Fraunces:ital,opsz,wght@0,9..144,300..600;1,9..144,300..500&family=Manrope:wght@400;500;600;700&display=swap"/>
 </>;
}

export function Brand(){
 return <a className="nh-brand is-light" href={SITES.main+'/'} aria-label="Nirili Hotel home">
  <span className="nh-brand-mark"><Waves/></span>
  <span className="nh-brand-text"><strong>Nirili</strong><small>Dhiffushi · Maldives</small></span>
 </a>;
}

// Sits over a dark hero image; pages without a hero pass `solid` for a dark bar instead.
export function SiteHeader({solid=false}:{solid?:boolean}){
 const header=<header className="nh-header">
  <Brand/>
  <nav className="nh-nav" aria-label="Main">
   {NAV.map(n=><a key={n.label} href={n.href}>{n.label}</a>)}
  </nav>
  <a className="nh-btn nh-btn-light nh-header-cta" href={STAY}>Book your stay</a>
  <details className="nh-mobile-menu">
   <summary aria-label="Open menu"><Menu className="i-open"/><X className="i-close"/></summary>
   <div className="nh-mobile-panel">
    {NAV.map(n=><a key={n.label} href={n.href}>{n.label}<ArrowRight/></a>)}
    <a className="nh-sub" href={RIDE}>Island rides<ArrowRight/></a>
    <a className="nh-sub" href={TRANSFERS}>Airport transfers<ArrowRight/></a>
    <a className="nh-btn nh-btn-primary" href={STAY}>Book your stay</a>
   </div>
  </details>
 </header>;
 return solid?<div className="nh-header-bar">{header}</div>:header;
}

export function SiteFooter(){
 return <footer className="nh-footer">
  <div className="nh-footer-brand">
   <Brand/>
   <p>A locally run island hotel on Dhiffushi, Kaafu Atoll, Republic of Maldives.</p>
  </div>
  <div className="nh-footer-col">
   <h3>Plan</h3>
   <a href={STAY}>Rooms &amp; packages</a>
   <a href={EXCURSION_GUIDE}>Excursions</a>
   <a href={RESTAURANT}>Restaurant</a>
  </div>
  <div className="nh-footer-col">
   <h3>Travel</h3>
   <a href={TRANSFERS}>Airport transfers</a>
   <a href={RIDE}>Island rides</a>
  </div>
  <div className="nh-footer-col">
   <h3>Contact</h3>
   <a href={WHATSAPP} target="_blank" rel="noopener noreferrer">WhatsApp +960 941 3977</a>
   <a href={STAY+'book/manage'}>Manage a booking</a>
   <a href={GUEST_PORTAL}>In-house guest login</a>
  </div>
  <p className="nh-footer-base">© {new Date().getFullYear()} Nirili Hotel · Dhiffushi, Maldives</p>
 </footer>;
}
