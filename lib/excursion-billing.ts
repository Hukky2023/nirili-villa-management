/** Excursion prices are booking/group totals in cents, never a per-guest price. */
export type ExcursionPricing = {
  originalCents: number; totalCents: number; discountCents: number;
  discountPercent: number; complimentary: boolean; adjusted: boolean;
};
export type ExcursionBillingActor = {role: string; userId: string; username: string};

function validBillingItems(value:any){
  return Array.isArray(value)&&value.length>0&&value.length<=100&&value.every((item:any)=>
    Array.isArray(item)&&item.length===4&&typeof item[0]==='string'&&item[0].trim()&&item[0].length<=200&&
    Number.isInteger(item[1])&&item[1]>=1&&item[1]<=10000&&
    Number.isFinite(item[2])&&item[2]>=0&&item[2]<=1000000&&
    Number.isFinite(item[3])&&item[3]>=0&&item[3]<=100
  );
}
function billingItemsTotalCents(items:any[]){
  return items.reduce((sum:number,item:any)=>sum+Math.round(Math.round(Number(item[2])*100)*(1-Number(item[3])/100)),0);
}
function billingItemsOriginalCents(items:any[]){
  return items.reduce((sum:number,item:any)=>sum+Math.round(Number(item[2])*100),0);
}
function billingItemsUniformDiscount(items:any[]){
  if(!items.length)return 0;
  const value=Number(items[0][3])||0;
  return items.every((item:any)=>Number(item[3]||0)===value)?value:0;
}
function defaultBillingItems(order:any){
  const pricing=excursionPricing(order);
  return [[String(order.name||'Excursion'),Math.max(1,Number(order.quantity)||1),pricing.originalCents/100,pricing.discountPercent]];
}

export function excursionPricing(order: any): ExcursionPricing {
  const totalCents = Math.max(0, Math.round(Number(order.cents) || 0));
  if(validBillingItems(order.billingItems)&&billingItemsTotalCents(order.billingItems)===totalCents){
    const originalCents=billingItemsOriginalCents(order.billingItems);
    return {
      originalCents,totalCents,discountCents:Math.max(0,originalCents-totalCents),
      discountPercent:billingItemsUniformDiscount(order.billingItems),
      complimentary:totalCents===0,
      adjusted:order.billingAdjustment?.action!=='restore'
    };
  }
  const saved = order.billingAdjustment;
  // Other bill editors can replace the charge. Never show or reapply stale discounts.
  const valid = saved && saved.totalCents === totalCents &&
    Number.isSafeInteger(saved.originalCents) && saved.originalCents >= totalCents;
  const originalCents = valid ? saved.originalCents : totalCents;
  const discountPercent = valid ? Number(saved.discountPercent) || 0 : 0;
  return {originalCents, totalCents, discountCents: originalCents - totalCents,
    discountPercent, complimentary: !!valid && !!saved.complimentary && totalCents === 0,
    adjusted: !!valid && saved.action !== 'restore'};
}

/** One shared projection for room folios, guest totals and invoice/PDF line items. */
export function excursionFolioBill(order: any) {
  const pricing = excursionPricing(order);
  const items=validBillingItems(order.billingItems)?order.billingItems.map((item:any)=>[String(item[0]),Number(item[1]),Number(item[2]),Number(item[3])]):defaultBillingItems(order);
  return {department: 'Excursions', id: order.id,
    items,
    date:order.billingDate||[order.date||order.schedule?.date||'',order.time||order.schedule?.time||''].filter(Boolean).join(' · '),
    status:order.billingStatus||'Posted',
    revision:Number(order.billingRevision)||0,
    editedAt:order.billingEditedAt||'',
    editedBy:order.billingEditedBy||'',
    ...pricing};
}

