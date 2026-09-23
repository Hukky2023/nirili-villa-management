import {SPECIAL_PACKAGE_COMPONENTS} from './excursion-operations';

const labels:Record<string,string>={
 turtle:'Turtle Snorkeling',
 shark:'Shark Snorkeling (Nurse Shark)',
 sandbank:'Sandbank Trip',
 'coral garden':'Coral Garden Snorkeling',
 dolphin:'Dolphin Watching',
 fishing:'Fishing with Dinner'
};

export function specialPackageComponentLabel(component:string){
 return labels[component]||component.replace(/\b\w/g,letter=>letter.toUpperCase());
}

export function specialPackageGroupId(){
 return 'PKG-'+crypto.randomUUID().slice(0,8).toUpperCase();
}

export function buildSpecialPackageOrders(input:{
 base:any;
 totalCents:number;
 plan?:any[]|null;
 resources?:{vessels?:any[];crew?:any[]};
 packageGroupId?:string;
 sourceDate:string;
 pendingPrivateBoat?:boolean;
}){
 const base=input.base||{},plan=Array.isArray(input.plan)?input.plan:[],resources=input.resources||{vessels:[],crew:[]};
 const groupId=input.packageGroupId||specialPackageGroupId();
 const covered=new Set<string>();
 for(const schedule of plan)for(const component of schedule.coverage||[])covered.add(String(component));
 const uncovered=SPECIAL_PACKAGE_COMPONENTS.filter(component=>!covered.has(component));
 const definitions=[
  ...plan.map((schedule:any)=>({kind:'scheduled' as const,schedule,coverage:(schedule.coverage||[]).map(String)})),
  ...uncovered.map(component=>({kind:'pending' as const,component,coverage:[component]}))
 ];
 if(!definitions.length)throw Error('Special Package requires at least one package leg.');
 const total=Math.max(0,Math.round(Number(input.totalCents)||0)),partCount=definitions.length,basePart=Math.floor(total/partCount);
 const createdAt=base.createdAt||new Date().toISOString();
 const orders=definitions.map((definition:any,index:number)=>{
  const id='EXC-'+crypto.randomUUID().slice(0,8).toUpperCase();
  const partQuoted=index===partCount-1?total-basePart*(partCount-1):basePart;
  const common={
   ...base,id,
   excursionGuestRoster:Array.isArray(base.guestNames)?base.guestNames.map((name:string,slot:number)=>({
    id:id+':'+(slot+1),slot:slot+1,name,ageCategory:base.guestCategories?.[slot]||'',boarded:false,boardedAt:''
   })):base.excursionGuestRoster,
   packageGroupId:groupId,packageName:'Special Package',packagePart:index+1,packageParts:partCount,
   packageTotalCents:total,packageCoverage:definition.coverage,specialPackage:true,
   menuItemId:'special-package',createdAt
  };
  if(definition.kind==='scheduled'){
   const schedule=definition.schedule,vessel=(resources.vessels||[]).find((item:any)=>item.id===schedule.vesselId),crew=(resources.crew||[]).filter((item:any)=>schedule.crewIds?.includes(item.id));
   const segmentName=definition.coverage.map((component:string)=>specialPackageComponentLabel(component)).join(' + ')||String(schedule.name||'Package trip');
   return {
    ...common,name:segmentName,packageSegmentName:segmentName,date:schedule.date,
    cents:partQuoted,quotedCents:partQuoted,baseQuotedCents:partQuoted,
    unitPriceCents:Math.max(1,Number(base.quantity)||1)?Math.round(partQuoted/Math.max(1,Number(base.quantity)||1)):partQuoted,
    time:schedule.time,endTime:schedule.endTime||'',returnTime:schedule.returnTime||'',scheduleId:schedule.id,
    seatRequest:false,unscheduledRequest:false,approvalStatus:'Approved',status:'Scheduled',
    requestedOverCapacity:false,autoConfirmed:true,matchedFromMenu:true,matchedScheduleName:schedule.name,guestNotified:false,
    schedule:{date:schedule.date,time:schedule.time,endTime:schedule.endTime||'',...(schedule.returnTime?{returnTime:schedule.returnTime}:{}),vesselId:schedule.vesselId||'',vessel:vessel?.name||'',crewIds:schedule.crewIds||[],crew:crew.map((person:any)=>person.name)}
   };
  }
  const component=definition.component,segmentName=specialPackageComponentLabel(component);
  return {
   ...common,name:segmentName,packageSegmentName:segmentName,date:input.sourceDate,
   cents:0,quotedCents:partQuoted,baseQuotedCents:partQuoted,
   unitPriceCents:Math.round(partQuoted/Math.max(1,Number(base.quantity)||1)),
   time:'',status:'Awaiting scheduling',approvalStatus:'Pending',seatRequest:false,unscheduledRequest:true,
   autoConfirmed:false,requestedSchedule:true,guestNotified:false,privateBoatRequested:input.pendingPrivateBoat===true||base.privateBoatRequested===true
  };
 });
 return {packageGroupId:groupId,orders,covered:[...covered],uncovered};
}
