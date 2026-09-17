'use client';

import {useEffect,useRef} from 'react';
import {useRouter} from 'next/navigation';

const AUTO_REFRESH_MS=5000;

export default function AutoRefresh(){
 const router=useRouter();
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
    // Refresh server-rendered data without a hard page reload, so open forms,
    // scroll position and client UI state are preserved.
    router.refresh();
    // Let client-side data stores refresh themselves too.
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
 },[router]);

 return null;
}
