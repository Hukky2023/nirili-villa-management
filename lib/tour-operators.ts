import {readRecord,readRecords,saveRecord} from './operation-records';
import {cleanUsername,partnerAuth} from './partner-auth';

export const TOUR_OPERATOR_PREFIX='tour-operator:';
export const TOUR_OPERATOR_USERNAME_PREFIX='tour-operator-username:';
export const TOUR_OPERATOR_SESSION_PREFIX='tour-operator-session:';
export const TOUR_OPERATOR_COOKIE='nirili_tour_operator_session';

export type TourOperator={
 id:string;name:string;contactName:string;phone:string;email:string;
 username:string;passwordHash:string;salt:string;passwordVersion:number;
 roomDiscountPercent:number;excursionDiscountPercent:number;transferDiscountPercent:number;
 active:boolean;createdAt:string;updatedAt:string;createdBy:string;
};
export type PublicTourOperator=Omit<TourOperator,'passwordHash'|'salt'|'passwordVersion'>;

const text=(v:any,max:number)=>String(v??'').trim().replace(/\s+/g,' ').slice(0,max);
const cleanPhone=(v:any)=>String(v||'').replace(/[\s()-]/g,'');
const PHONE=/^\+[1-9]\d{7,14}$/,EMAIL=/^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const discount=(v:any,label:string)=>{
 const n=Math.round(Number(v??0)*10)/10;
 if(!Number.isFinite(n)||n<0||n>100)throw Error(label+' discount must be between 0% and 100%.');
 return n;
};

export function publicTourOperator(o:TourOperator):PublicTourOperator{
 const {passwordHash,salt,passwordVersion,...rest}=o;return rest;
}
export function discountedCents(cents:number,percent:number){
 return Math.max(0,Math.round(Math.max(0,Number(cents)||0)*(100-Math.max(0,Math.min(100,Number(percent)||0)))/100));
}
export function cleanTourOperator(input:any){
 const name=text(input?.name,120),contactName=text(input?.contactName,120),phone=cleanPhone(input?.phone),email=text(input?.email,254).toLowerCase();
 if(!name)throw Error('Enter the tour operator name.');
 if(phone&&!PHONE.test(phone))throw Error('Enter the WhatsApp number with country code.');
 if(email&&!EMAIL.test(email))throw Error('Enter a valid email address.');
 return {name,contactName,phone,email,
  roomDiscountPercent:discount(input?.roomDiscountPercent,'Room'),
  excursionDiscountPercent:discount(input?.excursionDiscountPercent,'Excursion'),
  transferDiscountPercent:discount(input?.transferDiscountPercent,'Airport transfer'),
  active:input?.active!==false};
}

const auth=partnerAuth<TourOperator>({accountPrefix:TOUR_OPERATOR_PREFIX,usernamePrefix:TOUR_OPERATOR_USERNAME_PREFIX,sessionPrefix:TOUR_OPERATOR_SESSION_PREFIX,cookie:TOUR_OPERATOR_COOKIE,sessionDays:90});
export const clearedTourOperatorCookie=auth.clearedCookie;
export const tourOperatorFromRequest=auth.fromRequest;
export const tourOperatorSignOut=auth.signOut;

export async function tourOperatorSignIn(username:string,password:string){
 const result=await auth.signIn(username,password);
 return result?{operator:result.account,cookie:result.cookie}:null;
}
export async function loadTourOperators(){
 return (await readRecords<TourOperator>(TOUR_OPERATOR_PREFIX)).map(r=>({operator:r.value,revision:r.revision})).sort((a,b)=>a.operator.name.localeCompare(b.operator.name));
}
export async function loadTourOperator(id:string){
 const r=await readRecord<TourOperator>(TOUR_OPERATOR_PREFIX+id);return r?{operator:r.value,revision:r.revision}:null;
}
export async function createTourOperator(input:any,by:string){
 const details=cleanTourOperator(input),username=cleanUsername(input?.username);
 const id='TO-'+crypto.randomUUID().replace(/-/g,'').slice(0,8).toUpperCase(),now=new Date().toISOString();
 const secret=await auth.credentials(input?.password);
 if(!await auth.reserveUsername(username,id,by))throw Error('That username is already in use.');
 const operator:TourOperator={id,...details,username,...secret,passwordVersion:1,createdAt:now,updatedAt:now,createdBy:by};
 if(!await saveRecord(TOUR_OPERATOR_PREFIX+id,operator,0,by))throw Error('Could not create the tour operator.');
 return operator;
}
export async function updateTourOperator(id:string,revision:number,input:any,by:string){
 const current=await loadTourOperator(id);if(!current)return null;if(current.revision!==revision)return 'conflict' as const;
 const operator:TourOperator={...current.operator,...cleanTourOperator({...current.operator,...input}),updatedAt:new Date().toISOString()};
 if(input?.password){Object.assign(operator,await auth.credentials(input.password));operator.passwordVersion=(operator.passwordVersion||1)+1;}
 const next=await saveRecord(TOUR_OPERATOR_PREFIX+id,operator,revision,by);
 return next?{operator,revision:next}:'conflict' as const;
}
