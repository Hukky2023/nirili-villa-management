import {authDb, currentUser, hasPermission, sameOrigin} from '../../../lib/auth';
import {loadStays, stayKey} from '../../../lib/stays';
import {excursionPaid, excursionResources} from '../../../lib/excursion-workflow';
import {isConfirmedExcursion, toConfirmedExcursionBooking} from '../../../lib/excursion-bookings';
import {applyExcursionBillingAdjustment, excursionPricing} from '../../../lib/excursion-billing';

const headers = {'Cache-Control': 'private, no-store', 'Vary': 'Cookie'};
const normal = (value: unknown) => String(value || '').trim().replace(/\s+/g, ' ').toLowerCase();
const legacyKey = (date: unknown, time: unknown, name: unknown) => JSON.stringify([date || '', time || '', normal(name)]);

/** All confirmed excursions, across all dates. This endpoint never changes orders. */
export async function GET() {
  try {
    const user = await currentUser();
    if (!hasPermission(user, 'edit_excursions') && !hasPermission(user, 'excursions_manager')) {
      return Response.json({error: 'Excursion access is required.'}, {status: 403, headers});
    }
    const {state, revision} = await loadStays();
    const rows = await authDb().prepare('SELECT payload FROM operation_records WHERE key LIKE ?')
      .bind('excursion-schedule:%').all<any>();
    const schedules = (rows.results || []).map((row: any) => JSON.parse(row.payload));
    // Standard recurring schedules can reuse the same schedule id on different dates.
    // Never resolve a booking by schedule id alone or a later day's row can overwrite the booked date.
    const byDateAndId = new Map(schedules.map((s: any) => [String(s.date || '') + '|' + String(s.id || ''), s]));
    const byId = new Map<string, any[]>();
    for (const s of schedules) byId.set(String(s.id || ''), [...(byId.get(String(s.id || '')) || []), s]);
    const byDeparture = new Map<string, any[]>();
    for (const s of schedules) {
      const key = legacyKey(s.date, s.time, s.name);
      byDeparture.set(key, [...(byDeparture.get(key) || []), s]);
    }
    const stays = new Map((state.stays || []).map((s: any) => [s.id, s]));
    const resources = excursionResources(state);
    const bookings = (state.orders || []).filter(isConfirmedExcursion).map((order: any) => {
      const bookedDate = order.date || order.schedule?.date || '';
      let schedule = order.scheduleId ? byDateAndId.get(String(bookedDate) + '|' + String(order.scheduleId)) : undefined;
      if (order.scheduleId && !schedule) {
        const idMatches = byId.get(String(order.scheduleId)) || [];
        schedule = idMatches.length === 1 ? idMatches[0] : undefined;
      }
      if (!order.scheduleId) {
        const matches = byDeparture.get(legacyKey(order.schedule?.date || order.date, order.schedule?.time || order.time, order.name)) || [];
        // Never guess between two different departures sharing a name and time.
        schedule = matches.length === 1 ? matches[0] : matches.find(s => !!s.vesselId && s.vesselId === order.schedule?.vesselId);
      }
      return {...toConfirmedExcursionBooking(order, stays.get(order.stayId), schedule, resources, excursionPaid(order, state)),
        pricing: excursionPricing(order),
        billingHistory: user!.role === 'admin' ? (order.billingHistory || []) : undefined};
    });
    bookings.sort((a: any, b: any) => (a.date || '9999').localeCompare(b.date || '9999') || a.time.localeCompare(b.time) || a.id.localeCompare(b.id));
    return Response.json({bookings, revision, canAdjustBilling: user!.role === 'admin'}, {headers});
  } catch {
    return Response.json({error: 'Could not load confirmed excursion bookings. Please try again.'}, {status: 503, headers});
  }
}

/** Update the existing charge atomically; never create another room bill or payment. */
export async function PATCH(request: Request) {
  try {
    const user = await currentUser();
    if (!user || user.role !== 'admin' || !sameOrigin(request)) {
      return Response.json({error: 'Only Admin can make excursions free or change discounts.'}, {status: 403, headers});
    }
    let input: any;
    try { input = await request.json(); } catch {
      return Response.json({error: 'Invalid billing request.'}, {status: 400, headers});
    }
    if (!input || typeof input.id !== 'string' || !Number.isSafeInteger(input.revision) || input.revision < 0) {
      return Response.json({error: 'Refresh bookings and reopen the billing action.'}, {status: 400, headers});
    }
    const {state, revision} = await loadStays();
    const order = (state.orders || []).find((o: any) => o.id === input.id && o.kind === 'excursion');
    if (!order) return Response.json({error: 'Excursion booking not found.'}, {status: 404, headers});
    if (!isConfirmedExcursion(order)) return Response.json({error: 'Only confirmed excursion bookings can be adjusted.'}, {status: 400, headers});
    const duplicate = (order.billingHistory || []).some((entry: any) => entry.requestId === input.requestId);
    if (!duplicate && input.revision !== revision) {
      return Response.json({error: 'Booking or billing data changed. Close this action, refresh bookings and review the amount again.'}, {status: 409, headers});
    }
    let result;
    try { result = applyExcursionBillingAdjustment(state, input, user); } catch (error) {
      return Response.json({error: error instanceof Error ? error.message : 'Check the billing adjustment.'}, {status: 400, headers});
    }
    if (result.duplicate) return Response.json({ok: true, revision, pricing: excursionPricing(result.order)}, {headers});
    const saved = await authDb().prepare('UPDATE operation_records SET payload=?,revision=revision+1,updated_by=? WHERE key=? AND revision=?')
      .bind(JSON.stringify(state), user.userId, stayKey, revision).run();
    if (!saved.meta.changes) return Response.json({error: 'Another user changed the bill. Close this action, refresh bookings and review the amount again.'}, {status: 409, headers});
    return Response.json({ok: true, revision: revision + 1, pricing: excursionPricing(result.order)}, {headers});
  } catch {
    return Response.json({error: 'Could not save the billing adjustment. Please retry.'}, {status: 503, headers});
  }
}
