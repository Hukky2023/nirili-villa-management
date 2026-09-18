import {buildExcursionManifest} from './excursion-manifest';
import type {ManifestSchedule} from './excursion-manifest';

export type TimetableVessel = {vessel: string; crew: string[]; pax: number};
export type TimetableTrip = {
  id: string; name: string; time: string; status: string;
  confirmedPax: number; mainVesselPax: number; vessel: string; crew: string[];
  extraVessels: TimetableVessel[]; sharedTrips: number; sharedBoatPax: number; capacity: number;
};
export type ExcursionTimetable = {
  date: string; generatedAt: string; trips: TimetableTrip[];
  totals: {trips: number; bookings: number; pax: number};
};

export function isTimetableDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(value + 'T00:00:00Z');
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

/** Aggregate only: no guest identities, contacts, payments or booking notes leave this projection. */
export function buildExcursionTimetable(
  date: string, schedules: ManifestSchedule[],
  state: {orders?: any[]; stays?: any[]}, resources: {vessels: any[]; crew: any[]},
  generatedAt = new Date().toISOString(),
): ExcursionTimetable {
  if (!isTimetableDate(date)) throw new Error('Choose a valid timetable date.');
  const day = schedules.filter(s => s.date === date)
    .sort((a, b) => a.time.localeCompare(b.time) || a.name.localeCompare(b.name) || a.id.localeCompare(b.id));
  let bookings = 0;
  const trips = day.map(schedule => {
    // Reuse View/Guest list's confirmation and legacy-record matching rules.
    const manifest = buildExcursionManifest(schedule, day, state, resources, () => false);
    bookings += manifest.totals.bookings;
    const extras = new Map<string, TimetableVessel>();
    for (const booking of manifest.bookings) {
      if (!booking.separateVessel) continue;
      const crew = [...new Set(booking.crew)].sort();
      const key = JSON.stringify([booking.vessel, crew]);
      const group = extras.get(key) || {vessel: booking.vessel, crew, pax: 0};
      group.pax += booking.guests;
      extras.set(key, group);
    }
    return {
      id: schedule.id, name: manifest.trip.name, time: manifest.trip.time, status: manifest.trip.status,
      confirmedPax: manifest.totals.pax, mainVesselPax: manifest.totals.mainVesselPax,
      vessel: manifest.trip.vessel, crew: manifest.trip.crew,
      extraVessels: [...extras.values()].sort((a, b) => a.vessel.localeCompare(b.vessel)),
      sharedTrips: manifest.totals.sharedTrips, sharedBoatPax: manifest.totals.boatPax,
      capacity: manifest.totals.capacity,
    };
  });
  return {date, generatedAt, trips, totals: {trips: trips.length, bookings, pax: trips.reduce((sum, trip) => sum + trip.confirmedPax, 0)}};
}

export function timetableDateLabel(date: string): string {
  return isTimetableDate(date)
    ? new Intl.DateTimeFormat('en-GB', {timeZone: 'Indian/Maldives', weekday: 'long', day: 'numeric', month: 'long', year: 'numeric'}).format(new Date(date + 'T00:00:00Z'))
    : date;
}
export function timetableSnapshotLabel(value: string): string {
  const date = new Date(value);
  return Number.isFinite(date.getTime())
    ? new Intl.DateTimeFormat('en-GB', {timeZone: 'Indian/Maldives', dateStyle: 'medium', timeStyle: 'short', hour12: false}).format(date)
    : 'Unknown';
}
const inline = (value: string) => value.replace(/\s+/g, ' ').trim();
const crewLabel = (crew: string[]) => crew.length ? crew.map(inline).join(', ') : 'Not assigned';

/** Plain text is portable between the native share sheet, WhatsApp and clipboard. */
export function formatExcursionTimetable(data: ExcursionTimetable): string {
  const lines = ['NIRILI VILLA | EXCURSION TIMETABLE', timetableDateLabel(data.date), 'All departure times: Maldives time (UTC+5)', ''];
  for (const trip of data.trips) {
    lines.push(`${trip.time} | ${inline(trip.name)}`, `Confirmed pax: ${trip.confirmedPax}`,
      `Assigned vessel: ${inline(trip.vessel)}`, `Assigned crew: ${crewLabel(trip.crew)}`);
    if (trip.status !== 'Open') lines.push(`Booking status: ${inline(trip.status)}`);
    if (trip.sharedTrips > 1) lines.push(`Shared boat: ${trip.sharedBoatPax} / ${trip.capacity} pax across ${trip.sharedTrips} trips (combined, not extra pax).`);
    if (trip.extraVessels.length) {
      lines.push(`Main vessel pax for this trip: ${trip.mainVesselPax}`);
      for (const extra of trip.extraVessels) lines.push(`Extra vessel: ${inline(extra.vessel)} | ${extra.pax} confirmed pax | Crew: ${crewLabel(extra.crew)}`);
    }
    lines.push('');
  }
  if (!data.trips.length) lines.push('No scheduled trips for this date.', '');
  lines.push(`Scheduled trips: ${data.totals.trips}`, `Total confirmed passenger places: ${data.totals.pax}`,
    'Totals count passenger places across trips, not unique people. Extra-vessel pax are included; pending and cancelled bookings are excluded.',
    `Snapshot: ${timetableSnapshotLabel(data.generatedAt)} Maldives time. Assignments may change.`);
  return lines.join('\n');
}
