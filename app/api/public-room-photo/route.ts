// Preserve the real Nirili Villa room image while serving it from our domain.
// This route is public, intentionally fixed to one trusted image URL.
const source='https://static.cupid.travel/hotels/ex_277154f6_z.jpg';
export async function GET(){
 try{
  const upstream=await fetch(source,{headers:{Accept:'image/avif,image/webp,image/jpeg,image/*'},cf:{cacheTtl:2592000,cacheEverything:true}} as RequestInit);
  if(!upstream.ok||!upstream.body)throw Error('Room photo unavailable');
  return new Response(upstream.body,{status:200,headers:{
   'Content-Type':upstream.headers.get('Content-Type')||'image/jpeg',
   'Cache-Control':'public, max-age=604800, s-maxage=2592000, stale-while-revalidate=86400',
   'X-Content-Type-Options':'nosniff'
  }});
 }catch{return new Response('Room photo temporarily unavailable',{status:502,headers:{'Cache-Control':'no-store'}});}
}
