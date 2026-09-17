import {authDb, currentUser, hasPermission} from '../../../lib/auth';
import {loadStays} from '../../../lib/stays';
import {excursionPaid, excursionResources} from '../../../lib/excursion-workflow';
import {buildExcursionManifest} from '../../../lib/excursion-manifest';
import type {ManifestSchedule} from '../../../lib/excursion-manifest';

const headers = {'Cache-Control': 'private, no-store', 'Vary': 'Cookie'};

/** Staff-only, read-only guest list for one scheduled excursion. */
export async function GET(request: Request) {
  try {
    const user = await currentUser();
    if (!hasPermission(user, 'edit_excursions')) {
      return Response.json({error: 'Excursion access is required.'}, {status: 403, headers});
    }
    const scheduleId = new URL(request.url).searchParams.get('scheduleId')?.trim() || '';
    if (!scheduleId || scheduleId.length > 160) {
      return Response.json({error: 'Choose a scheduled excursion.'}, {status: 400, headers});
    }
    const {state} = await loadStays();
    const rows = await authDb().prepare('SELECT payload FROM operation_records WHERE key LIKE ?')
      .bind('excursion-schedule:%').all<{payload: string}>();
    const schedules: ManifestSchedule[] = (rows.results || []).map(row => JSON.parse(row.payload));
    const selected = schedules.find(s => s.id === scheduleId);
    if (!selected) {
      return Response.json({error: 'This scheduled excursion no longer exists. Refresh the schedule.'}, {status: 404, headers});
    }
    const manifest = buildExcursionManifest(selected, schedules, state, excursionResources(state), order => excursionPaid(order, state));
    return Response.json({manifest}, {headers});
  } catch {
    return Response.json({error: 'Could not load the excursion guest list. Please try again.'}, {status: 503, headers});
  }
}
