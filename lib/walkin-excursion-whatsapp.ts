export function normalizeWhatsAppPhone(value:any){
 const digits=String(value||'').replace(/\D/g,'');
 return digits.replace(/^00/,'');
}
export function whatsappDate(value:any){
 const date=String(value||'').slice(0,10);
 if(!/^\d{4}-\d{2}-\d{2}$/.test(date))return date;
 const [y,m,d]=date.split('-');
 return d+'-'+m+'-'+y;
}
export function buildWalkInExcursionWhatsAppMessage(booking:any,packageLegs:any[]=[]){
 const name=String(booking?.packageName||booking?.excursion||booking?.name||'Excursion');
 const ref=String(booking?.packageGroupId||booking?.id||'');
 const guest=String(booking?.guest||'Guest');
 const hotel=String(booking?.hotel||'').trim();
 const room=String(booking?.room||'').trim();
 const total=Number(booking?.totalCents);
 const status=String(booking?.tripStatus||'Confirmed');
 const lines=[
  'Nirili Tours · Dhiffushi',
  '',
  'Hello '+guest+',',
  'Your excursion booking is '+status.toLowerCase()+'.',
  '',
  'Booking: '+ref,
  'Excursion: '+name
 ];
 if(packageLegs.length>1){
  lines.push('Package itinerary:');
  for(const leg of [...packageLegs].sort((a,b)=>String(a.date).localeCompare(String(b.date))||String(a.time).localeCompare(String(b.time)))){
   lines.push('• '+String(leg.excursion||leg.name||'Trip')+' · '+whatsappDate(leg.date)+' · '+String(leg.time||'Time TBC')+(leg.endTime?'–'+leg.endTime:''));
  }
 }else{
  lines.push('Date: '+whatsappDate(booking?.date));
  lines.push('Time: '+String(booking?.time||'To be confirmed')+(booking?.endTime?'–'+booking.endTime:''));
 }
 if(hotel)lines.push('Pickup: '+hotel+(room?' · Room '+room:''));
 if(Number.isFinite(total))lines.push('Total: USD '+(Math.max(0,total)/100).toFixed(2));
 lines.push('');
 lines.push('Please keep this message for your booking details.');
 lines.push('Arrive as a Guest, Leave as a Friend.');
 return lines.join('\n');
}
export function walkInExcursionWhatsAppUrl(booking:any,packageLegs:any[]=[]){
 const phone=normalizeWhatsAppPhone(booking?.phone);
 if(!phone)return '';
 return 'https://wa.me/'+phone+'?text='+encodeURIComponent(buildWalkInExcursionWhatsAppMessage(booking,packageLegs));
}
