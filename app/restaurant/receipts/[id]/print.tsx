'use client';
import {useEffect,useRef} from 'react';
export default function ReceiptPrint(){const started=useRef(false);useEffect(()=>{const timer=setTimeout(()=>{if(!started.current){started.current=true;window.print();}},500);return()=>clearTimeout(timer)},[]);return <nav className="receipt-controls"><a href="/restaurant">← Restaurant</a><button onClick={()=>window.print()}>Print Bill / Save PDF</button></nav>}
