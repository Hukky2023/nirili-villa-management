export type BuggyWhatsAppEvent='general'|'on-the-way'|'arrived'|'return-arrived';

export function normalizeBuggyWhatsAppPhone(value:any){
 let digits=String(value||'').replace(/\D/g,'').replace(/^00/,'');
 if(digits.length===7)digits='960'+digits;
 return /^[1-9]\d{7,14}$/.test(digits)?digits:'';
}

function place(pickup:any){
 const location=String(pickup?.location||'').trim();
 const room=String(pickup?.room||'').trim();
 return location+(room?' · Room '+room:'');
}

export function buildBuggyDriverWhatsAppMessage(pickup:any,event:BuggyWhatsAppEvent,driverName='Buggy Driver'){
 const guest=String(pickup?.guest||'Guest').trim()||'Guest';
 const driver=String(pickup?.driver||driverName||'Buggy Driver').trim()||'Buggy Driver';
 const buggy=String(pickup?.buggyName||'').trim();
 const pickupPoint=place(pickup)||'your pickup point';
 const destination=String(pickup?.destination||'').trim();
 const pickupTime=String(pickup?.pickupTime||'').trim();
 const lines=['Nirili Villa · Buggy','','Hello '+guest+','];

 if(event==='on-the-way')lines.push('Your buggy driver '+driver+' is on the way to pick you up.');
 else if(event==='arrived')lines.push('Your buggy has arrived at '+pickupPoint+'. Please come to the pickup point.');
 else if(event==='return-arrived')lines.push('Your buggy has arrived for the return pickup at '+pickupPoint+'.');
 else lines.push('This is '+driver+' from Nirili Villa regarding your buggy pickup.');

 if(event!=='arrived'&&event!=='return-arrived')lines.push('Pickup: '+pickupPoint);
 if(pickupTime)lines.push('Pickup time: '+pickupTime);
 if(destination)lines.push('Destination: '+destination);
 if(buggy)lines.push('Buggy: '+buggy);
 lines.push('','Please reply here if you need any help.');
 return lines.join('\n');
}

export function buggyDriverWhatsAppUrl(pickup:any,event:BuggyWhatsAppEvent='general',driverName='Buggy Driver'){
 const phone=normalizeBuggyWhatsAppPhone(pickup?.phone);
 if(!phone)return '';
 return 'https://wa.me/'+phone+'?text='+encodeURIComponent(buildBuggyDriverWhatsAppMessage(pickup,event,driverName));
}
