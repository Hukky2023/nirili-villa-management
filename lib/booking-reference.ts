export function nextBookingReference(state:any){
 let n=Number.isSafeInteger(state.nextBookingNumber)&&state.nextBookingNumber>0?state.nextBookingNumber:1;
 const used=new Set([...state.stays,...(state.deletedBookings||[]).map((x:any)=>x.stay)].map((s:any)=>s.id));
 while(used.has('NV-'+String(n).padStart(4,'0')))n++;
 state.nextBookingNumber=n+1;
 return 'NV-'+String(n).padStart(4,'0');
}
