import {partnerWith,publicPartner,type Partner} from './partners';

// Room and package bookings by travel agencies. These are partner accounts (lib/partners.ts)
// allowed to book rooms and packages; this view of a partner keeps the package engine unchanged:
// the agency pays Nirili the public price less its room, excursion and airport transfer discounts.
export type TourOperator=Partner;

export function discountedCents(cents:number,percent:number){
 return Math.max(0,Math.round(Math.max(0,Number(cents)||0)*(100-Math.max(0,Math.min(100,Number(percent)||0)))/100));
}
// What the package screens show about the signed-in partner (never the password hash).
export const publicTourOperator=(partner:Partner)=>publicPartner(partner);
// The signed-in partner, only if they may book rooms and packages.
export const tourOperatorFromRequest=(request:Request)=>partnerWith(request,'rooms');
