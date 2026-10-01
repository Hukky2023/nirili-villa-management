import test from 'node:test';
import assert from 'node:assert/strict';
import {existsSync,readFileSync} from 'node:fs';
import {resolve,dirname,basename} from 'node:path';
import {createRequire} from 'node:module';

const require=createRequire(import.meta.url),ts=require('typescript');
const root=resolve(import.meta.dirname,'..');
function load(path,stubs={},cache=new Map()){
 const file=resolve(root,path);
 if(cache.has(file))return cache.get(file);
 const mod={exports:{}};cache.set(file,mod.exports);
 const source=ts.transpileModule(readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,resolveJsonModule:true}}).outputText;
 new Function('require','module','exports',source)(id=>{
  const name=basename(id).replace(/\.ts$/,'');
  if(id.startsWith('.')&&Object.hasOwn(stubs,name))return stubs[name];
  if(!id.startsWith('.'))return require(id);
  const base=resolve(dirname(file),id);
  if(base.endsWith('.json'))return JSON.parse(readFileSync(base,'utf8'));
  return load(existsSync(base+'.ts')?base+'.ts':base,stubs,cache);
 },mod,mod.exports);
 return mod.exports;
}

const ORDER=['zh','it','es','bn','ru','de','fr'];
const source=JSON.parse(readFileSync(resolve(root,'lib/i18n/translations.json'),'utf8'));
const runtime=load('lib/i18n/runtime.ts');
const catalog=lang=>runtime.catalogFrom(JSON.parse(readFileSync(resolve(root,'lib/i18n/site/'+lang+'.json'),'utf8')));

test('every piece of text a guest can see has a reviewed translation',()=>{
 const {missing}=require(resolve(root,'scripts/i18n-extract.cjs'));
 const gaps=missing().map(([s,where])=>s+'  ← '+where.join(', '));
 assert.deepEqual(gaps,[],'Add these to lib/i18n/translations.json, then run node scripts/i18n-build.mjs');
});

test('every entry is translated into every language, keeping its {0} placeholders',()=>{
 for(const [en,values] of Object.entries(source)){
  assert.equal(values.length,ORDER.length,en);
  const holders=(en.match(/\{\d+\}/g)||[]).sort().join();
  values.forEach((v,i)=>{
   assert.ok(typeof v==='string'&&v.trim(),ORDER[i]+' missing for: '+en);
   assert.equal((v.match(/\{\d+\}/g)||[]).sort().join(),holders,ORDER[i]+' placeholders differ for: '+en);
  });
 }
});

test('the per-language files the websites load match the reviewed source',()=>{
 for(const [i,lang] of ORDER.entries()){
  const built=JSON.parse(readFileSync(resolve(root,'lib/i18n/site/'+lang+'.json'),'utf8'));
  const expected=Object.fromEntries(Object.entries(source).map(([k,v])=>[k,v[i]]));
  assert.deepEqual(built,expected,lang+'.json is out of date: run node scripts/i18n-build.mjs');
 }
});

test('lookups handle case, surrounding symbols, numbers, prices, times and dates',()=>{
 const zh=catalog('zh'),ru=catalog('ru');
 assert.equal(runtime.lookup('Book your stay','zh',zh),'预订住宿');
 assert.equal(runtime.lookup('BOOK YOUR STAY','zh',zh),'预订住宿');
 assert.equal(runtime.lookup('  Book   your stay ','zh',zh),'预订住宿');
 assert.equal(runtime.lookup('Book your stay →','zh',zh),'预订住宿 →');
 assert.equal(runtime.lookup('3 passengers','zh',zh),'3 位乘客');
 assert.equal(runtime.lookup('Table 12','ru',ru),'Столик 12');
 assert.equal(runtime.lookup('Lunch ordering is open until 15:00.','zh',zh),'午餐点餐开放至 15:00。');
 assert.equal(runtime.lookup('Your partner rate: 12.5% off public prices','ru',ru),'Ваш партнёрский тариф: скидка 12.5% от публичных цен');
 assert.match(runtime.lookup('Fri, 2 Oct 2026','ru',ru),/2 окт/);
 assert.match(runtime.lookup('Fri, 2 Oct 2026','zh',zh),/10月2日/);
 const de=catalog('de'),fr=catalog('fr');
 assert.equal(runtime.lookup('Book your stay','de',de),'Aufenthalt buchen');
 assert.equal(runtime.lookup('3 passengers','fr',fr),'3 passagers');
 assert.equal(runtime.lookup('Table 7','de',de),'Tisch 7');
 assert.match(runtime.lookup('Fri, 2 Oct 2026','de',de),/2\. Okt/);
 assert.match(runtime.lookup('Fri, 2 Oct 2026','fr',fr),/2 oct/);
 assert.equal(runtime.lookup('Husam','zh',zh),null);
 assert.equal(runtime.lookup('EXC-0C7B2C52','zh',zh),null);
 assert.equal(runtime.lookup('Book your stay','en',zh),null);
});

