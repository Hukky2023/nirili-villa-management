import {isConfirmedExcursion} from './excursion-bookings';

export type GuideRule = {
  confirmedPax: number;
  requiredGuides: number;
  assignedGuides: number;
  missingGuides: number;
  needsGuides: boolean;
};

const text = (value: unknown): string => typeof value === 'string' ? value.trim() : '';
const normal = (value: unknown): string => text(value).replace(/\s+/g, ' ').toLowerCase();
const ids = (value: unknown): string[] => Array.isArray(value)
  ? [...new Set(value.filter((id): id is string => typeof id === 'string' && !!id.trim()).map(id => id.trim()))]
  : [];

/** This is a passenger threshold, not a rule about available seats or booking count. */
export const requiredExcursionGuides = (confirmedPax: number): number => confirmedPax > 4 ? 3 : 0;

export function guideDepartureKey(schedule: any): string {
  if (schedule.sharedGroup) return `${schedule.date}|${schedule.time}|group:${schedule.sharedGroup}`;
  if (schedule.vesselId) return `${schedule.date}|${schedule.time}|vessel:${schedule.vesselId}`;
  return '';
}

function matchesOrder(order: any, schedule: any): boolean {
  if (order.scheduleId) return !!schedule.id && order.scheduleId === schedule.id && (order.date || order.schedule?.date) === schedule.date;
  const stored = order.schedule || {};
  return (stored.date || order.date) === schedule.date && (stored.time || order.time) === schedule.time
    && (!schedule.vesselId || stored.vesselId === schedule.vesselId)
    && normal(order.name) === normal(schedule.name);
}

/** Sum each confirmed booking once, including extra-vessel passengers on this trip.
 * Shared excursion rows describe one departure, not separate sets of passengers.
 */
export function confirmedGuidePax(schedule: any, schedules: any[], orders: any[], previous?: any): number {
  const current = schedules.filter(row => !schedule.id || row.id !== schedule.id).concat(schedule);
  const key = guideDepartureKey(schedule);
  const group = key ? current.filter(row => guideDepartureKey(row) === key) : [schedule];
  const aliases = previous ? group.concat(previous) : group;
  const seen = new Set<string>();
  let passengers = 0;
  for (const order of orders) {
    if (!isConfirmedExcursion(order) || !aliases.some(row => matchesOrder(order, row))) continue;
    const id = text(order.id);
    if (id && seen.has(id)) continue;
    if (id) seen.add(id);
    const quantity = Number(order.quantity);
    if (Number.isFinite(quantity) && quantity > 0) passengers += Math.trunc(quantity);
  }
  return passengers;
}

/** Nirili excursion crew are also the trip guides.
 * Guide IDs are retained in stored records for compatibility, but staffing is based on
 * the distinct active crew members actually assigned to the departure.
 */
export function assignedGuideCount(_guideIds: unknown, crewIds: unknown, crew: any[]): number {
  const people = new Set<string>();
  for (const id of ids(crewIds)) {
    const member = crew.find(person => person.id === id);
    if (!member || member.active === false || member.active === 0) continue;
    // Legacy imported aliases for the same person cannot supply two of the three guides.
    people.add(text(member.accountId) || text(member.userId) || normal(member.name) || id);
  }
  return people.size;
}

export function cleanGuideSelection(value: unknown, crewIds: unknown, crew: any[]): string[] {
  if (value !== undefined && (!Array.isArray(value) || value.length > 20
    || value.some(id => typeof id !== 'string' || !id.trim() || id.length > 100))) {
    throw Error('Choose guides from the assigned crew members.');
  }
  const guides = ids(value), assigned = new Set(ids(crewIds));
  if (guides.some(id => !assigned.has(id) || !crew.some(member => member.id === id && member.active !== false && member.active !== 0))) {
    throw Error('Each guide must be an active crew member assigned to this trip.');
  }
  return guides;
}

export function guideRuleFor(schedule: any, schedules: any[], orders: any[], crew: any[], previous?: any): GuideRule {
  const confirmedPax = confirmedGuidePax(schedule, schedules, orders, previous);
  const requiredGuides = requiredExcursionGuides(confirmedPax);
  const assignedGuides = assignedGuideCount(schedule.guideIds, schedule.crewIds, crew);
  const missingGuides = Math.max(0, requiredGuides - assignedGuides);
  return {confirmedPax, requiredGuides, assignedGuides, missingGuides, needsGuides: missingGuides > 0};
}

export function guideRuleMessage(rule: GuideRule): string {
  return `This departure has ${rule.confirmedPax} confirmed guests. Assign at least ${rule.requiredGuides} different guides (${rule.assignedGuides} assigned, ${rule.missingGuides} more needed).`;
}

export function assertGuideRule(rule: GuideRule): void {
  if (rule.needsGuides) throw Error(guideRuleMessage(rule));
}
