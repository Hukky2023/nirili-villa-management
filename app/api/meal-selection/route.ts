import {authDb, currentUser, sameOrigin} from '../../../lib/auth';
import {canPOS} from '../../../lib/pos-access';
import {diningOrderRoom} from '../../../lib/dining-room';
import {loadStays, stayKey} from '../../../lib/stays';
import {selectHalfBoardMeal} from '../../../lib/meal-access';

export async function POST(request: Request) {
  const actor = await currentUser();
  if (!actor || !sameOrigin(request) || (actor.role !== 'guest' && !canPOS(actor)))
    return Response.json({error: 'Guest or restaurant ordering access required.'}, {status: 403});
  try {
    const body = await request.json(), {state, revision} = await loadStays();
    if (typeof body.stayId !== 'string') throw Error('Select your room first.');
    const stay = actor.role === 'guest'
      ? diningOrderRoom(state.stays, actor, body.stayId)
      : state.stays.find((s: any) => s.id === body.stayId && s.status === 'In House');
    const mealAccess = selectHalfBoardMeal(stay, body.meal, body.date, body.version, actor.username);
    const saved = revision === 0
      ? await authDb().prepare('INSERT OR IGNORE INTO operation_records(key,payload,revision,updated_by) VALUES(?,?,1,?)').bind(stayKey, JSON.stringify(state), actor.userId).run()
      : await authDb().prepare('UPDATE operation_records SET payload=?,revision=revision+1,updated_by=? WHERE key=? AND revision=?').bind(JSON.stringify(state), actor.userId, stayKey, revision).run();
    if (!saved.meta.changes) return Response.json({error: 'The room changed on another screen. Refresh and try again.'}, {status: 409});
    return Response.json({mealAccess, revision: revision + 1}, {headers: {'Cache-Control': 'no-store'}});
  } catch (error) {
    return Response.json({error: (error as Error).message}, {status: 400});
  }
}