test('the management system (PMS) is English only: no language picker and no translation',()=>{
 const layout=readFileSync(resolve(root,'app/layout.tsx'),'utf8');
 const management=readFileSync(resolve(root,'app/management.tsx'),'utf8');
 assert.doesNotMatch(layout,/LanguageSelector|LanguagePicker|SiteTranslator/);
 assert.doesNotMatch(management,/LanguageSelector|LanguagePicker|SiteTranslator/);
 const ui=readFileSync(resolve(root,'app/ui-language.tsx'),'utf8');
 assert.match(ui,/export function UiText\(\{children\}:\{children\?:ReactNode\}\)\{return <>\{children\}<\/>;\}/);
 // Until a guest website activates translation, the shared runtime always answers in English.
 assert.equal(runtime.getLanguage(),'en');
 assert.equal(runtime.translate('Book your stay'),'Book your stay');
});

test('the picker offers German and French alongside the other languages',()=>{
 assert.deepEqual(runtime.languages.map(([id])=>id),['en','zh','ru','de','fr','it','es','bn']);
});

test('every guest-facing site mounts the translator',()=>{
 for(const file of ['app/book/layout.tsx','app/hotel/page.tsx','app/stay/page.tsx'])
  assert.match(readFileSync(resolve(root,file),'utf8'),/<SiteTranslator\/>/,file);
 assert.match(readFileSync(resolve(root,'app/hotel/chrome.tsx'),'utf8'),/<LanguagePicker/);
});

function translateRoute(){
 const calls=[],cache=new Map([['zh|Already cached sentence for the guests.','已缓存的句子。']]);
 const limits={ok:true};
 const stubs={
  auth:{sameOrigin:r=>r.headers.get('origin')===new URL(r.url).origin,limit:async()=>limits.ok},
  machine:{
   isMachineLanguage:v=>['zh','ru','de','fr','it','es','bn'].includes(v),
   cachedTranslations:async(lang,texts)=>new Map(texts.filter(t=>cache.has(lang+'|'+t)).map(t=>[t,cache.get(lang+'|'+t)])),
   machineTranslate:async(lang,text)=>{calls.push(text);return '['+lang+'] '+text;},
  },
 };
 const route=load('app/api/translate/route.ts',stubs);
 const ask=(body,origin='https://tours.nirilihotels.test')=>route.POST(new Request('https://tours.nirilihotels.test/api/translate',{method:'POST',headers:{origin,'content-type':'application/json'},body:JSON.stringify(body)}));
 return {ask,calls,limits};
}

test('machine translation serves cached sentences and translates only new ones',async()=>{
 const {ask,calls}=translateRoute();
 const d=await (await ask({lang:'zh',texts:['Already cached sentence for the guests.','A brand new excursion description sentence.','A brand new excursion description sentence.','x','12345']})).json();
 assert.equal(d.translations['Already cached sentence for the guests.'],'已缓存的句子。');
 assert.equal(d.translations['A brand new excursion description sentence.'],'[zh] A brand new excursion description sentence.');
 assert.deepEqual(calls,['A brand new excursion description sentence.']);
});

test('machine translation rejects other languages, cross-site use and floods',async()=>{
 const {ask,limits,calls}=translateRoute();
 assert.equal((await ask({lang:'en',texts:['Hello there friend of mine']})).status,400);
 assert.equal((await ask({lang:'ja',texts:['Hello there friend of mine']})).status,400);
 assert.equal((await ask({lang:'zh',texts:['Hello there friend of mine']},'https://evil.example')).status,403);
 const many=Array.from({length:80},(_,i)=>'Sentence number '+i+' for the guests here');
 await ask({lang:'ru',texts:many});
 assert.equal(calls.length,40);
 limits.ok=false;
 assert.equal((await ask({lang:'zh',texts:['Another new sentence for our guests']})).status,429);
});
