import {currentUser} from '../../../../lib/auth';
export const dynamic='force-dynamic';
export async function GET(){return Response.json({signedIn:!!(await currentUser())},{headers:{'Cache-Control':'no-store'}});}
