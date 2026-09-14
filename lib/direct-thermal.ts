let loading:Promise<any>|null=null;
export async function connectThermal(){
 const w=window as any;
 if(!w.qz){if(!loading)loading=new Promise((resolve,reject)=>{const script=document.createElement('script');script.src='/vendor/qz-tray-2.2.5.js';script.onload=()=>resolve(w.qz);script.onerror=()=>{loading=null;script.remove();reject(Error('Could not load the print connector. Refresh and try again.'));};document.head.appendChild(script);});await loading;}
 if(!w.qz.websocket.isActive())await w.qz.websocket.connect({retries:0,delay:1});
 return w.qz;
}
export async function thermalPrinters(){const qz=await connectThermal();return await qz.printers.find() as string[];}
export function receiptRaster(){
 const receipt=document.querySelector('.restaurant-receipt');if(!receipt)throw Error('Receipt not ready.');
 const canvas=document.createElement('canvas');canvas.width=384;const ctx=canvas.getContext('2d');if(!ctx)throw Error('This browser cannot prepare the receipt.');
 const lines:{text:string;bold:boolean;center:boolean}[]=[];
 function add(value:string,bold=false,center=false){ctx!.font=(bold?'bold ':'')+'20px Arial';const words=value.trim().split(/\s+/);let text='';for(const word of words){for(const part of Array.from(word)){if(ctx!.measureText(text+part).width>360){lines.push({text,bold,center});text='';}text+=part;}if(ctx!.measureText(text+' ').width>360){lines.push({text,bold,center});text='';}else text+=' ';}if(text.trim())lines.push({text:text.trim(),bold,center});}
 receipt.querySelector('header')?.querySelectorAll('small,h1,p,b').forEach(e=>add(e.textContent||'',e.tagName==='H1'||e.tagName==='B',true));
 add('--------------------------------',false,true);
 receipt.querySelectorAll('.receipt-meta p').forEach(e=>add(Array.from(e.children).map(c=>c.textContent).join(': ')));
 add('--------------------------------',false,true);
 receipt.querySelectorAll('tbody tr').forEach(row=>{const cells=row.querySelectorAll('td');if(cells.length!==2)return;add(Array.from(cells[0].childNodes).map(c=>c.textContent).join(' '));add('Amount USD: '+(cells[1].textContent||''),true);});
 add('--------------------------------',false,true);
 receipt.querySelectorAll('.receipt-totals p').forEach(e=>add(Array.from(e.children).map(c=>c.textContent).join(': '),e.classList.contains('receipt-grand')));
 add(receipt.querySelector('.receipt-status')?.textContent||'',true,true);
 receipt.querySelector('footer')?.querySelectorAll('p,small').forEach(e=>add(e.textContent||'',false,true));
 canvas.height=16+lines.length*26;ctx.fillStyle='white';ctx.fillRect(0,0,384,canvas.height);ctx.fillStyle='black';ctx.textBaseline='top';lines.forEach((line,i)=>{ctx.font=(line.bold?'bold ':'')+'20px Arial';ctx.textAlign=line.center?'center':'left';ctx.fillText(line.text,line.center?192:12,8+i*26);});
 return canvas.toDataURL('image/png').split(',')[1];
}
export async function directThermalPrint(printer:string){
 if(!printer)throw Error('Select a printer first.');const image=receiptRaster(),qz=await connectThermal();
 const printers=await qz.printers.find();if(!printers.includes(printer))throw Error('The selected printer is unavailable. Reconnect and select it again.');
 await qz.print(qz.configs.create(printer,{forceRaw:true,copies:1,jobName:'Nirili Villa receipt'}),['\x1b\x40',{type:'raw',format:'image',flavor:'base64',data:image,options:{language:'ESCPOS',dotDensity:'double'}},'\n\n']);
}
