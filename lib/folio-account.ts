// Folios use room numbers for legacy stays and booking references for new stays.
export function validFolioAccount(value:unknown,stays:any[]){
 if(typeof value!=='string'||!value||value.length>80)return false;
 if(/^(?:10[1-6]|20[1-4]|30[1-4])$/.test(value))return true;
 return stays.some(stay=>String(stay.billRoom||stay.room)===value);
}
