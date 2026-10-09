import {authDb,currentUser,sameOrigin} from '../../../lib/auth';
export async function POST(r:Request){
 const user=await currentUser();
 if(user?.role!=='admin'||!sameOrigin(r))return Response.json({error:'Admin access required.'},{status:403});
 const limit=2500000;
 if(r.headers.get('content-type')!=='image/jpeg')return Response.json({error:'Use JPEG panorama photos.'},{status:400});
 const reader=r.body?.getReader();if(!reader)return Response.json({error:'No photo received.'},{status:400});
 const chunks:Uint8Array[]=[];let size=0;
 for(;;){const {value,done}=await reader.read();if(done)break;size+=value.length;if(size>limit){await reader.cancel();return Response.json({error:'Panorama must be under 2.5 MB.'},{status:413});}chunks.push(value);}
 const bytes=new Uint8Array(size);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.length;}
 if(size<4||bytes[0]!==255||bytes[1]!==216||bytes[2]!==255||bytes[size-2]!==255||bytes[size-1]!==217)return Response.json({error:'Invalid JPEG.'},{status:400});
 let binary='';for(let i=0;i<bytes.length;i+=8192)binary+=String.fromCharCode(...bytes.subarray(i,i+8192));
 const id=crypto.randomUUID();
 await authDb().prepare('INSERT INTO operation_records(key,payload,revision,updated_by) VALUES(?,?,1,?)').bind('room-panorama:'+id,btoa(binary),user.userId).run();
 return Response.json({url:'/api/room-panorama/'+id});
}
