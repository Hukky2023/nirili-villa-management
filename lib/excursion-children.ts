export type ExcursionGuestMix={adults:number;children:number;infants:number;total:number};

const whole=(value:any)=>Number.isInteger(Number(value))?Number(value):NaN;

export function excursionGuestMix(input:any,fallbackQuantity=1,max=100):ExcursionGuestMix{
 const hasBreakdown=input?.adults!==undefined||input?.children!==undefined||input?.infants!==undefined;
 if(!hasBreakdown){
  const total=whole(fallbackQuantity);
  if(!Number.isInteger(total)||total<1||total>max)throw Error('Enter a valid number of guests.');
  return {adults:total,children:0,infants:0,total};
 }
 const adults=whole(input?.adults??0),children=whole(input?.children??0),infants=whole(input?.infants??0);
 if([adults,children,infants].some(v=>!Number.isInteger(v)||v<0))throw Error('Check adult and child guest numbers.');
 const total=adults+children+infants;
 if(total<1||total>max)throw Error('At least 1 guest is required.');
 return {adults,children,infants,total};
}

export function excursionPriceCents(unitPriceCents:number,pricingUnit:string|undefined,mix:ExcursionGuestMix){
 const unit=Math.max(0,Math.round(Number(unitPriceCents)||0));
 if(pricingUnit==='couple')return unit*Math.ceil(Math.max(1,mix.total)/2);
 return Math.round(unit*(mix.adults+mix.children*0.5));
}

export function excursionChildPolicyText(){
 return 'Children under 3 years are free. Children aged 3–11 years receive 50% off. Guests aged 12+ are charged the adult price.';
}
