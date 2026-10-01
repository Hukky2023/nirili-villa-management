import {limit,sameOrigin} from '../../../../lib/auth';
import {readOperationalRecordPrimary} from '../../../../lib/supabase-bridge';
import {loadStays} from '../../../../lib/stays';
import {findManageLinks} from '../../../../lib/booking-lookup';
import {sendManageLinkEmail} from '../../../../lib/booking-email';

// "Find my booking": emails the private manage link(s) to the address on the booking.
// The reply is the same whether or not a booking matched, so it cannot be used to probe bookings.
const headers={'Cache-Control':'private, no-store, max-age=0'};
const SENT='If the reference and email match a booking, we have emailed the manage link to that address. It can take a minute to arrive; check your spam folder too. If nothing arrives, message us on WhatsApp.';

async function hotelState(){
 try{const row=await readOperationalRecordPrimary('hotel-stays-v1');if(row?.payload)return row.payload;}catch{}
 return (await loadStays()).state;
}

export async function POST(request:Request){
 if(!sameOrigin(request))return Response.json({error:'Invalid request.'},{status:403,headers});
 try{
  const body:Record<string,any>=await request.json();
  const reference=String(body.reference||'').trim().slice(0,40),email=String(body.email||'').trim().toLowerCase().slice(0,254);
  if(!/^[A-Za-z0-9-]{3,40}$/.test(reference)||!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))return Response.json({error:'Enter your booking reference and the email address you booked with.'},{status:400,headers});
  const ip=request.headers.get('cf-connecting-ip')||'unknown';
  if(!await limit('find-booking-ip:'+ip,10,3600000)||!await limit('find-booking-ref:'+reference.toUpperCase(),5,3600000))return Response.json({error:'Too many requests. Please try again later or message us on WhatsApp.'},{status:429,headers});
  const links=findManageLinks(await hotelState(),reference,email);
  if(links.length){
   // A failed send gets the same reply, so the response never reveals whether a booking exists.
   await sendManageLinkEmail({email,guest:links[0].guest,reference:links[0].reference,links}).catch(()=>null);
  }
  return Response.json({ok:true,message:SENT},{headers});
 }catch{return Response.json({error:'Could not look up the booking. Please try again or message us on WhatsApp.'},{status:503,headers});}
}
