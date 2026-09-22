import {sameOrigin} from "../../../../lib/auth";
export async function POST(request:Request){
 if(!sameOrigin(request))return Response.json({error:"Invalid request"},{status:403});
 return Response.json({error:"Guest account registration has been disabled. Please contact reception."},{status:403,headers:{"Cache-Control":"no-store"}});
}
