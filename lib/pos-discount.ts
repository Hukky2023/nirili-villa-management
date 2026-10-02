export function discountPOSBill(state:any,o:any,b:any,username:string){
 const percent=b.action==='free'?100:b.percent;
 if(typeof percent!=='number'||!Number.isFinite(percent)||percent<0||percent>100||Math.abs(percent*100-Math.round(percent*100))>0.000001)throw Error('Enter a percentage from 0 to 100, with up to two decimal places.');
 let s=state.stays.find((s:any)=>s.id===o.stayId);
 if(o.stayId&&!s)throw Error('Linked stay is missing. Refresh and try again.');
 if(['Cash','Card'].includes(o.method)||(o.cents>0&&s?.paidBills?.['Restaurant:'+o.id]===o.cents))throw Error('This bill is already paid. Correct its payment before applying a discount.');
 if(s&&s.status!=='In House')throw Error('Only a checked-in room bill can be changed.');
 if(b.action==='free'&&!s&&b.stayId){s=state.stays.find((s:any)=>s.id===b.stayId&&s.status==='In House');if(!s)throw Error('Select a checked-in room or choose Walk-in guest for the free bill.');}
 let bill=s?.posBills?.find((x:any)=>x.id===o.id);
 if(o.stayId&&!bill)throw Error('Linked room bill is missing. Refresh and try again.');
 const date=new Date().toISOString(),before={items:o.items,cents:o.cents,method:o.method};
 o.items=o.items.map((i:any)=>({...i,discount:percent,cents:Math.round(i.unitCents*i.quantity*(1-percent/100))}));
 o.cents=o.items.reduce((n:number,i:any)=>n+i.cents,0);o.billDiscountPercent=percent;o.complimentary=percent===100;o.updatedAt=date;o.updatedBy=username;
 const detail=(percent===100?'Marked as free':'Bill discount '+percent+'%')+' · $'+(before.cents/100).toFixed(2)+' → $'+(o.cents/100).toFixed(2);
 o.history??=[];o.history.push({date,by:username,detail,before,after:{items:o.items,cents:o.cents}});
 if(s){
  s.posBills??=[];s.history??=[];if(!bill){bill={department:'Restaurant',id:o.id};s.posBills.push(bill);}
  bill.items=o.items.map((i:any)=>[i.name,i.quantity,i.unitCents/100,i.discount]);bill.totalCents=o.cents;bill.status=percent===100?'Complimentary':'Posted';bill.complimentary=percent===100;bill.discountPercent=percent;bill.settledAtPOS=false;
  delete s.paidBills?.['Restaurant:'+o.id];o.stayId=s.id;o.room=s.room;o.customer=s.guest;if(percent===100)o.method='Room';
  s.history.unshift({date,by:username,detail:'Restaurant bill '+o.id+' · '+detail});
 }else if(b.action==='free'){
  o.stayId='';o.room='';o.method='';
 }
}
