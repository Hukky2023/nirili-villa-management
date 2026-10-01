'use client';
import {useEffect} from 'react';
import {activateSiteLanguage,getLanguage,loadCatalog,locales,lookup,subscribe,type Language} from '../lib/i18n/runtime';

// Translates the guest-facing websites in place. Reviewed translations (lib/i18n/site/*.json) cover
// all fixed text; longer text that staff write in admin (excursion descriptions, notes) is machine
// translated once on the server and cached. Text nodes are only ever re-valued, never replaced, so
// React keeps working; the original English is remembered so switching back to English is exact.
const ATTRS=['placeholder','aria-label','title','alt'];
const SKIP_TAGS=new Set(['SCRIPT','STYLE','NOSCRIPT','TEXTAREA','CODE','PRE','TEMPLATE']);
const textOriginal=new WeakMap<Text,string>(),textShown=new WeakMap<Text,string>();
const attrOriginal=new WeakMap<Element,Record<string,string>>(),attrShown=new WeakMap<Element,Record<string,string>>();
const tracked=new Set<Text>(),trackedEls=new Set<Element>();
const machine:Record<string,Map<string,string>>={};
const pending=new Set<string>(),failed=new Set<string>();
let titleOriginal='';
let lang:Language='en',observer:MutationObserver|null=null,flushTimer=0,applying=false;

const words=(s:string)=>(s.match(/\p{L}+/gu)||[]).length;
// Machine translation is for sentences only: names, references and short labels stay as written.
const wantsMachine=(s:string)=>words(s)>=4&&s.length<=1500&&!/^[\w.+-]+@[\w-]+\.[\w.]+$/.test(s);
const mtKey=(l:Language)=>'nirili-mt-'+l;

function skipped(el:Element|null){
 for(let e=el;e;e=e.parentElement){
  if(SKIP_TAGS.has(e.tagName)||e.getAttribute('translate')==='no'||e.hasAttribute('data-no-translate')||e.classList.contains('notranslate')||(e as HTMLElement).isContentEditable)return true;
 }
 return false;
}

function machineCache(l:Language){
 if(!machine[l]){
  machine[l]=new Map();
  try{const saved=JSON.parse(localStorage.getItem(mtKey(l))||'{}');for(const [k,v] of Object.entries(saved))machine[l].set(k,String(v));}catch{}
 }
 return machine[l];
}
function saveMachineCache(l:Language){
 try{const entries=[...machineCache(l)].slice(-400);localStorage.setItem(mtKey(l),JSON.stringify(Object.fromEntries(entries)));}catch{}
}

function queueMachine(text:string){
 if(pending.has(text)||failed.has(text))return;
 pending.add(text);
 clearTimeout(flushTimer);flushTimer=window.setTimeout(flush,250);
}
async function flush(){
 const l=lang,batch=[...pending].slice(0,40);
 if(!batch.length||l==='en')return;
 batch.forEach(t=>pending.delete(t));
 try{
  const r=await fetch('/api/translate',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({lang:l,texts:batch})});
  const d:any=r.ok?await r.json():{};
  const cache=machineCache(l);
  for(const t of batch){const v=d.translations?.[t];if(typeof v==='string'&&v.trim())cache.set(t,v);else failed.add(t);}
  saveMachineCache(l);
 }catch{batch.forEach(t=>failed.add(t));}
 if(pending.size)flushTimer=window.setTimeout(flush,250);
 if(l===lang)applyAll();
}

// Reviewed translation first, then a cached machine translation; otherwise English for now.
function translated(original:string):string{
 if(lang==='en')return original;
 const core=original.replace(/\s+/g,' ').trim();
 if(!core)return original;
 let v=lookup(core,lang);
 if(v===null&&wantsMachine(core)){v=machineCache(lang).get(core)??null;if(v===null)queueMachine(core);}
 if(v===null)return original;
 return original.match(/^\s*/)![0]+v+original.match(/\s*$/)![0];
}

function show(node:Text,value:string){if(node.nodeValue!==value)node.nodeValue=value;textShown.set(node,value);}
function originalOf(node:Text){
 // A value we did not set came from React (or the server): it is the new English original.
 if(textShown.get(node)!==node.nodeValue||!textOriginal.has(node))textOriginal.set(node,node.nodeValue||'');
 tracked.add(node);
 return textOriginal.get(node)!;
}

// React renders "{n} guests" or "Thank you, {name}." as several text nodes in one element. When an
// element holds only text, translate the whole sentence so word order is right in every language.
// Server-rendered HTML keeps <!-- --> markers between text pieces; they are not content.
const textOnly=(el:Element)=>{let texts=0;for(const c of el.childNodes){if(c.nodeType===Node.TEXT_NODE)texts++;else if(c.nodeType!==Node.COMMENT_NODE)return false;}return texts>1;};

