import {printUSB} from './usb-thermal';
import {PrinterSettings,readPrinterSettings,normalizeSettings} from './printer-settings';
let loading:Promise<any>|null=null;
export async function connectThermal(){
 const w=window as any;
 if(!w.qz){if(!loading)loading=new Promise((resolve,reject)=>{const script=document.createElement('script');script.src='/vendor/qz-tray-2.2.5.js';script.onload=()=>resolve(w.qz);script.onerror=()=>{loading=null;script.remove();reject(Error('Could not load the print connector. Refresh and try again.'));};document.head.appendChild(script);});await loading;}
 if(!w.qz.websocket.isActive())await w.qz.websocket.connect({retries:0,delay:1});
 return w.qz;
}
export async function thermalPrinters(){const qz=await connectThermal();return await qz.printers.find() as string[];}
export function receiptCanvas(options:PrinterSettings=readPrinterSettings(),test=false){
 const settings=normalizeSettings(options),font=Math.round(20*settings.scale/100),lineHeight=Math.ceil(font*1.3),left=Math.round(settings.left*8),right=Math.round(settings.right*8),top=Math.round(settings.top*8),bottom=Math.round(settings.bottom*8),width=384-left-right;
 const receipt=document.querySelector('.restaurant-receipt');if(!receipt&&!test)throw Error('Receipt not ready.');
 const canvas=document.createElement('canvas');canvas.width=384;const ctx=canvas.getContext('2d');if(!ctx)throw Error('This browser cannot prepare the receipt.');
 const lines:{text:string;bold:boolean;center:boolean}[]=[];
 function add(value:string,bold=false,center=false){ctx!.font=(bold?'bold ':'')+font+'px Arial';const words=value.trim().split(/\s+/);let text='';for(const word of words){for(const part of Array.from(word)){if(ctx!.measureText(text+part).width>width){lines.push({text,bold,center});text='';}text+=part;}if(ctx!.measureText(text+' ').width>width){lines.push({text,bold,center});text='';}else text+=' ';}if(text.trim())lines.push({text:text.trim(),bold,center});}
 if(settings.header)add(settings.header,false,true);
 if(test){add('NIRILI VILLA',true,true);add('PRINTER TEST',true,true);add('58 mm · automatic receipt length');add('One sample item: $5.00');add('Total USD: $5.00',true);add('Test only — no bill created.',false,true);}else{
 receipt!.querySelector('header')?.querySelectorAll('small,h1,p,b').forEach(e=>add(e.textContent||'',e.tagName==='H1'||e.tagName==='B',true));
 add('--------------------------------',false,true);
 receipt!.querySelectorAll('.receipt-meta p').forEach(e=>add(Array.from(e.children).map(c=>c.textContent).join(': ')));
 add('--------------------------------',false,true);
 receipt!.querySelectorAll('tbody tr').forEach(row=>{const cells=row.querySelectorAll('td');if(cells.length!==2)return;add(Array.from(cells[0].childNodes).map(c=>c.textContent).join(' '));add('Amount USD: '+(cells[1].textContent||''),true);});
 add('--------------------------------',false,true);
 receipt!.querySelectorAll('.receipt-totals p').forEach(e=>add(Array.from(e.children).map(c=>c.textContent).join(': '),e.classList.contains('receipt-grand')));
 add(receipt!.querySelector('.receipt-status')?.textContent||'',true,true);
 receipt!.querySelector('footer')?.querySelectorAll('p,small').forEach(e=>add(e.textContent||'',false,true));
 }
 if(settings.footer)add(settings.footer,false,true);
 canvas.height=Math.max(1,top+bottom+lines.length*lineHeight);ctx.fillStyle='white';ctx.fillRect(0,0,384,canvas.height);ctx.fillStyle='black';ctx.textBaseline='top';lines.forEach((line,i)=>{ctx.font=(line.bold?'bold ':'')+font+'px Arial';ctx.textAlign=line.center?'center':'left';ctx.fillText(line.text,line.center?left+width/2:left,top+i*lineHeight);});
 return canvas;
}
export function receiptRaster(options:PrinterSettings=readPrinterSettings(),test=false){return receiptCanvas(options,test).toDataURL('image/png').split(',')[1];}
export async function directThermalPrint(printer:string,options:PrinterSettings=readPrinterSettings(),test=false){
 const settings=normalizeSettings(options);
 if(!printer)throw Error('Select a printer first.');if(settings.transport==='usb'){await printUSB(settings.usbDevice,receiptCanvas(settings,test),settings.copies,settings.feed);return;}const image=receiptRaster(settings,test),qz=await connectThermal();
 const printers=await qz.printers.find();if(!printers.includes(printer))throw Error('The selected printer is unavailable. Reconnect and select it again.');
 await qz.print(qz.configs.create(printer,{forceRaw:true,copies:settings.copies,jobName:'Nirili Villa receipt'}),['\x1b\x40',{type:'raw',format:'image',flavor:'base64',data:image,options:{language:'ESCPOS',dotDensity:'double'}},'\n'.repeat(settings.feed)]);
}
