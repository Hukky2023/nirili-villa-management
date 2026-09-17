export function formatDateDMY(value:string|null|undefined){
 const text=String(value||'').trim();
 const match=text.match(/^(\d{4})-(\d{2})-(\d{2})$/);
 if(match)return `${match[3]}-${match[2]}-${match[1]}`;
 const date=new Date(text);
 if(Number.isNaN(date.getTime()))return text;
 const parts=new Intl.DateTimeFormat('en-GB',{timeZone:'Indian/Maldives',day:'2-digit',month:'2-digit',year:'numeric'}).formatToParts(date);
 const get=(type:string)=>parts.find(part=>part.type===type)?.value||'';
 return `${get('day')}-${get('month')}-${get('year')}`;
}

export function formatDateRangeDMY(start:string,end:string){
 return `${formatDateDMY(start)} → ${formatDateDMY(end)}`;
}
