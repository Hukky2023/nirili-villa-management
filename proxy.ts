import {NextResponse,NextRequest} from 'next/server';
import {ALIAS_HOSTS,HOSTS,SITES} from './lib/public-sites';

const tabPattern=/^[a-f0-9]{32}$/;
const PUBLIC='public, max-age=0, must-revalidate';
const PRIVATE='private, no-store, max-age=0';

function cache(response:NextResponse,value:string){
 response.headers.set('Cache-Control',value);
 return response;
}

// Each public service has its own subdomain, which serves the service's page at "/".
type Service='stay'|'tours'|'dine'|'transfers'|'ride'|'watersports'|'agents'|'operators'|'my';
const SERVICE_HOME:Record<Exclude<Service,'stay'>,string>={
 tours:'/book/excursions',
 dine:'/book/restaurant',
 transfers:'/book/transfers',
 ride:'/book/ride',
 watersports:'/book/water-sports',
 agents:'/book/agents',
 operators:'/operators',
 my:'/stay',
};
const SERVICE_BY_HOST:Record<string,Exclude<Service,'stay'>>={
 [HOSTS.tours]:'tours',
 [HOSTS.dine]:'dine',
 [HOSTS.transfers]:'transfers',
 [HOSTS.ride]:'ride',
 [HOSTS.watersports]:'watersports',
 [HOSTS.agents]:'agents',
 [HOSTS.operators]:'operators',
 [HOSTS.my]:'my',
};

const under=(path:string,prefix:string)=>path===prefix||path.startsWith(prefix+'/');

// The service that owns an app path, and the path to use on that service's own host.
function serviceFor(path:string):{service:Service;path:string}|null{
 if(path==='/'||path==='/book')return {service:'stay',path:'/'};
 if(path==='/book/manage')return {service:'stay',path};
 for(const [service,home] of Object.entries(SERVICE_HOME)){
  if(under(path,home))return {service:service as Service,path:path===home?'/':path};
 }
 return null;
}

function serviceRedirect(url:URL,target:{service:Service;path:string}){
 const next=new URL(SITES[target.service]);
 next.pathname=target.path;
 next.search=url.search;
 return NextResponse.redirect(next,308);
}

// Browser APIs used by the public booking pages and the guest portal.
const guestApi=new Set(['/api/excursion-weather','/api/public-excursions','/api/public-excursions/manage','/api/guest-auth/login','/api/guest-auth/setup','/api/guest-auth/logout','/api/guest-auth/status','/api/guest-services','/api/restaurant-guest','/api/transport','/api/walkin-transfers','/api/guest-excursion-schedules','/api/public-ride','/api/public-water-sports','/api/public-booking/find','/api/translate']);

function guestApiResponse(url:URL){
 // Uploaded menu photos are public; the upload endpoint remains blocked.
 if(/^\/api\/menu-images\/[a-f0-9-]{36}$/.test(url.pathname))return NextResponse.next();
 if(guestApi.has(url.pathname))return cache(NextResponse.next(),url.pathname==='/api/public-excursions'?PUBLIC:PRIVATE);
 return null;
}

function staySiteResponse(url:URL){
 const stayApi=new Set(['/api/public-booking','/api/public-booking/manage','/api/public-booking/find']);
 if(stayApi.has(url.pathname))return cache(NextResponse.next(),url.pathname==='/api/public-booking'?PUBLIC:PRIVATE);

 if(url.pathname==='/'){
  url.pathname='/book';
  return cache(NextResponse.rewrite(url),PUBLIC);
 }
 if(url.pathname==='/book/manage')return cache(NextResponse.next(),PRIVATE);

 const owner=serviceFor(url.pathname);
 if(owner)return serviceRedirect(url,owner);
 if(url.pathname.startsWith('/api/'))return new NextResponse('Not Found',{status:404});
 url.pathname='/';
 url.search='';
 return NextResponse.redirect(url);
}

// The partner Agent Portal APIs are served only on the agents host.
const agentApi=new Set(['/api/agent-portal/session','/api/agent-portal/bookings','/api/agent-portal/travel']);
// Operator portal APIs are served only on the operators host.
const operatorApi=new Set(['/api/operator-portal/session','/api/operator-portal/speedboats','/api/operator-portal/buggy','/api/operator-portal/crew']);

function serviceSiteResponse(url:URL,service:Exclude<Service,'stay'>){
 if(service==='agents'&&agentApi.has(url.pathname))return cache(NextResponse.next(),PRIVATE);
 if(service==='operators'&&operatorApi.has(url.pathname))return cache(NextResponse.next(),PRIVATE);
 const api=guestApiResponse(url);
 if(api)return api;
 const home=SERVICE_HOME[service],pageCache=service==='my'||service==='agents'||service==='operators'?PRIVATE:PUBLIC;

 if(url.pathname==='/'){
  url.pathname=home;
  return cache(NextResponse.rewrite(url),pageCache);
 }

 const owner=serviceFor(url.pathname);
 // The service's own sub-pages (details, manage links) stay on this host; its home lives at "/".
 if(owner?.service===service&&owner.path!=='/')return cache(NextResponse.next(),pageCache);
 if(owner)return serviceRedirect(url,owner);

 if(url.pathname.startsWith('/api/'))return new NextResponse('Not Found',{status:404});
 url.pathname='/';
 url.search='';
 return NextResponse.redirect(url);
}

// excursions., restaurant. and travels. forward to the service's real address. Keeps the
// same path, so e.g. excursions.nirilihotels.com/book/excursions/manage still reaches the right page.
function aliasSiteResponse(url:URL,target:string){
 if(target==='main')return NextResponse.redirect(SITES.main+'/#travel',308);
 const next=new URL(SITES[target as keyof typeof SITES]);
 next.pathname=url.pathname;
 next.search=url.search;
 return NextResponse.redirect(next,308);
}

