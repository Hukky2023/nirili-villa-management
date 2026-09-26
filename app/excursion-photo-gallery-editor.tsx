'use client';

import {useState} from 'react';
import {ImagePlus,Trash2} from 'lucide-react';

const MAX_PHOTOS=10;

async function preparePhoto(file:File){
 if(!['image/jpeg','image/png','image/webp'].includes(file.type)||file.size>15000000)throw Error('Choose JPG, PNG or WebP photos under 15 MB.');
 const local=URL.createObjectURL(file);
 try{
  const img=new Image();
  await new Promise<void>((resolve,reject)=>{img.onload=()=>resolve();img.onerror=()=>reject(Error('Cannot read this photo.'));img.src=local;});
  const maxSide=1200,scale=Math.min(1,maxSide/Math.max(img.naturalWidth,img.naturalHeight));
  const canvas=document.createElement('canvas');
  canvas.width=Math.max(1,Math.round(img.naturalWidth*scale));
  canvas.height=Math.max(1,Math.round(img.naturalHeight*scale));
  const ctx=canvas.getContext('2d');
  if(!ctx)throw Error('Cannot prepare this photo.');
  ctx.fillStyle='#fff';ctx.fillRect(0,0,canvas.width,canvas.height);ctx.drawImage(img,0,0,canvas.width,canvas.height);
  let quality=.8;
  let blob:Blob|null=null;
  for(let attempt=0;attempt<5;attempt++){
   blob=await new Promise<Blob|null>(resolve=>canvas.toBlob(resolve,'image/jpeg',quality));
   if(blob&&blob.size<=200000)break;
   quality-=.12;
  }
  if(!blob||blob.size>200000)throw Error('Photo could not be compressed enough. Choose a smaller photo.');
  return blob;
 }finally{URL.revokeObjectURL(local);}
}

export default function ExcursionPhotoGalleryEditor({
 value,onChange,onBusy
}:{value?:string[];onChange:(value:string[])=>void;onBusy:(busy:boolean)=>void}){
 const photos=Array.isArray(value)?value:[];
 const [error,setError]=useState(''),[uploading,setUploading]=useState(false);

 async function upload(files:FileList|null){
  if(!files?.length)return;
  setError('');
  const remaining=Math.max(0,MAX_PHOTOS-photos.length);
  if(!remaining){setError('Maximum 10 photos per excursion.');return;}
  const chosen=Array.from(files).slice(0,remaining);
  setUploading(true);onBusy(true);
  const added:string[]=[];
  try{
   for(const file of chosen){
    const blob=await preparePhoto(file);
    const response=await fetch('/api/menu-images',{method:'POST',headers:{'Content-Type':'image/jpeg'},body:blob});
    const result=await response.json();
    if(!response.ok)throw Error(result.error||'Photo upload failed.');
    if(result.url)added.push(result.url);
   }
   onChange([...photos,...added].slice(0,MAX_PHOTOS));
  }catch(e){setError(e instanceof Error?e.message:'Photo upload failed.');}
  finally{setUploading(false);onBusy(false);}
 }

 function move(index:number,direction:-1|1){
  const next=[...photos],target=index+direction;
  if(target<0||target>=next.length)return;
  [next[index],next[target]]=[next[target],next[index]];
  onChange(next);
 }

 return <div className="excursion-gallery-editor">
  <div className="excursion-gallery-editor-head">
   <div><strong>Photo gallery</strong><small>Add up to 10 photos. The first photo is the cover image shown on excursion cards.</small></div>
   <label className="excursion-gallery-upload">
    <ImagePlus/>
    <span>{uploading?'Uploading…':'Upload photos'}</span>
    <input type="file" accept="image/jpeg,image/png,image/webp" multiple disabled={uploading||photos.length>=MAX_PHOTOS} onChange={e=>{void upload(e.target.files);e.target.value='';}}/>
   </label>
  </div>
  {error&&<p className="excursion-gallery-error" role="alert">{error}</p>}
  {photos.length?<div className="excursion-gallery-editor-grid">{photos.map((url,index)=><article key={url}>
   <img src={url} alt={'Excursion photo '+(index+1)}/>
   <span>{index===0?'Cover':'Photo '+(index+1)}</span>
   <div>
    <button type="button" disabled={index===0||uploading} onClick={()=>move(index,-1)} aria-label={'Move photo '+(index+1)+' left'}>←</button>
    <button type="button" disabled={index===photos.length-1||uploading} onClick={()=>move(index,1)} aria-label={'Move photo '+(index+1)+' right'}>→</button>
    <button type="button" className="remove" disabled={uploading} onClick={()=>onChange(photos.filter((_,i)=>i!==index))} aria-label={'Remove photo '+(index+1)}><Trash2/></button>
   </div>
  </article>)}</div>:<div className="excursion-gallery-empty"><ImagePlus/><span>No photos yet. Upload photos to show a gallery on the excursion menu and details page.</span></div>}
  <small className="excursion-gallery-count">{photos.length} / {MAX_PHOTOS} photos</small>
 </div>;
}
