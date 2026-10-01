// Guest-facing website translation. The management system (PMS) is English only; translation is
// switched on by <SiteTranslator/>, which only the public websites and the in-house guest portal mount.
export type Language='en'|'zh'|'ru'|'de'|'fr'|'it'|'es'|'bn';
export const languages=[['en','English'],['zh','中文'],['ru','Русский'],['de','Deutsch'],['fr','Français'],['it','Italiano'],['es','Español'],['bn','বাংলা']] as const;
export const locales:Record<Language,string>={en:'en-GB',zh:'zh-Hans',ru:'ru',de:'de',fr:'fr',it:'it',es:'es',bn:'bn'};
const valid=(v:unknown):v is Language=>languages.some(([id])=>id===v);
const KEY='nirili-language',COOKIE='nirili_lang',EVENT='nirili-language';

let active=false;
let current:Language='en';
const catalogs:Partial<Record<Language,Map<string,string>>>={};

function readCookie(){
 try{return document.cookie.split(';').map(c=>c.trim()).find(c=>c.startsWith(COOKIE+'='))?.slice(COOKIE.length+1)||'';}catch{return '';}
}
// One choice for every Nirili subdomain: stay., tours., dine. etc. share the cookie.
function writeCookie(lang:Language){
 try{
  const host=location.hostname,shared=host==='nirilihotels.com'||host.endsWith('.nirilihotels.com');
  document.cookie=COOKIE+'='+lang+'; Path=/; Max-Age=31536000; SameSite=Lax'+(shared?'; Domain=.nirilihotels.com':'')+(location.protocol==='https:'?'; Secure':'');
 }catch{}
}
function browserLanguage():Language{
 try{
  for(const tag of navigator.languages||[navigator.language]){
   const base=String(tag||'').toLowerCase().split('-')[0];
   if(valid(base))return base;
  }
 }catch{}
 return 'en';
}

// Order: ?lang= link, the guest's saved choice (shared across subdomains), then the browser language.
export function detectLanguage():Language{
 if(typeof window==='undefined')return 'en';
 try{const q=new URLSearchParams(location.search).get('lang');if(valid(q)){remember(q);return q;}}catch{}
 const cookie=readCookie();if(valid(cookie))return cookie;
 try{const v=localStorage.getItem(KEY);if(valid(v))return v;}catch{}
 return browserLanguage();
}
function remember(lang:Language){writeCookie(lang);try{localStorage.setItem(KEY,lang);}catch{}}

export function activateSiteLanguage(){
 if(!active){
  active=true;current=detectLanguage();
  // Pickers rendered before activation show English until told otherwise.
  if(current!=='en')window.dispatchEvent(new Event(EVENT));
 }
 return current;
}
export function siteTranslationActive(){return active;}
export function getLanguage():Language{return active?current:'en';}
export function setLanguage(lang:Language){
 if(!valid(lang))return;
 current=lang;remember(lang);
 if(typeof window!=='undefined')window.dispatchEvent(new Event(EVENT));
}
export function subscribe(fn:()=>void){window.addEventListener(EVENT,fn);return()=>window.removeEventListener(EVENT,fn);}

// Reviewed translations, one file per language, loaded only when a guest picks that language.
const loaders:Record<Exclude<Language,'en'>,()=>Promise<{default:Record<string,string>}>>={
 zh:()=>import('./site/zh.json'),ru:()=>import('./site/ru.json'),de:()=>import('./site/de.json'),fr:()=>import('./site/fr.json'),it:()=>import('./site/it.json'),es:()=>import('./site/es.json'),bn:()=>import('./site/bn.json'),
};
export const normalizeKey=(s:string)=>s.replace(/\s+/g,' ').trim().toLowerCase();
export function catalogFrom(entries:Record<string,string>){return new Map(Object.entries(entries).map(([k,v])=>[normalizeKey(k),v]));}
export async function loadCatalog(lang:Language){
 if(lang==='en')return new Map<string,string>();
 if(!catalogs[lang])catalogs[lang]=catalogFrom((await loaders[lang]()).default);
 return catalogs[lang]!;
}
export function catalogFor(lang:Language){return catalogs[lang];}

const MONTHS=['jan','feb','mar','apr','may','jun','jul','aug','sep','oct','nov','dec'];
// "Fri, 2 Oct 2026", "2 Oct 2026", "Fri 2 Oct" → the guest's own date format.
function translateDate(text:string,lang:Language){
 const m=text.match(/^(?:(Mon|Tue|Wed|Thu|Fri|Sat|Sun)[a-z]*,?\s+)?(\d{1,2})\s+(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\.?(?:\s+(\d{4}))?$/i);
 if(!m)return null;
 const month=MONTHS.indexOf(m[3].slice(0,3).toLowerCase()),year=m[4]?Number(m[4]):new Date().getFullYear();
 const date=new Date(Date.UTC(year,month,Number(m[2])));
 if(Number.isNaN(date.getTime()))return null;
 return new Intl.DateTimeFormat(locales[lang],{timeZone:'UTC',day:'numeric',month:'short',...(m[1]?{weekday:'short'}:{}),...(m[4]?{year:'numeric'}:{})}).format(date);
}

const NUMBER=/[$€£]?\d+(?:[.,:]\d+)*/g;
// Looks up reviewed translations: exact text, text around symbols (·, :, →), then text with its
// numbers, prices and times swapped for {0}, {1}… ("2 guests" → "{0} guests"). Returns null if unknown.
export function lookup(text:string,lang:Language,catalog=catalogFor(lang)):string|null{
 if(lang==='en'||!catalog)return null;
 const clean=text.replace(/\s+/g,' ').trim();
 if(!clean||!/\p{L}/u.test(clean))return null;
 const hit=catalog.get(clean.toLowerCase());if(hit!==undefined)return hit;
 const decorated=clean.match(/^([^\p{L}\p{N}]*)(.*?)([\s:·%…→↑↗↓,.!?)(]*)$/u);
 if(decorated&&(decorated[1]||decorated[3])){const v=catalog.get(decorated[2].toLowerCase());if(v!==undefined)return decorated[1]+v+decorated[3];}
 const date=translateDate(clean,lang);if(date)return date;
 const numbers=clean.match(NUMBER);
 if(numbers){
  let i=0;const key=clean.replace(NUMBER,()=>'{'+(i++)+'}');
  const v=catalog.get(key.toLowerCase());
  if(v!==undefined)return v.replace(/\{(\d+)\}/g,(_,n)=>numbers[Number(n)]??'');
 }
 return null;
}

export function translate(text:string,lang:Language=getLanguage()):string{
 if(lang==='en'||!text)return text;
 const found=lookup(text,lang);
 if(found===null)return text;
 const lead=text.match(/^\s*/)![0],trail=text.match(/\s*$/)![0];
 return lead+found+trail;
}
export function localizedConfirm(message?:string){return window.confirm(translate(message||''));}
export function localizedAlert(message?:any){window.alert(typeof message==='string'?translate(message):message);}
