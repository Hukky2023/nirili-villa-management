import {readRecords,saveRecord} from './operation-records';
import {cleanUsername,partnerAuth,type PartnerCredentials} from './partner-auth';
import {loadOperator,offers} from './travel-operators';

// Crew members of a speedboat operator (captains and deckhands). The operator creates their
// logins in the operator portal and assigns them to trips; crew sign in on the same page as
// operators but only see the trips they are assigned to, where they board guests and close the
// trip. Usernames share one index with operator logins, so a username is unique across both.
export const CREW_PREFIX='travel-crew:';
export const CREW_COOKIE='nirili_crew_session';
export const CREW_ROLES=['Captain','Crew'] as const;
export const MAX_CREW=50;
export type CrewRole=typeof CREW_ROLES[number];
export type Crew=PartnerCredentials&{operatorId:string;name:string;phone:string;role:CrewRole;createdAt:string;updatedAt:string;createdBy:string};
export type PublicCrew=Omit<Crew,'passwordHash'|'salt'|'passwordVersion'>;

const text=(value:any,max:number)=>String(value??'').trim().replace(/\s+/g,' ').slice(0,max);
const cleanPhone=(value:any)=>String(value||'').replace(/[\s()-]/g,'');
const PHONE=/^\+[1-9]\d{7,14}$/;

const auth=partnerAuth<Crew>({accountPrefix:CREW_PREFIX,usernamePrefix:'travel-operator-username:',sessionPrefix:'travel-crew-session:',cookie:CREW_COOKIE});
export const signOutCrew=auth.signOut;
export const clearedCrewCookie=auth.clearedCookie;

export function publicCrew(crew:Crew):PublicCrew{const {passwordHash,salt,passwordVersion,...rest}=crew;return rest;}

// A crew login works only while both the crew member and their operator are active.
async function withOperator(crew:Crew|null){
 if(!crew)return null;
 const found=await loadOperator(crew.operatorId);
 return found&&found.operator.active&&offers(found.operator,'boat')?{crew,operator:found.operator}:null;
}
export async function crewFromRequest(request:Request){return withOperator(await auth.fromRequest(request));}
export async function signInCrew(username:string,password:string){
 const result=await auth.signIn(username,password);
 const ok=result&&await withOperator(result.account);
 return ok?{...ok,cookie:result.cookie}:null;
}

function cleanDetails(input:any){
 const name=text(input?.name,80),phone=cleanPhone(input?.phone),role=CREW_ROLES.includes(input?.role)?input.role as CrewRole:'Crew';
 if(!name)throw Error('Enter the crew member’s name.');
 if(phone&&!PHONE.test(phone))throw Error('Enter the WhatsApp number with country code, e.g. +960 7XX XXXX, or leave it empty.');
 return {name,phone,role,active:input?.active!==false};
}

export async function operatorCrew(operatorId:string){
 return (await readRecords<Crew>(CREW_PREFIX)).filter(r=>r.value.operatorId===operatorId).map(r=>({crew:r.value,revision:r.revision}))
  .sort((a,b)=>a.crew.name.localeCompare(b.crew.name));
}

export async function createCrew(operatorId:string,input:any,by:string):Promise<Crew>{
 const details=cleanDetails(input),username=cleanUsername(input?.username);
 if((await operatorCrew(operatorId)).length>=MAX_CREW)throw Error('You can have up to '+MAX_CREW+' crew logins.');
 const id='CREW-'+crypto.randomUUID().replace(/-/g,'').slice(0,8).toUpperCase(),now=new Date().toISOString();
 const secret=await auth.credentials(input?.password);
 if(!await auth.reserveUsername(username,id,by))throw Error('That username is already in use. Choose another.');
 const crew:Crew={id,operatorId,...details,username,...secret,passwordVersion:1,createdAt:now,updatedAt:now,createdBy:by};
 if(!await saveRecord(CREW_PREFIX+id,crew,0,by))throw Error('Could not save the crew member. Please try again.');
 return crew;
}

// The operator edits a crew member. A new password, or pausing the login, signs them out everywhere.
export async function updateCrew(operatorId:string,id:string,input:any,by:string):Promise<Crew>{
 const found=await auth.load(String(id||''));
 if(!found||found.account.operatorId!==operatorId)throw Error('Crew member not found.');
 const crew:Crew={...found.account,...cleanDetails({...found.account,...input}),updatedAt:new Date().toISOString()};
 if(input?.password!==undefined&&input.password!==''){
  Object.assign(crew,await auth.credentials(input.password));crew.passwordVersion=(Number(crew.passwordVersion)||1)+1;
 }
 if(!await saveRecord(CREW_PREFIX+crew.id,crew,found.revision,by))throw Error('Someone else changed this crew member. Refresh and try again.');
 return crew;
}
