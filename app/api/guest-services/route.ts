import {validateExcursionGuideAction} from '../../../lib/excursion-guide-server';
import {applyExcursionAction,excursionResources,excursionPaid,excursionStage,changeExcursionStatus} from '../../../lib/excursion-workflow';
import {nextBookingReference} from '../../../lib/booking-reference';
import {prepareStayLogin,saveStayAccess} from '../../../lib/stay-login';
import {mealItemIncluded} from '../../../lib/meal-access';
import {restaurantOnly} from '../../../lib/pos-access';
import {foodCatalog} from '../../../lib/menu-server';
import {authDb,currentUser,hasPermission,sameOrigin,hashPassword} from '../../../lib/auth';
import {credentialStatement} from '../../../lib/credential-store';
import {appendAccountHistory} from '../../../lib/account-history';
import {loadStays,stayKey,folioFor} from '../../../lib/stays';
import {catalog,plans,nightly,islandToday,validDate} from '../../../lib/guest-catalog';
import {loadExcursionMenu} from '../../../lib/excursion-menu';
const MIN_EXCURSION_PAX=1;
import {walkInExcursionBill,walkInExcursionProfile,syncWalkInExcursionAccess} from '../../../lib/walkin-excursion-access';

const crewPasswordChars='ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789';
function randomCrewPassword(length=10){
 const bytes=crypto.getRandomValues(new Uint8Array(length));
 return Array.from(bytes,b=>crewPasswordChars[b%crewPasswordChars.length]).join('');
}
function crewSlug(name:string){
 const slug=name.trim().toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-+|-+$/g,'').slice(0,22);
 return slug||'crew';
}
async function uniqueCrewUsername(name:string){
 const db=authDb(),base='crew-'+crewSlug(name);
 for(let i=0;i<8;i++){
  const suffix=crypto.randomUUID().replace(/-/g,'').slice(0,4);
  const username=(base+'-'+suffix).slice(0,40);
  const found=await db.prepare('SELECT id FROM accounts WHERE username=?').bind(username).first<any>();
  if(!found)return username;
 }
 throw Error('Could not generate a unique crew username. Please try again.');
}
async function view(u:any){const {state,revision}=await loadStays();const excursionMenu=await loadExcursionMenu();const currentCatalog=[...await foodCatalog(),...catalog.filter(i=>i.kind!=='food'&&i.kind!=='excursion'),...excursionMenu];const orders=state.orders.map((o:any)=>{const s=state.stays.find((s:any)=>s.id===o.stayId);return {...o,guestNotified:o.guestNotified??(o.status==='Scheduled and informed'),status:o.kind==='excursion'?excursionStage(o):o.status,paymentStatus:o.status==='Cancelled'?'Cancelled':o.kind==='excursion'?(excursionPaid(o,state)?'Paid':'Unpaid'):s?.paidBills?.[(o.kind==='food'?'Restaurant:':o.kind==='transfer'?'Transfer:':'Excursions:')+o.id]===o.cents?'Paid':'Unpaid'};});if(u.role==='guest'){
 const walkIn=walkInExcursionProfile(state,u.userId);
 if(walkIn?.active){
  const ownOrders=orders.filter((o:any)=>o.accountId===u.userId&&o.kind==='excursion');
  const bill=walkInExcursionBill(state,u.userId);
  return {catalog:currentCatalog,requests:[],stays:[],orders:ownOrders,walkInExcursion:{name:walkIn.name,phone:walkIn.phone,hotel:walkIn.hotel,room:walkIn.room,departureDate:walkIn.departureDate||'',createdAt:walkIn.createdAt,expiresAt:walkIn.expiresAt,bill}};
 }
 const stays=state.stays.filter((s:any)=>s.accountId===u.userId),ids=new Set(stays.map((s:any)=>s.id));
 const guestStays=await Promise.all(stays.map(async(s:any)=>{const f=await folioFor(s,state.orders);return {id:s.id,guest:s.guest,room:s.room,checkIn:s.checkIn,checkOut:s.checkOut,meal:s.meal,pax:s.pax,status:s.status,folio:{totalCents:f.totalCents,paidCents:f.paidCents,balanceCents:f.balanceCents,bills:f.bills.map((b:any)=>({id:b.id,department:b.department,items:b.items,status:b.status,totalCents:b.totalCents}))}}}));
 const ownOrders=orders.filter((o:any)=>ids.has(o.stayId)).map((o:any)=>({id:o.id,stayId:o.stayId,name:o.name,quantity:o.quantity,cents:o.cents,date:o.date,time:o.time,status:o.status,paymentStatus:o.paymentStatus}));
 const dining=(state.posOrders||[]).filter((o:any)=>ids.has(o.stayId)).map((o:any)=>({id:o.id,stayId:o.stayId,name:'Restaurant · Table '+o.table,quantity:1,cents:o.cents,date:o.createdAt?.slice(0,10),status:o.kitchen,paymentStatus:guestStays.find((s:any)=>s.id===o.stayId)?.folio.bills.find((b:any)=>b.id===o.id)?.status==='Paid'?'Paid':'Charged to room'}));
 return {catalog:currentCatalog,requests:[],stays:guestStays,orders:[...ownOrders,...dining]};
 }const crewOptions=u.role==='admin'?(await authDb().prepare("SELECT name FROM accounts WHERE active=1 AND role='staff'").all<any>()).results.map((x:any)=>x.name):[];return {canSchedule:u.role==='admin',resources:excursionResources(state),crewOptions,catalog:currentCatalog,revision,requests:state.requests,rooms:state.rooms,stays:state.stays,orders};}
