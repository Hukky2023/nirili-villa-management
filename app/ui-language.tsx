'use client';
import {createElement,useSyncExternalStore,type ReactNode} from 'react';
import {Globe} from 'lucide-react';
import {getLanguage,languages,setLanguage,subscribe,type Language} from '../lib/i18n/runtime';
import './ui-language.css';

// The management system is English only. These wrappers are kept so existing screens compile
// unchanged; guest-facing pages are translated by <SiteTranslator/> instead.
export function UiText({children}:{children?:ReactNode}){return <>{children}</>;}
export function UiField({as:tag,...props}:any){return createElement(tag,props);}
export function UiOption({children,value,...props}:any){
 const raw=Array.isArray(children)?children.filter(x=>x!==null&&x!==undefined&&typeof x!=='boolean').join(''):String(children??'');
 return <option {...props} value={value??raw}>{raw}</option>;
}

export function useLanguage():Language{return useSyncExternalStore(subscribe,getLanguage,()=>'en' as Language);}

const short:Record<Language,string>={en:'EN',zh:'中文',ru:'RU',de:'DE',fr:'FR',it:'IT',es:'ES',bn:'বাং'};

// Language picker for the guest-facing websites. `tone="light"` sits on dark headers.
export function LanguagePicker({tone='light',className=''}:{tone?:'light'|'dark';className?:string}){
 const lang=useLanguage();
 return <label className={'nh-lang nh-lang-'+tone+(className?' '+className:'')} translate="no">
  <Globe aria-hidden="true"/>
  <span aria-hidden="true">{short[lang]}</span>
  <select aria-label="Language / 语言 / Язык / Sprache / Langue / Lingua / Idioma / ভাষা" value={lang} onChange={e=>setLanguage(e.target.value as Language)}>
   {languages.map(([id,name])=><option value={id} key={id}>{name}</option>)}
  </select>
 </label>;
}

// Kept for the guest portal header and sign-in screen.
export default function LanguageSelector({inline=false}:{inline?:boolean}){
 return <LanguagePicker tone={inline?'dark':'light'} className={inline?'nh-lang-inline':''}/>;
}
