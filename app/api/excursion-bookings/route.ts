import {authDb, currentUser, hasPermission} from '../../../lib/auth';
import {loadStays} from '../../../lib/stays';
import {excursionPaid, excursionResources} from '../../../lib/excursion-workflow';
import {isConfirmedExcursion, toConfirmedExcursionBooking} from '../../../lib/excursion-bookings';

const headers = {'Cache-Control': 'private, no-store', 'Vary': 'Cookie'};
const normal = (value: unknown) => String(value || '').trim().replace(/\s+/g, ' ').toLowerCase();
const legacyKey = (date: unknown, time: unknown, name: unknown) => JSON.stringify([date || '', time || '', normal(name)]);

/** All confirmed excursions, across all dates. This endpoint never changes orders. */
export async function GET() {
  try {
    const user = await currentUser();
    if (!hasPermission(user, 'edit_excursions')) {
      return Response.json({error: 'Excursion access is required.'}, {status: 403, headers});
    }
    const {state} = await loadStays();
    const rows = await authDb().prepare('SELECT payload FROM operation_records WHERE key LIKE ?')
      .bind('excursion-schedule:%').all<any>();
    const schedules = (rows.results || []).map((row: any) => JSON.parse(row.payload));
    const byId = new Map(schedules.map((s: any) => [s.id, s]));
    const byDeparture = new Map<string, any[]>();
    for (const s of schedules) {
      const key = legacyKey(s.date, s.time, s.name);
      byDeparture.set(key, [...(byDeparture.get(key) || []), s]);
    }
    const stays = new Map((state.stays || []).map((s: any) => [s.id, s]));
    const resources = excursionResources(state);
    const bookings = (state.orders || []).filter(isConfirmedExcursion).map((order: any) => {
      let schedule = order.scheduleId ? byId.get(order.scheduleId) : undefined;
      if (!order.scheduleId) {
        const matches = byDeparture.get(legacyKey(order.schedule?.date || order.date, order.schedule?.time || order.time, order.name)) || [];
        // Never guess between two different departures sharing a name and time.
        schedule = matches.length === 1 ? matches[0] : matches.find(s => !!s.vesselId && s.vesselId === order.schedule?.vesselId);
      }
      return toConfirmedExcursionBooking(order, stays.get(order.stayId), schedule, resources, excursionPaid(order, state));
    });
    bookings.sort((a: any, b: any) => (a.date || '9999').localeCompare(b.date || '9999') || a.time.localeCompare(b.time) || a.id.localeCompare(b.id));
    return Response.json({bookings}, {headers});
  } catch {
    return Response.json({error: 'Could not load confirmed excursion bookings. Please try again.'}, {status: 503, headers});
  }
}
