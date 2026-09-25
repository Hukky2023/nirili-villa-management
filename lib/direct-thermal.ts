import {openCashDrawerUSB,printUSB,rasterCommands} from './usb-thermal';
import {PrinterSettings,readPrinterSettings,normalizeSettings} from './printer-settings';
let loading:Promise<any>|null=null;
function desktopBridge(){return typeof window!=='undefined'?(window as any).niriliDesktop:null;}
export function desktopPOSAvailable(){return !!desktopBridge();}
function bytesToBase64(bytes:Uint8Array){let binary='';for(let i=0;i<bytes.length;i+=32768)binary+=String.fromCharCode(...bytes.subarray(i,Math.min(bytes.length,i+32768)));return btoa(binary);}
function desktopReceiptBytes(canvas:HTMLCanvasElement,settings:PrinterSettings){const context=canvas.getContext('2d');if(!context)throw Error('Could not prepare the receipt.');const blocks=rasterCommands(canvas.width,canvas.height,context.getImageData(0,0,canvas.width,canvas.height).data);const chunks=[new Uint8Array([27,64]),...blocks,...(settings.feed?[new Uint8Array([27,100,settings.feed])]:[])];const length=chunks.reduce((n,b)=>n+b.length,0),all=new Uint8Array(length);let offset=0;for(const chunk of chunks){all.set(chunk,offset);offset+=chunk.length;}return all;}
export async function connectThermal(){
 const w=window as any;
 if(!w.qz){if(!loading)loading=new Promise((resolve,reject)=>{const script=document.createElement('script');script.src='/vendor/qz-tray-2.2.5.js';script.onload=()=>resolve(w.qz);script.onerror=()=>{loading=null;script.remove();reject(Error('Could not load the print connector. Refresh and try again.'));};document.head.appendChild(script);});await loading;}
 if(!w.qz.websocket.isActive())await w.qz.websocket.connect({retries:0,delay:1});
 return w.qz;
}
export async function thermalPrinters(){const desktop=desktopBridge();if(desktop?.listPrinters)return await desktop.listPrinters() as string[];const qz=await connectThermal();return await qz.printers.find() as string[];}
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
 if(!printer)throw Error('Select a printer first.');const desktop=desktopBridge();if(desktop?.rawPrint){const bytes=desktopReceiptBytes(receiptCanvas(settings,test),settings);for(let copy=0;copy<settings.copies;copy++)await desktop.rawPrint(printer,bytesToBase64(bytes));return;}if(settings.transport==='usb'){await printUSB(settings.usbDevice,receiptCanvas(settings,test),settings.copies,settings.feed);return;}const image=receiptRaster(settings,test),qz=await connectThermal();
 const printers=await qz.printers.find();if(!printers.includes(printer))throw Error('The selected printer is unavailable. Reconnect and select it again.');
 await qz.print(qz.configs.create(printer,{forceRaw:true,copies:settings.copies,jobName:'Nirili Villa receipt'}),['\x1b\x40',{type:'raw',format:'image',flavor:'base64',data:image,options:{language:'ESCPOS',dotDensity:'double'}},'\n'.repeat(settings.feed)]);
}


export async function openCashDrawer(options:PrinterSettings=readPrinterSettings()){
 const settings=normalizeSettings(options);
 if(!settings.printer)throw Error('Connect the receipt printer first in Printer settings.');
 const desktop=desktopBridge();if(desktop?.openDrawer){await desktop.openDrawer(settings.printer);return;}
 if(settings.transport==='usb'){
  if(!settings.usbDevice)throw Error('Reconnect your USB printer in Printer settings.');
  await openCashDrawerUSB(settings.usbDevice);return;
 }
 const qz=await connectThermal();const printers=await qz.printers.find();
 if(!printers.includes(settings.printer))throw Error('The selected printer is unavailable. Reconnect it in Printer settings.');
 await qz.print(qz.configs.create(settings.printer,{forceRaw:true,jobName:'Nirili Villa cash drawer'}),['\x1b\x70\x00\x19\xfa']);
}
