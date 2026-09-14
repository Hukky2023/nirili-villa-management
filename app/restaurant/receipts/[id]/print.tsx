'use client';
import {useEffect,useRef,useState} from 'react';
function preparePaper(){const receipt=document.querySelector('.restaurant-receipt');if(!receipt)return;const height=Math.max(80,Math.ceil(receipt.getBoundingClientRect().height*25.4/96)+4);let style=document.getElementById('thermal-paper-size') as HTMLStyleElement|null;if(!style){style=document.createElement('style');style.id='thermal-paper-size';document.head.appendChild(style);}style.textContent='@page { size: 58mm '+height+'mm; margin: 0; }';}
export default function ReceiptPrint(){const started=useRef(false),[message,setMessage]=useState('');
 function print(){preparePaper();try{window.print();}catch{setMessage('Printing could not open. Use the browser Print option or try the button again.');}}
 useEffect(()=>{let cancelled=false;async function start(){await document.fonts.ready;await new Promise<void>(resolve=>requestAnimationFrame(()=>requestAnimationFrame(()=>resolve())));if(cancelled||started.current)return;started.current=true;print();}start();window.addEventListener('beforeprint',preparePaper);return()=>{cancelled=true;window.removeEventListener('beforeprint',preparePaper);document.getElementById('thermal-paper-size')?.remove();}},[]);
 return <nav className="receipt-controls"><a href="/restaurant">← Restaurant</a><button onClick={print}>Print 58 mm bill</button><p>58 mm thermal receipt. Choose your connected thermal printer, 58 mm roll paper, 100% scale, and no headers or footers in the print settings. The browser controls the printer selection.</p>{message&&<p role="alert">{message}</p>}</nav>;
}
