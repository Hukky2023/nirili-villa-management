import {env} from 'cloudflare:workers';
import {authDb,digest} from '../auth';

// Machine translation for text the reviewed catalogs cannot know in advance: excursion
// descriptions, notes and other copy staff write in admin. Each sentence is translated once per
// language with Workers AI and cached in D1, so guests get an instant answer from then on.
export const MACHINE_LANGUAGES={zh:'Simplified Chinese',ru:'Russian',de:'German',fr:'French',it:'Italian',es:'Spanish',bn:'Bengali'} as const;
export type MachineLanguage=keyof typeof MACHINE_LANGUAGES;
export const isMachineLanguage=(v:unknown):v is MachineLanguage=>typeof v==='string'&&Object.hasOwn(MACHINE_LANGUAGES,v);
const LLM='@cf/meta/llama-3.3-70b-instruct-fp8-fast',FALLBACK='@cf/meta/m2m100-1.2b';

let tableReady:Promise<unknown>|null=null;
function ensureTable(){
 tableReady??=authDb().prepare('CREATE TABLE IF NOT EXISTS site_translations(lang TEXT NOT NULL,hash TEXT NOT NULL,source TEXT NOT NULL,text TEXT NOT NULL,model TEXT NOT NULL,created_at TEXT NOT NULL,PRIMARY KEY(lang,hash))').run().catch(e=>{tableReady=null;throw e;});
 return tableReady;
}

export async function cachedTranslations(lang:MachineLanguage,texts:string[]){
 await ensureTable();
 const found=new Map<string,string>();
 const hashes=await Promise.all(texts.map(t=>digest(t)));
 for(let i=0;i<texts.length;i+=50){
  const slice=hashes.slice(i,i+50);
  const rows=await authDb().prepare('SELECT hash,source,text FROM site_translations WHERE lang=? AND hash IN ('+slice.map(()=>'?').join(',')+')').bind(lang,...slice).all<any>();
  for(const row of rows.results||[])found.set(row.source,row.text);
 }
 return found;
}

async function storeTranslation(lang:MachineLanguage,source:string,text:string,model:string){
 await authDb().prepare('INSERT OR IGNORE INTO site_translations(lang,hash,source,text,model,created_at) VALUES(?,?,?,?,?,?)').bind(lang,await digest(source),source,text,model,new Date().toISOString()).run();
}

const clean=(s:unknown)=>String(s??'').trim().replace(/^["“”']+|["“”']+$/g,'').trim();

export async function machineTranslate(lang:MachineLanguage,source:string):Promise<string|null>{
 const ai=(env as any).AI;
 if(!ai)return null;
 try{
  const r:any=await ai.run(LLM,{max_tokens:1200,temperature:0.2,messages:[
   {role:'system',content:`You translate the guest-facing website of Nirili, a small hotel and tour operator on Dhiffushi island in the Maldives. Translate the user's text from English into ${MACHINE_LANGUAGES[lang]}. Use a warm, natural tone for holiday guests. Keep these unchanged: the names Nirili, Nirili Villa, Nirili Tours, Dhiffushi, Malé, Velana, Kaafu, WhatsApp; prices, currencies, times, dates, numbers, emails, phone numbers and booking references. Reply with the translation only, without quotes or notes.`},
   {role:'user',content:source},
  ]});
  const text=clean(r?.response);
  if(text&&text!==source){await storeTranslation(lang,source,text,LLM);return text;}
 }catch{}
 try{
  const r:any=await ai.run(FALLBACK,{text:source,source_lang:'en',target_lang:lang});
  const text=clean(r?.translated_text);
  if(text&&text!==source){await storeTranslation(lang,source,text,FALLBACK);return text;}
 }catch{}
 return null;
}
