import {authDb} from './auth';
import {excursionResources} from './excursion-workflow';
import {assertGuideRule, cleanGuideSelection, guideRuleFor} from './excursion-guides';
import {isDroneRequiredTrip,isSnorkelingTrip} from './excursion-operations';

async function daySchedules(date: string): Promise<any[]> {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw Error('A valid scheduled departure date is required.');
  const rows = await authDb().prepare('SELECT payload FROM operation_records WHERE key LIKE ?')
    .bind('excursion-schedule:' + date + ':%').all<any>();
  return (rows.results || []).map((row: any) => JSON.parse(row.payload));
}

/** Called after the existing action mutates the local snapshot, but before any save.
 * Failed validation never writes an order, payment or status change to the database.
 */
export async function validateExcursionGuideAction(state: any, action: any): Promise<void> {
  const departing = action.action === 'excursion-status' && action.status === 'Departed';
  if (!departing && action.action !== 'schedule-excursion') return;
  const order = (state.orders || []).find((item: any) => item.id === action.id && item.kind === 'excursion');
  if (!order?.schedule) throw Error('The excursion must be scheduled before assigning guides or departing.');
  const resources = excursionResources(state);
  const date = String(order.schedule.date || order.date || '');
  const rows = await daySchedules(date);
  let schedule: any;
  if (departing && order.scheduleId) {
    // Booking snapshots can be stale after Change crew. Always validate current assignments.
    schedule = rows.find(row => row.id === order.scheduleId);
    if (!schedule) throw Error('The scheduled trip no longer exists. Restore its schedule before departure.');
    if (schedule.status === 'Closed') throw Error('This trip is closed. Reopen and assign the required guides before departure.');
  } else {
    const stored = order.schedule;
    schedule = {...stored, id: order.scheduleId || 'legacy:' + order.id, name: order.name, date};
    if (!departing) {
      schedule.guideIds = cleanGuideSelection(action.guideIds, schedule.crewIds, resources.crew);
      order.schedule.guideIds = schedule.guideIds;
    }
    // Group legacy scheduled bookings by the same boat/date/time as well.
    for (const other of state.orders || []) {
      if (other.kind !== 'excursion' || other.scheduleId || !other.schedule) continue;
      rows.push({...other.schedule, id: 'legacy:' + other.id, name: other.name, date: other.schedule.date || other.date});
    }
  }
  assertGuideRule(guideRuleFor(schedule, rows, state.orders || [], resources.crew));
  if (departing && isSnorkelingTrip(schedule.name || order.name)) {
    const gopro = resources.gopros.find((item: any) => item.id === schedule.goproId);
    if (!gopro || gopro.condition !== 'Available') throw Error('Every snorkeling trip requires an available GoPro assigned to the vessel before departure.');
    order.schedule.goproId = gopro.id;
    order.schedule.gopro = gopro.name;
  }
  if (departing && isDroneRequiredTrip(schedule.name || order.name)) {
    const drone = resources.drones.find((item: any) => item.id === schedule.droneId);
    if (!drone || drone.condition !== 'Available') throw Error('Shark snorkeling and Sandbank trips require an available drone before departure.');
    order.schedule.droneId = drone.id;
    order.schedule.drone = drone.name;
  }
  if (departing) {
    // Freeze the guides actually checked for the departed booking's history.
    order.schedule.guideIds = [...(schedule.guideIds || [])];
    if (!order.separateVessel) {
      order.schedule.crewIds = [...(schedule.crewIds || [])];
      order.schedule.crew = resources.crew.filter((member: any) => schedule.crewIds?.includes(member.id)).map((member: any) => member.name);
    }
  }
}
