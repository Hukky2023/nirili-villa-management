import {currentUser,currentGuestUser} from '../../../../lib/auth';
import {canTransport} from '../../../../lib/transport-access';
import {loadTransport} from '../../../../lib/transport-store';
import {transportToday,journeyLive} from '../../../../lib/transport';

// Read-only integration health, using the same canonical ledger as customer ticket sales,
// operator manifest updates and management transfers. Never return guest PII or session data.
export async function GET(){
 const user=(await currentUser())||(await currentGuestUser());
 if(!user||!canTransport(user))return Response.json({error:'Transport permission required'},{status:403,headers:{'Cache-Control':'no-store'}});
 try{
  const {state,revision}=await loadTransport();
  const today=transportToday();
  const boats=(state.boats||[]).filter(b=>b.active);
  const sailings=state.sailings.filter(s=>s.active);
  const activeOperators=new Set(boats.map(b=>b.operatorId)).size;
  const upcoming=state.bookings.flatMap(b=>b.journeys.filter(j=>journeyLive(b,j)&&j.date>=today));
  const occupied=upcoming.reduce((n,j)=>n+j.seats.length,0);
  return Response.json({
    status:'connected',ledger:'transport-bookings-v1',revision,checkedAt:new Date().toISOString(),
    totals:{boats:boats.length,operators:activeOperators,schedules:sailings.length,upcomingJourneys:upcoming.length,reservedSeats:occupied},
    apps:[
     {id:'nirili-connect',name:'Nirili Connect',role:'Guest booking, live seat selection and individual tickets',url:'https://nirili-ride.floot.app'},
     {id:'ntadmin',name:'NTadmin',role:'Speedboat fleet, recurring schedules, crew and passenger manifests',url:'https://nirili-transfer-agent.floot.app'}
    ],
    note:'Both connected apps use the management transport ledger. This reports shared data, not independent runtime uptime.'
  },{headers:{'Cache-Control':'private, no-store'}});
 }catch{return Response.json({error:'Shared transport ledger unavailable'},{status:503,headers:{'Cache-Control':'no-store'}})}
}