function updatePaidCoverage(stay:any,order:any,previousCents:number,totalCents:number){
  if(!stay)return;
  const key='Excursions:'+order.id,covered=stay.paidBills?.[key];
  // Reductions to an already settled bill retain its paid state and create folio credit.
  // Increases never invent a payment: the old coverage remains and the bill becomes due again.
  if(Number.isSafeInteger(covered)&&covered===previousCents&&totalCents<=previousCents)stay.paidBills[key]=totalCents;
}

export function applyExcursionBillEdit(state:any,input:any,actor:ExcursionBillingActor){
  if(actor.role!=='admin')throw new Error('Only Admin can edit excursion bills.');
  if(!input||typeof input.id!=='string'||!Number.isSafeInteger(input.revision)||input.revision<0)throw new Error('Refresh the excursion bill and try again.');
  const order=(state.orders||[]).find((item:any)=>item.id===input.id&&item.kind==='excursion');
  if(!order)throw new Error('Excursion booking not found.');
  const revision=Number(order.billingRevision)||0;
  if(input.revision!==revision)throw new Error('This excursion bill changed elsewhere. Reopen it before saving.');
  if(!validBillingItems(input.items))throw new Error('Check excursion bill items, quantities, amounts and discounts.');
  if(typeof input.date!=='string'||!input.date.trim()||input.date.length>100)throw new Error('Enter a valid bill date.');
  if(!['Posted','Pending','Unpaid'].includes(String(input.status||'')))throw new Error('Use the payment or cancellation workflow to change paid/cancelled status.');

  const items=input.items.map((item:any)=>[String(item[0]).trim(),Number(item[1]),Number(item[2]),Number(item[3])]);
  const totalCents=billingItemsTotalCents(items),originalCents=billingItemsOriginalCents(items);
  if(!Number.isSafeInteger(totalCents)||totalCents<0||totalCents>100000000)throw new Error('The excursion bill total is invalid.');
  const previousCents=Math.max(0,Math.round(Number(order.cents)||0)),now=new Date().toISOString();
  const before={cents:previousCents,billingItems:order.billingItems||null,billingStatus:order.billingStatus||'',billingRevision:revision};

  order.billingItems=items;
  order.cents=totalCents;
  order.billingStatus=String(input.status);
  order.billingDate=String(input.date).trim();
  order.billingRevision=revision+1;
  order.billingEditedAt=now;
  order.billingEditedBy=actor.username;
  order.updatedAt=now;
  order.updatedBy=actor.username;
  order.billingAdjustment={
    action:'edit',
    originalCents,
    discountPercent:billingItemsUniformDiscount(items),
    discountCents:Math.max(0,originalCents-totalCents),
    totalCents,
    complimentary:totalCents===0,
    reason:'Bill edited by Admin',
    at:now,by:actor.username,userId:actor.userId
  };
  order.billingHistory=[...(order.billingHistory||[]),{
    requestId:String(input.requestId||crypto.randomUUID()),action:'edit',at:now,by:actor.username,userId:actor.userId,
    previousCents,totalCents,before,after:{items,status:order.billingStatus,revision:order.billingRevision}
  }];

  const stay=(state.stays||[]).find((item:any)=>item.id===order.stayId);
  updatePaidCoverage(stay,order,previousCents,totalCents);
  if(stay){
    stay.history=[...(stay.history||[]),{date:now,at:now,by:actor.username,action:'excursion-billing',
      detail:order.id+': Excursion bill edited; $'+(previousCents/100).toFixed(2)+' → $'+(totalCents/100).toFixed(2),
      orderId:order.id}];
  }
  return {order,bill:excursionFolioBill(order)};
}

