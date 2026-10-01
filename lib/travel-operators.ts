import {readRecords,saveRecord} from './operation-records';
import {cleanUsername,partnerAuth,type PartnerCredentials} from './partner-auth';

// Nirili Travels is a marketplace: Nirili does not own speedboats or buggies. Independent
// speedboat companies and buggy owners run the trips; guests, partner guest houses and Nirili
// reception book them here. Each operator has its own login at operators.nirilihotels.com.
// Guests pay the operator directly and Nirili earns a commission; transfers that in-house
// guests charge to their room are collected by Nirili and paid on to the operator.
export const OPERATOR_PREFIX='travel-operator:';
export const OPERATOR_COOKIE='nirili_operator_session';
export type OperatorService='boat'|'buggy';
export const SERVICES:OperatorService[]=['boat','buggy'];
export const MAX_COMMISSION_PERCENT=50;

export type Operator=PartnerCredentials&{
 name:string;contactName:string;phone:string;email:string;
 services:OperatorService[];
 commissionPercent:number;
 // Buggy owners are offered ride requests only while online.
 buggyOnline?:boolean;buggyOnlineAt?:string;
 createdAt:string;updatedAt:string;createdBy:string;
};
export type PublicOperator=Omit<Operator,'passwordHash'|'salt'|'passwordVersion'>;

const text=(value:any,max:number)=>String(value??'').trim().replace(/\s+/g,' ').slice(0,max);
const cleanPhone=(value:any)=>String(value||'').replace(/[\s()-]/g,'');
const PHONE=/^\+[1-9]\d{7,14}$/,EMAIL=/^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const auth=partnerAuth<Operator>({accountPrefix:OPERATOR_PREFIX,usernamePrefix:'travel-operator-username:',sessionPrefix:'travel-operator-session:',cookie:OPERATOR_COOKIE});
export const operatorFromRequest=auth.fromRequest;
export const signOutOperator=auth.signOut;
export const clearedOperatorCookie=auth.clearedCookie;
export async function signInOperator(username:string,password:string){
 const result=await auth.signIn(username,password);
 return result?{operator:result.account,cookie:result.cookie}:null;
}

export function publicOperator(operator:Operator):PublicOperator{
 const {passwordHash,salt,passwordVersion,...rest}=operator;
 return rest;
}
export const offers=(operator:Pick<Operator,'services'>|null|undefined,service:OperatorService)=>!!operator?.services?.includes(service);

export function cleanOperatorDetails(input:any){
 const name=text(input?.name,100),contactName=text(input?.contactName,100),phone=cleanPhone(input?.phone),email=text(input?.email,254).toLowerCase();
 const services=SERVICES.filter(s=>Array.isArray(input?.services)&&input.services.includes(s));
 const commissionPercent=Math.round(Number(input?.commissionPercent??0)*10)/10;
 if(!name)throw Error('Enter the company or owner name.');
 if(!PHONE.test(phone))throw Error('Enter the operator WhatsApp number with country code, e.g. +960 7XX XXXX.');
 if(email&&!EMAIL.test(email))throw Error('Enter a valid email address.');
 if(!services.length)throw Error('Choose at least one service: speedboat transfers or buggy rides.');
 if(!Number.isFinite(commissionPercent)||commissionPercent<0||commissionPercent>MAX_COMMISSION_PERCENT)throw Error('Commission must be between 0% and '+MAX_COMMISSION_PERCENT+'%.');
 return {name,contactName,phone,email,services,commissionPercent,active:input?.active!==false};
}

export async function loadOperators():Promise<{operator:Operator;revision:number}[]>{
 return (await readRecords<Operator>(OPERATOR_PREFIX)).map(row=>({operator:row.value,revision:row.revision}))
  .sort((a,b)=>a.operator.name.localeCompare(b.operator.name));
}
export async function loadOperator(id:string){
 const found=await auth.load(id);
 return found?{operator:found.account,revision:found.revision}:null;
}

export async function createOperator(input:any,by:string):Promise<Operator>{
 const details=cleanOperatorDetails(input);
 const username=cleanUsername(input?.username);
 const id='OP-'+crypto.randomUUID().replace(/-/g,'').slice(0,8).toUpperCase(),now=new Date().toISOString();
 const secret=await auth.credentials(input?.password);
 if(!await auth.reserveUsername(username,id,by))throw Error('That username is already in use.');
 const operator:Operator={id,...details,username,...secret,passwordVersion:1,createdAt:now,updatedAt:now,createdBy:by};
 if(!await saveRecord(OPERATOR_PREFIX+id,operator,0,by))throw Error('Could not save the operator. Please try again.');
 return operator;
}

// Admin edits. A new password signs the operator out on every device.
export async function updateOperator(id:string,revision:number,input:any,by:string):Promise<{operator:Operator;revision:number}|'conflict'|null>{
 const current=await loadOperator(id);
 if(!current)return null;
 if(current.revision!==revision)return 'conflict';
 const operator:Operator={...current.operator,...cleanOperatorDetails({...current.operator,...input}),updatedAt:new Date().toISOString()};
 if(input?.password!==undefined&&input.password!==''){
  Object.assign(operator,await auth.credentials(input.password));operator.passwordVersion=(Number(operator.passwordVersion)||1)+1;
 }
 if(!operator.active)operator.buggyOnline=false;
 const next=await saveRecord(OPERATOR_PREFIX+id,operator,revision,by);
 return next?{operator,revision:next}:'conflict';
}

// The operator's own switch: offered buggy ride requests or not.
export async function setBuggyOnline(id:string,online:boolean){
 for(let attempt=0;attempt<3;attempt++){
  const current=await loadOperator(id);
  if(!current||!current.operator.active)throw Error('Operator account not found.');
  if(online&&!offers(current.operator,'buggy'))throw Error('Buggy rides are not enabled for this operator.');
  const operator={...current.operator,buggyOnline:online,buggyOnlineAt:new Date().toISOString()};
  if(await saveRecord(OPERATOR_PREFIX+id,operator,current.revision,'operator:'+id))return operator;
 }
 throw Error('Could not update your status. Please try again.');
}
