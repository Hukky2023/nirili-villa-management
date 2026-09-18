import {authDb, currentUser, hasPermission} from '../../../lib/auth';
import {loadStays} from '../../../lib/stays';
import {excursionResources} from '../../../lib/excursion-workflow';
import {buildExcursionTimetable, isTimetableDate} from '../../../lib/excursion-timetable';
import type {ManifestSchedule} from '../../../lib/excursion-manifest';

const headers = {'Cache-Control': 'private, no-store', 'Vary': 'Cookie'};

/** Staff-only snapshot of one day. Sharing never changes bookings or assignments. */
export async function GET(request: Request) {
  try {
    const user = await currentUser();
    if (!user || user.role === 'guest' || !hasPermission(user, 'edit_excursions')) {
      return Response.json({error: 'Excursion access is required.'}, {status: 403, headers});
    }
    const date = new URL(request.url).searchParams.get('date') || '';
    if (!isTimetableDate(date)) {
      return Response.json({error: 'Choose a valid timetable date.'}, {status: 400, headers});
    }
    const {state} = await loadStays();
    const rows = await authDb().prepare('SELECT payload FROM operation_records WHERE key LIKE ?')
      .bind('excursion-schedule:' + date + ':%').all<{payload: string}>();
    const schedules: ManifestSchedule[] = (rows.results || []).map(row => JSON.parse(row.payload));
    const timetable = buildExcursionTimetable(date, schedules, state, excursionResources(state));
    return Response.json({timetable}, {headers});
  } catch {
    return Response.json({error: 'Could not load the timetable. Please try again.'}, {status: 503, headers});
  }
}
