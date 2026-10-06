import {authDb} from './auth';
import {readRecord,readRecords,saveRecord} from './operation-records';
import {deleteOperationalRecordPrimary} from './supabase-bridge';
import {cleanUsername,partnerAuth,type PartnerCredentials} from './partner-auth';

// One account for every outside business Nirili works with, at partners.nirilihotels.com.
// Admin ticks what each partner may do; every portal API checks the permission it needs on the
// server. Partners who sell Nirili's services (guest houses, travel agencies) and partners who
// run trips (speedboat companies, buggy owners) can be the same business with one login.
export const PARTNER_PREFIX='partner:';
export const PARTNER_USERNAME_PREFIX='partner-username:';
export const PARTNER_SESSION_PREFIX='partner-session:';
export const PARTNER_COOKIE='nirili_partner_session';

export const PERMISSIONS=['excursions','transfers','rides','rooms','boats','buggies'] as const;
export type Permission=typeof PERMISSIONS[number];
export const PERMISSION_LABELS:Record<Permission,string>={
 excursions:'Book excursions for guests',transfers:'Book speedboat seats for guests',rides:'Book buggy rides for guests',
 rooms:'Book rooms and packages',boats:'Run speedboat trips',buggies:'Run buggy rides',
};
export const MAX_PERCENT=50;

export type Partner=PartnerCredentials&{
 name:string;contactName:string;phone:string;email:string;
 // Where Nirili picks up the partner's guests (guest houses).
 pickup:string;
 permissions:Permission[];
 // Selling Nirili's services: the partner pays Nirili the public price less these discounts.
 excursionDiscountPercent:number;roomDiscountPercent:number;transferDiscountPercent:number;
 // Excursion bookings on a trip with free seats confirm at once; otherwise staff approve each.
 autoConfirm:boolean;
 // Running trips: Nirili's commission on what guests pay the partner.
 commissionPercent:number;
 // Buggy owners are offered ride requests only while online.
 buggyOnline?:boolean;buggyOnlineAt?:string;
 createdAt:string;updatedAt:string;createdBy:string;
};
export type PublicPartner=Omit<Partner,'passwordHash'|'salt'|'passwordVersion'>;

const text=(value:any,max:number)=>String(value??'').trim().replace(/\s+/g,' ').slice(0,max);
const cleanPhone=(value:any)=>String(value||'').replace(/[\s()-]/g,'');
const PHONE=/^\+[1-9]\d{7,14}$/,EMAIL=/^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const percent=(value:any,label:string,max=MAX_PERCENT)=>{
 const n=Math.round(Number(value??0)*10)/10;
 if(!Number.isFinite(n)||n<0||n>max)throw Error(label+' must be between 0% and '+max+'%.');
 return n;
};

export const can=(partner:Pick<Partner,'permissions'|'active'>|null|undefined,permission:Permission)=>!!partner?.active&&!!partner.permissions?.includes(permission);
export function publicPartner(partner:Partner):PublicPartner{const {passwordHash,salt,passwordVersion,...rest}=partner;return rest;}

export function cleanPartnerDetails(input:any){
 const name=text(input?.name,120),contactName=text(input?.contactName,120),phone=cleanPhone(input?.phone),email=text(input?.email,254).toLowerCase();
 const permissions=PERMISSIONS.filter(p=>Array.isArray(input?.permissions)&&input.permissions.includes(p));
 if(!name)throw Error('Enter the business name.');
 if(phone&&!PHONE.test(phone))throw Error('Enter the WhatsApp number with country code, e.g. +960 7XX XXXX.');
 if(email&&!EMAIL.test(email))throw Error('Enter a valid email address.');
 if(!permissions.length)throw Error('Tick at least one thing this partner can do.');
 // Operators must be reachable: guests and Nirili contact them about every trip.
 if((permissions.includes('boats')||permissions.includes('buggies'))&&!PHONE.test(phone))throw Error('Enter the WhatsApp number for a partner who runs trips.');
 return {name,contactName,phone,email,pickup:text(input?.pickup,150)||name,permissions,
  excursionDiscountPercent:percent(input?.excursionDiscountPercent,'Excursion discount'),
  roomDiscountPercent:percent(input?.roomDiscountPercent,'Room discount',100),
  transferDiscountPercent:percent(input?.transferDiscountPercent,'Airport transfer discount',100),
  autoConfirm:input?.autoConfirm!==false,
  commissionPercent:percent(input?.commissionPercent,'Nirili commission'),
  active:input?.active!==false};
}

const auth=partnerAuth<Partner>({accountPrefix:PARTNER_PREFIX,usernamePrefix:PARTNER_USERNAME_PREFIX,sessionPrefix:PARTNER_SESSION_PREFIX,cookie:PARTNER_COOKIE,sessionDays:30});
export const partnerFromRequest=auth.fromRequest;
export const signOutPartner=auth.signOut;
export const clearedPartnerCookie=auth.clearedCookie;
export async function signInPartner(username:string,password:string){
 const result=await auth.signIn(username,password);
 return result?{partner:result.account,cookie:result.cookie}:null;
}
// The signed-in partner, only if they hold this permission.
export async function partnerWith(request:Request,permission:Permission|Permission[]){
 const partner=await partnerFromRequest(request),list=Array.isArray(permission)?permission:[permission];
 return partner&&list.some(p=>can(partner,p))?partner:null;
}

