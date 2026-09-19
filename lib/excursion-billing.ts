/** Excursion prices are booking/group totals in cents, never a per-guest price. */
export type ExcursionPricing = {
  originalCents: number; totalCents: number; discountCents: number;
  discountPercent: number; complimentary: boolean; adjusted: boolean;
};
export type ExcursionBillingActor = {role: string; userId: string; username: string};

export function excursionPricing(order: any): ExcursionPricing {
  const totalCents = Math.max(0, Math.round(Number(order.cents) || 0));
  const saved = order.billingAdjustment;
  // Other bill editors can replace the charge. Never show or reapply stale discounts.
  const valid = saved && saved.totalCents === totalCents &&
    Number.isSafeInteger(saved.originalCents) && saved.originalCents >= totalCents;
  const originalCents = valid ? saved.originalCents : totalCents;
  const discountPercent = valid ? Number(saved.discountPercent) || 0 : 0;
  return {originalCents, totalCents, discountCents: originalCents - totalCents,
    discountPercent, complimentary: !!valid && !!saved.complimentary && totalCents === 0,
    adjusted: !!valid && saved.action !== 'restore'};
}

/** One shared projection for room folios, guest totals and invoice/PDF line items. */
export function excursionFolioBill(order: any) {
  const pricing = excursionPricing(order);
  return {department: 'Excursions', id: order.id,
    items: [[order.name, order.quantity, pricing.originalCents / 100, pricing.discountPercent]],
    status: order.status, ...pricing};
}

export function applyExcursionBillingAdjustment(state: any, input: any, actor: ExcursionBillingActor) {
  if (actor.role !== 'admin') throw new Error('Only Admin can make excursions free or change discounts.');
  if (!input || typeof input.id !== 'string' || typeof input.requestId !== 'string' ||
      !/^[-a-zA-Z0-9]{12,80}$/.test(input.requestId)) throw new Error('Reopen the billing action and try again.');
  const order = (state.orders || []).find((o: any) => o.id === input.id && o.kind === 'excursion');
  if (!order) throw new Error('Excursion booking not found.');
  // A response lost in transit must not apply the same adjustment or audit entry twice.
  const previous = (order.billingHistory || []).find((entry: any) => entry.requestId === input.requestId);
  if (previous) {
    if (previous.userId !== actor.userId || previous.action !== input.action ||
        previous.reason !== String(input.reason || '').trim() ||
        (input.action === 'discount' && previous.discountPercent !== input.discountPercent)) {
      throw new Error('This request was already used. Reopen the billing action and try again.');
    }
    return {order, duplicate: true};
  }
  if (['cancelled', 'canceled', 'declined', 'rejected'].includes(String(order.status || '').toLowerCase()) ||
      ['pending', 'declined', 'rejected'].includes(String(order.approvalStatus || '').toLowerCase())) {
    throw new Error('Only confirmed, non-cancelled excursion bookings can be adjusted.');
  }
  if (!['free', 'discount', 'restore'].includes(input.action)) throw new Error('Choose a valid billing action.');
  if (typeof input.reason !== 'string' || input.reason.length > 500) throw new Error('Keep the reason under 500 characters.');
  const pricing = excursionPricing(order);
  if (!Number.isSafeInteger(order.cents) || order.cents < 0 || pricing.originalCents > 100000000) {
    throw new Error('The excursion amount is invalid. Review the bill before changing it.');
  }
  let percent = input.action === 'free' ? 100 : 0;
  if (input.action === 'discount') {
    if (typeof input.discountPercent !== 'number' || !Number.isFinite(input.discountPercent) ||
        input.discountPercent <= 0 || input.discountPercent > 100 ||
        Math.abs(input.discountPercent * 100 - Math.round(input.discountPercent * 100)) > 0.000001) {
      throw new Error('Enter a discount greater than 0% and no more than 100%, with up to two decimal places.');
    }
    percent = input.discountPercent;
  }
  const totalCents = Math.round(pricing.originalCents * (10000 - Math.round(percent * 100)) / 10000);
  const now = new Date().toISOString();
  const adjustment = {action: input.action, originalCents: pricing.originalCents, discountPercent: percent,
    discountCents: pricing.originalCents - totalCents, totalCents,
    complimentary: input.action === 'free' || percent === 100,
    reason: input.reason.trim(), at: now, by: actor.username, userId: actor.userId};
  const entry = {...adjustment, requestId: input.requestId, previousCents: order.cents};
  order.cents = totalCents;
  order.billingAdjustment = adjustment;
  order.billingHistory = [...(order.billingHistory || []), entry];
  order.updatedAt = now; order.updatedBy = actor.username;
  const stay = (state.stays || []).find((s: any) => s.id === order.stayId);
  if (stay) {
    const key = 'Excursions:' + order.id, covered = stay.paidBills?.[key];
    // Keep cash/card receipts intact. A reduction to a settled charge leaves credit
    // in the folio; it is NOT a refund, a deleted payment, or new payment income.
    if (Number.isSafeInteger(covered) && covered >= totalCents) stay.paidBills[key] = totalCents;
    const detail = `${order.id}: ${input.action === 'free' ? 'Made free' : input.action === 'restore' ? 'Original price restored' : percent + '% discount'}; $${(entry.previousCents / 100).toFixed(2)} → $${(totalCents / 100).toFixed(2)}${adjustment.reason ? ' · ' + adjustment.reason : ''}`;
    stay.history = [...(stay.history || []), {date: now, at: now, by: actor.username,
      action: 'excursion-billing', detail, orderId: order.id, requestId: input.requestId}];
  }
  return {order, duplicate: false};
}
