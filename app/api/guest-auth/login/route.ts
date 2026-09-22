import {authDb,issueGuestSession,limit,roomLoginActive,sameOrigin,verifyPassword} from '../../../../lib/auth';
function guestHostAllowed(r:Request){const host=(r.headers.get('host')||new URL(r.url).host).split(':')[0].toLowerCase();return host==='booking.nirilihotels.com'||host==='localhost'||host==='127.0.0.1';}
export async function POST(r:Request){
 if(!guestHostAllowed(r)||!sameOrigin(r))return Response.json({error:'Guest sign-in is available only on the Nirili guest portal.'},{status:403});
 try{
  const b=await r.json(),username=String(b.username||'').trim().toLowerCase(),password=String(b.password||'');
  if(!/^\d{3,10}$/.test(username)||password.length<1||password.length>128)return Response.json({error:'Enter your room number and guest password.'},{status:400});
  const ip=r.headers.get('cf-connecting-ip')||'unknown';if(!await limit('guest-login:'+ip+':'+username,12,900000))return Response.json({error:'Too many sign-in attempts. Please contact reception.'},{status:429});
  const row=await authDb().prepare("SELECT * FROM accounts WHERE lower(username)=? AND role='guest' AND active=1").bind(username).first<any>();
  if(!row||!await verifyPassword(password,row.salt,row.password_hash)||!await roomLoginActive(row.id))return Response.json({error:'Incorrect room number or password. Ask reception for your current guest login.'},{status:401});
  return Response.json({ok:true,redirect:'/stay'},{headers:{'Cache-Control':'private, no-store','Set-Cookie':await issueGuestSession(row.id)}});
 }catch{return Response.json({error:'Could not sign in. Please ask reception for help.'},{status:503});}
}
