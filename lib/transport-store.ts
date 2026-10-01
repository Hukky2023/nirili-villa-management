import {authDb} from './auth';
import {mirrorOperationalRecord,mirrorTransportState,readOperationalRecordPrimary,saveOperationalRecordPrimary} from './supabase-bridge';
import {initialTransport,normalizeTransport,type TransportState} from './transport';

// The single place that reads and writes the speedboat ledger (departures, boats, tickets).
// Supabase is the primary copy when configured and D1 is the rollback copy, the same rule as
// the staff transport screen. Every writer must use this so no channel saves to a stale copy.
export const TRANSPORT_KEY='transport-bookings-v1';

export async function loadTransport():Promise<{state:TransportState;revision:number}>{
 try{
  const row=await readOperationalRecordPrimary(TRANSPORT_KEY);
  if(row)return {state:normalizeTransport(row.payload||initialTransport()),revision:Number(row.revision)||0};
 }catch{}
 const row=await authDb().prepare('SELECT payload,revision FROM operation_records WHERE key=?').bind(TRANSPORT_KEY).first<any>();
 return {state:normalizeTransport(row?JSON.parse(row.payload):initialTransport()),revision:Number(row?.revision)||0};
}

// Compare-and-swap save. Returns the new revision, or 0 when someone else saved first.
export async function saveTransport(state:TransportState,revision:number,by:string):Promise<number>{
 let primaryRevision=0,primaryAvailable=true;
 try{primaryRevision=await saveOperationalRecordPrimary(TRANSPORT_KEY,state,revision,by);}catch{primaryAvailable=false;}
 if(primaryAvailable&&primaryRevision){
  try{
   await authDb().prepare('INSERT INTO operation_records(key,payload,revision,updated_by) VALUES(?,?,?,?) ON CONFLICT(key) DO UPDATE SET payload=excluded.payload,revision=excluded.revision,updated_by=excluded.updated_by').bind(TRANSPORT_KEY,JSON.stringify(state),primaryRevision,by).run();
  }catch{}
  try{await mirrorTransportState(state);}catch{}
  return primaryRevision;
 }
 // saveOperationalRecordPrimary answers 0 both when Supabase is not configured and on a lost
 // race; only fall back to D1 when there is no primary copy at all.
 if(primaryAvailable){
  let primaryExists=false;
  try{primaryExists=!!await readOperationalRecordPrimary(TRANSPORT_KEY);}catch{}
  if(primaryExists)return 0;
 }
 const payload=JSON.stringify(state);
 const result=revision===0
  ?await authDb().prepare('INSERT OR IGNORE INTO operation_records(key,payload,revision,updated_by) VALUES(?,?,1,?)').bind(TRANSPORT_KEY,payload,by).run()
  :await authDb().prepare('UPDATE operation_records SET payload=?,revision=revision+1,updated_by=? WHERE key=? AND revision=?').bind(payload,by,TRANSPORT_KEY,revision).run();
 if(!result.meta.changes)return 0;
 try{await Promise.all([mirrorTransportState(state),mirrorOperationalRecord(TRANSPORT_KEY,state,revision+1,by)]);}catch{}
 return revision+1;
}

// Re-reads and retries a change a few times when another booking lands at the same moment.
export async function updateTransport<T>(by:string,change:(state:TransportState)=>T|Promise<T>):Promise<{result:T;state:TransportState;revision:number}>{
 for(let attempt=0;attempt<4;attempt++){
  const {state,revision}=await loadTransport();
  const result=await change(state);
  const next=await saveTransport(state,revision,by);
  if(next)return {result,state,revision:next};
 }
 throw Error('Bookings changed at the same time. Please try again.');
}
