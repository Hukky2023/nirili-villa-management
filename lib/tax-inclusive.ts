export const TOURISM_GST_RATE=0.17;
export const SERVICE_CHARGE_RATE=0.10;
export const GREEN_TAX_USD_PER_PERSON_DAY=6;

export type InclusiveTaxBreakdown={
 totalCents:number;
 baseCents:number;
 serviceChargeCents:number;
 tourismGstCents:number;
 greenTaxCents:number;
 greenTaxGuests:number;
 greenTaxDays:number;
};

export function stayNights(checkIn?:string,checkOut?:string){
 const a=Date.parse(String(checkIn||'')+'T00:00:00Z'),b=Date.parse(String(checkOut||'')+'T00:00:00Z');
 if(!Number.isFinite(a)||!Number.isFinite(b)||b<=a)return 0;
 return Math.max(0,Math.round((b-a)/86400000));
}

function guestUnderTwo(guest:any){
 if(!guest)return false;
 if(guest.underTwo===true||guest.infancy==='under2'||guest.ageCategory==='under2'||guest.ageCategory==='Under 2')return true;
 const age=Number(guest.age);
 return Number.isFinite(age)&&age>=0&&age<2;
}

export function greenTaxGuests(stay:any){
 const guests=Array.isArray(stay?.guests)?stay.guests.filter((g:any)=>g&&String(g.name||'').trim()):[];
 if(guests.length)return guests.filter((g:any)=>!guestUnderTwo(g)).length;
 return Math.max(0,Number(stay?.pax)||0);
}

export function greenTaxCentsForStay(stay:any){
 const guests=greenTaxGuests(stay),days=stayNights(stay?.checkIn,stay?.checkOut);
 return Math.round(guests*days*GREEN_TAX_USD_PER_PERSON_DAY*100);
}

/**
 * Break down a customer-facing ALL-INCLUSIVE amount without changing it.
 * Green Tax is taken out first. The remaining amount is treated as:
 *   base + 10% service charge + 17% Tourism GST on (base + service charge).
 * Therefore total before Green Tax = base * 1.10 * 1.17.
 */
export function inclusiveTourismBreakdown(totalCents:number,greenTaxCents=0):InclusiveTaxBreakdown{
 const total=Math.max(0,Math.round(Number(totalCents)||0));
 const green=Math.max(0,Math.min(total,Math.round(Number(greenTaxCents)||0)));
 const taxableGross=total-green;
 const divisor=(1+SERVICE_CHARGE_RATE)*(1+TOURISM_GST_RATE);
 const base=Math.round(taxableGross/divisor);
 const service=Math.round(base*SERVICE_CHARGE_RATE);
 let gst=taxableGross-base-service;
 if(gst<0)gst=0;
 return {totalCents:total,baseCents:base,serviceChargeCents:service,tourismGstCents:gst,greenTaxCents:green,greenTaxGuests:0,greenTaxDays:0};
}

export function stayInclusiveTaxBreakdown(totalCents:number,stay:any):InclusiveTaxBreakdown{
 const guests=greenTaxGuests(stay),days=stayNights(stay?.checkIn,stay?.checkOut),green=greenTaxCentsForStay(stay);
 return {...inclusiveTourismBreakdown(totalCents,green),greenTaxGuests:guests,greenTaxDays:days};
}
