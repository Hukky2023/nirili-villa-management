import {NextResponse,NextRequest} from 'next/server';

const guestBookingHost='booking.nirilihotels.com';
const publicHotelHost='nirilihotels.com';
const publicHotelWwwHost='www.nirilihotels.com';

function publicSiteResponse(request:NextRequest,url:URL){
 if(url.pathname==='/api/public-booking')return NextResponse.next();

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

 // Public hotel domains must never expose management APIs or pages.
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

 // The main hotel domain and booking subdomain are isolated from management.
 // Both render the public Nirili Villa website and may call only the public booking API.
 if(host===publicHotelHost||host===guestBookingHost){
  return publicSiteResponse(request,url);
 }

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
