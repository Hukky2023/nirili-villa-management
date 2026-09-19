/** Read-only projection used by the staff excursion Bookings tab. */
export type ExcursionGuestPerson = {
  id: string; slot: number; name: string; nameRecorded: boolean; boarded: boolean; boardedAt: string;
};
export type ConfirmedExcursionBooking = {
  id: string; excursion: string; guest: string; phone: string;
  guestType: 'In-house' | 'Walk-in'; hotel: string; room: string;
  date: string; time: string; endTime: string; returnTime: string; guests: number; adults: number; children: number; infants: number; totalCents: number;
  paymentStatus: 'Paid' | 'Unpaid'; tripStatus: string;
  vessel: string; crew: string[]; separateVessel: boolean; privateBoatRequested: boolean; privateBoatSurchargeCents: number; buggyRequested: boolean; buggyRoundTrip: boolean; serviceType: string;
  notes: string; source: string; createdAt: string; createdBy: string;
  people: ExcursionGuestPerson[]; attendanceReviewedAt: string;
};

const text = (value: unknown) => typeof value === 'string' ? value.trim() : '';
const normal = (value: unknown) => text(value).toLowerCase();
const blocked = new Set(['pending', 'declined', 'cancelled', 'canceled', 'rejected', 'requested', 'awaiting approval', 'awaiting scheduling', 'over capacity request']);

export function isConfirmedExcursion(order: any): boolean {
  if (!order || order.kind !== 'excursion') return false;
  const approval = normal(order.approvalStatus), status = normal(order.status);
  if (blocked.has(approval) || blocked.has(status)) return false;
  if (approval === 'approved' || approval === 'confirmed') return true;
  // Unknown approval states must not accidentally become confirmed bookings.
  if (approval) return false;
  if (order.autoConfirmed === true) return true;
  if (['confirmed', 'scheduled', 'scheduled and informed', 'departed', 'completed'].includes(status)) return true;
  // Older confirmed bookings predate approvalStatus and store their departure here.
  return !!text(order.schedule?.date) && !!text(order.schedule?.time);
}

/** Keep current assignments for active trips, but retain departed-trip snapshots. */
export function toConfirmedExcursionBooking(
  order: any, stay: any, liveSchedule: any,
  resources: {vessels: any[]; crew: any[]}, paid: boolean,
): ConfirmedExcursionBooking {
  const stored = order.schedule || {};
  const historical = ['departed', 'completed'].includes(normal(order.status));
  const current = historical ? null : liveSchedule;
  const assignment = current && !order.separateVessel ? current : stored;
  const vesselId = order.separateVessel ? order.overflowVesselId || stored.vesselId : assignment.vesselId;
  const vessel = resources.vessels.find(v => v.id === vesselId);
  const crewIds = Array.isArray(assignment.crewIds) ? assignment.crewIds : [];
  const storedCrew = Array.isArray(assignment.crew) ? assignment.crew : [];
  const crew = crewIds.length
    ? crewIds.map((id: string, index: number) => text(resources.crew.find(c => c.id === id)?.name) || text(storedCrew[index]) || 'Unknown crew member')
    : storedCrew.map(text).filter(Boolean);
  const inhouse = !!order.stayId, romanticDinner = order.serviceType === 'romantic-beach-dinner';
  const amount = Number(order.cents), quantity = Number(order.quantity);
  const guestName = text(order.guest) || text(stay?.guest);
  const guestCount = Number.isFinite(quantity) ? Math.max(0, Math.trunc(quantity)) : 0;
  const savedRoster = Array.isArray(order.excursionGuestRoster) ? order.excursionGuestRoster : [];
  const people = Array.from({length: guestCount}, (_, index) => {
    const slot = index + 1, id = text(order.id) + ':' + slot;
    const saved = savedRoster.find((person: any) => Number(person?.slot) === slot || text(person?.id) === id);
    const name = text(saved?.name) || (slot === 1 ? guestName : '');
    return {id, slot, name, nameRecorded: !!name, boarded: saved?.boarded === true, boardedAt: text(saved?.boardedAt)};
  });
  return {
    id: text(order.id), excursion: text(order.name) || text(current?.name) || 'Excursion',
    guest: guestName || 'Guest name not recorded',
    phone: text(order.phone) || text(stay?.whatsapp),
    guestType: inhouse ? 'In-house' : 'Walk-in',
    hotel: inhouse ? 'Nirili Villa' : text(order.hotel),
    room: inhouse ? text(stay?.room) || text(order.room) : text(order.externalRoom) || text(order.room),
    // The guest-selected/booked-for date and time are authoritative. Live schedule data is only an assignment fallback.
    date: text(order.date) || text(stored.date) || text(current?.date),
    time: text(order.time) || text(stored.time) || text(current?.time),
    endTime: text(order.endTime) || text(stored.endTime) || text(current?.endTime),
    returnTime: text(order.returnTime) || text(stored.returnTime) || text(current?.returnTime),
    guests: guestCount,
    adults: Number.isFinite(Number(order.adults)) ? Math.max(0, Math.trunc(Number(order.adults))) : (Number.isFinite(quantity) ? Math.max(0, Math.trunc(quantity)) : 0),
    children: Number.isFinite(Number(order.children)) ? Math.max(0, Math.trunc(Number(order.children))) : 0,
    infants: Number.isFinite(Number(order.infants)) ? Math.max(0, Math.trunc(Number(order.infants))) : 0,
    totalCents: Number.isFinite(amount) ? Math.max(0, Math.round(amount)) : 0,
    paymentStatus: paid ? 'Paid' : 'Unpaid',
    tripStatus: romanticDinner ? 'Dinner confirmed' : text(liveSchedule?.tripStatus) || (historical ? (normal(order.status) === 'completed' ? 'Completed' : 'Departed') : 'Excursion scheduled'),
    vessel: romanticDinner ? 'Not required' : text(vessel?.name) || text(assignment.vessel) || 'Not assigned',
    crew: romanticDinner ? [] : crew, separateVessel: !!order.separateVessel, privateBoatRequested: !!order.privateBoatRequested, privateBoatSurchargeCents: Math.max(0,Number(order.privateBoatSurchargeCents)||0), buggyRequested: inhouse ? true : !!order.buggyRequested, buggyRoundTrip: !!order.buggyRoundTrip, serviceType: text(order.serviceType),
    notes: text(order.notes), source: text(order.source),
    createdAt: text(order.createdAt), createdBy: text(order.createdBy),
    people, attendanceReviewedAt: text(order.attendanceReviewedAt),
  };
}
