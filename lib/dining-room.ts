// Resolve the assignment from the authenticated account, never a client room number.
export function diningRoom(stays:any[],user:{userId:string;username:string}){
 const own=stays.filter(s=>s.accountId===user.userId);
 const active=own.filter(s=>s.status==='In House');
 const candidates=active.length?active:own.filter(s=>s.status==='Confirmed');
 if(candidates.length===1)return candidates[0];
 const matching=candidates.filter(s=>String(s.room)===user.username);
 return matching.length===1?matching[0]:null;
}

export function diningOrderRoom(stays:any[],user:{userId:string;username:string},expectedStay?:string){
 const stay=diningRoom(stays,user);
 if(!stay||stay.status!=='In House')throw Error('Ordering is available after check-in. Please contact reception.');
 if(expectedStay!==undefined&&expectedStay!==stay.id)throw Error('Your room assignment changed. Refresh the menu before ordering.');
 return stay;
}
