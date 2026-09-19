import {authDb} from './auth';
import {historyFor,mergeAccountHistory,type AccountHistoryEntry} from './account-history-events';
export type {AccountHistoryEntry} from './account-history-events';

const legacyPrefix='account-history:';
const eventPrefix=(id:string)=>'account-history-event:'+encodeURIComponent(id)+':';
type HistoryOptions={state?:any;guard?:string;args?:any[]};

/** Read legacy history and every new append-only record. A read failure must not
 * masquerade as an empty history. The only HTTP reader is admin-gated. */
export async function readAccountHistory(accountId:string):Promise<AccountHistoryEntry[]>{
 const prefix=eventPrefix(accountId);
 const rows=await authDb().prepare('SELECT payload FROM operation_records WHERE key=? OR (key>=? AND key<?)').bind(legacyPrefix+accountId,prefix,prefix+'\uffff').all<any>();
 const entries=rows.results.flatMap((row:any)=>{
  const value=JSON.parse(row.payload);
  if(!Array.isArray(value))throw Error('Invalid stored account history.');
  return value;
 });
 return mergeAccountHistory(entries);
}

/** A new row per write prevents concurrent writers overwriting one another and
 * avoids pruning older events. Optional guards join the caller's D1 transaction. */
export function accountHistoryStatement(accountId:string,entries:AccountHistoryEntry[],by:string,options:HistoryOptions={}){
 const key=eventPrefix(accountId)+crypto.randomUUID();
 return authDb().prepare('INSERT INTO operation_records(key,payload,revision,updated_by) SELECT ?,?,1,? WHERE '+(options.guard||'1'))
  .bind(key,JSON.stringify(mergeAccountHistory(entries)),by||'system',...(options.args||[]));
}
export async function appendAccountHistory(accountId:string,entry:AccountHistoryEntry){
 await accountHistoryStatement(accountId,[{at:entry.at||new Date().toISOString(),action:String(entry.action||'Account updated'),by:String(entry.by||''),detail:String(entry.detail||'')}],entry.by||'system').run();
}

/** Capture the persisted state BEFORE a room login is replaced, plus any state
 * about to be saved (checkout/deleted booking/expiry). No credential fields are
 * selected or copied. Callers batch this statement with disabling and sign-out. */
export async function preserveAccountHistoryStatement(accountId:string,entry:AccountHistoryEntry,options:HistoryOptions={}){
 const db=authDb();
 const account=await db.prepare('SELECT id,username,name,role FROM accounts WHERE id=?').bind(accountId).first<any>();
 const row=await db.prepare('SELECT payload FROM operation_records WHERE key=?').bind('hotel-stays-v1').first<any>();
 const states=[row?JSON.parse(row.payload):{},...(options.state?[options.state]:[])];
 const at=entry.at||new Date().toISOString();
 const events:AccountHistoryEntry[]=account?states.flatMap(state=>historyFor(account,state,undefined,undefined,[],at)):[];
 events.push({...entry,at});
 return accountHistoryStatement(accountId,events,entry.by||'system',options);
}
