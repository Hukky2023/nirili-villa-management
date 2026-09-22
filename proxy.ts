import {NextResponse,NextRequest} from 'next/server';

const guestBookingHost='booking.nirilihotels.com';
const publicHotelHost='nirilihotels.com';
const publicHotelWwwHost='www.nirilihotels.com';

function bookingSiteResponse(url:URL){
 const guestApi=new Set(['/api/public-booking','/api/guest-auth/login','/api/guest-auth/logout','/api/guest-auth/status','/api/guest-services','/api/restaurant-guest','/api/transport','/api/guest-excursion-schedules']);
 if(guestApi.has(url.pathname)){
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

 if(url.pathname==='/book'||url.pathname.startsWith('/book/')){
  const response=NextResponse.next();
  response.headers.set('Cache-Control','public, max-age=0, must-revalidate');
  return response;
 }

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

function hotelSiteResponse(url:URL){
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

export function proxy(request:NextRequest){
 const url=new URL(request.url);
 const host=(request.headers.get('host')||'').split(':')[0].toLowerCase();

 // Canonicalize www to the main hotel domain.
 if(host===publicHotelWwwHost){
  url.hostname=publicHotelHost;
  url.port='';
  return NextResponse.redirect(url,308);
 }

 // Dedicated public websites stay isolated from the management application.
 // Root domain serves the dedicated /hotel homepage; booking subdomain serves /book.
 if(host===publicHotelHost)return hotelSiteResponse(url);
 if(host===guestBookingHost)return bookingSiteResponse(url);

 const id=url.searchParams.get('tab')||'',valid=/^[a-f0-9]{32}$/.test(id);
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
