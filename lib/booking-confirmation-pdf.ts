import {pdfFromPages} from './bill-pdf';

const clean=(value:any)=>String(value??'').trim();
const displayDate=(value:any)=>{
 const v=clean(value);if(!/^\d{4}-\d{2}-\d{2}$/.test(v))return v||'Not added';
 const d=new Date(v+'T00:00:00Z');
 return d.toLocaleDateString('en-GB',{day:'2-digit',month:'short',year:'numeric',timeZone:'UTC'});
};

export function createBookingConfirmationPdf(booking:any):File{
 const w=1240,h=1754,margin=90,images:Uint8Array[]=[];
 const canvas=document.createElement('canvas');canvas.width=w;canvas.height=h;
 const ctx=canvas.getContext('2d');if(!ctx)throw Error('Could not prepare booking confirmation PDF.');
 let y=0,page=0;
 const finish=()=>{
  ctx.font='21px sans-serif';ctx.fillStyle='#6b7e89';
  ctx.fillText('Nirili Villa · Dhiffushi Island, Maldives',margin,h-68);
  ctx.textAlign='right';ctx.fillText('Page '+page,w-margin,h-68);ctx.textAlign='left';
  const raw=atob(canvas.toDataURL('image/jpeg',.94).split(',')[1]);
  images.push(Uint8Array.from(raw,ch=>ch.charCodeAt(0)));
 };
 const start=()=>{
  page++;ctx.fillStyle='white';ctx.fillRect(0,0,w,h);
  ctx.fillStyle='#0b789d';ctx.fillRect(0,0,w,16);
  ctx.font='bold 42px sans-serif';ctx.fillStyle='#073f59';ctx.fillText('NIRILI VILLA',margin,105);
  ctx.font='23px sans-serif';ctx.fillStyle='#58717e';ctx.fillText('Dhiffushi Island · Kaafu Atoll · Maldives',margin,145);
  ctx.textAlign='right';ctx.font='bold 28px sans-serif';ctx.fillStyle='#073f59';ctx.fillText('BOOKING CONFIRMATION',w-margin,105);
  ctx.textAlign='left';y=210;
 };
 const line=(label:string,value:any,bold=false,size=25)=>{
  const text=label+(label?' ':'')+clean(value);
  ctx.font=`${bold?'bold ':''}${size}px sans-serif`;
  const rows:string[]=[];let row='';
  for(const ch of text){
   if(ch==='\n'||ctx.measureText(row+ch).width>w-margin*2){rows.push(row);row=ch==='\n'?'':ch}else row+=ch;
  }
  rows.push(row);
  for(const r of rows){
   if(y>h-145){finish();start();ctx.font=`${bold?'bold ':''}${size}px sans-serif`;}
   ctx.fillStyle=bold?'#073f59':'#263f4d';ctx.fillText(r,margin,y);y+=size+15;
  }
 };
 const heading=(text:string)=>{y+=18;line('',text,true,27);y+=4;};
 const excursions=Array.isArray(booking.excursions)?booking.excursions:Array.isArray(booking.packageExcursions)?booking.packageExcursions:[];
 const guestCount=Math.max(0,Number(booking.pax)||Number(booking.adults||0)+Number(booking.children||0));
 start();
 line('',clean(booking.guest)||'Guest',true,35);
 line('Booking reference:',booking.id||'Not added');
 line('Status:',booking.stayStatus||booking.status||'Confirmed',true);
 if(booking.packageName)line('Package:',booking.packageName);

 heading('STAY DETAILS');
 line('Property:','Nirili Villa, Dhiffushi');
 line('Check-in:',displayDate(booking.checkIn)+' · 14:00');
 line('Check-out:',displayDate(booking.checkOut)+' · 12:00');
 if(booking.room)line('Room:',booking.room);
 if(booking.roomType)line('Room type:',booking.roomType);
 line('Guests:',guestCount+(booking.adults!=null?' · '+booking.adults+' adult'+(Number(booking.adults)===1?'':'s'):'')+(Number(booking.children)>0?' · '+booking.children+' child'+(Number(booking.children)===1?'':'ren'):''));
 line('Meal plan:',booking.meal||'Not added');

 heading('GUEST DETAILS');
 if(booking.phone)line('WhatsApp:',booking.phone);
 if(booking.email)line('Email:',booking.email);

 heading('INCLUDED SERVICES');
 line('Accommodation:','Included');
 line('Meal plan:',booking.meal||'Not added');
 if(booking.transfer&&booking.transfer!=='none')line('Airport transfer:',booking.transfer==='return'?'Return airport transfer':'Arrival airport transfer');
 else line('Airport transfer:','Not included');
 if(excursions.length){
  line('Excursions:','');
  excursions.forEach((item:any,index:number)=>line('',(index+1)+'. '+(typeof item==='string'?item:clean(item.name)||clean(item.id)),false,23));
 }else line('Excursions:','Not included');

 if(booking.notes){heading('BOOKING NOTES');line('',booking.notes,false,23);}
 heading('GUEST INFORMATION');
 line('Check-in time:','14:00');
 line('Check-out time:','12:00');
 line('Property:','Nirili Villa, Dhiffushi Island, Maldives');
 y+=20;line('','Arrive as a Guest, Leave as a Friend.',true,25);
 y+=20;line('','This confirmation intentionally does not show prices, discounts, payments or balances.',false,19);
 finish();
 const bytes=pdfFromPages(images,w,h);
 return new File([bytes as BlobPart],'Booking Confirmation.pdf',{type:'application/pdf'});
}
