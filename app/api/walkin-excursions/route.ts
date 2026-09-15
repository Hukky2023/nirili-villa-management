import {cookies} from 'next/headers';
import {authDb,digest,randomToken,sameOrigin,limit} from '../../../lib/auth';
import {sessionCookieName} from '../../../lib/tab-session';
import {catalog,islandToday,validDate} from '../../../lib/guest-catalog';
import {loadStays,stayKey} from '../../../lib/stays';
const items=catalog.filter(i=>i.kind==='excursion');
async function identity(){const name=await sessionCookieName('nirili_excursion');const token=(await cookies()).get(name)?.value;return {name,token:token&&/^[a-f0-9]{64}$/.test(token)?token:null};}
const publicOrder=(o:any)=>({id:o.id,name:o.name,quantity:o.quantity,cents:o.cents,date:o.date,status:o.status});
export async function GET(){try{const id=await identity(),token=id.token||randomToken(),key='exc-walk:'+await digest(token);const {state}=await loadStays();return Response.json({items,today:islandToday(),orders:state.orders.filter((o:any)=>o.guestKey===key).map(publicOrder)},{headers:{'Cache-Control':'no-store',...(!id.token?{'Set-Cookie':`${id.name}=${token}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=43200`}:{})}});}catch{return Response.json({error:'Could not load excursions. Please refresh.'},{status:503});}}
export async function POST(r:Request){if(!sameOrigin(r))return Response.json({error:'Invalid request.'},{status:403});try{
 const id=await identity();if(!id.token)throw Error('Refresh this page before booking.');const key='exc-walk:'+await digest(id.token),b=await r.json();
 if(typeof b.token!=='string'||!/^[-a-zA-Z0-9]{12,80}$/.test(b.token))throw Error('Refresh and try again.');
 const {state,revision}=await loadStays();const old=state.orders.find((o:any)=>o.guestKey===key&&o.token===b.token);if(old)return Response.json({order:publicOrder(old)});
 const item=items.find(i=>i.id===b.itemId);if(!item||!Number.isInteger(b.quantity)||b.quantity<(item.minGuests||2)||b.quantity>20)throw Error('Select an excursion and 2–20 guests.');
 if(!validDate(b.date)||b.date<islandToday()||b.date>new Date(Date.now()+365*86400000).toISOString().slice(0,10))throw Error('Select a date within the next year.');
 if(typeof b.name!=='string'||!b.name.trim()||b.name.length>100||typeof b.phone!=='string'||!/^\+[1-9]\d{7,14}$/.test(b.phone))throw Error('Enter your name and WhatsApp number with country code.');
 if(typeof b.hotel!=='string'||!b.hotel.trim()||b.hotel.length>150||typeof b.room!=='string'||b.room.length>30||typeof b.notes!=='string'||b.notes.length>1000)throw Error('Enter your hotel or meeting location and check the notes.');
 const cents=item.cents*b.quantity;if(b.expectedCents!==cents)throw Error('The price changed. Refresh and review your booking.');
 if(!await limit('exc-walk:'+key,10,3600000)||!await limit('exc-ip:'+(r.headers.get('cf-connecting-ip')||'unknown'),40,3600000))throw Error('Please contact reception for more bookings.');
 const order={id:'EXC-'+crypto.randomUUID(),token:b.token,guestKey:key,stayId:'',room:'',guest:b.name.trim(),kind:'excursion',source:'Walk-in',phone:b.phone,hotel:b.hotel.trim(),externalRoom:b.room.trim(),name:item.name,quantity:b.quantity,cents,date:b.date,notes:b.notes.trim(),status:'Placed',createdAt:new Date().toISOString()};state.orders.push(order);
 const saved=revision===0?await authDb().prepare('INSERT OR IGNORE INTO operation_records(key,payload,revision,updated_by) VALUES(?,?,1,?)').bind(stayKey,JSON.stringify(state),key).run():await authDb().prepare('UPDATE operation_records SET payload=?,revision=revision+1,updated_by=? WHERE key=? AND revision=?').bind(JSON.stringify(state),key,stayKey,revision).run();
 if(!saved.meta.changes)return Response.json({error:'Another booking arrived. Please tap Book again.'},{status:409});return Response.json({order:publicOrder(order)},{headers:{'Cache-Control':'no-store'}});
 }catch(e){return Response.json({error:(e as Error).message},{status:400});}}
