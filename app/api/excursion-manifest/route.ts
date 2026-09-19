import {authDb, currentUser, hasPermission, sameOrigin} from '../../../lib/auth';
import {loadStays} from '../../../lib/stays';
import {saveStayAccess} from '../../../lib/stay-login';
import {excursionPaid, excursionResources} from '../../../lib/excursion-workflow';
import {assertGuideRule, guideRuleFor} from '../../../lib/excursion-guides';
import {isDroneRequiredTrip, isSnorkelingTrip} from '../../../lib/excursion-operations';
import {buildExcursionManifest} from '../../../lib/excursion-manifest';
import type {ManifestSchedule} from '../../../lib/excursion-manifest';

const headers = {'Cache-Control': 'private, no-store', 'Vary': 'Cookie'};
const prefix = 'excursion-schedule:';
const validDate = (value: string) => /^\d{4}-\d{2}-\d{2}$/.test(value);
const tripStatuses = ['Excursion scheduled', 'Guests boarded', 'Departed', 'Arrived', 'Completed'] as const;
type TripStatus = typeof tripStatuses[number];
const text = (value: unknown) => typeof value === 'string' ? value.trim() : '';
const cleanName = (value: unknown) => text(value).replace(/\s+/g, ' ').slice(0, 100);
const tripStatusOf = (schedule: any): TripStatus => tripStatuses.includes(schedule?.tripStatus) ? schedule.tripStatus : 'Excursion scheduled';
const departureKey = (schedule: any) => schedule.sharedGroup
  ? JSON.stringify([schedule.date, schedule.time, 'group', schedule.sharedGroup])
  : schedule.vesselId ? JSON.stringify([schedule.date, schedule.time, 'vessel', schedule.vesselId])
    : JSON.stringify([schedule.date, schedule.time, 'schedule', schedule.id]);

async function dateRows(date: string) {
  const result = await authDb().prepare('SELECT key,payload,revision FROM operation_records WHERE key LIKE ?')
    .bind(prefix + date + ':%').all<any>();
  return (result.results || []).map((row: any) => ({
    ...JSON.parse(row.payload), _key: row.key, _revision: Number(row.revision) || 1,
  }));
}

function schedulesOnly(rows: any[]): ManifestSchedule[] {
  return rows.map(({_key, _revision, ...schedule}) => schedule);
}

function manifestFor(selected: any, schedules: ManifestSchedule[], state: any) {
  return buildExcursionManifest(selected, schedules, state, excursionResources(state), order => excursionPaid(order, state));
}

/** Staff-only guest manifest for one physical excursion departure. */
export async function GET(request: Request) {
  try {
    const user = await currentUser();
    if (!hasPermission(user, 'edit_excursions')) {
      return Response.json({error: 'Excursion access is required.'}, {status: 403, headers});
    }
    const url = new URL(request.url);
    const scheduleId = url.searchParams.get('scheduleId')?.trim() || '';
    const date = url.searchParams.get('date')?.trim() || '';
    if (!scheduleId || scheduleId.length > 160 || !validDate(date)) {
      return Response.json({error: 'Choose a scheduled excursion and date.'}, {status: 400, headers});
    }
    const [{state}, rows] = await Promise.all([loadStays(), dateRows(date)]);
    const schedules = schedulesOnly(rows);
    const selected = schedules.find(s => s.id === scheduleId && s.date === date);
    if (!selected) {
      return Response.json({error: 'This scheduled excursion no longer exists. Refresh the schedule.'}, {status: 404, headers});
    }
    return Response.json({manifest: manifestFor(selected, schedules, state)}, {headers});
  } catch {
    return Response.json({error: 'Could not load the excursion guest list. Please try again.'}, {status: 503, headers});
  }
}

