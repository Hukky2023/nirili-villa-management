import {NextResponse,NextRequest} from 'next/server';
export function proxy(request:NextRequest){
 const url=new URL(request.url),id=url.searchParams.get('tab')||'',valid=/^[a-f0-9]{32}$/.test(id);
 if(!valid&&!url.pathname.startsWith('/api/')&&request.method==='GET'){
  url.searchParams.set('tab',crypto.randomUUID().replace(/-/g,''));const response=NextResponse.redirect(url);response.headers.set('Cache-Control','private, no-store');return response;
 }
 const headers=new Headers(request.headers);headers.delete('x-nirili-tab');if(valid)headers.set('x-nirili-tab',id);
 const response=NextResponse.next({request:{headers}});response.headers.set('Cache-Control','private, no-store, max-age=0');return response;
}
export const config={matcher:['/((?!_next|assets|favicon|.*\\.).*)']};
