import {env} from 'cloudflare:workers';
import {authDb} from './auth';
import {sealCredential,openCredential} from './credential-crypto';
import {mirrorOperationalRecord,readOperationalRecordPrimary,supabaseBridgeConfigured} from './supabase-bridge';
function secret(){return (env as unknown as Record<string,string>).NIRILI_CREDENTIAL_KEY||'';}
export async function credentialStatement(id:string,hash:string,password:string,by:string){if(!id.startsWith('room-')||!/^\d{5}$/.test(password))return authDb().prepare('DELETE FROM operation_records WHERE key=?').bind('credential:'+id);const payload=await sealCredential(secret(),id,hash,password);return authDb().prepare('INSERT INTO operation_records(key,payload,revision,updated_by) SELECT ?,?,1,? WHERE EXISTS(SELECT 1 FROM accounts WHERE id=? AND password_hash=?) ON CONFLICT(key) DO UPDATE SET payload=excluded.payload,revision=operation_records.revision+1,updated_by=excluded.updated_by').bind('credential:'+id,payload,by,id,hash);}
export async function readCredential(id:string,hash:string){
 if(!id.startsWith('room-'))return null;
 const configured=supabaseBridgeConfigured();
 // Do not treat an unavailable primary store as a completed password setup.
 const primary=configured?await readOperationalRecordPrimary('credential:'+id):null;
 const local=primary?null:await authDb().prepare('SELECT payload,revision,updated_by FROM operation_records WHERE key=?').bind('credential:'+id).first<any>();
 const row=primary||local;
 if(!row)return null;
 const sealed=typeof row.payload==='string'?row.payload:typeof row.payload?.raw==='string'?row.payload.raw:JSON.stringify(row.payload);
 // A recovered code must match the current account hash before it can be used.
 const code=await openCredential(secret(),id,hash,sealed);
 if(configured&&!primary){
  const mirrored=await mirrorOperationalRecord('credential:'+id,local.payload,Number(local.revision)||1,local.updated_by||'');
  if(!mirrored)throw Error('Guest setup code could not be synced. Please retry.');
 }
 return code;
}

export async function mirrorCredentialRecord(id:string){
 const row=await authDb().prepare('SELECT payload,revision,updated_by FROM operation_records WHERE key=?').bind('credential:'+id).first<any>();
 if(!row)return false;
 try{await mirrorOperationalRecord('credential:'+id,row.payload,Number(row.revision)||1,row.updated_by||'');return true;}catch{return false;}
}

