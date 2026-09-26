import {authDb,currentUser,hasPermission,sameOrigin} from '../../../lib/auth';
import {canTakePayment} from '../../../lib/pos-access';
export async function POST(r:Request){
 const u=await currentUser();const canUpload=!!u&&(u.role==='admin'||canTakePayment(u)||hasPermission(u,'edit_excursions')||hasPermission(u,'excursions_manager'));if(!canUpload||!sameOrigin(r))return Response.json({error:'Photo upload permission required.'},{status:403});
 if(r.headers.get('content-type')!=='image/jpeg'||Number(r.headers.get('content-length'))>200000)return Response.json({error:'Use a JPEG photo under 200 KB.'},{status:400});
 const reader=r.body?.getReader();if(!reader)return Response.json({error:'No image received.'},{status:400});let size=0;const chunks:Uint8Array[]=[];
 for(;;){const {value,done}=await reader.read();if(done)break;size+=value.length;if(size>200000){await reader.cancel();return Response.json({error:'Image is too large.'},{status:413});}chunks.push(value);}
 const bytes=new Uint8Array(size);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.length;}
 if(size<4||bytes[0]!==255||bytes[1]!==216||bytes[2]!==255||bytes[size-2]!==255||bytes[size-1]!==217)return Response.json({error:'Invalid JPEG photo.'},{status:400});
 let binary='';for(const b of bytes)binary+=String.fromCharCode(b);const id=crypto.randomUUID();await authDb().prepare('INSERT INTO operation_records(key,payload,revision,updated_by) VALUES(?,?,1,?)').bind('menu-image:'+id,btoa(binary),u.userId).run();
 return Response.json({url:'/api/menu-images/'+id});
}
