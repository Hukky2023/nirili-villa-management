import {authDb,currentUser} from '../../../lib/auth';
import {loadStays} from '../../../lib/stays';
import {excursionResources} from '../../../lib/excursion-workflow';

const headers={'Cache-Control':'private, no-store','Vary':'Cookie'};
const validId=(value:string)=>!!value&&value.length<=120;
const text=(value:any)=>String(value||'').trim();
const normal=(value:any)=>text(value).replace(/\s+/g,' ').toLowerCase();

function combinedTripStatus(value:any){
 const status=text(value);
 if(status==='Guests boarded'||status==='Departed'||status==='Guests boarded & Departed')return 'Guests boarded & Departed';
 if(status==='Arrived'||status==='Completed'||status==='Arrived & Completed')return 'Arrived & Completed';
 return status||'Excursion scheduled';
}
function maldivesToday(){
 return new Intl.DateTimeFormat('en-CA',{timeZone:'Indian/Maldives',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
}
function subtractMonths(date:string,months:number){
 const [year,month,day]=date.split('-').map(Number);
 const d=new Date(Date.UTC(year,month-1,1));
 d.setUTCMonth(d.getUTCMonth()-months);
 const lastDay=new Date(Date.UTC(d.getUTCFullYear(),d.getUTCMonth()+1,0)).getUTCDate();
 d.setUTCDate(Math.min(day,lastDay));
 return d.toISOString().slice(0,10);
}

export async function GET(request:Request){
 const user=await currentUser();
 if(user?.role!=='admin')return Response.json({error:'Admin access required.'},{status:403,headers});
 const crewId=new URL(request.url).searchParams.get('crewId')?.trim()||'';
 if(!validId(crewId))return Response.json({error:'Choose a crew member.'},{status:400,headers});
 try{
  const {state}=await loadStays();
  const resources=excursionResources(state);
  const crew=resources.crew.find((member:any)=>member.id===crewId);
  if(!crew)return Response.json({error:'Crew member not found.'},{status:404,headers});

  const today=maldivesToday(),from=subtractMonths(today,3);
  const result=await authDb().prepare("SELECT payload FROM operation_records WHERE key LIKE 'excursion-schedule:%'").all<any>();
  const history=(result.results||[]).map((row:any)=>{
   try{return JSON.parse(row.payload||'{}')}catch{return null}
  }).filter(Boolean).filter((schedule:any)=>{
   const date=text(schedule.date);
   if(!date||date<from||date>today||schedule.status==='Cancelled')return false;
   const ids=Array.isArray(schedule.crewIds)?schedule.crewIds.map(String):[];
   if(ids.includes(crewId))return true;
   // Legacy schedules may only contain crew names.
   const names=Array.isArray(schedule.crew)?schedule.crew:[];
   return names.some((name:any)=>normal(name)===normal(crew.name));
  }).map((schedule:any)=>{
   const vessel=resources.vessels.find((item:any)=>item.id===schedule.vesselId);
   const guideIds=Array.isArray(schedule.guideIds)?schedule.guideIds.map(String):[];
   return {
    id:text(schedule.id),date:text(schedule.date),time:text(schedule.time),endTime:text(schedule.endTime),
    name:text(schedule.name)||'Excursion',tripStatus:combinedTripStatus(schedule.tripStatus||schedule.status),
    bookingStatus:text(schedule.status)||'Open',
    vessel:text(vessel?.name)||text(schedule.vessel)||'Not recorded',
    role:guideIds.includes(crewId)?'Guide / Crew':'Crew',
    completedAt:text(schedule.completedAt),departedAt:text(schedule.departedAt),arrivedAt:text(schedule.arrivedAt)
   };
  }).sort((a:any,b:any)=>b.date.localeCompare(a.date)||b.time.localeCompare(a.time)||a.name.localeCompare(b.name));

  return Response.json({
   crew:{id:crew.id,name:crew.name},
   period:{from,to:today,months:3},
   totals:{trips:history.length,completed:history.filter((trip:any)=>trip.tripStatus==='Arrived & Completed').length},
   history
  },{headers});
 }catch{
  return Response.json({error:'Could not load crew excursion history. Please try again.'},{status:503,headers});
 }
}
