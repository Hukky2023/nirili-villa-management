/** Timestamp ticket receipts/reversals in MVR without altering legacy dates. */
export function toggleTransferPayment(booking:any,by:string,now=new Date()){
 const date=now.toISOString();
 if(!Array.isArray(booking.paymentHistory)){
  booking.paymentHistory=[];
  if(booking.paid&&!booking.paidAt)booking.undatedPaidCents=booking.total;
  else if(booking.paid&&booking.paidAt)booking.paymentHistory.push({id:'legacy-'+booking.id,cents:booking.total,date:booking.paidAt,by:'legacy'});
 }
 booking.paid=!booking.paid;
 booking.paidAt=booking.paid?date:null;
 booking.paymentHistory.push({id:crypto.randomUUID(),cents:booking.paid?booking.total:-booking.total,date,by});
}
