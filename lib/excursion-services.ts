const normalize=(value:any)=>String(value||'').trim().replace(/\s+/g,' ').toLowerCase();

export const ROMANTIC_BEACH_DINNER_ID='romantic-beach-dinner';
export const ROMANTIC_BEACH_DINNER_SERVICE='romantic-beach-dinner';

export function isRomanticBeachDinner(value:any){
 const id=normalize(value?.menuItemId||value?.itemId||value?.id);
 const name=normalize(value?.name||value);
 return id===ROMANTIC_BEACH_DINNER_ID||name==='romantic beach dinner';
}
