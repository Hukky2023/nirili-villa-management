// Carry the non-secret session selector through same-site requests and navigation,
// and remember the current management/guest view so a browser refresh stays put.
export const tabBootstrap=`(()=>{
 const initialUrl=new URL(location.href),tab=initialUrl.searchParams.get('tab'),hasTab=/^[a-f0-9]{32}$/.test(tab||'');
 function scoped(value){try{const u=new URL(value,location.href);if(u.origin!==location.origin||!/^https?:$/.test(u.protocol))return value;if(hasTab)u.searchParams.set('tab',u.searchParams.get('tab')||tab);return u.href}catch{return value}}
 window.niriliTabUrl=scoped;
 const originalFetch=window.fetch.bind(window);window.fetch=(input,init)=>{if(input instanceof Request)return originalFetch(new Request(scoped(input.url),input),init);return originalFetch(scoped(String(input)),init)};
 const originalOpen=window.open.bind(window);window.open=(url,...args)=>originalOpen(url?scoped(String(url)):url,...args);
 function decorate(root){root.querySelectorAll('a[href],form[action]').forEach(el=>{if(el.hasAttribute('data-new-login')||el.hasAttribute('download'))return;const key=el.tagName==='FORM'?'action':'href',old=el.getAttribute(key);if(!old||old.startsWith('#'))return;const value=scoped(old);if(value!==old)el.setAttribute(key,value)})}
 const groups=[
  {key:'view',store:'nirili:view',selector:'.admin aside nav button, .phone-navigation button'},
  {key:'service',store:'nirili:service',selector:'.guest-services > nav button'},
  {key:'excursionTab',store:'nirili:excursionTab',selector:'.excursion-admin-tabs button'},
  {key:'bookingView',store:'nirili:bookingView',selector:'.viewtabs button'}
 ];
 const normalized=value=>String(value||'').replace(/\s+/g,' ').trim();
 function remember(group,value,writeUrl=true){if(!value)return;try{sessionStorage.setItem(group.store,value)}catch{}if(!writeUrl)return;try{const u=new URL(location.href);u.searchParams.set(group.key,value);history.replaceState(history.state,'',u.pathname+u.search+u.hash)}catch{}}
 function desired(group){try{return new URL(location.href).searchParams.get(group.key)||sessionStorage.getItem(group.store)||''}catch{return ''}}
 const restored={};
 function restore(){for(const group of groups){if(restored[group.key])continue;const wanted=normalized(desired(group));if(!wanted){restored[group.key]=true;continue}const buttons=[...document.querySelectorAll(group.selector)];if(!buttons.length)continue;const button=buttons.find(btn=>normalized(btn.textContent)===wanted);if(!button){restored[group.key]=true;continue}restored[group.key]=true;const active=button.classList.contains('active')||button.getAttribute('aria-current')==='page'||button.getAttribute('aria-pressed')==='true';if(!active)button.click()}}
 function captureActive(){for(const group of groups){const buttons=[...document.querySelectorAll(group.selector)],active=buttons.find(btn=>btn.classList.contains('active')||btn.getAttribute('aria-current')==='page'||btn.getAttribute('aria-pressed')==='true');if(active)remember(group,normalized(active.textContent),false)}}
 const observer=new MutationObserver(()=>{decorate(document);restore()});observer.observe(document.documentElement,{childList:true,subtree:true});
 document.addEventListener('click',event=>{const button=event.target&&event.target.closest?event.target.closest('button'):null;if(button){for(const group of groups){if(button.matches(group.selector)){remember(group,normalized(button.textContent));break}}}decorate(document)},true);
 document.addEventListener('submit',()=>decorate(document),true);
 window.addEventListener('beforeunload',captureActive);
 decorate(document);restore();requestAnimationFrame(restore);setTimeout(restore,0);
})();`;
