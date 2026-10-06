import {can,loadPartner,loadPartners,partnerFromRequest,publicPartner,setPartnerOnline,type Partner} from './partners';

// Nirili Travels is a marketplace: Nirili does not own speedboats or buggies. Independent
// speedboat companies and buggy owners run the trips; guests, partner guest houses and Nirili
// reception book them. Operators are partner accounts (lib/partners.ts) allowed to run
// speedboat trips or buggy rides. Guests pay the operator directly and Nirili earns a commission;
// transfers that in-house guests charge to their room are collected by Nirili and paid on.
export type OperatorService='boat'|'buggy';
export const SERVICES:OperatorService[]=['boat','buggy'];
export type Operator=Partner&{services:OperatorService[]};

// This view of a partner keeps the operator screens and statements unchanged.
export function asOperator(partner:Partner):Operator{
 return {...partner,services:SERVICES.filter(s=>can(partner,s==='boat'?'boats':'buggies'))};
}
export const publicOperator=(operator:Operator)=>({...publicPartner(operator),services:operator.services});
export const offers=(operator:Pick<Operator,'services'>|null|undefined,service:OperatorService)=>!!operator?.services?.includes(service);

// The signed-in partner as an operator, if they run speedboats or buggies.
export async function operatorFromRequest(request:Request){
 const partner=await partnerFromRequest(request);
 const operator=partner?asOperator(partner):null;
 return operator&&operator.services.length?operator:null;
}
export async function loadOperators():Promise<{operator:Operator;revision:number}[]>{
 return (await loadPartners()).map(r=>({operator:asOperator(r.partner),revision:r.revision})).filter(r=>r.operator.services.length);
}
export async function loadOperator(id:string){
 const found=await loadPartner(id);
 return found?{operator:asOperator(found.partner),revision:found.revision}:null;
}
export async function setBuggyOnline(id:string,online:boolean){return asOperator(await setPartnerOnline(id,online));}