// booking.nirilihotels.com is retired: forward every page to the service's own subdomain.
function bookingSiteResponse(url:URL){
 const api=guestApiResponse(url);
 if(api)return api;

 // Guests already signed in to the portal here (with push notifications tied to this origin)
 // keep working until they next open the portal from a new link.
 if(under(url.pathname,'/stay'))return cache(NextResponse.next(),PRIVATE);

 const owner=serviceFor(url.pathname);
 if(owner)return serviceRedirect(url,owner);
 if(url.pathname.startsWith('/api/'))return new NextResponse('Not Found',{status:404});
 return NextResponse.redirect(SITES.main,308);
}

// Short, printable links on the main domain, e.g. nirilihotels.com/tours.
const SHORTCUTS:Record<string,string>={
 '/stay':SITES.stay,'/book':SITES.stay,'/rooms':SITES.stay,
 '/tours':SITES.tours,
 '/dine':SITES.dine,'/restaurant':SITES.dine,'/menu':SITES.dine,
 '/transfers':SITES.transfers,'/speedboat':SITES.transfers,
 '/ride':SITES.ride,'/buggy':SITES.ride,
 '/watersports':SITES.watersports,'/water-sports':SITES.watersports,
 '/agents':SITES.agents,'/partners':SITES.agents,
 '/operators':SITES.operators,
 '/my':SITES.my,'/guest':SITES.my,
};

function hotelSiteResponse(url:URL,method='GET'){
 // Public photo reads only; uploads and management APIs remain private.
 if(method==='POST'&&url.pathname==='/api/translate')return cache(NextResponse.next(),PRIVATE);
 if(['GET','HEAD'].includes(method)&&/^\/api\/menu-images\/[a-f0-9-]{36}$/.test(url.pathname))return NextResponse.next();
 if(url.pathname==='/'){
  url.pathname='/hotel';
  return cache(NextResponse.rewrite(url),PUBLIC);
 }
 // Excursions live on the tours site; keep old guide links working.
 if(under(url.pathname,'/hotel/excursions')){
  const id=url.pathname.slice('/hotel/excursions/'.length);
  return NextResponse.redirect(SITES.tours+(id?'/book/excursions/details/'+id:'/'),308);
 }
 if(under(url.pathname,'/hotel'))return cache(NextResponse.next(),PUBLIC);

 const shortcut=SHORTCUTS[url.pathname.toLowerCase().replace(/\/+$/,'')];
 if(shortcut)return NextResponse.redirect(shortcut+'/'+url.search,302);

 // Keep all management APIs and application pages inaccessible on the public hotel domain.
 if(url.pathname.startsWith('/api/'))return new NextResponse('Not Found',{status:404});
 url.pathname='/';
 url.search='';
 return NextResponse.redirect(url);
}

function requestTab(request:NextRequest,url:URL){
 const direct=url.searchParams.get('tab')||'';
 if(tabPattern.test(direct))return direct;

 // Client-side fetches call /api/* without repeating the page's ?tab= value.
 // Same-origin Referer keeps the API request tied to the tab-specific session.
 if(url.pathname.startsWith('/api/')){
  const referer=request.headers.get('referer');
  if(referer)try{
   const source=new URL(referer);
   const fromPage=source.searchParams.get('tab')||'';
   if(source.origin===url.origin&&tabPattern.test(fromPage))return fromPage;
  }catch{}
 }
 return '';
}

function routeRequest(request:NextRequest){
 const url=new URL(request.url);
 const host=(request.headers.get('host')||'').split(':')[0].toLowerCase();

 // Canonicalize www to the main hotel domain.
 if(host===HOSTS.www){
  url.hostname=HOSTS.main;
  url.port='';
  return NextResponse.redirect(url,308);
 }

 // Dedicated public websites stay isolated from the management application.
 if(host===HOSTS.main)return hotelSiteResponse(url,request.method);
 if(host===HOSTS.stay)return staySiteResponse(url);
 if(SERVICE_BY_HOST[host])return serviceSiteResponse(url,SERVICE_BY_HOST[host]);
 if(host===HOSTS.booking)return bookingSiteResponse(url);
 if(ALIAS_HOSTS[host])return aliasSiteResponse(url,ALIAS_HOSTS[host]);

 const id=requestTab(request,url),valid=tabPattern.test(id);
 if(!valid&&!url.pathname.startsWith('/api/')&&request.method==='GET'){
  url.searchParams.set('tab',crypto.randomUUID().replace(/-/g,''));
  const response=NextResponse.redirect(url);
  response.headers.set('Cache-Control','private, no-store');
  return response;
 }
 const headers=new Headers(request.headers);
 headers.delete('x-nirili-tab');
 if(valid)headers.set('x-nirili-tab',id);
 const response=NextResponse.next({request:{headers}});
 response.headers.set('Cache-Control','private, no-store, max-age=0');
 return response;
}

export const config={matcher:['/((?!_next|assets|favicon|.*\\.).*)']};


export function proxy(request:NextRequest){
 const response=routeRequest(request);
 response.headers.set('X-Content-Type-Options','nosniff');
 response.headers.set('X-Frame-Options','DENY');
 response.headers.set('Referrer-Policy','strict-origin-when-cross-origin');
 response.headers.set('Strict-Transport-Security','max-age=31536000');
 response.headers.set('Content-Security-Policy',"object-src 'none'; base-uri 'self'; frame-ancestors 'none'");
 return response;
}