function applyElementText(el:Element){
 const nodes=[...el.childNodes].filter(c=>c.nodeType===Node.TEXT_NODE) as Text[];
 const originals=nodes.map(originalOf),joined=originals.join('');
 const whole=lang==='en'?null:lookup(joined.replace(/\s+/g,' ').trim(),lang);
 if(whole!==null){
  nodes.forEach((n,i)=>show(n,i===0?joined.match(/^\s*/)![0]+whole+joined.match(/\s*$/)![0]:''));
  return;
 }
 nodes.forEach((n,i)=>show(n,translated(originals[i])));
}

function applyText(node:Text){
 const parent=node.parentElement;
 if(!parent||skipped(parent))return;
 if(textOnly(parent))return applyElementText(parent);
 show(node,translated(originalOf(node)));
}

function applyAttrs(el:Element){
 // A text box's own hint text is translated; what the guest types inside it never is.
 if(skipped(el.tagName==='TEXTAREA'?el.parentElement:el))return;
 for(const name of ATTRS){
  const value=el.getAttribute(name);
  if(value===null)continue;
  const originals=attrOriginal.get(el)||{},shown=attrShown.get(el)||{};
  if(shown[name]!==value||originals[name]===undefined)originals[name]=value;
  const next=translated(originals[name]);
  shown[name]=next;attrOriginal.set(el,originals);attrShown.set(el,shown);trackedEls.add(el);
  if(value!==next)el.setAttribute(name,next);
 }
}

function walk(root:Node){
 if(root.nodeType===Node.TEXT_NODE)return applyText(root as Text);
 if(root.nodeType!==Node.ELEMENT_NODE||skipped(root as Element))return;
 applyAttrs(root as Element);
 const it=document.createTreeWalker(root,NodeFilter.SHOW_TEXT|NodeFilter.SHOW_ELEMENT,{acceptNode:n=>n.nodeType===Node.ELEMENT_NODE&&SKIP_TAGS.has((n as Element).tagName)&&(n as Element).tagName!=='TEXTAREA'?NodeFilter.FILTER_REJECT:NodeFilter.FILTER_ACCEPT});
 for(let n=it.nextNode();n;n=it.nextNode()){
  if(n.nodeType===Node.ELEMENT_NODE&&(n as Element).tagName==='TEXTAREA'){applyAttrs(n as Element);continue;}
  if(n.nodeType===Node.TEXT_NODE)applyText(n as Text);else applyAttrs(n as Element);
 }
}

let titleShown='';
function applyTitle(){
 if(document.title!==titleShown||!titleOriginal)titleOriginal=document.title;
 titleShown=translated(titleOriginal);
 if(document.title!==titleShown)document.title=titleShown;
}

function applyAll(){
 applying=true;
 for(const n of tracked)if(!n.isConnected)tracked.delete(n);
 for(const e of trackedEls)if(!e.isConnected)trackedEls.delete(e);
 walk(document.body);
 applyTitle();
 observer?.takeRecords();
 applying=false;
}

function onMutations(records:MutationRecord[]){
 if(applying)return;
 applying=true;
 for(const r of records){
  if(r.type==='characterData')applyText(r.target as Text);
  else if(r.type==='attributes')applyAttrs(r.target as Element);
  else r.addedNodes.forEach(walk);
 }
 observer?.takeRecords();
 applying=false;
}

async function setPageLanguage(next:Language){
 lang=next;
 document.documentElement.lang=locales[next];
 document.documentElement.dataset.siteLanguage=next;
 if(next!=='en')await loadCatalog(next).catch(()=>null);
 if(lang!==next)return;
 applyAll();
 if(!observer){
  observer=new MutationObserver(onMutations);
  observer.observe(document.body,{subtree:true,childList:true,characterData:true,attributes:true,attributeFilter:ATTRS});
  new MutationObserver(()=>{if(!applying){applying=true;applyTitle();applying=false;}}).observe(document.head,{subtree:true,childList:true,characterData:true});
 }
}

export default function SiteTranslator(){
 useEffect(()=>{
  const initial=activateSiteLanguage();
  // Start after React has hydrated the server HTML, so the first paint and hydration agree.
  const start=window.setTimeout(()=>void setPageLanguage(initial),0);
  const stop=subscribe(()=>void setPageLanguage(getLanguage()));
  return ()=>{clearTimeout(start);stop();};
 },[]);
 return null;
}
