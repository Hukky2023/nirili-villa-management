import {NextResponse,NextRequest} from 'next/server';

const publicBookingHost='booking.nirilihotels.com';
const niriliStayHost='stay.nirilihotels.com';
const publicHotelHost='nirilihotels.com';
const publicHotelWwwHost='www.nirilihotels.com';
const tabPattern=/^[a-f0-9]{32}$/;

function staySiteResponse(url:URL){
 const stayApi=new Set(['/api/public-booking','/api/public-booking/manage']);
 if(stayApi.has(url.pathname)){
  const response=NextResponse.next();
  response.headers.set('Cache-Control',url.pathname==='/api/public-booking'?'public, max-age=0, must-revalidate':'private, no-store, max-age=0');
  return response;
 }

 if(url.pathname==='/'){
  url.pathname='/book';
  const response=NextResponse.rewrite(url);
  response.headers.set('Cache-Control','public, max-age=0, must-revalidate');
  return response;
 }

 if(url.pathname==='/book'||url.pathname==='/book/manage'){
  const response=NextResponse.next();
  response.headers.set('Cache-Control','public, max-age=0, must-revalidate');
  return response;
 }

 if(url.pathname.startsWith('/api/'))return new NextResponse('Not Found',{status:404});
 url.pathname='/';
 url.search='';
 return NextResponse.redirect(url);
}

function bookingSiteResponse(url:URL){
 const guestApi=new Set(['/api/excursion-weather','/api/public-excursions','/api/public-excursions/manage','/api/guest-auth/login','/api/guest-auth/setup','/api/guest-auth/logout','/api/guest-auth/status','/api/guest-services','/api/restaurant-guest','/api/transport','/api/walkin-transfers','/api/guest-excursion-schedules']);
 // Uploaded menu photos are public; the upload endpoint remains blocked.
 if(/^\/api\/menu-images\/[a-f0-9-]{36}$/.test(url.pathname))return NextResponse.next();
 if(guestApi.has(url.pathname)){
  const response=NextResponse.next();
  response.headers.set('Cache-Control',url.pathname==='/api/public-excursions'?'public, max-age=0, must-revalidate':'private, no-store, max-age=0');
  return response;
 }

 // Room booking has its own dedicated Nirili Stay address.
 if(url.pathname==='/'||url.pathname==='/book'||url.pathname==='/book/manage'){
  const stayUrl=new URL('https://stay.nirilihotels.com');
  if(url.pathname==='/book/manage')stayUrl.pathname='/book/manage';
  stayUrl.search=url.search;
  return NextResponse.redirect(stayUrl,308);
 }

 if(
  url.pathname==='/book/excursions'||url.pathname.startsWith('/book/excursions/')||
  url.pathname==='/book/transfers'||url.pathname.startsWith('/book/transfers/')||
  url.pathname==='/book/restaurant'||url.pathname.startsWith('/book/restaurant/')
 ){
  const response=NextResponse.next();
  response.headers.set('Cache-Control','public, max-age=0, must-revalidate');
  return response;
 }

 // The private in-house guest portal remains separate from all public business pages.
 if(url.pathname==='/stay'||url.pathname.startsWith('/stay/')){
  const response=NextResponse.next();
  response.headers.set('Cache-Control','private, no-store, max-age=0');
  return response;
 }

 if(url.pathname.startsWith('/api/'))return new NextResponse('Not Found',{status:404});
 url.pathname='/';
 url.search='';
 return NextResponse.redirect(url);
}

function hotelSiteResponse(url:URL,method='GET'){
 // Public photo reads only; uploads and management APIs remain private.
 if(['GET','HEAD'].includes(method)&&/^\/api\/menu-images\/[a-f0-9-]{36}$/.test(url.pathname))return NextResponse.next();
 if(url.pathname==='/'){
  url.pathname='/hotel';
  const response=NextResponse.rewrite(url);
  response.headers.set('Cache-Control','public, max-age=0, must-revalidate');
  return response;
 }

 if(url.pathname==='/hotel'||url.pathname.startsWith('/hotel/')){
  const response=NextResponse.next();
  response.headers.set('Cache-Control','public, max-age=0, must-revalidate');
  return response;
 }

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
 if(host===publicHotelWwwHost){
  url.hostname=publicHotelHost;
  url.port='';
  return NextResponse.redirect(url,308);
 }

 // Dedicated public websites stay isolated from the management application.
 if(host===publicHotelHost)return hotelSiteResponse(url,request.method);
 if(host===niriliStayHost)return staySiteResponse(url);
 if(host===publicBookingHost)return bookingSiteResponse(url);

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
