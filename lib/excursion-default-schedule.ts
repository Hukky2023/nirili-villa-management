import {authDb} from './auth';
import {catalog,islandToday} from './guest-catalog';

const schedulePrefix='excursion-schedule:';
const markerPrefix='excursion-standard-day:v2:';

const norm=(v:any)=>String(v||'').trim().replace(/\s+/g,' ').toLowerCase();
const slug=(v:string)=>v.toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'').slice(0,60);
const catalogPrice=(...names:string[])=>{
 const item=catalog.find((x:any)=>x.kind==='excursion'&&names.some(name=>norm(x.name)===norm(name)));
 return item?.cents||0;
};
const catalogIdPrice=(id:string)=>catalog.find((x:any)=>x.kind==='excursion'&&x.id===id)?.cents||0;
const sumPrices=(...ids:string[])=>ids.reduce((sum,id)=>sum+catalogIdPrice(id),0);

export const standardDailyExcursions=[
 {time:'07:00',name:'Fish Tank + Sandbank',sharedGroup:'07-fishtank',priceCents:sumPrices('fishtank','sandbank')},
 {time:'07:00',name:'Fish Tank only',sharedGroup:'07-fishtank',priceCents:catalogPrice('Fish Tank Snorkeling')},
 {time:'08:00',name:'Turtle Snorkeling + Coral Garden',sharedGroup:'',priceCents:sumPrices('turtle','coral')},
 {time:'10:30',name:'Sandbank only',sharedGroup:'1030-sandbank',priceCents:catalogPrice('Sandbank Trip')},
 {time:'10:30',name:'Sandbank + Turtle',sharedGroup:'1030-sandbank',priceCents:sumPrices('sandbank','turtle')},
 {time:'11:00',name:'Shark + Turtle',sharedGroup:'1100-shark',priceCents:catalogPrice('Shark + Turtle Snorkeling')},
 {time:'11:00',name:'Shark only',sharedGroup:'1100-shark',priceCents:catalogPrice('Shark Snorkeling (Nurse Shark)')},
 {time:'13:00',name:'Clown Fish Snorkeling only',sharedGroup:'1300-clownfish',priceCents:0},
 {time:'13:00',name:'Clown Fish Snorkeling + Manta',sharedGroup:'1300-clownfish',priceCents:0},
 {time:'16:30',name:'Dolphin only',sharedGroup:'',priceCents:catalogPrice('Dolphin Watching')},
 {time:'16:30',name:'Dolphin + Fishing',sharedGroup:'',priceCents:sumPrices('dolphin','fishing')}
] as const;

export async function ensureStandardDailyExcursions(date:string){
 if(date<islandToday())return;
 const db=authDb();
 const markerKey=markerPrefix+date;
 const marker=await db.prepare('SELECT key FROM operation_records WHERE key=?').bind(markerKey).first<any>();
 if(marker)return;
 const rows=await db.prepare('SELECT payload FROM operation_records WHERE key LIKE ?').bind(schedulePrefix+date+':%').all<any>();
 const existing=(rows.results||[]).map((row:any)=>{try{return JSON.parse(row.payload)}catch{return null}}).filter(Boolean);
 const now=new Date().toISOString();
 for(const item of standardDailyExcursions){
  if(existing.some((x:any)=>x.time===item.time&&norm(x.name)===norm(item.name)))continue;
  const id='std-'+item.time.replace(':','')+'-'+slug(item.name);
  const record={id,date,time:item.time,name:item.name,capacity:6,priceCents:item.priceCents,vesselId:'',crewIds:[],status:'Open',notes:'',sharedGroup:item.sharedGroup,standardDaily:true,createdAt:now,updatedAt:now};
  await db.prepare('INSERT OR IGNORE INTO operation_records(key,payload,revision,updated_by) VALUES(?,?,1,?)').bind(schedulePrefix+date+':'+id,JSON.stringify(record),'system:standard-daily-excursions').run();
 }
 await db.prepare('INSERT OR IGNORE INTO operation_records(key,payload,revision,updated_by) VALUES(?,?,1,?)').bind(markerKey,JSON.stringify({date,version:2,createdAt:now}),'system:standard-daily-excursions').run();
}
