import {NextResponse,NextRequest} from 'next/server';

const legacyBookingHost='booking.nirilihotels.com';
const stayHost='stay.nirilihotels.com';
const excursionsHost='excursions.nirilihotels.com';
const restaurantHost='restaurant.nirilihotels.com';
const transfersHost='transfers.nirilihotels.com';
const guestPortalHost='guest.nirilihotels.com';
const publicHotelHost='www.nirilihotels.com';
const publicHotelRootHost='nirilihotels.com';
const tabPattern=/^[a-f0-9]{32}$/;

function publicRewrite(url:URL,pathname:string,cache='public, max-age=0, must-revalidate'){
 url.pathname=pathname;
 const response=NextResponse.rewrite(url);
 response.headers.set('Cache-Control',cache);
 return response;
}

function publicRedirect(url:URL,origin:string,pathname='/'){
 const target=new URL(origin);
 target.pathname=pathname;
 target.search=url.search;
 return NextResponse.redirect(target,308);
}

function publicImageRead(url:URL,method='GET'){
 return ['GET','HEAD'].includes(method)&&/^\/api\/menu-images\/[a-f0-9-]{36}$/.test(url.pathname);
}

function staySiteResponse(url:URL){
 const stayApi=new Set(['/api/public-booking','/api/public-booking/manage']);
 if(stayApi.has(url.pathname)){
  const response=NextResponse.next();
  response.headers.set('Cache-Control',url.pathname==='/api/public-booking'?'public, max-age=0, must-revalidate':'private, no-store, max-age=0');
  return response;
 }
 if(url.pathname==='/')return publicRewrite(url,'/book');
 if(url.pathname==='/manage')return publicRewrite(url,'/book/manage','private, no-store, max-age=0');
 if(url.pathname==='/book')return publicRedirect(url,'https://stay.nirilihotels.com','/');
 if(url.pathname==='/book/manage')return publicRedirect(url,'https://stay.nirilihotels.com','/manage');
 if(url.pathname.startsWith('/api/'))return new NextResponse('Not Found',{status:404});
 return publicRedirect(url,'https://stay.nirilihotels.com','/');
}

function excursionsSiteResponse(url:URL,method='GET'){
 const excursionApi=new Set(['/api/public-excursions','/api/public-excursions/manage','/api/excursion-weather']);
 if(publicImageRead(url,method))return NextResponse.next();
 if(excursionApi.has(url.pathname)){
  const response=NextResponse.next();
  response.headers.set('Cache-Control',url.pathname==='/api/public-excursions'?'public, max-age=0, must-revalidate':'private, no-store, max-age=0');
  return response;
 }
 if(url.pathname==='/')return publicRewrite(url,'/book/excursions');
 if(url.pathname==='/manage')return publicRewrite(url,'/book/excursions/manage','private, no-store, max-age=0');
 if(url.pathname.startsWith('/details/')){
  const id=url.pathname.slice('/details/'.length);
  return publicRedirect(url,'https://www.nirilihotels.com','/hotel/excursions/'+id);
 }
 if(url.pathname==='/book/excursions')return publicRedirect(url,'https://excursions.nirilihotels.com','/');
 if(url.pathname==='/book/excursions/manage')return publicRedirect(url,'https://excursions.nirilihotels.com','/manage');
 if(url.pathname.startsWith('/api/'))return new NextResponse('Not Found',{status:404});
 return publicRedirect(url,'https://excursions.nirilihotels.com','/');
}

function restaurantSiteResponse(url:URL,method='GET'){
 if(publicImageRead(url,method))return NextResponse.next();
 if(url.pathname==='/api/restaurant-guest'){
  const response=NextResponse.next();
  response.headers.set('Cache-Control','private, no-store, max-age=0');
  return response;
 }
 if(url.pathname==='/')return publicRewrite(url,'/book/restaurant','private, no-store, max-age=0');
 if(url.pathname==='/book/restaurant')return publicRedirect(url,'https://restaurant.nirilihotels.com','/');
 if(url.pathname.startsWith('/api/'))return new NextResponse('Not Found',{status:404});
 return publicRedirect(url,'https://restaurant.nirilihotels.com','/');
}

