export type RoomRates=Record<string,number[]>;
export const defaultRoomRates:RoomRates={
 'Bed & Breakfast':[5000,6000,7000],
 'Half Board':[7000,8000,9000],
 'Full Board':[8000,10000,12000]
};
export function roomRates(value?:RoomRates):RoomRates{
 return Object.fromEntries(Object.entries(defaultRoomRates).map(([plan,defaults])=>[plan,defaults.map((fallback,index)=>{
  const amount=value?.[plan]?.[index];
  return Number.isInteger(amount)&&Number(amount)>=0&&Number(amount)<=1000000?Number(amount):fallback;
 })]));
}
export function validateRoomRates(value:any):RoomRates{
 if(!value||Object.keys(defaultRoomRates).some(plan=>!Array.isArray(value[plan])||value[plan].length!==3||value[plan].some((amount:any)=>!Number.isInteger(amount)||amount<0||amount>1000000)))throw Error('Enter each nightly rate between $0 and $10,000.');
 return roomRates(value);
}


export type RoomRatePeriod={id?:string;validFrom:string;validTo:string;rates:RoomRates};
export function roomRatesForDate(base?:RoomRates,periods?:RoomRatePeriod[],date?:string):RoomRates{
 const fallback=roomRates(base);
 if(!date||!/^\d{4}-\d{2}-\d{2}$/.test(date)||!Array.isArray(periods))return fallback;
 const period=periods.find(item=>item&&item.validFrom<=date&&item.validTo>=date);
 return period?roomRates(period.rates):fallback;
}
