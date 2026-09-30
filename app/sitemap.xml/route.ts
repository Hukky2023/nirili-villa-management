import {baseExcursionMenu,loadExcursionMenu} from '../../lib/excursion-menu';
import {HOTEL_ORIGIN} from '../hotel/seo';

const xml=(value:string)=>value.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&apos;');
export async function GET(request:Request){
 if(!['nirilihotels.com','www.nirilihotels.com'].includes(new URL(request.url).hostname))return new Response('Not Found',{status:404});
 const items=await loadExcursionMenu().catch(()=>baseExcursionMenu());
 const paths=['/','/hotel/dhiffushi','/hotel/dhiffushi-airport-transfer','/hotel/maldives-packages','/hotel/excursions',...items.map(item=>'/hotel/excursions/'+encodeURIComponent(item.id))];
 const body='<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">'+[...new Set(paths)].map(path=>'<url><loc>'+xml(HOTEL_ORIGIN+path)+'</loc></url>').join('')+'</urlset>';
 return new Response(body,{headers:{'Content-Type':'application/xml; charset=utf-8','Cache-Control':'public, max-age=300'}});
}
