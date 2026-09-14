'use client';
import {useEffect,useRef,useState} from 'react';
import {printThermalReceipt} from '../../../../lib/thermal-print';
export default function ReceiptPrint(){const started=useRef(false),printing=useRef(false),[message,setMessage]=useState('');
 async function print(){if(printing.current)return;printing.current=true;setMessage('');try{const height=await printThermalReceipt();setMessage('Receipt paper: 58 × '+height+' mm.');}catch(e){setMessage((e as Error).message);}finally{printing.current=false;}}
 useEffect(()=>{let cancelled=false;async function start(){await document.fonts.ready;if(cancelled||started.current)return;started.current=true;await print();}start();return()=>{cancelled=true}},[]);
 return <nav className="receipt-controls"><a href="/restaurant">← Restaurant</a><button onClick={print}>Print fitted 58 mm bill</button><p>Print settings: 58 mm roll, margins None, scale 100%, headers and footers Off. If the printer still feeds blank paper, choose receipt / variable-length paper in its Printing Preferences instead of a long fixed sheet.</p>{message&&<p role="status">{message}</p>}</nav>;
}
