'use client';
import {UiText,UiField,UiOption} from '../../ui-language';

export default function PrintBill(){return <button className="print-control" onClick={()=>window.print()}><UiText>Print / Save as PDF</UiText></button>}
