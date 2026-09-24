import translations from './translations.json';
import guestLoginTranslations from './guest-login-translations.json';
export type Language='en'|'zh'|'it'|'es'|'bn'|'ru';
export const languages=[['en','English'],['zh','中文'],['it','Italiano'],['es','Español'],['bn','বাংলা'],['ru','Русский']] as const;
const valid=(v:string|null):v is Language=>languages.some(([id])=>id===v);
const key='nirili-language';
let selected:Language='en';
export function getLanguage():Language{if(typeof window==='undefined')return 'en';try{const v=localStorage.getItem(key);return valid(v)?v:selected;}catch{return selected;}}
export function setLanguage(v:Language){selected=v;try{localStorage.setItem(key,v);}catch{}window.dispatchEvent(new Event('nirili-language'));}
export function subscribe(fn:()=>void){window.addEventListener('nirili-language',fn);window.addEventListener('storage',fn);return()=>{window.removeEventListener('nirili-language',fn);window.removeEventListener('storage',fn)};}
const dict={...translations,...guestLoginTranslations} as Record<string,string[]>;
const indexes={zh:0,it:1,es:2,bn:3,ru:4};
const normalize=(s:string)=>s.replace(/\s+/g,' ').trim();
const lookup=new Map(Object.entries(dict).map(([k,v])=>[normalize(k).toLowerCase(),v]));
export function translate(text:string,lang:Language):string{
 if(lang==='en'||!text)return text;
 const clean=normalize(text),found=lookup.get(clean.toLowerCase());
 if(found)return text.replace(text.trim(),found[indexes[lang]]);
 // Translate fixed labels while preserving amounts, IDs and user-entered values.
 const decorated=clean.match(/^([^\p{L}\p{N}]*)(.*?)([\s:·%…→↑↗]+)$/u)||clean.match(/^([^\p{L}\p{N}]+)(.*?)(\s*)$/u);
 if(decorated){const v=lookup.get(decorated[2].toLowerCase());if(v)return decorated[1]+v[indexes[lang]]+decorated[3];}
 const numbered=clean.match(/^(Room|Table|Seat|Adult|Guest|Page)\s+(\d+)(.*)$/i);
 if(numbered){const v=lookup.get(numbered[1].toLowerCase());if(v)return v[indexes[lang]]+' '+numbered[2]+numbered[3];}
 const chunks=text.split(/(\s+[·×→↔+]\s+|\s*\n\s*)/);
 if(chunks.length>1)return chunks.map((c,i)=>i%2?c:translate(c,lang)).join('');
 return text;
}
export function localizedConfirm(message?:string){return window.confirm(translate(message||'',getLanguage()));}
export function localizedAlert(message?:any){window.alert(typeof message==='string'?translate(message,getLanguage()):message);}
