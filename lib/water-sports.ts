import {readRecord,readRecords,saveRecord} from './operation-records';

// Nirili Water Sports. Nirili does not run water sports itself yet: every booking is forwarded to
// a partner operator, and staff track it here until the partner confirms and the session is done.
export const SETTINGS_KEY='water-sports:settings';
export const BOOKING_PREFIX='water-sports:booking:';
export const STATUSES=['New','Forwarded','Confirmed','Completed','Cancelled'] as const;
export type Status=typeof STATUSES[number];

export type Activity={id:string;name:string;detail:string;durationMinutes:number;cents:number;pricingUnit:'person'|'ride';maxPeople:number;active:boolean};
export type Settings={operatedBy:'partner'|'nirili';partner:{name:string;whatsapp:string;email:string};activities:Activity[]};
export type HistoryEntry={at:string;by:string;action:string;detail?:string};
export type Booking={
 id:string;token:string;source:'Website'|'Staff';createdAt:string;
 activityId:string;activityName:string;date:string;time:string;participants:number;
 name:string;phone:string;email:string;hotel:string;room:string;notes:string;
 quotedCents:number;status:Status;partnerName:string;partnerReference:string;
 forwardedAt?:string;forwardedBy?:string;cancelReason?:string;history:HistoryEntry[];
};

// Starting list. Prices are 0 ("confirmed when we book you in") until Admin enters the partner's rates.
export function defaultSettings():Settings{
 const a=(id:string,name:string,detail:string,durationMinutes:number,pricingUnit:'person'|'ride',maxPeople:number):Activity=>({id,name,detail,durationMinutes,cents:0,pricingUnit,maxPeople,active:true});
 return {operatedBy:'partner',partner:{name:'',whatsapp:'',email:''},activities:[
  a('jet-ski','Jet Ski','Ride the lagoon around Dhiffushi on a jet ski.',30,'ride',2),
  a('parasailing','Parasailing','Float high above the lagoon for views of the whole atoll.',15,'person',2),
  a('banana-boat','Banana Boat','A fun group ride towed across the lagoon. Hold on tight!',15,'person',6),
  a('tube-ride','Tube Ride','An inflatable tube towed behind a speedboat for a bumpy, splashy ride.',15,'person',3),
  a('kayak','Kayak','Paddle along the island shoreline at your own pace.',60,'ride',2),
  a('paddleboard','Stand-up Paddleboard','Glide over calm, clear water on a stand-up paddleboard.',60,'ride',1),
 ]};
}

export const text=(value:any,max:number)=>String(value??'').trim().replace(/\s+/g,' ').slice(0,max);
export const cleanPhone=(value:any)=>String(value||'').replace(/[\s()-]/g,'');
export const PHONE=/^\+[1-9]\d{7,14}$/;
const EMAIL=/^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const DATE=/^\d{4}-\d{2}-\d{2}$/;
const TIME=/^([01]\d|2[0-3]):[0-5]\d$/;

export function cleanSettings(input:any):Settings{
 const base=defaultSettings();
 const activities=(Array.isArray(input?.activities)?input.activities:base.activities).slice(0,40).map((x:any)=>{
  const id=text(x.id,60).toLowerCase().replace(/[^a-z0-9-]/g,'-')||'activity-'+crypto.randomUUID().slice(0,8);
  const cents=Math.round(Number(x.cents)||0);
  if(!Number.isInteger(cents)||cents<0||cents>1000000)throw Error('Enter a price between $0 and $10,000.');
  return {id,name:text(x.name,80)||'Activity',detail:text(x.detail,400),durationMinutes:Math.max(0,Math.min(600,Math.round(Number(x.durationMinutes)||0))),cents,pricingUnit:x.pricingUnit==='ride'?'ride':'person',maxPeople:Math.max(1,Math.min(20,Math.round(Number(x.maxPeople)||1))),active:x.active!==false} as Activity;
 });
 if(new Set(activities.map((x:Activity)=>x.id)).size!==activities.length)throw Error('Each activity needs a different name.');
 const whatsapp=cleanPhone(input?.partner?.whatsapp);
 if(whatsapp&&!PHONE.test(whatsapp))throw Error('Enter the partner WhatsApp number with country code, e.g. +960 7XX XXXX.');
 const email=text(input?.partner?.email,254);
 if(email&&!EMAIL.test(email))throw Error('Enter a valid partner email address.');
 return {operatedBy:input?.operatedBy==='nirili'?'nirili':'partner',partner:{name:text(input?.partner?.name,100),whatsapp,email},activities};
}

