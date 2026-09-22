import {NextResponse,NextRequest} from 'next/server';

const guestBookingHost='booking.nirilivilla.com';

export function proxy(request:NextRequest){
 const url=new URL(request.url);
 const host=(request.headers.get('host')||'').split(':')[0].toLowerCase();

 // The public booking subdomain is isolated from the management application.
 // It can render the guest booking website and call only its public booking API.
 if(host===guestBookingHost){
  if(url.pathname==='/api/public-booking')return NextResponse.next();
  if(url.pathname==='/' ){
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
  if(url.pathname.startsWith('/api/'))return new NextResponse('Not Found',{status:404});
  url.pathname='/';
  url.search='';
  return NextResponse.redirect(url);
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
