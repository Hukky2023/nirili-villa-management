import {isConfirmedExcursion, toConfirmedExcursionBooking} from './excursion-bookings';
import type {ConfirmedExcursionBooking} from './excursion-bookings';

export type ManifestSchedule = {
  id: string; name: string; date: string; time: string; endTime?: string; capacity: number;
  status?: string; tripStatus?: string; vesselId?: string; crewIds?: string[]; sharedGroup?: string; notes?: string;
};
export type ExcursionManifest = {
  trip: {id: string; name: string; date: string; time: string; endTime: string; status: string; tripStatus: string; vessel: string; crew: string[]; notes: string};
  bookings: ConfirmedExcursionBooking[];
  totals: {bookings: number; pax: number; mainVesselPax: number; extraVesselPax: number; boatPax: number; capacity: number; sharedTrips: number};
};

const text = (value: unknown) => typeof value === 'string' ? value.trim() : '';
function combinedTripStatus(value:unknown){
 const status=text(value);
 if(status==='Guests boarded'||status==='Departed'||status==='Guests boarded & Departed')return 'Guests boarded & Departed';
 if(status==='Arrived'||status==='Completed'||status==='Arrived & Completed')return 'Arrived & Completed';
 return status||'Excursion scheduled';
}
const count = (value: unknown) => Number.isFinite(Number(value)) ? Math.max(0, Math.trunc(Number(value))) : 0;
const departureKey = (date: unknown, time: unknown, name: unknown) => JSON.stringify([
  text(date), text(time), text(name).replace(/\s+/g, ' ').toLowerCase(),
]);
const boatKey = (s: ManifestSchedule) => s.sharedGroup
  ? JSON.stringify([s.date, s.time, 'group', s.sharedGroup])
  : s.vesselId ? JSON.stringify([s.date, s.time, 'vessel', s.vesselId]) : '';

const isCancelledSchedule = (schedule: ManifestSchedule) => ['cancelled', 'canceled'].includes(text(schedule.status).toLowerCase());

/** Read-only manifest. Match explicit schedule IDs within the booked date, never across days. */
export function buildExcursionManifest(
  selected: ManifestSchedule, schedules: ManifestSchedule[],
  state: {orders?: any[]; stays?: any[]},
  resources: {vessels: any[]; crew: any[]}, isPaid: (order: any) => boolean,
  scope: 'trip' | 'departure' = 'trip',
): ExcursionManifest {
  // Standard daily schedules intentionally reuse the same schedule id on different dates.
  // Resolve a booking by schedule id + booked date so guests from another day never leak
  // into this manifest.
  // The timetable filters cancelled rows before calling us, while View loads the full
  // day's records. Apply the same filter here so both callers resolve the same guests.
  const activeSchedules = schedules.filter(s => !isCancelledSchedule(s));
  const byIdDate = new Map(activeSchedules.map(s => [JSON.stringify([s.date, s.id]), s]));
  const byId = new Map<string, ManifestSchedule[]>();
  for (const s of activeSchedules) byId.set(s.id, [...(byId.get(s.id) || []), s]);
  const byDeparture = new Map<string, ManifestSchedule[]>();
  for (const s of activeSchedules) {
    const key = departureKey(s.date, s.time, s.name);
    byDeparture.set(key, [...(byDeparture.get(key) || []), s]);
  }
  const key = boatKey(selected);
  const shared = isCancelledSchedule(selected) ? [] : key ? activeSchedules.filter(s => boatKey(s) === key) : [selected];
  const boatIds = new Set(shared.map(s => s.id));
  const stays = new Map((state.stays || []).map(s => [s.id, s]));
  const bookings: ConfirmedExcursionBooking[] = [];
  const seenBookingIds = new Set<string>();
  let boatPax = 0;

  for (const order of state.orders || []) {
    if (!isConfirmedExcursion(order)) continue;
    const bookedDate = text(order.date) || text(order.schedule?.date);
    if (bookedDate && bookedDate !== text(selected.date)) continue;
    let schedule: ManifestSchedule | undefined;
    if (text(order.scheduleId)) {
      schedule = bookedDate ? byIdDate.get(JSON.stringify([bookedDate, text(order.scheduleId)])) : undefined;
      // Only undated legacy records may use a unique-ID fallback. A known date
      // must never fall back to the same repeating daily ID on a different date.
      if (!bookedDate) {
        const idMatches = byId.get(text(order.scheduleId)) || [];
        if (idMatches.length === 1) schedule = idMatches[0];
      }
    } else {
      const stored = order.schedule || {};
      const matches = byDeparture.get(departureKey(bookedDate, text(order.time) || text(stored.time), order.name)) || [];
      if (matches.length === 1) schedule = matches[0];
      else if (text(stored.vesselId)) {
        const sameVessel = matches.filter(s => s.vesselId === stored.vesselId);
        // Ambiguous legacy records must never appear on more than one manifest.
        if (sameVessel.length === 1) schedule = sameVessel[0];
      }
    }
    if (!schedule) continue;
    const bookingId = text(order.id);
    if (bookingId && seenBookingIds.has(bookingId)) continue;
    const onSharedScheduledBoat = boatIds.has(schedule.id) && schedule.date === selected.date && !order.separateVessel;
    if (onSharedScheduledBoat) {
      if (bookingId) seenBookingIds.add(bookingId);
      // Count all seats on the shared boat, but keep View on the selected trip.
      // Only the server's physical-departure attendance checks request the full roster.
      boatPax += count(order.quantity);
      if (scope === 'departure' || schedule.id === selected.id) {
        bookings.push(toConfirmedExcursionBooking(order, stays.get(order.stayId), schedule, resources, isPaid(order)));
      }
    } else if (schedule.id === selected.id && schedule.date === selected.date && order.separateVessel) {
      if (bookingId) seenBookingIds.add(bookingId);
      // Keep extra-vessel bookings for the selected excursion visible, while the scheduled
      // boat passenger total stays aligned with the timetable occupancy.
      bookings.push(toConfirmedExcursionBooking(order, stays.get(order.stayId), schedule, resources, isPaid(order)));
    }
  }
  bookings.sort((a, b) => a.guest.localeCompare(b.guest) || a.id.localeCompare(b.id));
  const pax = bookings.reduce((sum, b) => sum + b.guests, 0);
  const extraVesselPax = bookings.filter(b => b.separateVessel).reduce((sum, b) => sum + b.guests, 0);
  return {
    trip: {
      id: selected.id, name: selected.name, date: selected.date, time: selected.time, endTime: text(selected.endTime),
      status: text(selected.status) || 'Open',
      tripStatus: combinedTripStatus(selected.tripStatus),
      vessel: text(resources.vessels.find(v => v.id === selected.vesselId)?.name) || 'Not assigned',
      crew: (selected.crewIds || []).map(id => text(resources.crew.find(c => c.id === id)?.name) || 'Unknown crew member'),
      notes: text(selected.notes),
    },
    bookings,
    totals: {
      bookings: bookings.length, pax, mainVesselPax: pax - extraVesselPax, extraVesselPax, boatPax,
      capacity: Math.min(...(shared.length ? shared : [selected]).map(s => count(s.capacity))),
      sharedTrips: Math.max(1, shared.length),
    },
  };
}
