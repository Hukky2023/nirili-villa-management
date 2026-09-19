"use client";
import {useEffect,useState} from 'react';
import {UiText} from './ui-language';
import './session-button.css';
export default function SessionButton({signedIn,inline=false}:{signedIn?:boolean;inline?:boolean}){
 const [active,setActive]=useState<boolean|undefined>(signedIn);
 useEffect(()=>{if(signedIn!==undefined){setActive(signedIn);return;}let live=true;const refresh=()=>fetch('/api/auth/status',{cache:'no-store'}).then(r=>{if(!r.ok)throw Error();return r.json()}).then(d=>{if(live)setActive(d.signedIn)}).catch(()=>{});refresh();window.addEventListener('pageshow',refresh);window.addEventListener('focus',refresh);return()=>{live=false;window.removeEventListener('pageshow',refresh);window.removeEventListener('focus',refresh)};},[signedIn]);
 return <div className={inline?'nv-session-inline':'nv-session-floating'}>{active===undefined?null:active?<form action="/api/auth/logout" method="post"><button className="nv-session-button" type="submit"><UiText>Sign out</UiText></button></form>:<a className="nv-session-button" href="/login?portal=direct"><UiText>Sign in</UiText></a>}</div>;
}