export async function GET(){const u=await currentUser();if(!u||restaurantOnly(u))return Response.json({error:'Please log in.'},{status:401});try{return Response.json(await view(u),{headers:{'Cache-Control':'no-store'}})}catch{return Response.json({error:'Could not load bookings. Please retry.'},{status:503})}}
export async function POST(r:Request){const u=await currentUser();if(!u||!sameOrigin(r))return Response.json({error:'Please log in.'},{status:403});let generatedCrewAccountId='',generatedCrewLogin:any=null,generatedCrewCommitted=false;try{const b=await r.json(),{state,revision}=await loadStays();let resultId='';let loginPlan:any=null;let revokeAccounts:string[]=[];const today=islandToday();
if(b.action==='request'){if(u.role!=='guest')throw Error('Use your guest account to request a stay.');if(typeof b.token!=='string'||!/^[-a-zA-Z0-9]{12,80}$/.test(b.token))throw Error('Invalid request.');const old=state.requests.find((x:any)=>x.token===b.token&&x.accountId===u.userId);if(old)return Response.json(await view(u));const nights=(Date.parse(b.checkOut)-Date.parse(b.checkIn))/86400000;if(!validDate(b.checkIn)||!validDate(b.checkOut)||b.checkIn<today||!Number.isInteger(nights)||nights<1||nights>365||!Number.isInteger(b.pax)||b.pax<1||b.pax>3||!plans.includes(b.meal)||typeof b.guest!=='string'||!b.guest.trim()||b.guest.length>100||typeof b.whatsapp!=='string'||!/^\+[1-9]\d{7,14}$/.test(b.whatsapp)||typeof b.notes!=='string'||b.notes.length>1000)throw Error('Check dates, guest name, number of guests and WhatsApp number with country code.');if(state.requests.filter((x:any)=>x.accountId===u.userId&&x.status==='Pending').length>=5)throw Error('You already have five pending requests. Please contact reception.');resultId='REQ-'+crypto.randomUUID();state.requests.push({id:resultId,token:b.token,accountId:u.userId,guest:b.guest.trim(),whatsapp:b.whatsapp,checkIn:b.checkIn,checkOut:b.checkOut,pax:b.pax,meal:b.meal,notes:b.notes,status:'Pending',createdAt:new Date().toISOString(),estimate:nights*nightly(b.meal,b.pax)});}
else if(b.action==='confirm'||b.action==='decline'){if(u.role!=='admin')return Response.json({error:'Only Admin can confirm or decline bookings.'},{status:403});if(b.revision!==revision)return Response.json({error:'Bookings changed. Refresh and try again.'},{status:409});const q=state.requests.find((x:any)=>x.id===b.id);if(!q||q.status!=='Pending')throw Error('This request has already been handled.');if(b.action==='decline'){q.status='Declined';q.reviewedBy=u.username;}else{const room=state.rooms.find((x:any)=>x.number===b.room);if(!room||room.status==='Maintenance'||q.pax>room.capacity||state.stays.some((s:any)=>s.room===b.room&&s.status!=='Checked Out'&&s.checkIn<q.checkOut&&s.checkOut>q.checkIn))throw Error('That room is unavailable for these dates or guest count.');if(!Number.isInteger(b.rateCents)||b.rateCents<0||b.rateCents>1000000)throw Error('Enter a valid nightly rate.');const id=nextBookingReference(state);state.stays.push({id,accountId:q.accountId,guest:q.guest,whatsapp:q.whatsapp,room:b.room,billRoom:id,checkIn:q.checkIn,checkOut:q.checkOut,meal:q.meal,pax:q.pax,source:'Guest portal',status:'Confirmed',base:(Date.parse(q.checkOut)-Date.parse(q.checkIn))/86400000*b.rateCents,initialPaid:0,extensions:[],payments:[],history:[{date:new Date().toISOString(),detail:'Booking confirmed and room '+b.room+' allocated',by:u.username}]});q.status='Confirmed';q.stayId=id;q.room=b.room;q.reviewedBy=u.username;}}
else if(b.action==='checkin'){if(!hasPermission(u,'edit_bills'))return Response.json({error:'Check-in permission required.'},{status:403});if(b.revision!==revision)return Response.json({error:'Bookings changed. Refresh and try again.'},{status:409});const s=state.stays.find((x:any)=>x.id===b.id);if(!s||!['Confirmed','Checked Out'].includes(s.status))throw Error('Only confirmed or checked-out bookings can check in.');const reentry=s.status==='Checked Out';if(today<s.checkIn||today>=s.checkOut)throw Error('Check-in is available during the booked stay dates.');const room=state.rooms.find((x:any)=>x.number===s.room);if(!room||!(room.status==='Available'||(reentry&&b.roomReady===true&&room.status==='Cleaning'))||state.stays.some((x:any)=>x.id!==s.id&&x.room===s.room&&(x.status==='In House'||(x.status==='Confirmed'&&x.checkIn<s.checkOut&&x.checkOut>today))))throw Error('The allocated room is not ready. Mark it Available after cleaning.');s.status='In House';loginPlan=await prepareStayLogin(state,s);delete s.checkedOutAt;s.checkedInAt=new Date().toISOString();room.status='Occupied';s.history.unshift({date:s.checkedInAt,detail:(reentry?'Guest checked back in · Room readiness confirmed':'Guest checked in')+' · Food and excursion ordering unlocked',by:u.username});}
else if(b.action==='order'){if(u.role!=='guest')throw Error('Use your guest account.');const s=state.stays.find((s:any)=>s.id===b.stayId&&s.accountId===u.userId);if(!s)return Response.json({error:'This booking is not linked to your account.'},{status:403});if(typeof b.token!=='string'||!/^[-a-zA-Z0-9]{12,80}$/.test(b.token))throw Error('Invalid request.');if(state.orders.some((o:any)=>o.token===b.token&&o.accountId===u.userId))return Response.json(await view(u));const item=[...await foodCatalog(),...catalog.filter(i=>i.kind!=='food'&&i.kind!=='excursion'),...await loadExcursionMenu()].find(x=>x.id===b.itemId);if(!item||!Number.isInteger(b.quantity)||b.quantity<MIN_EXCURSION_PAX||b.quantity>20||typeof b.notes!=='string'||b.notes.length>1000)throw Error('Check the quantity and notes.');if(!(s.status==='In House'||(item.kind==='transfer'&&s.status==='Confirmed')))return Response.json({error:'A confirmed stay is required for transfers. Food and excursions unlock after check-in.'},{status:403});if(item.kind==='transfer'&&(!validDate(b.date)||b.date<today||b.date<s.checkIn||b.date>s.checkOut||typeof b.time!=='string'||!/^([01]\d|2[0-3]):[0-5]\d$/.test(b.time)))throw Error('Choose a transfer date within your stay and a valid departure time.');const expectedTotal=item.kind==='food'&&mealItemIncluded(s.meal,item as any)?0:item.cents*b.quantity;if(b.expectedCents!==undefined&&b.expectedCents!==expectedTotal)throw Error('Price or meal plan changed. Refresh and review the total before ordering.');if(item.kind==='excursion'&&(!validDate(b.date)||b.date<today||b.date<s.checkIn||b.date>=s.checkOut))throw Error('Choose an excursion date within your stay, before checkout.');state.orders.push({id:(item.kind==='food'?'FOOD-':item.kind==='transfer'?'TRF-':'EXC-')+crypto.randomUUID().slice(0,8).toUpperCase(),token:b.token,accountId:u.userId,stayId:s.id,guest:s.guest,room:s.room,kind:item.kind,name:item.name+(item.kind==='food'&&mealItemIncluded(s.meal,item as any)?' (meal plan included)':''),quantity:b.quantity,cents:item.kind==='food'&&mealItemIncluded(s.meal,item as any)?0:item.cents*b.quantity,notes:b.notes,date:item.kind==='food'?today:b.date,time:item.kind==='transfer'?b.time:undefined,status:'Placed',kitchen:item.kind==='food'?'Awaiting cashier':undefined,createdAt:new Date().toISOString()});}
else if(['schedule-excursion','excursion-create','excursion-resource','excursion-status','excursion-payment','excursion-notified','excursion-vessel-condition','excursion-vessel-remove','excursion-crew-update','excursion-crew-remove','excursion-gopro-update','excursion-gopro-remove'].includes(b.action)){
 if(u.role!=='admin')return Response.json({error:'Admin access required.'},{status:403});
 if(b.revision!==revision)return Response.json({error:'Bookings changed. Refresh and try again.'},{status:409});
 if(b.action==='excursion-resource'&&b.resourceType==='crew'){
  const crewName=String(b.name||'').trim();
  const existing=excursionResources(state).crew.some((member:any)=>!member.removed&&String(member.name||'').trim().toLowerCase()===crewName.toLowerCase());
  if(existing)throw Error('That name is already in the crew list.');
  const accountId=crypto.randomUUID(),username=await uniqueCrewUsername(crewName),password=randomCrewPassword(10),hashed=await hashPassword(password);
  const db=authDb();
  const results=await db.batch([
   db.prepare("INSERT INTO accounts(id,username,email,name,password_hash,salt,role,permissions,active) VALUES(?,?,?,?,?,?,'staff',?,1)").bind(accountId,username,null,crewName,hashed.hash,hashed.salt,JSON.stringify(['crew_location'])),
   await credentialStatement(accountId,hashed.hash,password,u.userId)
  ]);
  if(!results[0].meta.changes)throw Error('Could not create the crew login. Please try again.');
  generatedCrewAccountId=accountId;
  generatedCrewLogin={accountId,username,password,name:crewName,role:'Crew Member'};
  b.resourceId=accountId;b.accountId=accountId;b.username=username;
 }
 if(b.action==='excursion-crew-remove'){
  const member=excursionResources(state).crew.find((crew:any)=>crew.id===b.crewId&&!crew.removed);
  if(!member)throw Error('Crew member not found.');
  const rows=(await authDb().prepare("SELECT payload FROM operation_records WHERE key LIKE 'excursion-schedule:%'").all<any>()).results||[];
  const scheduled=rows.map((row:any)=>{try{return JSON.parse(row.payload||'{}')}catch{return null}}).filter(Boolean);
  const activeSchedule=scheduled.find((schedule:any)=>schedule.status!=='Cancelled'&&String(schedule.date||'')>=today&&Array.isArray(schedule.crewIds)&&schedule.crewIds.includes(member.id));
  if(activeSchedule)throw Error('This crew member is assigned to '+String(activeSchedule.name||'an excursion')+' on '+String(activeSchedule.date||'')+' at '+String(activeSchedule.time||'')+'. Reassign or cancel that trip before removing the crew member.');
 }
 if(b.action==='excursion-gopro-remove'){
  const gopro=excursionResources(state).gopros.find((item:any)=>item.id===b.goproId);
  if(!gopro)throw Error('GoPro not found.');
  const rows=(await authDb().prepare("SELECT payload FROM operation_records WHERE key LIKE 'excursion-schedule:%'").all<any>()).results||[];
  const scheduled=rows.map((row:any)=>{try{return JSON.parse(row.payload||'{}')}catch{return null}}).filter(Boolean);
  const activeSchedule=scheduled.find((schedule:any)=>schedule.status!=='Cancelled'&&String(schedule.date||'')>=today&&schedule.goproId===gopro.id);
  if(activeSchedule)throw Error(gopro.name+' is assigned to '+String(activeSchedule.name||'an excursion')+' on '+String(activeSchedule.date||'')+' at '+String(activeSchedule.time||'')+'. Assign another GoPro or cancel that trip before removing it.');
 }
 applyExcursionAction(state,b,today,u.username);
 await validateExcursionGuideAction(state,b);
}
else if(b.action==='orderstatus'){const o=state.orders.find((x:any)=>x.id===b.id);if(!o)throw Error('Order not found.');if(o.transportBooking)throw Error('Manage this ticket from the Transport manifest. Room payments are managed from the room bill.');if(!hasPermission(u,o.kind==='food'?'edit_bills':o.kind==='transfer'?'edit_transfers':'edit_excursions'))return Response.json({error:'Editing permission required.'},{status:403});if(b.revision!==revision)return Response.json({error:'Orders changed. Refresh and try again.'},{status:409});if(!['Confirmed','Completed','Cancelled'].includes(b.status)||o.status==='Completed'||o.status==='Cancelled')throw Error('This order cannot be changed.');const stay=state.stays.find((x:any)=>x.id===o.stayId);if(stay?.status==='Checked Out')throw Error('This stay is checked out.');if(o.kind==='food'&&o.kitchen==='Awaiting cashier'&&b.status!=='Cancelled')throw Error('Send this order to the kitchen from the cashier Bills screen first.');if(o.kind==='excursion'){if(u.role!=='admin')return Response.json({error:'Admin access required.'},{status:403});changeExcursionStatus(o,b.status,state,u.username);}else{o.status=b.status;o.updatedBy=u.username;}}
else throw Error('Unknown action.');
revokeAccounts=syncWalkInExcursionAccess(state);
const saved=await saveStayAccess(state,revision,u.userId,loginPlan,revokeAccounts);
if(!saved){
 if(generatedCrewAccountId){
  const db=authDb();await db.batch([db.prepare('DELETE FROM operation_records WHERE key=?').bind('credential:'+generatedCrewAccountId),db.prepare('DELETE FROM accounts WHERE id=?').bind(generatedCrewAccountId)]);
  generatedCrewAccountId='';
 }
 return Response.json({error:'Another update was saved. Please refresh and try again.'},{status:409});
}
generatedCrewCommitted=true;
if(generatedCrewLogin){try{await appendAccountHistory(generatedCrewLogin.accountId,{at:new Date().toISOString(),action:'Crew account created',by:u.username,detail:'Automatic Crew Member login generated from Excursions → Crew members.'});}catch{}}
if(b.action==='excursion-crew-update'){
 const member=excursionResources(state).crew.find((crew:any)=>crew.id===b.crewId);
 if(member?.accountId){
  try{
   const active=member.active!==false&&member.active!==0,db=authDb();
   await db.prepare("UPDATE accounts SET name=?,active=? WHERE id=? AND role='staff'").bind(member.name,active?1:0,member.accountId).run();
   if(!active)await db.prepare('DELETE FROM account_sessions WHERE account_id=?').bind(member.accountId).run();
   try{await appendAccountHistory(member.accountId,{at:new Date().toISOString(),action:active?'Crew profile updated':'Crew account disabled',by:u.username,detail:'Crew name/status updated from Excursions.'});}catch{}
  }catch{}
 }
}
if(b.action==='excursion-crew-remove'){
 const member=excursionResources(state).crew.find((crew:any)=>crew.id===b.crewId);
 if(member?.accountId){
  try{
   const db=authDb(),account=await db.prepare("SELECT permissions FROM accounts WHERE id=? AND role='staff'").bind(member.accountId).first<any>();
   const permissions=account?JSON.parse(account.permissions||'[]'):[],remaining=(Array.isArray(permissions)?permissions:[]).filter((permission:string)=>permission!=='crew_location');
   try{await appendAccountHistory(member.accountId,{at:new Date().toISOString(),action:'Removed from excursion crew',by:u.username,detail:'Crew resource removed from Excursions. Historical trip records retained.'});}catch{}
   await db.prepare('DELETE FROM operation_records WHERE key=?').bind('crew-location:'+member.accountId).run();
   if(account&&remaining.length===0){
    await db.batch([
     db.prepare('DELETE FROM account_sessions WHERE account_id=?').bind(member.accountId),
     db.prepare('DELETE FROM operation_records WHERE key=?').bind('credential:'+member.accountId),
     db.prepare("DELETE FROM accounts WHERE id=? AND role='staff'").bind(member.accountId)
    ]);
   }else if(account){
    await db.prepare("UPDATE accounts SET permissions=? WHERE id=? AND role='staff'").bind(JSON.stringify(remaining),member.accountId).run();
   }
  }catch{}
 }
}
const response=await view(u);
return Response.json(generatedCrewLogin?{...response,generatedCrewLogin}:response);
}catch(e){
 if(generatedCrewAccountId&&!generatedCrewCommitted){
  try{const db=authDb();await db.batch([db.prepare('DELETE FROM operation_records WHERE key=?').bind('credential:'+generatedCrewAccountId),db.prepare('DELETE FROM accounts WHERE id=?').bind(generatedCrewAccountId)]);}catch{}
 }
 return Response.json({error:e instanceof Error?e.message:'Could not save. Please retry.'},{status:400});
}}