function transfersSiteResponse(url:URL){
 if(url.pathname==='/api/walkin-transfers'){
  const response=NextResponse.next();
  response.headers.set('Cache-Control','private, no-store, max-age=0');
  return response;
 }
 if(url.pathname==='/')return publicRewrite(url,'/book/transfers','private, no-store, max-age=0');
 if(url.pathname==='/book/transfers')return publicRedirect(url,'https://transfers.nirilihotels.com','/');
 if(url.pathname.startsWith('/api/'))return new NextResponse('Not Found',{status:404});
 return publicRedirect(url,'https://transfers.nirilihotels.com','/');
}

function guestPortalResponse(url:URL,method='GET'){
 const guestApi=new Set([
  '/api/guest-auth/login','/api/guest-auth/setup','/api/guest-auth/logout','/api/guest-auth/status',
  '/api/guest-services','/api/guest-excursion-schedules','/api/guest-push','/api/guest-passport',
  '/api/restaurant-guest','/api/transport'
 ]);
 if(publicImageRead(url,method))return NextResponse.next();
 if(guestApi.has(url.pathname)){
  const response=NextResponse.next();
  response.headers.set('Cache-Control','private, no-store, max-age=0');
  return response;
 }
 if(url.pathname==='/')return publicRewrite(url,'/stay','private, no-store, max-age=0');
 if(url.pathname==='/stay')return publicRedirect(url,'https://guest.nirilihotels.com','/');
 if(url.pathname.startsWith('/api/'))return new NextResponse('Not Found',{status:404});
 return publicRedirect(url,'https://guest.nirilihotels.com','/');
}

function legacyBookingResponse(url:URL){
 if(url.pathname==='/'||url.pathname==='/book')return publicRedirect(url,'https://stay.nirilihotels.com','/');
 if(url.pathname==='/book/manage')return publicRedirect(url,'https://stay.nirilihotels.com','/manage');
 if(url.pathname==='/book/excursions')return publicRedirect(url,'https://excursions.nirilihotels.com','/');
 if(url.pathname==='/book/excursions/manage')return publicRedirect(url,'https://excursions.nirilihotels.com','/manage');
 if(url.pathname.startsWith('/book/excursions/details/')){
  const id=url.pathname.slice('/book/excursions/details/'.length);
  return publicRedirect(url,'https://www.nirilihotels.com','/hotel/excursions/'+id);
 }
 if(url.pathname==='/book/restaurant')return publicRedirect(url,'https://restaurant.nirilihotels.com','/');
 if(url.pathname==='/book/transfers')return publicRedirect(url,'https://transfers.nirilihotels.com','/');
 if(url.pathname==='/stay'||url.pathname.startsWith('/stay/'))return publicRedirect(url,'https://guest.nirilihotels.com','/');
 if(url.pathname.startsWith('/api/'))return new NextResponse('Not Found',{status:404});
 return publicRedirect(url,'https://www.nirilihotels.com','/');
}

function hotelSiteResponse(url:URL,method='GET'){
 if(publicImageRead(url,method))return NextResponse.next();
 if(url.pathname==='/')return publicRewrite(url,'/hotel');
 if(url.pathname==='/hotel'||url.pathname.startsWith('/hotel/')){
  const response=NextResponse.next();
  response.headers.set('Cache-Control','public, max-age=0, must-revalidate');
  return response;
 }
 if(url.pathname.startsWith('/api/'))return new NextResponse('Not Found',{status:404});
 return publicRedirect(url,'https://www.nirilihotels.com','/');
}

function requestTab(request:NextRequest,url:URL){
 const direct=url.searchParams.get('tab')||'';
 if(tabPattern.test(direct))return direct;
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

 if(host===publicHotelRootHost){
  url.hostname=publicHotelHost;
  url.port='';
  return NextResponse.redirect(url,308);
 }

 if(host===publicHotelHost)return hotelSiteResponse(url,request.method);
 if(host===stayHost)return staySiteResponse(url);
 if(host===excursionsHost)return excursionsSiteResponse(url,request.method);
 if(host===restaurantHost)return restaurantSiteResponse(url,request.method);
 if(host===transfersHost)return transfersSiteResponse(url);
 if(host===guestPortalHost)return guestPortalResponse(url,request.method);
 if(host===legacyBookingHost)return legacyBookingResponse(url);

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
