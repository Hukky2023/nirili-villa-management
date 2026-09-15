'use client';
import {useState} from 'react';
import {UiText} from './ui-language';
export default function MenuPhotoEditor({value,onChange,onBusy}:{value?:string;onChange:(value:string)=>void;onBusy:(busy:boolean)=>void}){
 const [error,setError]=useState(''),[loading,setLoading]=useState(false);
 async function upload(file?:File){if(!file)return;setError('');setLoading(true);onBusy(true);let url='';try{
 if(!['image/jpeg','image/png','image/webp'].includes(file.type)||file.size>15000000)throw Error('Choose a JPG, PNG or WebP photo under 15 MB.');
 url=URL.createObjectURL(file);const img=new Image();await new Promise<void>((resolve,reject)=>{img.onload=()=>resolve();img.onerror=()=>reject(Error('Cannot read this photo.'));img.src=url;});
 const scale=Math.min(1,640/Math.max(img.naturalWidth,img.naturalHeight));const canvas=document.createElement('canvas');canvas.width=Math.max(1,Math.round(img.naturalWidth*scale));canvas.height=Math.max(1,Math.round(img.naturalHeight*scale));const ctx=canvas.getContext('2d');if(!ctx)throw Error('Cannot prepare this photo.');ctx.fillStyle='#fff';ctx.fillRect(0,0,canvas.width,canvas.height);ctx.drawImage(img,0,0,canvas.width,canvas.height);
 const blob=await new Promise<Blob|null>(resolve=>canvas.toBlob(resolve,'image/jpeg',0.7));if(!blob||blob.size>200000)throw Error('Photo is too large. Choose a smaller image.');
 const r=await fetch('/api/menu-images',{method:'POST',headers:{'Content-Type':'image/jpeg'},body:blob}),d=await r.json();if(!r.ok)throw Error(d.error||'Upload failed.');onChange(d.url);
 }catch(e){setError((e as Error).message);}finally{if(url)URL.revokeObjectURL(url);setLoading(false);onBusy(false);}}
 return <div className="menu-photo-editor"><label><UiText>Menu photo</UiText><input type="file" accept="image/jpeg,image/png,image/webp" disabled={loading} onChange={e=>{upload(e.target.files?.[0]);e.target.value='';}}/></label>{loading&&<p role="status"><UiText>Uploading photo…</UiText></p>}{error&&<p role="alert">{error}</p>}{value&&<><img src={value} alt="Menu photo preview" width={160} height={120} style={{objectFit:'cover',borderRadius:8}}/><button type="button" disabled={loading} onClick={()=>onChange('')}><UiText>Remove photo</UiText></button></>}</div>;
}
