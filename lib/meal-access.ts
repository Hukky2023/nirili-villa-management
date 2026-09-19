export type MainMeal = 'lunch' | 'dinner';
export type MealPeriod = 'breakfast' | MainMeal;
export const MEAL_RULE_VERSION = 'half-board-daily-v1';
export const MEAL_TIME_ZONE = 'Indian/Maldives';
export const hasMealPlan = (meal?: string) => meal === 'Full Board' || meal === 'Half Board';

/** Server and browser use the same Maldives-day service boundaries. End times are exclusive. */
export function mealService(now = new Date()) {
  if (!Number.isFinite(now.getTime())) throw Error('Invalid meal date.');
  const local = new Date(now.getTime() + 5 * 60 * 60 * 1000);
  const date = local.toISOString().slice(0, 10), friday = local.getUTCDay() === 5;
  const minutes = local.getUTCHours() * 60 + local.getUTCMinutes();
  const hours = {breakfast: {start: '07:00', end: '09:00'}, lunch: {start: friday ? '13:30' : '12:00', end: '15:00'}, dinner: {start: '18:00', end: '21:00'}};
  const period: MealPeriod | null = minutes >= 420 && minutes < 540 ? 'breakfast'
    : minutes >= (friday ? 810 : 720) && minutes < 900 ? 'lunch'
    : minutes >= 1080 && minutes < 1260 ? 'dinner' : null;
  return {date, friday, period, hours, timeZone: MEAL_TIME_ZONE};
}

export function mealContext(stay: any, now = new Date()) {
  const service = mealService(now), record = stay?.halfBoardMeals?.[service.date];
  const choice: MainMeal | null = record?.meal === 'lunch' || record?.meal === 'dinner' ? record.meal : null;
  return {...service, meal: stay?.meal || '', active: stay?.status === 'In House', choice,
    locked: !!(choice && record?.lockedAt), version: Number.isInteger(record?.version) ? record.version : 0};
}
export type MealContext = ReturnType<typeof mealContext>;

export function mealItemIncluded(meal: string | undefined, item: {fullBoard?: boolean}, context?: MealContext) {
  if (item.fullBoard !== true) return false;
  // Preserve Full Board pricing. A supplied inactive stay never receives included meals.
  if (meal === 'Full Board') return context ? context.active : true;
  // Half Board is deliberately fail-closed when a caller has not supplied the daily context.
  if (meal !== 'Half Board' || !context?.active) return false;
  return context.period === 'breakfast' || (context.period !== null && context.period === context.choice);
}

export function needsMealChoice(stay: any, products: {fullBoard?: boolean}[], now = new Date()) {
  const context = mealContext(stay, now);
  return context.meal === 'Half Board' && context.active &&
    (context.period === 'lunch' || context.period === 'dinner') && !context.choice &&
    products.some(item => item.fullBoard === true);
}
export function assertMealChoice(stay: any, products: {fullBoard?: boolean}[], now = new Date()) {
  if (needsMealChoice(stay, products, now)) throw Error('Choose Free Lunch or Free Dinner for today, then review your order.');
}

export function selectHalfBoardMeal(stay: any, choice: unknown, date: unknown, version: unknown, actor: string, now = new Date()) {
  const context = mealContext(stay, now);
  if (!context.active || context.meal !== 'Half Board') throw Error('A checked-in Half Board room is required.');
  if (choice !== 'lunch' && choice !== 'dinner') throw Error('Choose Free Lunch or Free Dinner.');
  if (date !== context.date) throw Error('A new Maldives day has started. Refresh your meal selection.');
  if (version !== context.version) throw Error('The meal selection changed on another screen. Refresh and try again.');
  if (context.locked && choice !== context.choice) throw Error('Your included ' + context.choice + ' has already been ordered. The other main meal is charged today.');
  if (choice === context.choice) return context;
  stay.halfBoardMeals ??= {};
  stay.halfBoardMeals[context.date] = {meal: choice, version: context.version + 1, selectedAt: now.toISOString(), selectedBy: actor};
  stay.history ??= [];
  stay.history.unshift({date: now.toISOString(), by: actor, detail: 'Half Board ' + context.date + ': free ' + choice + ' selected; the other main meal is charged.'});
  return mealContext(stay, now);
}

/** Call before saving the order and folio in the same revision-checked database write. */
export function lockHalfBoardMeal(stay: any, lines: {included?: boolean}[], orderId: string, actor: string, now = new Date()) {
  const context = mealContext(stay, now);
  if (context.meal !== 'Half Board' || !context.active || !lines.some(line => line.included === true) ||
      (context.period !== 'lunch' && context.period !== 'dinner')) return;
  if (context.choice !== context.period) throw Error('Meal allowance changed. Refresh and review the order.');
  const record = stay.halfBoardMeals[context.date];
  if (record.lockedAt) return;
  record.lockedAt = now.toISOString(); record.lockedBy = actor; record.firstOrderId = orderId; record.version = context.version + 1;
  stay.history ??= [];
  stay.history.unshift({date: now.toISOString(), by: actor, detail: 'Half Board ' + context.date + ': included ' + context.period + ' used on ' + orderId + '; the other main meal is charged.'});
}

/** Recover included meals already submitted before this feature without repricing historical bills. */
export function restoreHalfBoardSelections(state: any) {
  const stays = new Map<string, any>((state.stays || []).filter((s: any) => s.meal === 'Half Board').map((s: any) => [s.id, s]));
  if (!stays.size) return;
  const orders = [...(state.posOrders || []), ...(state.orders || []).filter((o: any) => o.kind === 'food')]
    .filter((o: any) => stays.has(o.stayId) && o.createdAt && o.status !== 'Cancelled')
    .sort((a: any, b: any) => String(a.createdAt).localeCompare(String(b.createdAt)));
  for (const order of orders) {
    const at = new Date(order.createdAt);
    if (!Number.isFinite(at.getTime())) continue;
    const {date, period} = mealService(at);
    if (period !== 'lunch' && period !== 'dinner') continue;
    const included = order.included === true || String(order.name || '').includes('(meal plan included)') ||
      order.items?.some((line: any) => line.included === true || String(line.name || '').includes('(meal plan included)'));
    if (!included) continue;
    const stay = stays.get(order.stayId);
    if (stay.halfBoardMeals?.[date]?.lockedAt) continue;
    const previous = stay.halfBoardMeals?.[date];
    stay.halfBoardMeals ??= {};
    stay.halfBoardMeals[date] = {meal: period, version: (previous?.version || 0) + 1,
      selectedAt: order.createdAt, selectedBy: 'Existing included order', lockedAt: order.createdAt,
      lockedBy: order.createdBy || 'Existing included order', firstOrderId: order.id};
  }
}
