// Refresh data only: no navigation, page reload, focus changes or scroll changes.
export function startLiveRefresh(refresh:()=>unknown){
 let stopped=false,running=false;
 const tick=async()=>{if(stopped||running||document.hidden)return;running=true;try{await refresh();}catch{/* Existing views handle their own fetch errors. */}finally{running=false;}};
 const timer=setInterval(tick,5000);
 return()=>{stopped=true;clearInterval(timer)};
}
