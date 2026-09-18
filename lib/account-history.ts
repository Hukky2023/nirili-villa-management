import {authDb} from './auth';

const prefix='account-history:';

export type AccountHistoryEntry={
 at:string;
 action:string;
 by?:string;
 detail?:string;
};

export async function readAccountHistory(accountId:string):Promise<AccountHistoryEntry[]>{
 try{
  const row=await authDb().prepare('SELECT payload FROM operation_records WHERE key=?').bind(prefix+accountId).first<any>();
  if(!row)return [];
  const value=JSON.parse(row.payload||'[]');
  return Array.isArray(value)?value.filter((x:any)=>x&&typeof x.at==='string'&&typeof x.action==='string').slice(-100):[];
 }catch{return [];}
}

export async function appendAccountHistory(accountId:string,entry:AccountHistoryEntry){
 const current=await readAccountHistory(accountId);
 const next=[...current,{at:entry.at||new Date().toISOString(),action:String(entry.action||'Account updated').slice(0,160),by:String(entry.by||'').slice(0,100),detail:String(entry.detail||'').slice(0,500)}].slice(-100);
 await authDb().prepare("INSERT INTO operation_records(key,payload,revision,updated_by) VALUES(?,?,1,?) ON CONFLICT(key) DO UPDATE SET payload=excluded.payload,revision=operation_records.revision+1,updated_by=excluded.updated_by").bind(prefix+accountId,JSON.stringify(next),entry.by||'system').run();
}