export async function PATCH(request: Request) {
  const user = await currentUser();
  if (!hasPermission(user, 'edit_excursions') || !sameOrigin(request)) {
    return Response.json({error: 'Excursion editing permission is required.'}, {status: 403, headers});
  }
  try {
    const body = await request.json();
    const action = String(body.action || '');
    const scheduleId = String(body.scheduleId || '').trim().slice(0, 160);
    const date = String(body.date || '');
    if (!scheduleId || !validDate(date)) throw Error('Choose a scheduled excursion and date.');

    const [{state, revision}, rows] = await Promise.all([loadStays(), dateRows(date)]);
    const schedules = schedulesOnly(rows);
    const selectedRow = rows.find(row => row.id === scheduleId && row.date === date);
    if (!selectedRow) return Response.json({error: 'This scheduled excursion no longer exists. Refresh the schedule.'}, {status: 404, headers});
    if (selectedRow.status === 'Cancelled') throw Error('Cancelled excursions cannot be updated.');
    const selected = schedules.find(schedule => schedule.id === scheduleId && schedule.date === date)!;
    const currentManifest = manifestFor(selected, schedules, state);

    if (action === 'save-attendance') {
      const rosters = Array.isArray(body.rosters) ? body.rosters : [];
      if (rosters.length !== currentManifest.bookings.length) throw Error('Review every booking before saving the boarding list.');
      const byBooking = new Map(rosters.map((item: any) => [String(item?.bookingId || ''), item]));
      const now = new Date().toISOString();
      for (const booking of currentManifest.bookings) {
        const incoming: any = byBooking.get(booking.id);
        if (!incoming || !Array.isArray(incoming.people) || incoming.people.length !== booking.guests) {
          throw Error('Every guest in booking ' + booking.id + ' must be listed.');
        }
        const order = (state.orders || []).find((item: any) => item.id === booking.id && item.kind === 'excursion');
        if (!order) throw Error('Booking ' + booking.id + ' is no longer available. Refresh the list.');
        const previous = Array.isArray(order.excursionGuestRoster) ? order.excursionGuestRoster : [];
        const next = incoming.people.map((person: any, index: number) => {
          const slot = index + 1, id = booking.id + ':' + slot, name = cleanName(person?.name);
          if (!name) throw Error('Enter the name for guest ' + slot + ' in booking ' + booking.id + '.');
          if (String(person?.id || '') !== id || typeof person?.boarded !== 'boolean') throw Error('The boarding list changed. Refresh and try again.');
          const before = previous.find((item: any) => Number(item?.slot) === slot || String(item?.id || '') === id);
          return {
            id, slot, name,
            ageCategory: String(before?.ageCategory || booking.people[index]?.ageCategory || ''),
            boarded: person.boarded,
            boardedAt: person.boarded ? (before?.boarded === true && before?.boardedAt ? before.boardedAt : now) : '',
            updatedAt: now, updatedBy: user!.username,
          };
        });
        order.excursionGuestRoster = next;
        order.attendanceReviewedAt = now;
        order.attendanceReviewedBy = user!.username;
      }
      const saved = await saveStayAccess(state, revision, user!.userId);
      if (!saved) return Response.json({error: 'The guest list changed elsewhere. Refresh and try again.'}, {status: 409, headers});
      return Response.json({manifest: manifestFor(selected, schedules, state), saved: true}, {headers});
    }

    if (action === 'trip-status') {
      const nextStatus = String(body.status || '') as TripStatus;
      if (!tripStatuses.includes(nextStatus)) throw Error('Choose a valid excursion status.');
      const currentStatus = tripStatusOf(selectedRow);
      const currentIndex = tripStatuses.indexOf(currentStatus), nextIndex = tripStatuses.indexOf(nextStatus);
      if (nextIndex !== currentIndex + 1) throw Error('Follow the trip sequence: Excursion scheduled → Guests boarded → Departed → Arrived → Completed.');

      if (nextStatus === 'Guests boarded') {
        if (!currentManifest.bookings.length) throw Error('There are no confirmed guests to board.');
        if (currentManifest.bookings.some(booking => !booking.attendanceReviewedAt || booking.people.some(person => !person.nameRecorded))) {
          throw Error('Save the complete guest-name and boarding checklist before marking Guests boarded.');
        }
        const boarded = currentManifest.bookings.flatMap(booking => booking.people).filter(person => person.boarded).length;
        if (!boarded) throw Error('Tick at least one guest as boarded before continuing.');
      }

      if (nextStatus === 'Departed') {
        const resources = excursionResources(state);
        const targetsForChecks = rows.filter(row => departureKey(row) === departureKey(selectedRow) && row.status !== 'Cancelled');
        assertGuideRule(guideRuleFor(selectedRow, schedules, state.orders || [], resources.crew));
        for (const trip of targetsForChecks) {
          const vessel = resources.vessels.find((item: any) => item.id === trip.vesselId);
          if (!vessel || vessel.condition !== 'Available') throw Error('The assigned vessel must be Available before departure.');
          if (isSnorkelingTrip(trip.name)) {
            const gopro = resources.gopros.find((item: any) => item.id === trip.goproId);
            if (!gopro || gopro.condition !== 'Available') throw Error('Every snorkeling trip requires an available GoPro before departure.');
          }
          if (isDroneRequiredTrip(trip.name)) {
            const drone = resources.drones.find((item: any) => item.id === trip.droneId);
            if (!drone || drone.condition !== 'Available') throw Error('Shark snorkeling and Sandbank trips require an available drone before departure.');
          }
        }
      }

      const key = departureKey(selectedRow), now = new Date().toISOString();
      const targets = rows.filter(row => departureKey(row) === key && row.status !== 'Cancelled');
      const field = nextStatus === 'Guests boarded' ? 'boardingStartedAt'
        : nextStatus === 'Departed' ? 'departedAt'
          : nextStatus === 'Arrived' ? 'arrivedAt' : nextStatus === 'Completed' ? 'completedAt' : '';
      const db = authDb();
      const writes = targets.map(row => {
        const {_key, _revision, ...plain} = row;
        const updated = {
          ...plain,
          status: nextStatus === 'Guests boarded' || currentStatus !== 'Excursion scheduled' ? 'Closed' : plain.status,
          tripStatus: nextStatus,
          tripStatusHistory: [...(Array.isArray(plain.tripStatusHistory) ? plain.tripStatusHistory : []), {from: tripStatusOf(plain), to: nextStatus, at: now, by: user!.username}],
          ...(field ? {[field]: now} : {}),
          updatedAt: now,
        };
        return {row, updated, statement: db.prepare('UPDATE operation_records SET payload=?,revision=revision+1,updated_by=? WHERE key=? AND revision=?')
          .bind(JSON.stringify(updated), user!.userId, _key, _revision)};
      });
      const results = await db.batch(writes.map(item => item.statement));
      if (results.some((result: any) => !result.meta.changes)) {
        return Response.json({error: 'The excursion changed elsewhere. Refresh and try again.'}, {status: 409, headers});
      }
      const updatedById = new Map(writes.map(item => [item.updated.id, item.updated]));
      const freshSchedules = schedules.map(schedule => updatedById.get(schedule.id) || schedule);
      const freshSelected = updatedById.get(selected.id) || selected;
      return Response.json({manifest: manifestFor(freshSelected, freshSchedules, state), status: nextStatus}, {headers});
    }

    throw Error('Unknown excursion manifest action.');
  } catch (error) {
    return Response.json({error: error instanceof Error ? error.message : 'Could not update the excursion.'}, {status: 400, headers});
  }
}