export function applyExcursionBillingAdjustment(state: any, input: any, actor: ExcursionBillingActor) {
  if (actor.role !== 'admin') throw new Error('Only Admin can make excursions free or change discounts.');
  if (!input || typeof input.id !== 'string' || typeof input.requestId !== 'string' ||
      !/^[-a-zA-Z0-9]{12,80}$/.test(input.requestId)) throw new Error('Reopen the billing action and try again.');
  const order = (state.orders || []).find((o: any) => o.id === input.id && o.kind === 'excursion');
  if (!order) throw new Error('Excursion booking not found.');
  const previous = (order.billingHistory || []).find((entry: any) => entry.requestId === input.requestId);
  if (previous) {
    if (previous.userId !== actor.userId || previous.action !== input.action ||
        previous.reason !== String(input.reason || '').trim() ||
        (input.action === 'discount' && previous.discountPercent !== input.discountPercent)) {
      throw new Error('This request was already used. Reopen the billing action and try again.');
    }
    return {order, duplicate: true};
  }
  if (['cancelled', 'canceled', 'declined', 'rejected'].includes(String(order.status || '').toLowerCase()) ||
      ['pending', 'declined', 'rejected'].includes(String(order.approvalStatus || '').toLowerCase())) {
    throw new Error('Only confirmed, non-cancelled excursion bookings can be adjusted.');
  }
  if (!['free', 'discount', 'restore'].includes(input.action)) throw new Error('Choose a valid billing action.');
  if (typeof input.reason !== 'string' || input.reason.length > 500) throw new Error('Keep the reason under 500 characters.');

  const currentCents=Math.max(0,Math.round(Number(order.cents)||0));
  const currentItems=validBillingItems(order.billingItems)&&billingItemsTotalCents(order.billingItems)===currentCents
    ?order.billingItems.map((item:any)=>[String(item[0]),Number(item[1]),Number(item[2]),Number(item[3])])
    :defaultBillingItems(order);
  const pricing = excursionPricing(order);
  if (!Number.isSafeInteger(order.cents) || order.cents < 0 || pricing.originalCents > 100000000) {
    throw new Error('The excursion amount is invalid. Review the bill before changing it.');
  }
  let percent = input.action === 'free' ? 100 : 0;
  if (input.action === 'discount') {
    if (typeof input.discountPercent !== 'number' || !Number.isFinite(input.discountPercent) ||
        input.discountPercent <= 0 || input.discountPercent > 100 ||
        Math.abs(input.discountPercent * 100 - Math.round(input.discountPercent * 100)) > 0.000001) {
      throw new Error('Enter a discount greater than 0% and no more than 100%, with up to two decimal places.');
    }
    percent = input.discountPercent;
  }
  const baseItems=currentItems.map((item:any)=>[item[0],item[1],item[2],percent]);
  const totalCents=billingItemsTotalCents(baseItems),originalCents=billingItemsOriginalCents(baseItems);
  const now = new Date().toISOString(),previousCents=Math.max(0,Math.round(Number(order.cents)||0));
  const adjustment = {action: input.action, originalCents, discountPercent: percent,
    discountCents: originalCents - totalCents, totalCents,
    complimentary: input.action === 'free' || percent === 100,
    reason: input.reason.trim(), at: now, by: actor.username, userId: actor.userId};
  const entry = {...adjustment, requestId: input.requestId, previousCents};
  order.billingItems=baseItems;
  order.cents = totalCents;
  order.billingAdjustment = adjustment;
  order.billingRevision=(Number(order.billingRevision)||0)+1;
  order.billingEditedAt=now;order.billingEditedBy=actor.username;
  order.billingHistory = [...(order.billingHistory || []), entry];
  order.updatedAt = now; order.updatedBy = actor.username;
  const stay = (state.stays || []).find((s: any) => s.id === order.stayId);
  updatePaidCoverage(stay,order,previousCents,totalCents);
  if (stay) {
    const detail = `${order.id}: ${input.action === 'free' ? 'Made free' : input.action === 'restore' ? 'Original price restored' : percent + '% discount'}; $${(previousCents / 100).toFixed(2)} → $${(totalCents / 100).toFixed(2)}${adjustment.reason ? ' · ' + adjustment.reason : ''}`;
    stay.history = [...(stay.history || []), {date: now, at: now, by: actor.username,
      action: 'excursion-billing', detail, orderId: order.id, requestId: input.requestId}];
  }
  return {order, duplicate: false};
}
