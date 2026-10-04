import {currentUser,sameOrigin} from '../../../lib/auth';
import {createTourOperator,loadTourOperators,publicTourOperator,updateTourOperator} from '../../../lib/tour-operators';

const headers={'Cache-Control':'no-store'};
const actor=(u:any)=>u?.displayName||u?.username||'admin';

export async function GET(){
 const user=await currentUser();if(user?.role!=='admin')return Response.json({error:'Admin access required.'},{status:403,headers});
 try{const rows=await loadTourOperators();return Response.json({operators:rows.map(({operator,revision})=>({...publicTourOperator(operator),revision}))},{headers});}
 catch(e){return Response.json({error:e instanceof Error?e.message:'Could not load tour operators.'},{status:400,headers});}
}
export async function POST(r:Request){
 const user=await currentUser();if(user?.role!=='admin'||!sameOrigin(r))return Response.json({error:'Admin access required.'},{status:403,headers});
 try{const operator=await createTourOperator(await r.json(),actor(user));return Response.json({operator:publicTourOperator(operator)},{status:201,headers});}
 catch(e){return Response.json({error:e instanceof Error?e.message:'Could not create tour operator.'},{status:400,headers});}
}
export async function PATCH(r:Request){
 const user=await currentUser();if(user?.role!=='admin'||!sameOrigin(r))return Response.json({error:'Admin access required.'},{status:403,headers});
 try{const b=await r.json();const result=await updateTourOperator(String(b.id||''),Number(b.revision),b,actor(user));
  if(!result)return Response.json({error:'Tour operator not found.'},{status:404,headers});
  if(result==='conflict')return Response.json({error:'This tour operator changed elsewhere. Refresh and try again.'},{status:409,headers});
  return Response.json({operator:{...publicTourOperator(result.operator),revision:result.revision}},{headers});
 }catch(e){return Response.json({error:e instanceof Error?e.message:'Could not save tour operator.'},{status:400,headers});}
}
