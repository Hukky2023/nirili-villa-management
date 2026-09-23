import {validateExcursionGuideAction} from '../../../lib/excursion-guide-server';
import {applyExcursionAction,excursionResources,excursionPaid,excursionStage,changeExcursionStatus} from '../../../lib/excursion-workflow';
import {nextBookingReference} from '../../../lib/booking-reference';
import {editBooking,deleteBooking} from '../../../lib/booking-admin';
import {createBookingManageToken} from '../../../lib/booking-manage';
import {prepareStayLogin,saveStayAccess} from '../../../lib/stay-login';
import {mealItemIncluded} from '../../../lib/meal-access';
import {restaurantOnly} from '../../../lib/pos-access';
import {foodCatalog} from '../../../lib/menu-server';
import {authDb,currentUser,currentGuestUser,hasPermission,sameOrigin,hashPassword,validPassword} from '../../../lib/auth';
import {credentialStatement,mirrorCredentialRecord} from '../../../lib/credential-store';
import {appendAccountHistory} from '../../../lib/account-history';
import {loadStays,stayKey,folioFor} from '../../../lib/stays';
import {catalog,plans,nightly,islandToday,validDate} from '../../../lib/guest-catalog';
import {loadExcursionMenu} from '../../../lib/excursion-menu';
import {deactivateSupabaseAccount,deleteLegacySessionsForAccount,ensureSupabaseEmployee,mirrorLegacyAccount,readOperationalRecordPrimary,updatePublicBookingRequestStatus} from '../../../lib/supabase-bridge';
import {updateRoomInventory} from '../../../lib/rooms';
import {autoPushBookingComAvailability} from '../../../lib/channels';
import {sendBookingConfirmationEmail,sendBookingUpdatedEmail,sendBookingCancelledEmail,sendBookingRequestRejectedEmail} from '../../../lib/booking-email';
const MIN_EXCURSION_PAX=1;
import {walkInExcursionBill,walkInExcursionProfile,syncWalkInExcursionAccess} from '../../../lib/walkin-excursion-access';
async function serviceUser(){return (await currentUser())||(await currentGuestUser());}
function canUseManagementServices(u:any){
 if(!u)return false;
 if(u.role==='guest'||u.role==='admin')return true;
 if(u.role!=='staff')return false;
 if(u.permissions.length===0)return true;
 return u.permissions.some((p:string)=>['guesthouse_reception','excursions_manager','edit_bills','edit_excursions','edit_transfers'].includes(p));
}

