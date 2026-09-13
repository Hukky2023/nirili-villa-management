// Carry the non-secret session selector through same-site requests and navigation.
export const tabBootstrap=`(()=>{
 const tab=new URL(location.href).searchParams.get('tab');if(!/^[a-f0-9]{32}$/.test(tab||''))return;
 function scoped(value){try{const u=new URL(value,location.href);if(u.origin!==location.origin||!/^https?:$/.test(u.protocol))return value;u.searchParams.set('tab',u.searchParams.get('tab')||tab);return u.href}catch{return value}}
 window.niriliTabUrl=scoped;
 const originalFetch=window.fetch.bind(window);window.fetch=(input,init)=>{if(input instanceof Request)return originalFetch(new Request(scoped(input.url),input),init);return originalFetch(scoped(String(input)),init)};
 const originalOpen=window.open.bind(window);window.open=(url,...args)=>originalOpen(url?scoped(String(url)):url,...args);
 function decorate(root){root.querySelectorAll('a[href],form[action]').forEach(el=>{if(el.hasAttribute('data-new-login')||el.hasAttribute('download'))return;const key=el.tagName==='FORM'?'action':'href',old=el.getAttribute(key);if(!old||old.startsWith('#'))return;const value=scoped(old);if(value!==old)el.setAttribute(key,value)})}
 new MutationObserver(()=>decorate(document)).observe(document.documentElement,{childList:true,subtree:true});
 document.addEventListener('click',()=>decorate(document),true);document.addEventListener('submit',()=>decorate(document),true);decorate(document);
})();`;
