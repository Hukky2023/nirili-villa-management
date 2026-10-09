import {stayInclusiveTaxBreakdown,SERVICE_CHARGE_RATE,TOURISM_GST_RATE,GREEN_TAX_USD_PER_PERSON_DAY} from './tax-inclusive';
// JPEG-backed A4 pages preserve the browser's Unicode font rendering in the PDF.
export function pdfFromPages(images:Uint8Array[],width=1240,height=1754):Uint8Array{
 const enc=new TextEncoder(),chunks:Uint8Array[]=[],offsets:number[]=[0];let length=0;
 const put=(v:string|Uint8Array)=>{const b=typeof v==='string'?enc.encode(v):v;chunks.push(b);length+=b.length};
 const obj=(id:number,value:string)=>{offsets[id]=length;put(`${id} 0 obj\n${value}\nendobj\n`)};
 put('%PDF-1.4\n');obj(1,'<< /Type /Catalog /Pages 2 0 R >>');obj(2,`<< /Type /Pages /Count ${images.length} /Kids [${images.map((_,i)=>`${3+i*3} 0 R`).join(' ')}] >>`);
 images.forEach((image,i)=>{const id=3+i*3;obj(id,`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595.28 841.89] /Resources << /XObject << /Im ${id+1} 0 R >> >> /Contents ${id+2} 0 R >>`);offsets[id+1]=length;put(`${id+1} 0 obj\n<< /Type /XObject /Subtype /Image /Width ${width} /Height ${height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${image.length} >>\nstream\n`);put(image);put('\nendstream\nendobj\n');const commands='q\n595.28 0 0 841.89 0 0 cm\n/Im Do\nQ\n';obj(id+2,`<< /Length ${enc.encode(commands).length} >>\nstream\n${commands}endstream`)});
 const xref=length;put(`xref\n0 ${offsets.length}\n0000000000 65535 f \n`);for(let i=1;i<offsets.length;i++)put(String(offsets[i]).padStart(10,'0')+' 00000 n \n');put(`trailer\n<< /Size ${offsets.length} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`);const result=new Uint8Array(length);let pos=0;for(const c of chunks){result.set(c,pos);pos+=c.length}return result;
}
export function createBillPdf(stay:any):File{
 const w=1240,h=1754,margin=58,images:Uint8Array[]=[];
 const canvas=document.createElement('canvas');canvas.width=w;canvas.height=h;
 const ctx=canvas.getContext('2d');if(!ctx)throw Error('Could not prepare PDF. Please try another browser.');
 const dark='#073f59',teal='#0c819e',aqua='#e8f7fa',text='#294451',muted='#647c87',line='#d7e6ea',green='#1c7b3d',red='#c52d2d',amber='#a75c13';
 const usd=(cents:number)=>'$'+(Number(cents||0)/100).toFixed(2);
 const round=(x:number,y:number,width:number,height:number,r:number,fill:string,stroke?:string)=>{ctx.beginPath();ctx.roundRect(x,y,width,height,r);ctx.fillStyle=fill;ctx.fill();if(stroke){ctx.strokeStyle=stroke;ctx.lineWidth=1.5;ctx.stroke();}};
 const write=(value:any,x:number,y:number,size=21,bold=false,color=text,align:'left'|'right'|'center'='left',maxWidth?:number)=>{ctx.font=`${bold?'bold ':''}${size}px sans-serif`;ctx.fillStyle=color;ctx.textAlign=align;ctx.fillText(String(value??''),x,y,maxWidth);ctx.textAlign='left';};
 const wrap=(value:any,x:number,y:number,maxWidth:number,size=20,bold=false,color=text,lineHeight=size+8)=>{
  ctx.font=`${bold?'bold ':''}${size}px sans-serif`;ctx.fillStyle=color;const words=String(value??'').split(/\s+/);let row='',yy=y;
  for(const word of words){const next=row?row+' '+word:word;if(ctx.measureText(next).width>maxWidth&&row){ctx.fillText(row,x,yy);yy+=lineHeight;row=word}else row=next;}
  if(row)ctx.fillText(row,x,yy);return yy+lineHeight;
 };
 let page=0,y=0;
 const footer=()=>{write('Nirili Villa · Dhiffushi Island, Maldives',margin,h-52,17,false,muted);write('Page '+page,w-margin,h-52,17,false,muted,'right');};
 const finish=()=>{footer();const raw=atob(canvas.toDataURL('image/jpeg',.95).split(',')[1]);images.push(Uint8Array.from(raw,ch=>ch.charCodeAt(0)));};
 const startPage=()=>{
  page++;ctx.fillStyle='#fff';ctx.fillRect(0,0,w,h);ctx.fillStyle=teal;ctx.fillRect(0,0,w,12);
  write('NIRILI',margin,78,38,true,dark);write('VILLA',margin+145,78,38,true,'#14a9c9');
  write('Dhiffushi Island · Kaafu Atoll · Maldives',margin,112,19,false,muted);
  write('INVOICE',w-margin,78,34,true,dark,'right');
  write('Invoice No · '+stay.id,w-margin,111,18,false,muted,'right');
  y=155;
 };
 const ensure=(need:number)=>{if(y+need>h-105){finish();startPage();}};
 const chip=(label:string,status:string,x:number,yy:number)=>{
  const s=String(status||'').toLowerCase(),fill=s.includes('paid')&&!s.includes('unpaid')?'#e6f7eb':s.includes('cancel')?'#f1f3f4':s.includes('unpaid')?'#fff1e4':'#e7f3fb';
  const color=s.includes('paid')&&!s.includes('unpaid')?green:s.includes('cancel')?muted:s.includes('unpaid')?amber:'#176d9d';
  round(x,yy-24,150,34,17,fill);write(label,x+75,yy,16,true,color,'center');
 };
 startPage();

 // Guest/stay summary
 round(margin,y,w-margin*2,132,18,aqua,line);
 const summary=[
  ['GUEST',stay.guest||'Guest'],['ROOM',stay.room||'—'],['CHECK-IN',stay.checkIn||'—'],
  ['CHECK-OUT',stay.checkOut||'—'],['MEAL PLAN',stay.meal||'—'],['STAY STATUS',stay.status||'—']
 ];
 const colW=(w-margin*2)/3;
 summary.forEach((item,i)=>{const row=Math.floor(i/3),col=i%3,x=margin+22+col*colW,yy=y+37+row*58;write(item[0],x,yy,13,true,teal);write(item[1],x,yy+25,20,true,dark);});
 y+=164;

 write('STAY & SERVICES',margin,y,15,true,teal);write('Charges',margin,y+31,29,true,dark);y+=50;
 for(const bill of stay.folio.bills){
  const itemRows=(bill.items||[]).reduce((n:number,item:any)=>n+Math.max(1,Math.ceil(String(item[0]||'').length/45)),0);
  const boxH=92+itemRows*42+52;ensure(boxH+18);
  const top=y;round(margin,top,w-margin*2,boxH,16,'#fff',line);
  round(margin,top,w-margin*2,58,16,'#f5fafb');ctx.fillStyle='#f5fafb';ctx.fillRect(margin,top+30,w-margin*2,28);
  write(String(bill.department||'Bill').toUpperCase(),margin+20,top+24,12,true,muted);
  write(bill.id||'',margin+20,top+47,20,true,dark);
  chip(String(bill.status||'Posted'),String(bill.status||''),w-margin-170,top+40);
  let iy=top+88;
  write('ITEM',margin+20,iy,12,true,muted);write('QTY',720,iy,12,true,muted,'right');write('AMOUNT',860,iy,12,true,muted,'right');write('DISC.',980,iy,12,true,muted,'right');write('NET',w-margin-20,iy,12,true,muted,'right');iy+=24;
  for(const item of bill.items||[]){
   const net=bill.status==='Cancelled'?0:Math.round(Number(item[2]||0)*100*(1-Number(item[3]||0)/100));
   const next=wrap(item[0],margin+20,iy,590,18,false,text,24);
   write(item[1],720,iy,18,false,text,'right');write(usd(Math.round(Number(item[2]||0)*100)),860,iy,18,false,text,'right');write((item[3]||0)+'%',980,iy,18,false,text,'right');write(usd(net),w-margin-20,iy,18,true,dark,'right');
   iy=Math.max(next,iy+36);
  }
  ctx.strokeStyle=line;ctx.beginPath();ctx.moveTo(margin+20,top+boxH-50);ctx.lineTo(w-margin-20,top+boxH-50);ctx.stroke();
  write('Bill total',w-margin-220,top+boxH-19,17,false,muted,'right');write(usd(bill.totalCents),w-margin-20,top+boxH-19,20,true,dark,'right');
  y=top+boxH+16;
 }

 const tax=stayInclusiveTaxBreakdown(stay.folio.totalCents,stay);
 ensure(430);
 const sectionTop=y+10,leftW=515,rightX=margin+leftW+24,rightW=w-margin-rightX;
 round(margin,sectionTop,leftW,325,16,'#fff',line);
 write('PAYMENTS',margin+20,sectionTop+30,13,true,teal);write('Payments received',margin+20,sectionTop+60,25,true,dark);
 let py=sectionTop+100;write('Opening payments',margin+20,py,18,false,muted);write(usd(stay.initialPaid),margin+leftW-20,py,18,true,dark,'right');py+=34;
 for(const p of stay.payments||[]){write(String(p.date||'').slice(0,10),margin+20,py,17,true,text);write((p.method||'')+(p.reference?' · '+p.reference:''),margin+20,py+22,15,false,muted);write(usd(p.cents),margin+leftW-20,py+12,18,true,dark,'right');py+=52;if(py>sectionTop+285)break;}
 if(!(stay.payments||[]).length)write('No additional payments recorded.',margin+20,py,16,false,muted);

 round(rightX,sectionTop,rightW,325,16,'#f8fcfd',line);
 write('INVOICE SUMMARY',rightX+20,sectionTop+30,13,true,teal);
 const rows=[
  ['Price before tax/service',usd(tax.baseCents)],['Service charge '+Math.round(SERVICE_CHARGE_RATE*100)+'%',usd(tax.serviceChargeCents)],
  ['Tourism GST '+Math.round(TOURISM_GST_RATE*100)+'%',usd(tax.tourismGstCents)],['Green Tax',usd(tax.greenTaxCents)]
 ];
 let sy=sectionTop+70;for(const row of rows){write(row[0],rightX+20,sy,17,false,muted);write(row[1],rightX+rightW-20,sy,17,true,dark,'right');sy+=33;}
 write('USD '+GREEN_TAX_USD_PER_PERSON_DAY+' per taxable guest/day',rightX+20,sy,14,false,muted);sy+=22;
 round(rightX+14,sy,rightW-28,46,10,'#e7f3fb');write('Total charges',rightX+28,sy+30,18,true,dark);write(usd(stay.folio.totalCents),rightX+rightW-28,sy+30,20,true,dark,'right');sy+=55;
 round(rightX+14,sy,rightW-28,44,10,'#e7f7eb');write('Payments received',rightX+28,sy+29,17,true,green);write(usd(stay.folio.paidCents),rightX+rightW-28,sy+29,19,true,green,'right');sy+=53;
 const due=Number(stay.folio.balanceCents||0)>0;round(rightX+14,sy,rightW-28,48,10,due?'#fff0f0':'#eaf8ee');write('Balance due',rightX+28,sy+31,18,true,due?red:green);write(usd(stay.folio.balanceCents),rightX+rightW-28,sy+31,22,true,due?red:green,'right');

 y=sectionTop+355;round(margin,y,w-margin*2,68,14,'#eef8fb');write('All taxes and service charge are included in the total.',margin+20,y+28,17,true,dark);write('Guest price is unchanged.',margin+20,y+50,16,false,muted);y+=112;
 write('Thank you for staying with us!',w/2,y,28,true,dark,'center');write('Arrive as a Guest, Leave as a Friend.',w/2,y+36,21,false,teal,'center');

 finish();
 const bytes=pdfFromPages(images,w,h);
 return new File([bytes as BlobPart],`Nirili-Villa-Invoice-${stay.id}.pdf`,{type:'application/pdf'});
}
export function downloadBill(file:File){const url=URL.createObjectURL(file),link=document.createElement('a');link.href=url;link.download=file.name;document.body.appendChild(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(url),60000);}
export function whatsappBillUrl(stay:any){if(!/^\+[1-9]\d{7,14}$/.test(stay.whatsapp||''))throw Error('Save a WhatsApp number with country code first.');return 'https://wa.me/'+stay.whatsapp.slice(1)+'?text='+encodeURIComponent(`Hello ${stay.guest}, your Nirili Villa bill ${stay.id} for Room ${stay.room} is ready. Total: $${(stay.folio.totalCents/100).toFixed(2)}. Paid: $${(stay.folio.paidCents/100).toFixed(2)}. Balance: $${(stay.folio.balanceCents/100).toFixed(2)}.`)}