async function loadViewState(){try{const row=await readOperationalRecordPrimary(stayKey);if(row?.payload){const state=row.payload;state.requests??=[];state.orders??=[];state.posOrders??=[];state.stays??=[];state.rooms??=[];state.bookingChanges??=[];state.excursionChanges??=[];state.buggyBookings??=[];state.buggyFleet??=[];state.buggyTripHistory??=[];state.buggySettings??={guestRideFareCents:0};updateRoomInventory(state);return {state,revision:Number(row.revision)||0};}}catch{}return loadStays();}
function maldivesClock(){
 const parts=new Intl.DateTimeFormat('en-GB',{timeZone:'Indian/Maldives',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).formatToParts(new Date());
 const get=(type:string)=>parts.find((part:any)=>part.type===type)?.value||'00';
 return get('hour')+':'+get('minute');
}
function syncBuggyRideBill(stay:any,ride:any){
 stay.posBills=Array.isArray(stay.posBills)?stay.posBills:[];
 stay.posBills=stay.posBills.filter((bill:any)=>!(bill?.department==='Buggy'&&String(bill?.id||'')===String(ride.id)));
 if(ride.cancelled===true||ride.chargeToRoom!==true||Math.max(0,Number(ride.fareCents)||0)===0)return;
 const fare=Math.max(0,Number(ride.fareCents)||0);
 stay.posBills.push({department:'Buggy',id:ride.id,items:[[String(ride.location||'Pickup')+' → '+String(ride.destination||'Drop-off'),1,fare/100,0]],status:'Posted',totalCents:fare});
}
function activeBuggyRide(ride:any){return ride?.bookingType==='guest-ride'&&ride.cancelled!==true&&!['Completed','Cancelled'].includes(String(ride.buggyStatus||''));}
function releaseBuggyIfIdle(state:any,ride:any){
 if(!ride?.buggyId)return;
 const busy=(state.buggyBookings||[]).some((x:any)=>x.id!==ride.id&&x.buggyId===ride.buggyId&&activeBuggyRide(x));
 if(!busy){const buggy=(state.buggyFleet||[]).find((x:any)=>x.id===ride.buggyId);if(buggy&&buggy.status==='Assigned')buggy.status='Available';}
}
async function view(u:any){const {state,revision}=await loadViewState();const excursionMenu=await loadExcursionMenu();const currentCatalog=[...await foodCatalog(),...catalog.filter(i=>i.kind!=='food'&&i.kind!=='excursion'),...excursionMenu];const orders=state.orders.map((o:any)=>{const s=state.stays.find((s:any)=>s.id===o.stayId);return {...o,guestNotified:o.guestNotified??(o.status==='Scheduled and informed'),status:o.kind==='excursion'?excursionStage(o):o.status,paymentStatus:o.status==='Cancelled'?'Cancelled':o.kind==='excursion'?(excursionPaid(o,state)?'Paid':'Unpaid'):s?.paidBills?.[(o.kind==='food'?'Restaurant:':o.kind==='transfer'?'Transfer:':'Excursions:')+o.id]===o.cents?'Paid':'Unpaid'};});if(u.role==='guest'){
 const walkIn=walkInExcursionProfile(state,u.userId);
 if(walkIn?.active){
  const ownOrders=orders.filter((o:any)=>o.accountId===u.userId&&o.kind==='excursion');
  const bill=walkInExcursionBill(state,u.userId);
  return {catalog:currentCatalog,requests:[],stays:[],orders:ownOrders,walkInExcursion:{name:walkIn.name,phone:walkIn.phone,hotel:walkIn.hotel,room:walkIn.room,departureDate:walkIn.departureDate||'',guests:walkIn.guests||[],createdAt:walkIn.createdAt,expiresAt:walkIn.expiresAt,bill}};
 }
 const stays=state.stays.filter((s:any)=>s.accountId===u.userId),ids=new Set(stays.map((s:any)=>s.id));
 const guestStays=await Promise.all(stays.map(async(s:any)=>{const f=await folioFor(s,state.orders);return {id:s.id,guest:s.guest,room:s.room,checkIn:s.checkIn,checkOut:s.checkOut,meal:s.meal,pax:s.pax,status:s.status,folio:{totalCents:f.totalCents,paidCents:f.paidCents,balanceCents:f.balanceCents,bills:f.bills.map((b:any)=>({id:b.id,department:b.department,items:b.items,status:b.status,totalCents:b.totalCents}))}}}));
 const ownOrders=orders.filter((o:any)=>ids.has(o.stayId)).map((o:any)=>({id:o.id,stayId:o.stayId,name:o.name,quantity:o.quantity,cents:o.cents,date:o.date,time:o.time,status:o.status,paymentStatus:o.paymentStatus}));
 const dining=(state.posOrders||[]).filter((o:any)=>ids.has(o.stayId)).map((o:any)=>({id:o.id,stayId:o.stayId,name:'Restaurant · Table '+o.table,quantity:1,cents:o.cents,date:o.createdAt?.slice(0,10),status:o.kitchen,paymentStatus:guestStays.find((s:any)=>s.id===o.stayId)?.folio.bills.find((b:any)=>b.id===o.id)?.status==='Paid'?'Paid':'Charged to room'}));
 const buggyRides=(state.buggyBookings||[]).filter((ride:any)=>ride.accountId===u.userId&&ride.bookingType==='guest-ride').slice().sort((a:any,b:any)=>String(b.createdAt||'').localeCompare(String(a.createdAt||''))).map((ride:any)=>{const buggy=(state.buggyFleet||[]).find((x:any)=>x.id===ride.buggyId);return {id:ride.id,stayId:ride.stayId,room:ride.room,guest:ride.guest,date:ride.date,pickupTime:ride.pickupTime,location:ride.location,destination:ride.destination,quantity:ride.quantity,status:ride.cancelled?'Cancelled':ride.buggyStatus||'Requested',buggyId:ride.buggyId||'',buggyName:buggy?.name||'',driver:ride.buggyDriver||buggy?.driver||'',fareCents:Math.max(0,Number(ride.fareCents)||0),chargeToRoom:ride.chargeToRoom===true,createdAt:ride.createdAt||''};});
 return {catalog:currentCatalog,requests:[],stays:guestStays,orders:[...ownOrders,...dining],buggyFareCents:Math.max(0,Number(state.buggySettings?.guestRideFareCents)||0),buggyRides};
 }const canManageExcursions=u.role==='admin'||hasPermission(u,'excursions_manager')||hasPermission(u,'edit_excursions');const crewOptions=canManageExcursions?(await authDb().prepare("SELECT name FROM accounts WHERE active=1 AND role='staff'").all<any>()).results.map((x:any)=>x.name):[];return {canSchedule:canManageExcursions,resources:excursionResources(state),crewOptions,catalog:currentCatalog,revision,requests:state.requests,bookingChanges:state.bookingChanges||[],excursionChanges:state.excursionChanges||[],rooms:state.rooms,stays:state.stays,orders};}
export async function GET(){const u=await serviceUser();if(!canUseManagementServices(u)||restaurantOnly(u))return Response.json({error:'This account cannot access hotel management services.'},{status:403});try{return Response.json(await view(u),{headers:{'Cache-Control':'no-store'}})}catch{return Response.json({error:'Could not load bookings. Please retry.'},{status:503})}}
export async function POST(r:Request){const u=await serviceUser();if(!u||!sameOrigin(r)||(!canUseManagementServices(u)&&u.role!=='guest'))return Response.json({error:'This account cannot access hotel management services.'},{status:403});let generatedCrewAccountId='',generatedCrewLogin:any=null,generatedCrewCommitted=false;try{const b=await r.json(),{state,revision}=await loadViewState();let resultId='';let loginPlan:any=null;let revokeAccounts:string[]=[];let publicBookingUpdate:any=null;let confirmationEmailInput:any=null;let bookingConfirmation:any=null;let bookingDecisionEmailInput:any=null;let bookingDecisionKind='';let bookingDecision:any=null;state.bookingChanges??=[];const today=islandToday();
if(b.action==='request'){if(u.role!=='guest')throw Error('Use your guest account to request a stay.');if(typeof b.token!=='string'||!/^[-a-zA-Z0-9]{12,80}$/.test(b.token))throw Error('Invalid request.');const old=state.requests.find((x:any)=>x.token===b.token&&x.accountId===u.userId);if(old)return Response.json(await view(u));const nights=(Date.parse(b.checkOut)-Date.parse(b.checkIn))/86400000;if(!validDate(b.checkIn)||!validDate(b.checkOut)||b.checkIn<today||!Number.isInteger(nights)||nights<1||nights>365||!Number.isInteger(b.pax)||b.pax<1||b.pax>3||!plans.includes(b.meal)||typeof b.guest!=='string'||!b.guest.trim()||b.guest.length>100||typeof b.whatsapp!=='string'||!/^\+[1-9]\d{7,14}$/.test(b.whatsapp)||typeof b.notes!=='string'||b.notes.length>1000)throw Error('Check dates, guest name, number of guests and WhatsApp number with country code.');if(state.requests.filter((x:any)=>x.accountId===u.userId&&x.status==='Pending').length>=5)throw Error('You already have five pending requests. Please contact reception.');resultId='REQ-'+crypto.randomUUID();state.requests.push({id:resultId,token:b.token,accountId:u.userId,guest:b.guest.trim(),whatsapp:b.whatsapp,checkIn:b.checkIn,checkOut:b.checkOut,pax:b.pax,meal:b.meal,notes:b.notes,status:'Pending',createdAt:new Date().toISOString(),estimate:nights*nightly(b.meal,b.pax)});}
else if(b.action==='confirm'||b.action==='decline'){if(u.role!=='admin')return Response.json({error:'Only Admin can confirm or decline bookings.'},{status:403});if(b.revision!==revision)return Response.json({error:'Bookings changed. Refresh and try again.'},{status:409});const q=state.requests.find((x:any)=>x.id===b.id);if(!q||q.status!=='Pending')throw Error('This request has already been handled.');if(b.action==='decline'){q.status='Declined';q.reviewedBy=u.username;publicBookingUpdate=q.source==='Guest booking website'?{id:q.id,status:'Declined'}:null;}else{const room=state.rooms.find((x:any)=>x.number===b.room);if(!room||room.status==='Maintenance'||q.pax>room.capacity||state.stays.some((s:any)=>s.room===b.room&&!['Checked Out','Cancelled'].includes(s.status)&&s.checkIn<q.checkOut&&s.checkOut>q.checkIn))throw Error('That room is unavailable for these dates or guest count.');if(!Number.isInteger(b.rateCents)||b.rateCents<0||b.rateCents>1000000)throw Error('Enter a valid nightly rate.');const id=nextBookingReference(state),manageToken=q.manageToken||createBookingManageToken();q.manageToken=manageToken;state.stays.push({id,...(q.accountId?{accountId:q.accountId}:{}),manageToken,guest:q.guest,whatsapp:q.whatsapp,email:q.email||'',room:b.room,billRoom:id,checkIn:q.checkIn,checkOut:q.checkOut,meal:q.meal,pax:q.pax,adults:q.adults??q.pax,children:q.children??0,notes:q.notes||'',source:q.source||'Guest booking website',status:'Confirmed',rateCents:b.rateCents,base:(Date.parse(q.checkOut)-Date.parse(q.checkIn))/86400000*b.rateCents,initialPaid:0,extensions:[],payments:[],history:[{date:new Date().toISOString(),detail:'Booking confirmed · Room '+b.room+' assigned',by:u.username}]});q.status='Confirmed';q.stayId=id;q.room=b.room;q.reviewedBy=u.username;publicBookingUpdate=q.source==='Guest booking website'?{id:q.id,status:'Confirmed',stayId:id,room:b.room}:null;confirmationEmailInput=q.email?{email:q.email,guest:q.guest,reference:id,room:b.room,checkIn:q.checkIn,checkOut:q.checkOut,meal:q.meal,pax:q.pax,totalCents:(Date.parse(q.checkOut)-Date.parse(q.checkIn))/86400000*b.rateCents,manageToken}:null;}}
else if(['booking-change-approve','booking-change-reject','booking-cancel-approve','booking-cancel-reject'].includes(b.action)){
 const canReview=u.role==='admin'||(u.role==='staff'&&(u.permissions.length===0||u.permissions.includes('guesthouse_reception')));
 if(!canReview)return Response.json({error:'Reception access required.'},{status:403});
 if(b.revision!==revision)return Response.json({error:'Bookings changed. Refresh and try again.'},{status:409});
 const change=state.bookingChanges.find((item:any)=>item.id===b.id&&item.status==='Pending');
 if(!change)throw Error('This booking request has already been handled.');
 const s=state.stays.find((stay:any)=>stay.id===change.bookingId);
 if(!s||s.status!=='Confirmed')throw Error('The confirmed booking is no longer available for this request.');
 const reject=b.action.endsWith('-reject'),cancel=change.type==='cancel';
 const note=String(b.note||'').trim().slice(0,500);
 if(reject){
  change.status='Rejected';change.decidedAt=new Date().toISOString();change.decidedBy=u.username;change.decisionNote=note;
  bookingDecisionKind='rejected';
  bookingDecisionEmailInput={email:s.email,guest:s.guest,reference:s.id,room:s.room,checkIn:s.checkIn,checkOut:s.checkOut,meal:s.meal,pax:s.pax,totalCents:s.base||0,manageToken:s.manageToken,eventId:change.id,requestType:cancel?'cancel':'change',reason:note};
 }else if(cancel){
  const folio=await folioFor(s,state.orders),refundRequiredCents=Math.max(0,Number(folio.paidCents)||0);
  change.status='Approved';change.decidedAt=new Date().toISOString();change.decidedBy=u.username;change.decisionNote=note;change.refundRequiredCents=refundRequiredCents;
  s.refundRequiredCents=refundRequiredCents;s.cancelledAt=new Date().toISOString();s.cancelledBy=u.username;s.status='Cancelled';
  s.history.unshift({date:s.cancelledAt,detail:'Guest cancellation approved'+(refundRequiredCents?' · Refund required USD '+(refundRequiredCents/100).toFixed(2):''),by:u.username});
  bookingDecisionKind='cancelled';
  bookingDecisionEmailInput={email:s.email,guest:s.guest,reference:s.id,room:s.room,checkIn:s.checkIn,checkOut:s.checkOut,meal:s.meal,pax:s.pax,totalCents:s.base||0,manageToken:s.manageToken,eventId:change.id,refundRequiredCents};
  if(s.accountId)revokeAccounts.push(s.accountId);
  const sourceRequest=state.requests.find((request:any)=>request.stayId===s.id);
  deleteBooking(state,s,u.username);
  if(sourceRequest){sourceRequest.status='Cancelled';sourceRequest.cancelledAt=new Date().toISOString();sourceRequest.reviewedBy=u.username;if(sourceRequest.source==='Guest booking website')publicBookingUpdate={id:sourceRequest.id,status:'Cancelled',stayId:s.id,room:s.room};}
 }else{
  const p=change.proposed||{},room=String(b.room||s.room),rateCents=Number(b.rateCents);
  if(!Number.isInteger(rateCents)||rateCents<0||rateCents>1000000)throw Error('Enter a valid nightly rate.');
  editBooking(state,s,{guest:p.guest,room,checkIn:p.checkIn,checkOut:p.checkOut,pax:p.pax,meal:p.meal,source:s.source,rateCents},u.username);
  Object.assign(s,{email:p.email,whatsapp:p.whatsapp,adults:p.adults,children:p.children,notes:p.notes||'',rateCents});
  change.status='Approved';change.decidedAt=new Date().toISOString();change.decidedBy=u.username;change.decisionNote=note;change.approvedRoom=room;change.approvedRateCents=rateCents;
  s.history.unshift({date:change.decidedAt,detail:'Guest-requested booking changes approved · '+change.id,by:u.username});
  const sourceRequest=state.requests.find((request:any)=>request.stayId===s.id);if(sourceRequest)Object.assign(sourceRequest,{guest:s.guest,email:s.email,whatsapp:s.whatsapp,checkIn:s.checkIn,checkOut:s.checkOut,pax:s.pax,adults:s.adults,children:s.children,meal:s.meal,notes:s.notes,room:s.room});
  bookingDecisionKind='updated';
  bookingDecisionEmailInput={email:s.email,guest:s.guest,reference:s.id,room:s.room,checkIn:s.checkIn,checkOut:s.checkOut,meal:s.meal,pax:s.pax,totalCents:s.base||0,manageToken:s.manageToken,eventId:change.id,statusLabel:'Confirmed'};
  if(sourceRequest?.source==='Guest booking website')publicBookingUpdate={id:sourceRequest.id,status:'Confirmed',stayId:s.id,room:s.room};
 }
}
else if(b.action==='checkin'){if(!hasPermission(u,'edit_bills')&&!hasPermission(u,'guesthouse_reception'))return Response.json({error:'Reception or bill editing permission is required for check-in.'},{status:403});if(b.revision!==revision)return Response.json({error:'Bookings changed. Refresh and try again.'},{status:409});const s=state.stays.find((x:any)=>x.id===b.id);if(!s||!['Confirmed','Checked Out'].includes(s.status))throw Error('Only confirmed or checked-out bookings can check in.');const reentry=s.status==='Checked Out';if(today<s.checkIn||today>=s.checkOut)throw Error('Check-in is available during the booked stay dates.');const room=state.rooms.find((x:any)=>x.number===s.room);if(!room||!(room.status==='Available'||(reentry&&b.roomReady===true&&room.status==='Cleaning'))||state.stays.some((x:any)=>x.id!==s.id&&x.room===s.room&&(x.status==='In House'||(x.status==='Confirmed'&&x.checkIn<s.checkOut&&x.checkOut>today))))throw Error('The allocated room is not ready. Mark it Available after cleaning.');s.status='In House';loginPlan=await prepareStayLogin(state,s);delete s.checkedOutAt;s.checkedInAt=new Date().toISOString();room.status='Occupied';s.history.unshift({date:s.checkedInAt,detail:(reentry?'Guest checked back in · Room readiness confirmed':'Guest checked in')+' · Guest stay access created for Room '+s.room,by:u.username});}
else if(b.action==='buggy-request'){
 if(u.role!=='guest')throw Error('Use your guest account to request a buggy.');
 state.buggyBookings??=[];state.buggyFleet??=[];state.buggyTripHistory??=[];state.buggySettings??={guestRideFareCents:0};
 const s=state.stays.find((stay:any)=>stay.id===b.stayId&&stay.accountId===u.userId);
 if(!s||s.status!=='In House')return Response.json({error:'Buggy rides are available to checked-in guests only.'},{status:403});
 if(typeof b.token!=='string'||!/^[-a-zA-Z0-9]{12,80}$/.test(b.token))throw Error('Invalid ride request.');
 const duplicate=state.buggyBookings.find((ride:any)=>ride.token===b.token&&ride.accountId===u.userId);
 if(duplicate)return Response.json(await view(u));
 if(state.buggyBookings.some((ride:any)=>ride.accountId===u.userId&&activeBuggyRide(ride)))throw Error('You already have an active buggy ride. Complete or cancel it before requesting another.');
 const location=String(b.location||'').trim().slice(0,150),destination=String(b.destination||'').trim().slice(0,150),notes=String(b.notes||'').trim().slice(0,500),quantity=Math.max(1,Math.min(Number(s.pax)||1,Number(b.quantity)||1));
 if(!location||!destination||location.toLowerCase()===destination.toLowerCase())throw Error('Choose different pickup and drop-off points.');
 const now=new Date().toISOString(),fareCents=Math.max(0,Number(state.buggySettings.guestRideFareCents)||0);
 const ride:any={id:'BUG-'+crypto.randomUUID().slice(0,8).toUpperCase(),token:b.token,bookingType:'guest-ride',accountId:u.userId,stayId:s.id,guest:s.guest,phone:s.whatsapp||'',room:s.room,date:today,pickupTime:maldivesClock(),location,destination,quantity,notes,chargeToRoom:true,fareCents,buggyStatus:'Requested',createdAt:now,createdBy:'guest:'+u.userId};
 const buggy=(state.buggyFleet||[]).find((x:any)=>x.status==='Available'&&Math.max(1,Number(x.capacity)||4)>=quantity);
 if(buggy){ride.buggyId=buggy.id;ride.buggyDriver=buggy.driver||'';ride.buggyAssignedAt=now;ride.buggyAssignedBy='auto-dispatch';ride.buggyStatus='Driver on the way';buggy.status='Assigned';buggy.updatedAt=now;buggy.updatedBy='auto-dispatch';state.buggyTripHistory.push({id:'buggy-history-'+crypto.randomUUID(),at:now,type:'Auto assigned',buggyId:buggy.id,buggyName:buggy.name,bookingId:ride.id,guest:s.guest,driver:ride.buggyDriver||'',by:'guest request'});}
 state.buggyBookings.push(ride);syncBuggyRideBill(s,ride);s.history??=[];s.history.unshift({date:now,by:'Guest',detail:'Buggy requested · '+location+' → '+destination+(fareCents?' · USD '+(fareCents/100).toFixed(2)+' added to room bill':' · Complimentary / no configured fare')});
}
else if(b.action==='buggy-cancel'){
 if(u.role!=='guest')throw Error('Use your guest account.');
 state.buggyBookings??=[];state.buggyFleet??=[];
 const ride=state.buggyBookings.find((x:any)=>x.id===b.id&&x.accountId===u.userId&&x.bookingType==='guest-ride');
 if(!ride||ride.cancelled===true||['Completed','Cancelled'].includes(String(ride.buggyStatus||'')))throw Error('This ride can no longer be cancelled.');
 if(['On trip'].includes(String(ride.buggyStatus||'')))throw Error('The ride has already started. Contact reception if you need help.');
 ride.cancelled=true;ride.cancelledAt=new Date().toISOString();ride.cancelledBy='guest:'+u.userId;ride.buggyStatus='Cancelled';
 const s=state.stays.find((stay:any)=>stay.id===ride.stayId);if(s){syncBuggyRideBill(s,ride);s.history??=[];s.history.unshift({date:ride.cancelledAt,by:'Guest',detail:'Buggy ride cancelled · '+ride.id});}
 releaseBuggyIfIdle(state,ride);
}
else if(b.action==='order'){if(u.role!=='guest')throw Error('Use your guest account.');const s=state.stays.find((s:any)=>s.id===b.stayId&&s.accountId===u.userId);if(!s)return Response.json({error:'This booking is not linked to your account.'},{status:403});if(typeof b.token!=='string'||!/^[-a-zA-Z0-9]{12,80}$/.test(b.token))throw Error('Invalid request.');if(state.orders.some((o:any)=>o.token===b.token&&o.accountId===u.userId))return Response.json(await view(u));const item=[...await foodCatalog(),...catalog.filter(i=>i.kind!=='food'&&i.kind!=='excursion'),...await loadExcursionMenu()].find(x=>x.id===b.itemId);if(!item||!Number.isInteger(b.quantity)||b.quantity<MIN_EXCURSION_PAX||b.quantity>20||typeof b.notes!=='string'||b.notes.length>1000)throw Error('Check the quantity and notes.');if(!(s.status==='In House'||(item.kind==='transfer'&&s.status==='Confirmed')))return Response.json({error:'A confirmed stay is required for transfers. Food and excursions unlock after check-in.'},{status:403});if(item.kind==='transfer'&&(!validDate(b.date)||b.date<today||b.date<s.checkIn||b.date>s.checkOut||typeof b.time!=='string'||!/^([01]\d|2[0-3]):[0-5]\d$/.test(b.time)))throw Error('Choose a transfer date within your stay and a valid departure time.');const expectedTotal=item.kind==='food'&&mealItemIncluded(s.meal,item as any)?0:item.cents*b.quantity;if(b.expectedCents!==undefined&&b.expectedCents!==expectedTotal)throw Error('Price or meal plan changed. Refresh and review the total before ordering.');if(item.kind==='excursion'&&(!validDate(b.date)||b.date<today||b.date<s.checkIn||b.date>=s.checkOut))throw Error('Choose an excursion date within your stay, before checkout.');state.orders.push({id:(item.kind==='food'?'FOOD-':item.kind==='transfer'?'TRF-':'EXC-')+crypto.randomUUID().slice(0,8).toUpperCase(),token:b.token,accountId:u.userId,stayId:s.id,guest:s.guest,room:s.room,kind:item.kind,name:item.name+(item.kind==='food'&&mealItemIncluded(s.meal,item as any)?' (meal plan included)':''),quantity:b.quantity,cents:item.kind==='food'&&mealItemIncluded(s.meal,item as any)?0:item.cents*b.quantity,notes:b.notes,date:item.kind==='food'?today:b.date,time:item.kind==='transfer'?b.time:undefined,status:'Placed',kitchen:item.kind==='food'?'Awaiting cashier':undefined,createdAt:new Date().toISOString()});}
else if(['schedule-excursion','excursion-create','excursion-resource','excursion-status','excursion-payment','excursion-notified','excursion-vessel-condition','excursion-vessel-remove','excursion-crew-update','excursion-crew-remove','excursion-gopro-update','excursion-gopro-remove','excursion-drone-update','excursion-drone-remove'].includes(b.action)){
 if(u.role!=='admin'&&!hasPermission(u,'excursions_manager')&&!hasPermission(u,'edit_excursions'))return Response.json({error:'Excursions manager access required.'},{status:403});
 if(b.revision!==revision)return Response.json({error:'Bookings changed. Refresh and try again.'},{status:409});
 if(b.action==='excursion-resource'&&b.resourceType==='crew'){
  const crewName=String(b.name||'').trim();
  const username=String(b.username||'').trim().toLowerCase();
  const password=typeof b.password==='string'?b.password:'';
  const existing=excursionResources(state).crew.some((member:any)=>!member.removed&&String(member.name||'').trim().toLowerCase()===crewName.toLowerCase());
  if(existing)throw Error('That name is already in the crew list.');
  if(!/^[a-z0-9._-]{3,40}$/.test(username))throw Error('Username must be 3–40 characters using letters, numbers, dots, underscores or hyphens.');
  if(!validPassword(password))throw Error('Password must be 8–128 characters.');
  const db=authDb();
  const taken=await db.prepare('SELECT id FROM accounts WHERE username=? OR email=?').bind(username,username).first<any>();
  if(taken)throw Error('That username is already in use. Choose another username.');
  const accountId=crypto.randomUUID(),hashed=await hashPassword(password);
  const results=await db.batch([
   db.prepare("INSERT OR IGNORE INTO accounts(id,username,email,name,password_hash,salt,role,permissions,active) VALUES(?,?,?,?,?,?,'staff',?,1)").bind(accountId,username,null,crewName,hashed.hash,hashed.salt,JSON.stringify(['crew_location'])),
   await credentialStatement(accountId,hashed.hash,password,u.userId)
  ]);
  if(!results[0].meta.changes)throw Error('That username is already in use. Choose another username.');
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
 if(b.action==='excursion-drone-remove'){
  const drone=excursionResources(state).drones.find((item:any)=>item.id===b.droneId);
  if(!drone)throw Error('Drone not found.');
  const rows=(await authDb().prepare("SELECT payload FROM operation_records WHERE key LIKE 'excursion-schedule:%'").all<any>()).results||[];
  const scheduled=rows.map((row:any)=>{try{return JSON.parse(row.payload||'{}')}catch{return null}}).filter(Boolean);
  const activeSchedule=scheduled.find((schedule:any)=>schedule.status!=='Cancelled'&&String(schedule.date||'')>=today&&schedule.droneId===drone.id);
  if(activeSchedule)throw Error(drone.name+' is assigned to '+String(activeSchedule.name||'an excursion')+' on '+String(activeSchedule.date||'')+' at '+String(activeSchedule.time||'')+'. Assign another drone or cancel that trip before removing it.');
 }
 applyExcursionAction(state,b,today,u.username);
 await validateExcursionGuideAction(state,b);
}
else if(b.action==='orderstatus'){const o=state.orders.find((x:any)=>x.id===b.id);if(!o)throw Error('Order not found.');if(o.transportBooking)throw Error('Manage this ticket from the Transport manifest. Room payments are managed from the room bill.');if(o.kind==='excursion'?(!hasPermission(u,'edit_excursions')&&!hasPermission(u,'excursions_manager')):!hasPermission(u,o.kind==='food'?'edit_bills':'edit_transfers'))return Response.json({error:'Editing permission required.'},{status:403});if(b.revision!==revision)return Response.json({error:'Orders changed. Refresh and try again.'},{status:409});if(!['Confirmed','Completed','Cancelled'].includes(b.status)||o.status==='Completed'||o.status==='Cancelled')throw Error('This order cannot be changed.');const stay=state.stays.find((x:any)=>x.id===o.stayId);if(stay?.status==='Checked Out')throw Error('This stay is checked out.');if(o.kind==='food'&&o.kitchen==='Awaiting cashier'&&b.status!=='Cancelled')throw Error('Send this order to the kitchen from the cashier Bills screen first.');if(o.kind==='excursion'){if(u.role!=='admin'&&!hasPermission(u,'excursions_manager')&&!hasPermission(u,'edit_excursions'))return Response.json({error:'Excursion management access required.'},{status:403});changeExcursionStatus(o,b.status,state,u.username);}else{o.status=b.status;o.updatedBy=u.username;}}
else throw Error('Unknown action.');
revokeAccounts=[...new Set([...revokeAccounts,...syncWalkInExcursionAccess(state)])];
const saved=await saveStayAccess(state,revision,u.userId,loginPlan,revokeAccounts);
if(!saved){
 if(generatedCrewAccountId){
  const db=authDb();await db.batch([db.prepare('DELETE FROM operation_records WHERE key=?').bind('credential:'+generatedCrewAccountId),db.prepare('DELETE FROM accounts WHERE id=?').bind(generatedCrewAccountId)]);
  generatedCrewAccountId='';
 }
 return Response.json({error:'Another update was saved. Please refresh and try again.'},{status:409});
}
if(publicBookingUpdate)try{await updatePublicBookingRequestStatus(publicBookingUpdate.id,publicBookingUpdate.status,publicBookingUpdate);}catch{}
if(['booking-change-approve','booking-cancel-approve'].includes(b.action))try{await autoPushBookingComAvailability();}catch{}
if(confirmationEmailInput){try{bookingConfirmation=await sendBookingConfirmationEmail(confirmationEmailInput);}catch{bookingConfirmation={sent:false,error:'Booking confirmed, but the confirmation email could not be sent.'};}}
if(bookingDecisionEmailInput){try{bookingDecision=bookingDecisionKind==='updated'?await sendBookingUpdatedEmail(bookingDecisionEmailInput):bookingDecisionKind==='cancelled'?await sendBookingCancelledEmail(bookingDecisionEmailInput):await sendBookingRequestRejectedEmail(bookingDecisionEmailInput);}catch{bookingDecision={sent:false,error:'Booking decision saved, but the guest email could not be sent.'};}}
generatedCrewCommitted=true;
if(generatedCrewLogin){
 try{await appendAccountHistory(generatedCrewLogin.accountId,{at:new Date().toISOString(),action:'Crew account created',by:u.username,detail:'Crew Member login created from Excursions → Crew members using credentials chosen by Admin.'});}catch{}
 try{
  const account=await authDb().prepare('SELECT * FROM accounts WHERE id=?').bind(generatedCrewLogin.accountId).first<any>();
  if(account)await ensureSupabaseEmployee(account,generatedCrewLogin.password);
  await mirrorCredentialRecord(generatedCrewLogin.accountId);
 }catch{
  try{const account=await authDb().prepare('SELECT * FROM accounts WHERE id=?').bind(generatedCrewLogin.accountId).first<any>();if(account)await mirrorLegacyAccount(account);}catch{}
 }
}
if(b.action==='excursion-crew-update'){
 const member=excursionResources(state).crew.find((crew:any)=>crew.id===b.crewId);
 if(member?.accountId){
  try{
   const active=member.active!==false&&member.active!==0,db=authDb();
   await db.prepare("UPDATE accounts SET name=?,active=? WHERE id=? AND role='staff'").bind(member.name,active?1:0,member.accountId).run();
   if(!active){await db.prepare('DELETE FROM account_sessions WHERE account_id=?').bind(member.accountId).run();try{await deleteLegacySessionsForAccount(member.accountId);}catch{}}
   try{const account=await db.prepare('SELECT * FROM accounts WHERE id=?').bind(member.accountId).first<any>();if(account)await mirrorLegacyAccount(account);}catch{}
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
    try{await deactivateSupabaseAccount(member.accountId);}catch{}
   }else if(account){
    await db.prepare("UPDATE accounts SET permissions=? WHERE id=? AND role='staff'").bind(JSON.stringify(remaining),member.accountId).run();
    try{const updated=await db.prepare('SELECT * FROM accounts WHERE id=?').bind(member.accountId).first<any>();if(updated)await mirrorLegacyAccount(updated);}catch{}
   }
  }catch{}
 }
}
const response=await view(u);
const responseWithConfirmation=bookingConfirmation?{...response,bookingConfirmation}:response;
const responseWithDecision=bookingDecision?{...responseWithConfirmation,bookingDecision}:responseWithConfirmation;
return Response.json(generatedCrewLogin?{...responseWithDecision,generatedCrewLogin}:responseWithDecision);
}catch(e){
 if(generatedCrewAccountId&&!generatedCrewCommitted){
  try{const db=authDb();await db.batch([db.prepare('DELETE FROM operation_records WHERE key=?').bind('credential:'+generatedCrewAccountId),db.prepare('DELETE FROM accounts WHERE id=?').bind(generatedCrewAccountId)]);}catch{}
 }
 return Response.json({error:e instanceof Error?e.message:'Could not save. Please retry.'},{status:400});
}}
