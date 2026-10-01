import {limit,sameOrigin} from '../../../lib/auth';
import {cachedTranslations,isMachineLanguage,machineTranslate} from '../../../lib/i18n/machine';

// Guest websites ask for sentences that the reviewed catalogs do not cover. Cached answers are
// free; new ones are capped per visitor so the endpoint cannot be used as a general translator.
const headers={'Cache-Control':'no-store'};

export async function POST(request:Request){
 if(!sameOrigin(request))return Response.json({error:'Invalid request.'},{status:403,headers});
 try{
  const body:Record<string,any>=await request.json();
  if(!isMachineLanguage(body.lang))return Response.json({error:'Unsupported language.'},{status:400,headers});
  const texts=[...new Set((Array.isArray(body.texts)?body.texts:[]).map((t:unknown)=>String(t??'').replace(/\s+/g,' ').trim()))]
   .filter((t:string)=>t.length>=2&&t.length<=1500&&/\p{L}/u.test(t)).slice(0,40) as string[];
  if(!texts.length)return Response.json({translations:{}},{headers});
  const ip=request.headers.get('cf-connecting-ip')||'unknown';
  if(!await limit('translate-ip:'+ip,240,600000))return Response.json({error:'Too many requests.'},{status:429,headers});
  const found=await cachedTranslations(body.lang,texts);
  const missing=texts.filter(t=>!found.has(t));
  // New translations: a few at a time, and a ceiling per visitor per hour.
  for(let i=0;i<missing.length;i+=5){
   const group=[];
   for(const t of missing.slice(i,i+5))if(await limit('translate-new-ip:'+ip,300,3600000))group.push(t);
   const done=await Promise.all(group.map(t=>machineTranslate(body.lang,t)));
   group.forEach((t,n)=>{if(done[n])found.set(t,done[n]!);});
  }
  return Response.json({translations:Object.fromEntries(found)},{headers});
 }catch{return Response.json({translations:{}},{headers});}
}
