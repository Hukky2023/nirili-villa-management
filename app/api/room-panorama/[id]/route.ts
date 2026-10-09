import {authDb} from '../../../../lib/auth';
export async function GET(_r:Request,{params}:{params:Promise<{id:string}>}){
 const {id}=await params;
 if(!/^[a-f0-9-]{36}$/.test(id))return new Response(null,{status:404});
 const row=await authDb().prepare('SELECT payload FROM operation_records WHERE key=?').bind('room-panorama:'+id).first<{payload:string}>();
 if(!row)return new Response(null,{status:404});
 const binary=atob(row.payload);const bytes=new Uint8Array(binary.length);
 for(let i=0;i<binary.length;i++)bytes[i]=binary.charCodeAt(i);
 return new Response(bytes,{headers:{'Content-Type':'image/jpeg','Cache-Control':'public,max-age=31536000,immutable','Access-Control-Allow-Origin':'*','X-Content-Type-Options':'nosniff'}});
}
