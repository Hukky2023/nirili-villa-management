import {env} from 'cloudflare:workers';
import {authDb} from './auth';
import {sealCredential,openCredential} from './credential-crypto';
import {readOperationalRecordPrimary} from './supabase-bridge';
function secret(){return (env as unknown as Record<string,string>).NIRILI_CREDENTIAL_KEY||'';}
export async function credentialStatement(id:string,hash:string,password:string,by:string){const payload=await sealCredential(secret(),id,hash,password);return authDb().prepare('INSERT INTO operation_records(key,payload,revision,updated_by) SELECT ?,?,1,? WHERE EXISTS(SELECT 1 FROM accounts WHERE id=? AND password_hash=?) ON CONFLICT(key) DO UPDATE SET payload=excluded.payload,revision=operation_records.revision+1,updated_by=excluded.updated_by').bind('credential:'+id,payload,by,id,hash);}
export async function readCredential(id:string,hash:string){let row:any=null;try{row=await readOperationalRecordPrimary('credential:'+id);}catch{}if(!row)row=await authDb().prepare('SELECT payload FROM operation_records WHERE key=?').bind('credential:'+id).first<{payload:string}>();if(!row)return null;const sealed=typeof row.payload==='string'?row.payload:typeof row.payload?.raw==='string'?row.payload.raw:JSON.stringify(row.payload);return openCredential(secret(),id,hash,sealed);}
