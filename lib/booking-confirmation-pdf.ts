import {pdfFromPages} from './bill-pdf';

const clean=(value:any)=>String(value??'').trim();
const displayDate=(value:any)=>{
 const v=clean(value);if(!/^\d{4}-\d{2}-\d{2}$/.test(v))return v||'Not added';
 const d=new Date(v+'T00:00:00Z');
 return d.toLocaleDateString('en-GB',{day:'2-digit',month:'short',year:'numeric',timeZone:'UTC'});
};

export function createBookingConfirmationPdf(booking:any):File{
 const w=1240,h=1754,margin=58,images:Uint8Array[]=[];
 const canvas=document.createElement('canvas');canvas.width=w;canvas.height=h;
 const ctx=canvas.getContext('2d');if(!ctx)throw Error('Could not prepare booking confirmation PDF.');
 const excursions=Array.isArray(booking.excursions)?booking.excursions:Array.isArray(booking.packageExcursions)?booking.packageExcursions:[];
 const guestCount=Math.max(0,Number(booking.pax)||Number(booking.adults||0)+Number(booking.children||0));
 const guests=Array.isArray(booking.guests)&&booking.guests.length?booking.guests.map((g:any,i:number)=>({name:clean(g?.name)||('Guest '+(i+1)),passport:clean(g?.passport),kind:clean(g?.kind),age:g?.age})):[{name:clean(booking.guest)||'Guest',passport:'',kind:'adult',age:null}];
 const dark='#063f58',teal='#0d829f',aqua='#dff4f7',sand='#f6f0e5',text='#263f4d',muted='#617985',line='#d8e3e7';
 const roundRect=(x:number,y:number,width:number,height:number,r:number,fill:string,stroke?:string)=>{
  ctx.beginPath();ctx.roundRect(x,y,width,height,r);ctx.fillStyle=fill;ctx.fill();
  if(stroke){ctx.strokeStyle=stroke;ctx.lineWidth=1.5;ctx.stroke();}
 };
 const textLine=(value:string,x:number,y:number,size=22,bold=false,color=text,maxWidth?:number)=>{
  ctx.font=`${bold?'bold ':''}${size}px sans-serif`;ctx.fillStyle=color;ctx.fillText(value,x,y,maxWidth);
 };
 const wrap=(value:string,x:number,y:number,maxWidth:number,size=21,bold=false,color=text,lineHeight=size+10)=>{
  ctx.font=`${bold?'bold ':''}${size}px sans-serif`;ctx.fillStyle=color;
  const words=String(value||'').split(/\s+/);let row='',yy=y;
  for(const word of words){
   const next=row?row+' '+word:word;
   if(ctx.measureText(next).width>maxWidth&&row){ctx.fillText(row,x,yy);yy+=lineHeight;row=word;}else row=next;
  }
  if(row)ctx.fillText(row,x,yy);
  return yy+lineHeight;
 };
 const field=(label:string,value:any,x:number,y:number,labelW=145,width=460)=>{
  textLine(label,x,y,20,false,muted,labelW);
  return wrap(clean(value)||'—',x+labelW,y,width-labelW,20,true,text,28);
 };
 const cardHeader=(x:number,y:number,width:number,title:string,fill:string)=>{
  roundRect(x,y,width,58,13,fill);
  textLine(title,x+24,y+38,22,true,dark);
 };
 const footerWaves=()=>{
  ctx.fillStyle='#cceff3';ctx.beginPath();ctx.moveTo(0,h-60);ctx.quadraticCurveTo(260,h-115,520,h-68);ctx.quadraticCurveTo(800,h-25,1240,h-78);ctx.lineTo(1240,h);ctx.lineTo(0,h);ctx.closePath();ctx.fill();
  ctx.fillStyle='#1586a5';ctx.beginPath();ctx.moveTo(0,h-35);ctx.quadraticCurveTo(260,h-88,560,h-45);ctx.quadraticCurveTo(850,h-5,1240,h-52);ctx.lineTo(1240,h);ctx.lineTo(0,h);ctx.closePath();ctx.fill();
  ctx.fillStyle='#08657f';ctx.beginPath();ctx.moveTo(0,h-18);ctx.quadraticCurveTo(330,h-55,610,h-24);ctx.quadraticCurveTo(900,h+6,1240,h-30);ctx.lineTo(1240,h);ctx.lineTo(0,h);ctx.closePath();ctx.fill();
 };
 ctx.fillStyle='white';ctx.fillRect(0,0,w,h);
 ctx.fillStyle=teal;ctx.fillRect(0,0,w,12);

 // Header / brand
 textLine('NIRILI VILLA',margin,80,40,true,dark);
 textLine('Dhiffushi Island · Kaafu Atoll · Maldives',margin,116,20,false,muted);
 textLine('BOOKING CONFIRMATION',w-margin-410,80,31,true,dark,410);
 textLine('Your island stay is confirmed',w-margin-410,115,18,false,teal,410);

 // Decorative tropical corner
 ctx.strokeStyle='#b9d9d7';ctx.lineWidth=4;
 for(let i=0;i<6;i++){ctx.beginPath();ctx.moveTo(w-15,20+i*7);ctx.quadraticCurveTo(w-95,45+i*15,w-150,5+i*12);ctx.stroke();}

 // Large title
 textLine('BOOKING CONFIRMATION',margin,195,42,true,dark);
 textLine('THANK YOU FOR CHOOSING NIRILI VILLA',margin,230,18,false,teal);

 // Guest summary ribbon
 roundRect(margin,260,w-margin*2,118,18,sand);
 const colW=(w-margin*2)/4;
 const summary=[
  ['Guest name',clean(booking.guest)||'Guest'],
  ['Booking reference',clean(booking.id)||'—'],
  ['Status',clean(booking.stayStatus||booking.status)||'Confirmed'],
  ['Package',clean(booking.packageName)||'Stay']
 ];
 summary.forEach((item,i)=>{
  const x=margin+i*colW+22;
  if(i){ctx.strokeStyle='#d4cdc2';ctx.beginPath();ctx.moveTo(margin+i*colW,280);ctx.lineTo(margin+i*colW,356);ctx.stroke();}
  textLine(item[0],x,305,17,false,muted,colW-35);
  wrap(item[1],x,340,colW-35,24,true,dark,28);
 });

 const leftX=margin,rightX=635,leftW=520,rightW=w-margin-rightX;
 let y=410;

 // Stay details
 roundRect(leftX,y,leftW,405,16,'#ffffff','#cbe3e8');cardHeader(leftX,y,leftW,'STAY DETAILS',teal);
 let ly=y+92;
 ly=field('Property','Nirili Villa, Dhiffushi',leftX+24,ly,150,leftW-48);
 ly=field('Check-in',displayDate(booking.checkIn)+' · 14:00',leftX+24,ly+7,150,leftW-48);
 ly=field('Check-out',displayDate(booking.checkOut)+' · 12:00',leftX+24,ly+7,150,leftW-48);
 if(booking.roomType)ly=field('Room type',booking.roomType,leftX+24,ly+7,150,leftW-48);
 ly=field('Guests',guestCount+(booking.adults!=null?' · '+booking.adults+' adult'+(Number(booking.adults)===1?'':'s'):'')+(Number(booking.children)>0?' · '+booking.children+' child'+(Number(booking.children)===1?'':'ren'):''),leftX+24,ly+7,150,leftW-48);
 field('Meal plan',booking.meal||'Not added',leftX+24,ly+7,150,leftW-48);

 // Included services
 const serviceH=excursions.length?405:325;
 roundRect(rightX,y,rightW,serviceH,16,'#ffffff','#cbe3e8');cardHeader(rightX,y,rightW,'INCLUDED SERVICES',aqua);
 let ry=y+92;
 ry=field('Accommodation','Included',rightX+24,ry,155,rightW-48);
 ry=field('Meal plan',booking.meal||'Not added',rightX+24,ry+7,155,rightW-48);
 ry=field('Airport transfer',booking.transfer&&booking.transfer!=='none'?(booking.transfer==='return'?'Return airport transfer':'Arrival airport transfer'):'Not included',rightX+24,ry+7,155,rightW-48);
 textLine('Excursions',rightX+24,ry+9,20,false,muted);
 if(excursions.length){
  let ey=ry+9;
  excursions.forEach((item:any,index:number)=>{ey=wrap((index+1)+'. '+(typeof item==='string'?item:clean(item.name)||clean(item.id)),rightX+179,ey,rightW-210,19,true,text,27);});
 }else textLine('Not included',rightX+179,ry+9,20,true,text);

 // Guest details
 const gy=y+430,guestCardH=205+Math.max(0,guests.length-1)*62;
 roundRect(leftX,gy,leftW,guestCardH,16,'#ffffff','#e5d9c6');cardHeader(leftX,gy,leftW,'GUEST DETAILS',sand);
 let gyy=gy+90;
 guests.forEach((g:any,index:number)=>{
  textLine((g.kind==='child'?'Child ':'Guest ')+(index+1)+(g.kind==='child'&&Number.isInteger(Number(g.age))?' · Age '+Number(g.age):''),leftX+24,gyy,18,false,muted,160);
  gyy=wrap(g.name,leftX+134,gyy,leftW-158,19,true,text,26);
  if(g.passport){textLine('Passport',leftX+24,gyy,17,false,muted,110);gyy=wrap(g.passport,leftX+134,gyy,leftW-158,18,true,text,25);}
  gyy+=8;
 });
 if(booking.phone)gyy=field('WhatsApp',booking.phone,leftX+24,gyy,145,leftW-48);
 if(booking.email)field('Email',booking.email,leftX+24,gyy+8,145,leftW-48);

 // Guest information
 roundRect(rightX,gy,rightW,210,16,'#ffffff','#cbe3e8');cardHeader(rightX,gy,rightW,'GUEST INFORMATION',aqua);
 let iy=gy+93;
 iy=field('Check-in time','14:00',rightX+24,iy,155,rightW-48);
 iy=field('Check-out time','12:00',rightX+24,iy+8,155,rightW-48);
 field('Property','Nirili Villa, Dhiffushi Island, Maldives',rightX+24,iy+8,155,rightW-48);

 // Notes / decorative band
 const ny=gy+Math.max(245,guestCardH+35);
 if(booking.notes){
  roundRect(margin,ny,w-margin*2,125,16,'#f8fbfc','#dce8eb');
  textLine('BOOKING NOTES',margin+24,ny+36,20,true,dark);
  wrap(booking.notes,margin+24,ny+72,w-margin*2-48,19,false,text,27);
 }

 // Tagline
 const tagY=booking.notes?ny+175:ny+90;
 ctx.textAlign='center';
 textLine('Arrive as a Guest, Leave as a Friend.',w/2,tagY,31,true,dark);
 textLine('A warm island welcome awaits you in Dhiffushi.',w/2,tagY+38,18,false,muted);
 ctx.textAlign='left';

 // Privacy/payment note
 const noteY=tagY+88;
 roundRect(margin,noteY,w-margin*2,66,14,'#f8fbfc');
 textLine('Guest confirmation',margin+22,noteY+27,17,true,teal);
 textLine('This confirmation does not show prices, discounts, payments or balances.',margin+22,noteY+50,17,false,muted);

 // Footer
 textLine('Nirili Villa · Dhiffushi Island, Maldives',margin,h-85,18,false,muted);
 ctx.textAlign='right';textLine('A SMALL ISLAND · A BIG WELCOME',w-margin,h-85,16,true,dark);ctx.textAlign='left';
 footerWaves();

 const raw=atob(canvas.toDataURL('image/jpeg',.95).split(',')[1]);images.push(Uint8Array.from(raw,ch=>ch.charCodeAt(0)));
 const bytes=pdfFromPages(images,w,h);
 return new File([bytes as BlobPart],'Booking Confirmation.pdf',{type:'application/pdf'});
}
