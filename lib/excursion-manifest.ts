import {isConfirmedExcursion, toConfirmedExcursionBooking} from './excursion-bookings';
import type {ConfirmedExcursionBooking} from './excursion-bookings';

export type ManifestSchedule = {
  id: string; name: string; date: string; time: string; capacity: number;
  status?: string; vesselId?: string; crewIds?: string[]; sharedGroup?: string; notes?: string;
};
export type ExcursionManifest = {
  trip: {id: string; name: string; date: string; time: string; status: string; vessel: string; crew: string[]; notes: string};
  bookings: ConfirmedExcursionBooking[];
  totals: {bookings: number; pax: number; mainVesselPax: number; extraVesselPax: number; boatPax: number; capacity: number; sharedTrips: number};
};

const text = (value: unknown) => typeof value === 'string' ? value.trim() : '';
const count = (value: unknown) => Number.isFinite(Number(value)) ? Math.max(0, Math.trunc(Number(value))) : 0;
const departureKey = (date: unknown, time: unknown, name: unknown) => JSON.stringify([
  text(date), text(time), text(name).replace(/\s+/g, ' ').toLowerCase(),
]);
const boatKey = (s: ManifestSchedule) => s.sharedGroup
  ? JSON.stringify([s.date, s.time, 'group', s.sharedGroup])
  : s.vesselId ? JSON.stringify([s.date, s.time, 'vessel', s.vesselId]) : '';

/** Read-only manifest. An explicit schedule ID always wins over names and dates. */
export function buildExcursionManifest(
  selected: ManifestSchedule, schedules: ManifestSchedule[],
  state: {orders?: any[]; stays?: any[]},
  resources: {vessels: any[]; crew: any[]}, isPaid: (order: any) => boolean,
): ExcursionManifest {
  const byId = new Map(schedules.map(s => [s.id, s]));
  const byDeparture = new Map<string, ManifestSchedule[]>();
  for (const s of schedules) {
    const key = departureKey(s.date, s.time, s.name);
    byDeparture.set(key, [...(byDeparture.get(key) || []), s]);
  }
  const key = boatKey(selected);
  const shared = key ? schedules.filter(s => boatKey(s) === key) : [selected];
  const boatIds = new Set(shared.map(s => s.id));
  const stays = new Map((state.stays || []).map(s => [s.id, s]));
  const bookings: ConfirmedExcursionBooking[] = [];
  let boatPax = 0;

  for (const order of state.orders || []) {
    if (!isConfirmedExcursion(order)) continue;
    let schedule: ManifestSchedule | undefined;
    if (text(order.scheduleId)) {
      schedule = byId.get(text(order.scheduleId));
    } else {
      const stored = order.schedule || {};
      const matches = byDeparture.get(departureKey(stored.date || order.date, stored.time || order.time, order.name)) || [];
      if (matches.length === 1) schedule = matches[0];
      else if (text(stored.vesselId)) {
        const sameVessel = matches.filter(s => s.vesselId === stored.vesselId);
        // Ambiguous legacy records must never appear on more than one manifest.
        if (sameVessel.length === 1) schedule = sameVessel[0];
      }
    }
    if (!schedule) continue;
    if (boatIds.has(schedule.id) && !order.separateVessel) boatPax += count(order.quantity);
    if (schedule.id === selected.id) {
      bookings.push(toConfirmedExcursionBooking(order, stays.get(order.stayId), schedule, resources, isPaid(order)));
    }
  }
  bookings.sort((a, b) => a.guest.localeCompare(b.guest) || a.id.localeCompare(b.id));
  const pax = bookings.reduce((sum, b) => sum + b.guests, 0);
  const extraVesselPax = bookings.filter(b => b.separateVessel).reduce((sum, b) => sum + b.guests, 0);
  return {
    trip: {
      id: selected.id, name: selected.name, date: selected.date, time: selected.time,
      status: text(selected.status) || 'Open',
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
