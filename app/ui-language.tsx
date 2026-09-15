'use client';
import {createElement,Fragment,useEffect,useSyncExternalStore,type ReactNode} from 'react';
import {getLanguage,setLanguage,subscribe,translate,languages,type Language} from '../lib/i18n/runtime';
import './ui-language.css';
export function useLanguage(){return useSyncExternalStore(subscribe,getLanguage,()=> 'en' as Language);}
export function UiText({children}:{children?:ReactNode}){const lang=useLanguage();return <>{typeof children==='string'?translate(children,lang):children}</>;}
export function UiField({as:tag,...props}:any){const lang=useLanguage();const p={...props};for(const key of ['placeholder','title','aria-label','alt','label'])if(typeof p[key]==='string')p[key]=translate(p[key],lang);return createElement(tag,p);}
export function UiOption({children,value,...props}:any){const lang=useLanguage();const raw=Array.isArray(children)?children.filter(x=>x!==null&&x!==undefined&&typeof x!=='boolean').join(''):String(children??'');return <option {...props} value={value??raw}>{translate(raw,lang)}</option>;}
export default function LanguageSelector({inline=false}:{inline?:boolean}){const lang=useLanguage();useEffect(()=>{document.documentElement.lang=lang==='zh'?'zh-Hans':lang;},[lang]);return <div className={inline?"nv-language nv-language-inline":"nv-language nv-language-floating"} translate="no"><label><span aria-hidden="true">🌐</span><select aria-label={translate('Language',lang)} value={lang} onChange={e=>setLanguage(e.target.value as Language)}>{languages.map(([id,name])=><option value={id} key={id}>{name}</option>)}</select></label></div>;}
