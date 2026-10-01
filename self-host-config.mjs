import {readFileSync,writeFileSync} from 'node:fs';
const id=process.argv[2];if(!/^[0-9a-f-]{36}$/i.test(id||''))throw Error('Provide your Cloudflare D1 database UUID');
const config=JSON.parse(readFileSync('dist/server/wrangler.json','utf8'));
config.name='nirili-villa';config.main='dist/server/index.js';config.assets={...config.assets,directory:'dist/client'};config.keep_vars=true;
config.d1_databases=[{binding:'DB',database_name:'nirili-villa-db',database_id:id,migrations_dir:'drizzle'}];
// Workers AI translates admin-written text on the guest websites (lib/i18n/machine.ts).
config.ai={binding:'AI'};
delete config.topLevelName;
writeFileSync('wrangler.selfhost.json',JSON.stringify(config,null,2));
console.log('Created wrangler.selfhost.json');
