'use client';

import {useEffect,useRef} from 'react';

const AUTO_REFRESH_MS=5000;

export default function AutoRefresh(){
 const running=useRef(false);
 const lastRun=useRef(0);

 useEffect(()=>{
  let stopped=false;
  const refresh=()=>{
   if(stopped||running.current||document.hidden)return;
   const now=Date.now();
   if(now-lastRun.current<1000)return;
   running.current=true;
   lastRun.current=now;
   try{
    // Background data refresh only. Never call router.refresh(), reload(),
    // replace(), push(), or change the current URL/page.
    window.dispatchEvent(new Event('nirili:auto-refresh'));
    window.dispatchEvent(new Event('services-updated'));
   }finally{
    window.setTimeout(()=>{running.current=false},250);
   }
  };
  const timer=window.setInterval(refresh,AUTO_REFRESH_MS);
  const onFocus=()=>refresh();
  const onVisibility=()=>{if(!document.hidden)refresh()};
  window.addEventListener('focus',onFocus);
  document.addEventListener('visibilitychange',onVisibility);
  return()=>{
   stopped=true;
   window.clearInterval(timer);
   window.removeEventListener('focus',onFocus);
   document.removeEventListener('visibilitychange',onVisibility);
  };
 },[]);

 return null;
}
