/** The accepted package quote is the single charge for all included services. */
export function packageSnapshot(item:any,total:number,rate:number,menu:any[]=[]){
 if(!Number.isSafeInteger(total)||total<0)throw Error('Invalid package total.');
 return {packageId:String(item.id),packageName:String(item.name||'Package'),packageQuotedCents:total,packageRatePerGuestCents:rate,
  packageNights:Number(item.nights),packageMealPlan:String(item.mealPlan),
  packageIncludeTransfer:item.includeTransfer===true,packageTransferLabel:String(item.transferLabel||'Return airport transfer'),
  packageExcursions:(Array.isArray(item.excursions)?item.excursions:[]).map((id:any)=>({id:String(id),name:String(menu.find(x=>String(x.id)===String(id))?.name||id)}))};
}
export function bookedPackage(state:any,booking:any,menu:any[]=[]){
 if(!booking?.packageId)return {};
 if(Array.isArray(booking.packageExcursions))return Object.fromEntries(Object.entries(booking).filter(([key])=>key.startsWith('package')));
 const item=(state.propertyPackages||[]).find((x:any)=>String(x.id)===String(booking.packageId));
 if(!item)throw Error('The original package inclusions need review by reception.');
 return packageSnapshot(item,Number(booking.packageQuotedCents),Number(booking.packageRatePerGuestCents)||0,menu);
}
export function recoverStayPackages(state:any,menu:any[]=[]){
 for(const stay of state.stays||[]){
  if(stay.packageId||!['Confirmed','In House'].includes(stay.status))continue;
  const q=(state.requests||[]).find((x:any)=>x.stayId===stay.id&&x.packageId&&Number.isSafeInteger(x.packageQuotedCents));
  if(!q||q.checkIn!==stay.checkIn||q.checkOut!==stay.checkOut||q.pax!==stay.pax||q.meal!==stay.meal)continue;
  if(stay.extensions?.length||(stay.history||[]).some((h:any)=>h.detail==='Booking details edited')||stay.billOverrides?.[stay.id])continue;
  try{const snapshot=bookedPackage(state,q,menu);Object.assign(stay,snapshot,{base:q.packageQuotedCents,legacyFolio:false});
   stay.history??=[];stay.history.unshift({date:new Date().toISOString(),by:'System',detail:'Original booked package restored from accepted quote'});
  }catch{/* A missing historical package requires manual review, never invent inclusions. */}
 }
 return state;
}
export function arrangePackageExcursions(state:any,stay:any,by:string,today:string){
 if(!stay?.packageId||stay.status!=='In House')throw Error('Package excursions can be arranged after check-in.');
 state.orders??=[];
 for(const item of stay.packageExcursions||[]){
  const key=stay.id+':'+item.id;
  if(state.orders.some((o:any)=>o.packageInclusionKey===key))continue;
  state.orders.push({id:'EXC-'+crypto.randomUUID(),kind:'excursion',itemId:item.id,name:item.name,
   packageInclusionKey:key,includedInStayPackage:true,stayId:stay.id,accountId:stay.accountId,guest:stay.guest,
   phone:stay.whatsapp||'',email:stay.email||'',room:stay.room,hotel:'Nirili Villa',quantity:stay.pax,
   adults:stay.adults??stay.pax,children:stay.children??0,cents:0,date:today,time:'',status:'Awaiting scheduling',
   notes:'Included in '+stay.packageName+' · Arrange during stay '+stay.checkIn+' to '+stay.checkOut,
   source:'Stay package',createdBy:by,createdAt:new Date().toISOString()});
 }
 stay.packageExcursionsRequestedAt??=new Date().toISOString();
}
export function validatePackageChange(booking:any,next:any){
 if(!booking.packageId)return;
 if(next.pax!==booking.pax||next.meal!==booking.meal||Date.parse(next.checkOut)-Date.parse(next.checkIn)!==Date.parse(booking.checkOut)-Date.parse(booking.checkIn))
  throw Error('Package guest count, meal plan and duration must match the booked package. Contact reception to rebook a different package.');
}
