import {authDb} from './auth';
import {readOperationalRecordPrimary,readOperationalRecordsPrimary,saveOperationalRecordPrimary,supabaseBridgeConfigured} from './supabase-bridge';

// Keyed operation records: Supabase primary when configured, D1 otherwise (same pattern as the excursion menu).
const parse=(p:any)=>typeof p==='string'?JSON.parse(p):p;
export async function readRecord<T>(key:string):Promise<{value:T;revision:number}|null>{
 let row:any=null;try{row=await readOperationalRecordPrimary(key);}catch{}
 if(!row)row=await authDb().prepare('SELECT payload,revision FROM operation_records WHERE key=?').bind(key).first<any>();
 return row?{value:parse(row.payload),revision:Number(row.revision)||0}:null;
}
export async function readRecords<T>(prefix:string):Promise<{key:string;value:T;revision:number}[]>{
 const byKey=new Map<string,{key:string;value:T;revision:number}>();
 const d1=await authDb().prepare('SELECT key,payload,revision FROM operation_records WHERE key LIKE ?').bind(prefix+'%').all<any>();
 for(const row of d1.results||[])byKey.set(row.key,{key:row.key,value:parse(row.payload),revision:Number(row.revision)||0});
 let primary:any[]=[];try{primary=await readOperationalRecordsPrimary(prefix);}catch{}
 for(const row of primary){const current=byKey.get(row.key);if(!current||Number(row.revision)>=current.revision)byKey.set(row.key,{key:row.key,value:parse(row.payload),revision:Number(row.revision)||0});}
 return [...byKey.values()];
}
// Compare-and-swap save. Returns the new revision, or 0 if someone else saved first.
export async function saveRecord(key:string,value:any,expectedRevision:number,by:string):Promise<number>{
 const db=authDb(),payload=JSON.stringify(value);
 if(supabaseBridgeConfigured()){
  let primaryRevision=0,reachable=true;
  try{primaryRevision=await saveOperationalRecordPrimary(key,value,expectedRevision,by);}catch{reachable=false;}
  if(reachable){
   if(!primaryRevision)return 0;
   try{await db.prepare('INSERT INTO operation_records(key,payload,revision,updated_by) VALUES(?,?,?,?) ON CONFLICT(key) DO UPDATE SET payload=excluded.payload,revision=excluded.revision,updated_by=excluded.updated_by').bind(key,payload,primaryRevision,by).run();}catch{}
   return primaryRevision;
  }
 }
 const result=expectedRevision===0
  ?await db.prepare('INSERT OR IGNORE INTO operation_records(key,payload,revision,updated_by) VALUES(?,?,1,?)').bind(key,payload,by).run()
  :await db.prepare('UPDATE operation_records SET payload=?,revision=revision+1,updated_by=? WHERE key=? AND revision=?').bind(payload,by,key,expectedRevision).run();
 return result.meta.changes?expectedRevision+1:0;
}
