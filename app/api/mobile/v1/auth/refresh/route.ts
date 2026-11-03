import {authDb,digest,randomToken,publicUser,roomLoginActive} from '../../../../../../lib/auth';
import {mobileEnabled} from '../../../../../../lib/mobile-auth';
export async function POST(req:Request){
 const headers={'Cache-Control':'no-store'};
 if(!mobileEnabled())return Response.json({error:'Disabled'},{status:503,headers});
 try{
  const body=await req.json();
  const value=body?.refresh_token;
  if(typeof value!=='string'||!/^[a-f0-9]{64}$/.test(value))return Response.json({error:'Unauthorized'},{status:401,headers});
  const rotated=randomToken();
  const record=await authDb().prepare('UPDATE mobile_refresh_sessions SET token_hash=? WHERE token_hash=? AND expires_at>? RETURNING account_id').bind(await digest(rotated),await digest(value),Date.now()).first<{account_id:string}>();
  if(!record)return Response.json({error:'Session expired'},{status:401,headers});
  const account=await authDb().prepare('SELECT * FROM accounts WHERE id=? AND active=1').bind(record.account_id).first<any>();
  if(!account||account.role==='guest'||!await roomLoginActive(account.id)){
    await authDb().prepare('DELETE FROM mobile_refresh_sessions WHERE token_hash=?').bind(await digest(rotated)).run();
    return Response.json({error:'Unauthorized'},{status:401,headers});
  }
  const access=randomToken();
  await authDb().prepare('INSERT INTO mobile_access_sessions(token_hash,account_id,expires_at) VALUES(?,?,?)').bind(await digest(access),account.id,Date.now()+900000).run();
  return Response.json({access_token:access,refresh_token:rotated,expires_in:900,user:publicUser(account)},{headers});
 }catch{return Response.json({error:'Unavailable'},{status:503,headers});}
}
