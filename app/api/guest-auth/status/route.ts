import {currentGuestUser} from '../../../../lib/auth';
export async function GET(){const user=await currentGuestUser();return Response.json({signedIn:!!user,guest:user?{name:user.displayName,room:user.username}:null},{headers:{'Cache-Control':'private, no-store'}});}
