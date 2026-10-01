import {bookingManageUrl,validBookingManageToken} from './booking-manage';
import {excursionManageUrl,validExcursionManageToken} from './excursion-manage';

// "Find my booking": a guest who has lost the private link from their email enters the booking
// reference and the email address used to book. The link is only ever sent to the email on file,
// so knowing a reference alone never opens someone else's booking.
export type ManageLink={kind:'stay'|'excursion';reference:string;guest:string;label:string;url:string};

const ref=(value:any)=>String(value??'').trim().toUpperCase().replace(/\s+/g,'');
const mail=(value:any)=>String(value??'').trim().toLowerCase();

export function findManageLinks(state:any,reference:string,email:string):ManageLink[]{
 const wanted=ref(reference),address=mail(email);
 if(!wanted||!address)return [];
 const links:ManageLink[]=[],seen=new Set<string>();
 const add=(link:ManageLink)=>{if(!seen.has(link.url)){seen.add(link.url);links.push(link);}};

 // Room bookings: the reference is the request number (REQ-…) or, once confirmed, the stay's booking number.
 const stays:any[]=state?.stays||[],requests:any[]=state?.requests||[];
 for(const item of [...stays,...requests]){
  const ids=[item?.id,item?.requestId,item?.reference,item?.bookingNumber].map(ref).filter(Boolean);
  if(!ids.includes(wanted)||mail(item?.email)!==address||!validBookingManageToken(item?.manageToken))continue;
  add({kind:'stay',reference:String(item.id),guest:String(item.guest||''),label:'Room booking '+String(item.id)+(item.checkIn?' · '+item.checkIn+' to '+item.checkOut:''),url:bookingManageUrl(item.manageToken)});
 }

 // Excursions booked on the tours website: EXC-… or, for a Special Package, PKG-….
 for(const order of state?.orders||[]){
  if(order?.kind!=='excursion'||order?.source!=='External guest website')continue;
  const ids=[order.id,order.packageGroupId].map(ref).filter(Boolean);
  if(!ids.includes(wanted)||mail(order.email)!==address||!validExcursionManageToken(order.manageToken))continue;
  const name=order.packageGroupId?order.packageName||'Special Package':order.name;
  add({kind:'excursion',reference:String(order.packageGroupId||order.id),guest:String(order.guest||''),label:String(name)+' · '+String(order.date||''),url:excursionManageUrl(order.manageToken)});
 }
 return links;
}