export async function loadPartners(){
 return (await readRecords<Partner>(PARTNER_PREFIX)).map(row=>({partner:row.value,revision:row.revision})).sort((a,b)=>a.partner.name.localeCompare(b.partner.name));
}
export async function loadPartner(id:string){
 const row=await readRecord<Partner>(PARTNER_PREFIX+id);
 return row?{partner:row.value,revision:row.revision}:null;
}
// Ids of active partners holding a permission, e.g. whose departures guests may book.
export async function activePartnerIds(permission:Permission){
 return new Set((await loadPartners()).filter(r=>can(r.partner,permission)).map(r=>r.partner.id));
}

export async function createPartner(input:any,by:string):Promise<Partner>{
 const details=cleanPartnerDetails(input),username=cleanUsername(input?.username);
 const id='PT-'+crypto.randomUUID().replace(/-/g,'').slice(0,8).toUpperCase(),now=new Date().toISOString();
 const secret=await auth.credentials(input?.password);
 if(!await auth.reserveUsername(username,id,by))throw Error('That username is already in use.');
 const partner:Partner={id,...details,username,...secret,passwordVersion:1,createdAt:now,updatedAt:now,createdBy:by};
 if(!await saveRecord(PARTNER_PREFIX+id,partner,0,by))throw Error('Could not save the partner. Please try again.');
 return partner;
}
// Admin edits. A new password signs the partner out on every device; pausing blocks every request.
export async function updatePartner(id:string,revision:number,input:any,by:string):Promise<{partner:Partner;revision:number}|'conflict'|null>{
 const current=await loadPartner(id);
 if(!current)return null;
 if(current.revision!==revision)return 'conflict';
 const partner:Partner={...current.partner,...cleanPartnerDetails({...current.partner,...input}),updatedAt:new Date().toISOString()};
 if(input?.password!==undefined&&input.password!==''){Object.assign(partner,await auth.credentials(input.password));partner.passwordVersion=(Number(partner.passwordVersion)||1)+1;}
 if(!partner.active||!partner.permissions.includes('buggies'))partner.buggyOnline=false;
 const next=await saveRecord(PARTNER_PREFIX+id,partner,revision,by);
 return next?{partner,revision:next}:'conflict';
}
// The partner's own buggy online switch.
export async function setPartnerOnline(id:string,online:boolean){
 for(let attempt=0;attempt<3;attempt++){
  const current=await loadPartner(id);
  if(!current||!current.partner.active)throw Error('Partner account not found.');
  if(online&&!can(current.partner,'buggies'))throw Error('Buggy rides are not enabled for this partner.');
  const partner={...current.partner,buggyOnline:online,buggyOnlineAt:new Date().toISOString()};
  if(await saveRecord(PARTNER_PREFIX+id,partner,current.revision,'partner:'+id))return partner;
 }
 throw Error('Could not update your status. Please try again.');
}

async function deleteKey(key:string){
 try{await deleteOperationalRecordPrimary(key);}catch{}
 try{await authDb().prepare('DELETE FROM operation_records WHERE key=?').bind(key).run();}catch{}
}
// Delete a login, its username and its sessions. Bookings it made stay in the system.
export async function deletePartner(id:string){
 const current=await loadPartner(id);
 if(!current)return null;
 const sessions=(await readRecords<any>(PARTNER_SESSION_PREFIX)).filter(r=>r.value?.accountId===id).map(r=>r.key);
 await Promise.all([deleteKey(PARTNER_PREFIX+id),deleteKey(PARTNER_USERNAME_PREFIX+current.partner.username),...sessions.map(deleteKey)]);
 return {id,name:current.partner.name,sessionsRemoved:sessions.length};
}
// The separate logins used before partners were combined (all test accounts): agents, travel
// operators, tour operators and their crew, with their usernames and sessions.
export const LEGACY_PREFIXES=['excursion-agent:','excursion-agent-username:','excursion-agent-session:','travel-operator:','travel-operator-username:','travel-operator-session:',
 'tour-operator:','tour-operator-username:','tour-operator-session:'];
export async function purgeLegacyAccounts(){
 let removed=0;
 for(const prefix of LEGACY_PREFIXES){
  const rows=await readRecords<any>(prefix);
  // readRecords matches by prefix, so 'travel-operator:' must not catch 'travel-operator-…'.
  for(const row of rows)if(row.key.startsWith(prefix)){await deleteKey(row.key);removed++;}
 }
 // Crew logins of those old operators (new crew belong to PT- partners).
 for(const row of await readRecords<any>('travel-crew:'))if(row.key.startsWith('travel-crew:')&&!String(row.value?.operatorId||'').startsWith('PT-')){await deleteKey(row.key);removed++;}
 return removed;
}
