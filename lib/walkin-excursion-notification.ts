export function walkInNotificationTargets(state:any,selected:any,packageGroupId=''){
 const orders=Array.isArray(state?.orders)?state.orders:[];
 const group=String(packageGroupId||selected?.packageGroupId||'');
 if(group)return orders.filter((item:any)=>item?.kind==='excursion'&&item?.packageGroupId===group&&item?.status!=='Cancelled'&&item?.approvalStatus!=='Cancelled');
 return selected?[selected]:[];
}
export function markWalkInExcursionNotified(state:any,selected:any,input:{notified:boolean;by:string;channel?:string;at?:string;packageGroupId?:string}){
 if(!selected||selected.kind!=='excursion')throw Error('Excursion booking not found.');
 if(selected.stayId)throw Error('This action is for walk-in excursion guests.');
 if(!String(selected.phone||'').trim())throw Error('Walk-in guest WhatsApp number is missing.');
 const targets=walkInNotificationTargets(state,selected,input.packageGroupId||'');
 if(!targets.length)throw Error('No active excursion booking was found.');
 const now=input.at||new Date().toISOString(),channel=input.channel||'WhatsApp';
 for(const order of targets){
  order.guestNotified=input.notified;
  order.guestNotifiedAt=input.notified?now:null;
  order.guestNotifiedBy=input.notified?input.by:null;
  order.guestNotificationChannel=input.notified?channel:'';
  order.notificationHistory=Array.isArray(order.notificationHistory)?order.notificationHistory:[];
  order.notificationHistory.push({at:now,by:input.by,channel,status:input.notified?'Sent':'Reset',bookingId:order.id,packageGroupId:order.packageGroupId||''});
 }
 return {targets,notifiedAt:input.notified?now:'',notifiedBy:input.notified?input.by:''};
}
