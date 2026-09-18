import {validDate} from './guest-catalog';
import {clockMinutes,inferTripEndTime,validClockTime} from './excursion-operations';
export function scheduleExcursion(order:any,input:any,today:string,by:string){
 if(order.kind!=='excursion'||['Completed','Cancelled'].includes(order.status))throw Error('This excursion cannot be scheduled.');
 if(!validDate(input.date)||input.date<today||!validClockTime(input.time))throw Error('Choose a valid date and time.');
 const endTime=validClockTime(input.endTime)?input.endTime:inferTripEndTime(order.name,input.time);
 if(!validClockTime(endTime)||clockMinutes(endTime)<=clockMinutes(input.time))throw Error('Choose an end time later than the departure time.');
 if(typeof input.vessel!=='string'||!input.vessel.trim()||input.vessel.length>100||!Array.isArray(input.crew)||input.crew.length<1||input.crew.length>20||input.crew.some((x:any)=>typeof x!=='string'||!x.trim()||x.length>100))throw Error('Choose a vessel and at least one crew member.');
 const phone=String(input.phone||'').replace(/[ ()-]/g,'');if(!/^\+[1-9]\d{7,14}$/.test(phone))throw Error('Enter the guest WhatsApp number with country code.');
 const schedule={date:input.date,time:input.time,endTime,vessel:input.vessel.trim(),crew:[...new Set(input.crew.map((x:string)=>x.trim()))],phone,scheduledBy:by,scheduledAt:new Date().toISOString()};
 order.scheduleHistory=[...(order.scheduleHistory||[]),...(order.schedule?[order.schedule]:[])];order.schedule=schedule;order.date=schedule.date;order.time=schedule.time;order.status='Confirmed';order.updatedBy=by;
}
export function excursionWhatsApp(order:any){const s=order.schedule;if(!s)return '';const message=`Hello ${order.guest||'guest'}, your Nirili Tours excursion is confirmed.\n\nExcursion: ${order.name}\nBooking: ${order.id}\nGuests: ${order.quantity}\nDate: ${s.date}\nTime: ${s.time} (Maldives time)\nVessel: ${s.vessel}\nCrew: ${s.crew.join(', ')}\n\nPlease contact Nirili Villa reception for meeting details.\nArrive as a Guest, Leave as a Friend.`;return 'https://wa.me/'+s.phone.replace(/\D/g,'')+'?text='+encodeURIComponent(message);}
