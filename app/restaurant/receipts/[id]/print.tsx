'use client';
import {useEffect,useRef,useState} from 'react';
import {printThermalReceipt} from '../../../../lib/thermal-print';
import {directThermalPrint} from '../../../../lib/direct-thermal';
import {readPrinterSettings} from '../../../../lib/printer-settings';
import PrinterSettingsPanel from '../../../printer-settings';
export default function ReceiptPrint(){const started=useRef(false),printing=useRef(false),[message,setMessage]=useState(''),[busy,setBusy]=useState(false);
 async function print(direct=false){if(printing.current)return;printing.current=true;setBusy(true);setMessage('');try{if(direct){const settings=readPrinterSettings();await directThermalPrint(settings.printer,settings);setMessage('Receipt sent to '+settings.printer+'. Check the printer before retrying.');}else{const height=await printThermalReceipt();setMessage('Browser receipt: 58 × '+height+' mm. Driver paper settings may add blank space.');}}catch(e){setMessage((e as Error).message+' Open Printer settings to connect and select your printer.');}finally{printing.current=false;setBusy(false);}}
 useEffect(()=>{let cancelled=false;async function start(){await document.fonts.ready;if(cancelled||started.current)return;started.current=true;if(readPrinterSettings().automatic)await print(true);}start();return()=>{cancelled=true}},[]);
 return <nav className="receipt-controls"><a href="/restaurant">← Restaurant</a><PrinterSettingsPanel/><button disabled={busy} onClick={()=>print(true)}>Direct thermal print</button><button disabled={busy} onClick={()=>print(false)}>Browser print / PDF</button><p>Direct printing uses your saved printer settings and automatic receipt length. QZ Tray must be running on this computer. Browser printing may still feed a full sheet.</p>{message&&<p role="status">{message}</p>}</nav>;
}
