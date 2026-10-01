// Builds the per-language catalogs the guest websites load (lib/i18n/site/<lang>.json) from the
// single reviewed source, lib/i18n/translations.json: {"English": [zh, it, es, bn, ru]}.
// Run after editing translations: node scripts/i18n-build.mjs
import {readFileSync,writeFileSync} from 'node:fs';
const ORDER=['zh','it','es','bn','ru'];
const root=new URL('../lib/i18n/',import.meta.url);
const source=JSON.parse(readFileSync(new URL('translations.json',root),'utf8'));
const keys=Object.keys(source).sort((a,b)=>a.localeCompare(b,'en'));
// One entry per line keeps reviews and diffs readable.
writeFileSync(new URL('translations.json',root),'{\n'+keys.map(k=>JSON.stringify(k)+':'+JSON.stringify(source[k])).join(',\n')+'\n}\n');
for(const [i,lang] of ORDER.entries()){
 const out={};for(const k of keys)if(source[k][i])out[k]=source[k][i];
 writeFileSync(new URL('site/'+lang+'.json',root),JSON.stringify(out)+'\n');
}
console.log('Built',ORDER.length,'catalogs with',keys.length,'entries.');
