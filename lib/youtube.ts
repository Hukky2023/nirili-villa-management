export function youtubeVideoId(value:string){
 try{
  const url=new URL(value),host=url.hostname.toLowerCase().replace(/^www\./,'');
  if(!['https:','http:'].includes(url.protocol)||url.username||url.password)return '';
  const parts=url.pathname.split('/').filter(Boolean);
  const id=host==='youtu.be'?parts[0]:['youtube.com','m.youtube.com','youtube-nocookie.com'].includes(host)?url.pathname==='/watch'?url.searchParams.get('v'):['embed','shorts','live'].includes(parts[0])?parts[1]:'':'';
  return id&&/^[A-Za-z0-9_-]{11}$/.test(id)?id:'';
 }catch{return '';}
}
export function cleanYouTubeUrl(value:any){
 const raw=String(value||'').trim();
 if(!raw)return '';
 const id=youtubeVideoId(raw);
 if(!id)throw Error('Enter a valid YouTube video link.');
 return 'https://www.youtube.com/watch?v='+id;
}
export function youtubeEmbed(value:string){
 const id=youtubeVideoId(value);
 return id?'https://www.youtube-nocookie.com/embed/'+id:'';
}
