export function chatRecipients(actor:any,body:any,accounts:any[],stays:any[]){
 if(actor.role==='guest')return [actor.userId];
 if(actor.role!=='admin')throw Error('Admin or guest access required.');
 const active=new Set(accounts.filter(a=>a.active&&a.role==='guest').map(a=>a.id));
 if(body.broadcast){const ids=[...new Set<string>(stays.filter(s=>s.status==='In House'&&active.has(s.accountId)).map(s=>s.accountId))];if(!ids.length)throw Error('No checked-in guests have active guest logins.');return ids;}
 if(typeof body.recipient!=='string'||!active.has(body.recipient))throw Error('Select an active guest.');return [body.recipient];
}
export function validateChat(body:any){if(typeof body.text!=='string'||!body.text.trim()||body.text.trim().length>2000)throw Error('Enter a message of 1–2,000 characters.');if(typeof body.token!=='string'||!/^[a-f0-9-]{36}$/.test(body.token))throw Error('Invalid message. Please reopen chat.');if(body.broadcast!==undefined&&typeof body.broadcast!=='boolean')throw Error('Invalid audience.');return body.text.trim();}
export function mayReadChat(actor:any,message:any){return actor?.role==='admin'||(actor?.role==='guest'&&message.recipients.includes(actor.userId));}
