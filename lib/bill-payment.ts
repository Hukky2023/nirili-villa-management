export const billPaymentKey=(b:any)=>b.department+':'+b.id;
export function paidBillStatus(stay:any,bill:any){if(bill.settledAtPOS)return bill;if(bill.status==='Cancelled')return bill;if(stay.markedUnpaid)return {...bill,status:'Unpaid'};const covered=stay.paidBills?.[billPaymentKey(bill)];return Number.isInteger(covered)&&covered===bill.totalCents?{...bill,status:'Paid'}:Number.isInteger(covered)&&bill.status==='Paid'?{...bill,status:'Posted'}:bill;}

export function allBillsPaid(folio:any){const bills=folio?.bills?.filter((b:any)=>b.status!=='Cancelled')||[];return folio?.balanceCents===0&&bills.length>0&&bills.every((b:any)=>b.status==='Paid');}
