export const REFRESH_INTERVALS = { standard: 15000, live: 5000, guest: 30000, reports: 60000 } as const;

// Refresh data only: never navigate, remount forms, change focus or scroll.
export function startLiveRefresh(refresh:()=>unknown, intervalMs:number=REFRESH_INTERVALS.standard){
 let stopped=false,running=false,pending=false;
 let timer:ReturnType<typeof setInterval>|undefined;
 let queued:ReturnType<typeof setTimeout>|undefined;
 let lastWake=-Infinity;
 const tick=async()=>{
  if(stopped||document.hidden)return;
  if(running)return;
  running=true;
  try{await refresh();}catch{/* Existing views handle their own fetch errors. */}
  finally{running=false;if(pending){pending=false;queue();}}
 };
 // Coalesce paired POS/service events, and re-read after an in-flight fetch.
 const queue=()=>{
  if(stopped||document.hidden)return;
  if(running){pending=true;return;}
  if(queued!==undefined)return;
  queued=setTimeout(()=>{queued=undefined;void tick();},0);
 };
 const pause=()=>{clearInterval(timer);timer=undefined;clearTimeout(queued);queued=undefined;};
 const schedule=()=>{if(!stopped&&!document.hidden&&timer===undefined)timer=setInterval(()=>void tick(),intervalMs);};
 const wake=()=>{
  if(document.hidden||stopped)return;
  schedule();
  const now=Date.now();if(now-lastWake<250)return;lastWake=now;queue();
 };
 const visibility=()=>{if(document.hidden){pause();lastWake=-Infinity;}else wake();};
 schedule();
 window.addEventListener('focus',wake);
 window.addEventListener('online',wake);
 window.addEventListener('services-updated',queue);
 window.addEventListener('pos-updated',queue);
 document.addEventListener('visibilitychange',visibility);
 return()=>{
  stopped=true;pending=false;pause();
  window.removeEventListener('focus',wake);
  window.removeEventListener('online',wake);
  window.removeEventListener('services-updated',queue);
  window.removeEventListener('pos-updated',queue);
  document.removeEventListener('visibilitychange',visibility);
 };
}
