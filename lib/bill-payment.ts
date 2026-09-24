export const billPaymentKey=(b:any)=>b.department+':'+b.id;
export function paidBillStatus(stay:any,bill:any){if(bill.complimentary&&bill.totalCents===0)return {...bill,status:'Complimentary'};if(bill.settledAtPOS)return bill;if(bill.status==='Cancelled')return bill;if(stay.markedUnpaid)return {...bill,status:'Unpaid'};const covered=stay.paidBills?.[billPaymentKey(bill)];return Number.isInteger(covered)&&covered===bill.totalCents?{...bill,status:'Paid'}:Number.isInteger(covered)&&bill.status==='Paid'?{...bill,status:'Posted'}:bill;}

export function allBillsPaid(folio:any){const bills=folio?.bills?.filter((b:any)=>b.status!=='Cancelled')||[];return folio?.balanceCents===0&&bills.length>0&&bills.every((b:any)=>b.status==='Paid'||(b.complimentary&&b.totalCents===0));}

export function folioTotals(stay:any,bills:any[]){
 const active=(bills||[]).filter((bill:any)=>!bill?.deleted&&bill?.status!=='Cancelled');
 const totalCents=active.reduce((sum:number,bill:any)=>sum+Math.max(0,Math.round(Number(bill?.totalCents)||0)),0);
 const recordedPaidCents=Math.round(Number(stay?.initialPaid)||0)+(stay?.payments||[]).reduce((sum:number,payment:any)=>sum+Math.round(Number(payment?.cents)||0),0);
 const directlyPaidCents=stay?.markedUnpaid?0:active.reduce((sum:number,bill:any)=>{
  const cents=Math.max(0,Math.round(Number(bill?.totalCents)||0));
  if(bill?.status!=='Paid'||cents===0)return sum;
  const covered=stay?.paidBills?.[billPaymentKey(bill)];
  return Number.isInteger(covered)&&covered===cents?sum:sum+cents;
 },0);
 const paidCents=recordedPaidCents+directlyPaidCents;
 return {totalCents,paidCents,balanceCents:totalCents-paidCents};
}
