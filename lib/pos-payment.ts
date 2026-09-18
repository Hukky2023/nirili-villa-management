export function changePOSPayment(state:any,o:any,b:any,username:string){
 if(!['Cash','Card','Bank transfer','Room'].includes(b.method))throw Error('Choose cash, card, bank transfer or room charge.');
 if(o.method===b.method)return;
 const date=new Date().toISOString(),previous=o.method||'Unpaid';
 let s=state.stays.find((s:any)=>s.id===o.stayId);
 if(s&&s.status!=='In House')throw Error('This stay is closed. Review the room folio with Admin before changing payment.');
 if(s?.paidBills?.['Restaurant:'+o.id]===o.cents&&o.cents>0)throw Error('This bill was settled through the room folio. Reverse that settlement in booking details before changing its payment method.');
 if(b.method==='Room'&&!s){s=state.stays.find((s:any)=>s.id===b.stayId&&s.status==='In House');if(!s)throw Error('Select a checked-in room.');}
 if(s){s.posBills??=[];s.payments??=[];s.history??=[];
  if(['Cash','Card','Bank transfer'].includes(previous)&&o.stayId){
   const paid=s.payments.filter((p:any)=>p.reference===o.id&&['Cash','Card','Bank transfer'].includes(p.method)&&!p.reversedAt&&p.cents>=0);
   if(o.cents>0&&paid.reduce((n:number,p:any)=>n+p.cents,0)!==o.cents)throw Error('Payment records do not match this bill. Ask Admin to review them.');
   for(const p of paid){p.reversedAt=date;p.reversedBy=username;s.payments.push({id:crypto.randomUUID(),cents:-p.cents,method:'Payment reversal',reference:o.id,reverses:p.id,date,by:username});}
  }
  let bill=s.posBills.find((x:any)=>x.id===o.id);
  if(!bill){if(o.stayId)throw Error('Linked room bill is missing. Refresh and try again.');bill={department:'Restaurant',id:o.id,items:o.items.map((i:any)=>[i.name,i.quantity,i.unitCents*i.quantity/100,i.discount||0]),totalCents:o.cents};s.posBills.push(bill);}
  o.stayId=s.id;o.room=s.room;o.customer=s.guest;
  delete s.paidBills?.['Restaurant:'+o.id];
  bill.status=b.method==='Room'?'Posted':'Paid';bill.settledAtPOS=b.method!=='Room';
  if(b.method!=='Room')s.payments.push({id:crypto.randomUUID(),cents:o.cents,method:b.method,reference:o.id,date,by:username,...(['Cash','Card'].includes(b.method)?{currency:['MVR','EUR'].includes(b.currency)?b.currency:'USD',...(b.currency==='MVR'?{exchangeRate:Number(b.exchangeRate)||0,paidMvr:Number(b.paidMvr)||0}:b.currency==='EUR'?{exchangeRate:Number(b.exchangeRate)||0,paidEur:Number(b.paidEur)||0}:{})}:{})});
  s.history.unshift({date,by:username,detail:'Restaurant bill '+o.id+' payment changed: '+previous+' → '+b.method});
 }
 o.method=b.method;o.paidAt=b.method==='Room'?null:date;
 if(['Cash','Card'].includes(b.method)){
  o.paymentCurrency=['MVR','EUR'].includes(b.currency)?b.currency:'USD';
  if(o.paymentCurrency==='MVR'){o.exchangeRate=Number(b.exchangeRate)||0;o.paidMvr=Number(b.paidMvr)||0;delete o.paidEur;}
  else if(o.paymentCurrency==='EUR'){o.exchangeRate=Number(b.exchangeRate)||0;o.paidEur=Number(b.paidEur)||0;delete o.paidMvr;}
  else{delete o.exchangeRate;delete o.paidMvr;delete o.paidEur;}
 }else{delete o.paymentCurrency;delete o.exchangeRate;delete o.paidMvr;delete o.paidEur;}
 if(b.method==='Bank transfer'){o.bankName=String(b.bankName||'');o.bankAccountName=String(b.accountName||'');o.bankAccountNumber=String(b.accountNumber||'');}
 else{delete o.bankName;delete o.bankAccountName;delete o.bankAccountNumber;}
 o.history??=[];o.history.push({date,by:username,detail:'Payment changed: '+previous+' → '+b.method+(['Cash','Card'].includes(b.method)&&b.currency==='MVR'?' · MVR '+Number(b.paidMvr||0).toFixed(2)+' @ '+Number(b.exchangeRate||0):['Cash','Card'].includes(b.method)&&b.currency==='EUR'?' · EUR '+Number(b.paidEur||0).toFixed(2)+' @ '+Number(b.exchangeRate||0):''),cents:o.cents});
}
