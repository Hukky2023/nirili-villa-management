import {authDb,hashPassword,verifyPassword} from './auth';
import {credentialStatement} from './credential-store';
import {stayKey} from './stays';
export async function prepareStayLogin(state:any,s:any){
 const db=authDb(),username=String(s.room);
 const existing=await db.prepare('SELECT id,role,password_hash,salt FROM accounts WHERE username=?').bind(username).first<any>();
 if(existing&&(existing.role!=='guest'||state.stays.some((x:any)=>x.id!==s.id&&x.accountId===existing.id&&x.status==='In House')))throw Error('This room login is already in use. Please review the room assignment.');
 const retire=new Set<string>();if(existing)retire.add(existing.id);
 if(s.accountId&&!state.stays.some((x:any)=>x.id!==s.id&&x.accountId===s.accountId&&x.status==='In House'))retire.add(s.accountId);
 let password='';do{let n;do{n=crypto.getRandomValues(new Uint32Array(1))[0];}while(n>=4294890000);password=String(10000+n%90000);}while(existing&&await verifyPassword(password,existing.salt,existing.password_hash));
 const id='room-'+crypto.randomUUID(),hash=await hashPassword(password);
 if(!s.accountId&&s.legacyFolio!==false)s.legacyFolio=true;s.accountId=id;s.roomLogin=true;s.loginIssuedAt=new Date().toISOString();
 return {id,username,password,hash,name:s.guest,retire:[...retire]};
}
export async function saveStayAccess(state:any,revision:number,by:string,plan:any=null,revoke:string[]=[],documents:{id:string;payload:string}[]=[],removedDocuments:string[]=[]){
 const db=authDb(),payload=JSON.stringify(state),next=revision+1;
 const guard='EXISTS(SELECT 1 FROM operation_records WHERE key=? AND revision=? AND payload=?)';
 const args=[stayKey,next,payload];
 const writes:any[]=[revision===0?db.prepare('INSERT OR IGNORE INTO operation_records(key,payload,revision,updated_by) VALUES(?,?,1,?)').bind(stayKey,payload,by):db.prepare('UPDATE operation_records SET payload=?,revision=revision+1,updated_by=? WHERE key=? AND revision=?').bind(payload,by,stayKey,revision)];
 for(const id of new Set<string>([...(plan?.retire||[]),...revoke])){
  writes.push(db.prepare("UPDATE accounts SET active=0,username=CASE WHEN ?=1 THEN 'retired-'||id ELSE username END WHERE id=? AND role='guest' AND "+guard).bind(plan?.retire.includes(id)?1:0,id,...args));
  writes.push(db.prepare('DELETE FROM account_sessions WHERE account_id=? AND '+guard).bind(id,...args));
 }
 if(plan){writes.push(db.prepare("INSERT INTO accounts(id,username,name,password_hash,salt,role,permissions,active) SELECT ?,?,?,?,?,'guest','[]',1 WHERE "+guard).bind(plan.id,plan.username,plan.name,plan.hash.hash,plan.hash.salt,...args));writes.push(await credentialStatement(plan.id,plan.hash.hash,plan.password,by));}
 for(const doc of documents)writes.push(db.prepare('INSERT INTO operation_records(key,payload,revision,updated_by) SELECT ?,?,1,? WHERE '+guard).bind('passport:'+doc.id,doc.payload,by,...args));
 for(const id of removedDocuments)writes.push(db.prepare('DELETE FROM operation_records WHERE key=? AND '+guard).bind('passport:'+id,...args));
 const result=await db.batch(writes);return !!result[0].meta.changes;
}
