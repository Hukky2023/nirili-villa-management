import {roomRates, type RoomRates} from './room-rates.ts';

export const childAges = Array.from({length: 13}, (_, age) => age);

export function childAge(value: unknown): number | null {
 const age = typeof value === 'string' && /^\d{1,2}$/.test(value) ? Number(value) : value;
 return typeof age === 'number' && childAges.includes(age) ? age : null;
}

type Excursion = {cents: number; pricingUnit?: string};
type Commission = {roomDiscountPercent: number; excursionDiscountPercent: number; transferDiscountPercent: number};
type QuoteInput = {
 adults: number;
 childAges: number[];
 nights: number;
 meal: string;
 rates?: RoomRates;
 excursions: Excursion[];
 transfer: string;
 commission: Commission;
};

export function discountedCents(cents:number, percent:number) {
 return Math.max(0,Math.round(Math.max(0,Number(cents)||0)*(100-Math.max(0,Math.min(100,Number(percent)||0)))/100));
}

// Occupancy prices are whole-room tariffs. Children under three add nothing.
// For older children, halve the extra charge after applying the agent commission.
function familyCharge(adultsCost: number, withChildrenCost: number, percent: number) {
 return Math.round((discountedCents(adultsCost, percent) + discountedCents(withChildrenCost, percent)) / 2);
}

export const airportTransferCents = 3000;

export function partnerPackagePrice(input: QuoteInput) {
 const {adults, childAges: ages, nights, meal, excursions, commission} = input;
 const chargeableGuests = adults + ages.filter(age => age >= 3).length;
 const nightly = roomRates(input.rates)[meal] || [];
 const roomFor = (count: number) => (nightly[count - 1] ?? 0) * nights;
 const excursionsFor = (count: number) => excursions.reduce((sum, item) =>
  sum + item.cents * (item.pricingUnit === 'couple' ? Math.ceil(count / 2) : count), 0);
 const adultRoom = roomFor(adults), fullRoom = roomFor(chargeableGuests);
 const adultTrips = excursionsFor(adults), fullTrips = excursionsFor(chargeableGuests);
 const roomCents = familyCharge(adultRoom, fullRoom, commission.roomDiscountPercent);
 const excursionCents = familyCharge(adultTrips, fullTrips, commission.excursionDiscountPercent);
 const legs = input.transfer === 'return' ? 2 : input.transfer === 'arrival' ? 1 : 0;
 const publicTransferCents = airportTransferCents * (adults + ages.length) * legs;
 const transferCents = discountedCents(publicTransferCents, commission.transferDiscountPercent);
 return {
  publicRoomCents: familyCharge(adultRoom, fullRoom, 0), roomCents, roomDiscountPercent: commission.roomDiscountPercent,
  publicExcursionCents: familyCharge(adultTrips, fullTrips, 0), excursionCents, excursionDiscountPercent: commission.excursionDiscountPercent,
  publicTransferCents, transferCents, transferDiscountPercent: commission.transferDiscountPercent,
  totalCents: roomCents + excursionCents + transferCents,
 };
}