// Validates a guest's request against the current catalogue. Throws a guest-readable message.
export function buildBooking(input:any,settings:Settings,today:string,source:'Website'|'Staff'='Website'):Booking{
 const activity=settings.activities.find(x=>x.active&&x.id===text(input.activityId,60));
 if(!activity)throw Error('Choose an activity.');
 const date=text(input.date,10),time=text(input.time,5),participants=Number(input.participants);
 if(!DATE.test(date)||date<today)throw Error('Choose today or a future date.');
 if(time&&!TIME.test(time))throw Error('Choose a valid time.');
 if(!Number.isInteger(participants)||participants<1||participants>20)throw Error('Choose how many people are taking part.');
 const name=text(input.name,100),phone=cleanPhone(input.phone),email=text(input.email,254).toLowerCase();
 if(!name||!PHONE.test(phone))throw Error('Enter your name and WhatsApp number with country code, e.g. +960 7XX XXXX.');
 if(email&&!EMAIL.test(email))throw Error('Enter a valid email address or leave it empty.');
 const token=text(input.token,80);
 if(!/^[a-f0-9-]{20,80}$/i.test(token))throw Error('Refresh the page and try again.');
 const units=activity.pricingUnit==='ride'?Math.ceil(participants/Math.max(1,activity.maxPeople)):participants;
 const now=new Date().toISOString();
 return {id:'WS-'+crypto.randomUUID().replace(/-/g,'').slice(0,6).toUpperCase(),token,source,createdAt:now,activityId:activity.id,activityName:activity.name,date,time,participants,name,phone,email,hotel:text(input.hotel,150),room:text(input.room,40),notes:text(input.notes,1000),quotedCents:activity.cents*units,status:'New',partnerName:'',partnerReference:'',history:[{at:now,by:source==='Website'?'Guest':'Staff',action:'Booked',detail:activity.name+' · '+date+(time?' '+time:'')+' · '+participants+' pax'}]};
}

// Message staff send to the partner operator on WhatsApp.
export function partnerMessage(b:Booking,partnerName=''){
 return ['Hello'+(partnerName?' '+partnerName:'')+', new water sports booking from Nirili Villa:','',
  'Ref: '+b.id,'Activity: '+b.activityName,'Date: '+b.date+(b.time?' at '+b.time:' (time flexible)'),'People: '+b.participants,
  'Guest: '+b.name,'Guest WhatsApp: '+b.phone,'Staying at: '+(b.hotel||'Not given')+(b.room?' · Room '+b.room:''),
  ...(b.notes?['Notes: '+b.notes]:[]),'','Please confirm availability and your booking reference. Thank you!'].join('\n');
}
export function whatsappLink(phone:string,message:string){
 return 'https://wa.me/'+cleanPhone(phone).replace(/^\+/,'')+'?text='+encodeURIComponent(message);
}

// Staff actions on a booking. Returns the updated booking; throws a staff-readable message.
export function applyAction(b:Booking,action:any,by:string,settings:Settings):Booking{
 const next:Booking={...b,history:[...(b.history||[])]};
 const at=new Date().toISOString(),kind=text(action?.action,30);
 const log=(what:string,detail='')=>next.history.push({at,by,action:what,...(detail?{detail}:{})});
 if(['Completed','Cancelled'].includes(b.status)&&kind!=='note')throw Error('This booking is already '+b.status.toLowerCase()+'.');
 if(kind==='forward'){
  next.status=b.status==='Confirmed'?'Confirmed':'Forwarded';next.forwardedAt=at;next.forwardedBy=by;next.partnerName=text(action.partnerName,100)||settings.partner.name;
  log('Forwarded to partner',next.partnerName);
 }else if(kind==='confirm'){
  next.status='Confirmed';next.partnerReference=text(action.partnerReference,80);
  if(action.time!==undefined){const t=text(action.time,5);if(t&&!TIME.test(t))throw Error('Enter the confirmed time as HH:mm.');next.time=t||next.time;}
  log('Confirmed by partner',[next.partnerReference&&'Ref '+next.partnerReference,next.time&&'at '+next.time].filter(Boolean).join(' · '));
 }else if(kind==='complete'){
  if(b.status!=='Confirmed')throw Error('Confirm the booking before marking it completed.');
  next.status='Completed';log('Completed');
 }else if(kind==='cancel'){
  next.status='Cancelled';next.cancelReason=text(action.reason,300);log('Cancelled',next.cancelReason);
 }else if(kind==='note'){
  const note=text(action.note,500);if(!note)throw Error('Write a note first.');log('Note',note);
 }else throw Error('Unknown action.');
 return next;
}

// Staff access: Admin, reception and the excursions team (who already handle partner-run trips).
export function canManageWaterSports(user:any){
 if(!user)return false;
 if(user.role==='admin')return true;
 if(user.role!=='staff')return false;
 const p:string[]=Array.isArray(user.permissions)?user.permissions:[];
 return p.length===0||p.some(x=>['guesthouse_reception','edit_excursions','excursions_manager'].includes(x));
}

export {readRecord,readRecords,saveRecord};

export async function loadSettings():Promise<{settings:Settings;revision:number}>{
 const row=await readRecord<Settings>(SETTINGS_KEY);
 return row?{settings:cleanSettings(row.value),revision:row.revision}:{settings:defaultSettings(),revision:0};
}
export async function loadBookings():Promise<{booking:Booking;revision:number}[]>{
 return (await readRecords<Booking>(BOOKING_PREFIX)).map(r=>({booking:r.value,revision:r.revision}))
  .sort((a,b)=>(a.booking.date+a.booking.time).localeCompare(b.booking.date+b.booking.time)||a.booking.createdAt.localeCompare(b.booking.createdAt));
}
