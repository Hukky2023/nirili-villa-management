import test from 'node:test';
import assert from 'node:assert/strict';
import {applyExcursionScheduleTimeChange,excursionTimeChangeMessage} from '../lib/excursion-time-change.ts';
import {addGuestNotification,dismissGuestNotification,guestNotificationsForAccount} from '../lib/guest-notifications.ts';

test('schedule time change updates assignment only and preserves booking/billing/passenger data',()=>{
 const order={
  id:'EXC-1',kind:'excursion',accountId:'acct-1',guest:'Guest',name:'Turtle Snorkeling',quantity:2,
  date:'2026-09-24',time:'08:00',endTime:'09:30',scheduleId:'trip2',
  schedule:{date:'2026-09-24',time:'08:00',endTime:'09:30',vesselId:'boat-a',vessel:'Boat A',crewIds:['c1'],crew:['Crew One']},
  cents:5000,quotedCents:5000,excursionPayments:[{cents:2500}],guestNames:['A','B'],guestCategories:['adult','adult'],
  excursionGuestRoster:[{id:'1',slot:1,name:'A',ageCategory:'adult'},{id:'2',slot:2,name:'B',ageCategory:'adult'}],
  buggyRequested:true,pickupLocation:'Hotel A',notes:'Keep this',packageGroupId:'PKG-1',packagePart:1,packageParts:3
 };
 const before=structuredClone(order);
 const schedule={id:'trip2',date:'2026-09-24',time:'10:30',endTime:'12:30',returnTime:'',vesselId:'boat-b',crewIds:['c2']};
 const moved=applyExcursionScheduleTimeChange(order,schedule,'manager',{vessels:[{id:'boat-b',name:'Boat B'}],crew:[{id:'c2',name:'Crew Two'}]},'2026-09-23T18:00:00Z');
 assert.deepEqual(moved.before,{date:'2026-09-24',time:'08:00'});
 assert.deepEqual(moved.after,{date:'2026-09-24',time:'10:30'});
 assert.equal(order.time,'10:30');assert.equal(order.endTime,'12:30');assert.equal(order.schedule.vessel,'Boat B');assert.deepEqual(order.schedule.crew,['Crew Two']);
 assert.equal(order.cents,before.cents);assert.equal(order.quotedCents,before.quotedCents);assert.deepEqual(order.excursionPayments,before.excursionPayments);
 assert.deepEqual(order.guestNames,before.guestNames);assert.deepEqual(order.excursionGuestRoster,before.excursionGuestRoster);
 assert.equal(order.buggyRequested,true);assert.equal(order.pickupLocation,'Hotel A');assert.equal(order.notes,'Keep this');
 assert.equal(order.packageGroupId,'PKG-1');assert.equal(order.packagePart,1);assert.equal(order.packageParts,3);
 assert.equal(order.scheduleTimeHistory.length,1);assert.equal(order.scheduleTimeHistory[0].by,'manager');assert.equal(order.guestNotified,false);
});

test('time-change message states old and new assigned times',()=>{
 const message=excursionTimeChangeMessage({name:'Turtle Snorkeling'},{date:'2026-09-24',time:'08:00'},{date:'2026-09-24',time:'10:30'});
 assert.equal(message,'Turtle Snorkeling departure changed from 08:00 to 10:30 on 2026-09-24.');
});

test('guest notification persists for the correct account until dismissed',()=>{
 const state={};
 const first=addGuestNotification(state,{id:'GNT-1',accountId:'acct-1',type:'excursion-time-change',title:'Excursion time changed',message:'Turtle departure changed from 08:00 to 10:30.',url:'/stay?service=excursion',bookingId:'EXC-1',createdAt:'2026-09-23T18:00:00Z'});
 addGuestNotification(state,{id:'GNT-2',accountId:'acct-2',type:'excursion-time-change',title:'Excursion time changed',message:'Other guest update',createdAt:'2026-09-23T18:01:00Z'});
 assert.equal(first?.id,'GNT-1');
 assert.deepEqual(guestNotificationsForAccount(state,'acct-1').map(item=>item.id),['GNT-1']);
 assert.equal(dismissGuestNotification(state,'acct-1','GNT-1'),true);
 assert.deepEqual(guestNotificationsForAccount(state,'acct-1'),[]);
 assert.equal(guestNotificationsForAccount(state,'acct-2').length,1);
});

test('guest notification helper caps retained history',()=>{
 const state={guestNotifications:[]};
 for(let i=0;i<520;i++)addGuestNotification(state,{id:'GNT-'+i,accountId:'acct',type:'test',title:'Update',message:'Message '+i,createdAt:new Date(2026,0,1,0,0,i).toISOString()});
 assert.equal(state.guestNotifications.length,500);
});
