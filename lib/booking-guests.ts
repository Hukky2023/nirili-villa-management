import {env} from 'cloudflare:workers';
import {sealCredential} from './credential-crypto';
export async function bookingGuests(input:any,pax:number,existing:any[]=[],adults:number=pax,children:number=0){
 if(!Array.isArray(input)||input.length!==pax||pax<1||pax>3)throw Error('Enter details for every guest.');
 if(!Number.isInteger(adults)||adults<1||adults>3||!Number.isInteger(children)||children<0||children>3-adults||adults+children!==pax)throw Error('A room allows up to three guests: at least one adult and no more than two children.');
 const documents:{id:string;payload:string}[]=[];
 const guests=await Promise.all(input.map(async(g:any,index:number)=>{
 if(!g||typeof g.name!=='string'||!g.name.trim()||g.name.trim().length>100||(g.phone!==undefined&&typeof g.phone!=='string'))throw Error('Enter each guest’s name.');
 const phone=index<adults?(g.phone||'').replace(/[ ()-]/g,''):'';if(phone&&!/^\+[1-9]\d{7,14}$/.test(phone))throw Error('Enter each contact number with country code, for example +960 followed by the number.');
 let passportId=g.passportId||'';if(passportId&&!existing.some(x=>x.passportId===passportId))throw Error('This passport is not attached to this booking.');
 if(g.photo){
 if(typeof g.photo!=='string'||!/^data:image\/jpeg;base64,[A-Za-z0-9+/]+=*$/.test(g.photo)||g.photo.length>350000)throw Error('Passport photo must be a JPEG under 250 KB after processing.');
 const raw=atob(g.photo.split(',')[1]);if(raw.length>250000||raw.length<4||raw.charCodeAt(0)!==255||raw.charCodeAt(1)!==216||raw.charCodeAt(2)!==255)throw Error('Choose a valid passport photo.');
 passportId=crypto.randomUUID();const secret=(env as unknown as Record<string,string>).NIRILI_CREDENTIAL_KEY||'';
 const payload=await sealCredential(secret,'passport:'+passportId,'passport-v1',g.photo);
 documents.push({id:passportId,payload});
 }
 const passportNumber=typeof g.passportNumber==='string'?g.passportNumber.trim().replace(/\s+/g,' ').slice(0,40):'';
 const country=typeof g.country==='string'?g.country.trim().replace(/\s+/g,' ').slice(0,80):'';
 return {name:g.name.trim(),phone,passportId,passportNumber,country,kind:index<adults?'adult':'child'};
 }));
 const removed=existing.map(g=>g.passportId).filter(id=>id&&!guests.some(g=>g.passportId===id));
 return {guests,documents,removed,adults,children};
}
