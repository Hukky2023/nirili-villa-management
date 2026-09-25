import {directThermalPrint} from './direct-thermal';
import {readPrinterSettings} from './printer-settings';
import {inclusiveTourismBreakdown,SERVICE_CHARGE_RATE,TOURISM_GST_RATE} from './tax-inclusive';
import {tableLabel} from './restaurant-tables';

const money=(n:number)=>'$'+(Number(n||0)/100).toFixed(2);

function node(tag:string,text?:string){
 const el=document.createElement(tag);
 if(text!==undefined)el.textContent=text;
 return el;
}

function pair(parent:HTMLElement,label:string,value:string,className=''){
 const p=node('p');if(className)p.className=className;
 p.append(node('span',label),node('b',value));parent.appendChild(p);
}

export async function directPrintPOSOrder(order:any){
 const settings=readPrinterSettings();
 if(!settings.printer)throw Error('Select and save a receipt printer in Printer settings first.');

 const host=document.createElement('div');
 host.setAttribute('aria-hidden','true');
 host.style.cssText='position:fixed;left:-10000px;top:0;width:58mm;pointer-events:none;opacity:0;';
 const receipt=document.createElement('article');
 receipt.className='restaurant-receipt';

 const header=node('header');
 header.append(node('small','DHIFFUSHI · MALDIVES'),node('h1','NIRILI VILLA'),node('p','RESTAURANT INVOICE'),node('b',String(order.id||'')));
 receipt.appendChild(header);

 const meta=node('div') as HTMLDivElement;meta.className='receipt-meta';
 pair(meta,'Customer',String(order.customer||'Walk-in guest'));
 if(order.room)pair(meta,'Room',String(order.room));
 pair(meta,'Table',tableLabel(order.table));
 const issued=new Intl.DateTimeFormat('en-GB',{timeZone:'Indian/Maldives',dateStyle:'medium',timeStyle:'short',hour12:false}).format(new Date(order.createdAt||Date.now()));
 pair(meta,'Issued',issued);
 pair(meta,'Cashier',String(order.createdBy||'Restaurant cashier'));
 receipt.appendChild(meta);

 const table=node('table') as HTMLTableElement;
 const tbody=node('tbody') as HTMLTableSectionElement;
 for(const item of order.items||[]){
  const tr=node('tr');
  const desc=node('td');
  desc.append(document.createTextNode(String(item.name||'Item')));
  desc.appendChild(node('small',String(item.quantity||1)+' × '+money(item.unitCents??item.cents)));
  if(Number(item.discount)>0)desc.appendChild(node('small','Discount '+Number(item.discount)+'%'));
  const amount=node('td',money(item.cents??((item.unitCents||0)*(item.quantity||1))));
  tr.append(desc,amount);tbody.appendChild(tr);
 }
 table.appendChild(tbody);receipt.appendChild(table);

 const total=Number(order.cents||0),tax=inclusiveTourismBreakdown(total);
 const totals=node('div') as HTMLDivElement;totals.className='receipt-totals';
 pair(totals,'Total USD',money(total),'receipt-grand');
 pair(totals,'Before tax/service',money(tax.baseCents));
 pair(totals,'Service charge '+Math.round(SERVICE_CHARGE_RATE*100)+'%',money(tax.serviceChargeCents));
 pair(totals,'Tourism GST '+Math.round(TOURISM_GST_RATE*100)+'%',money(tax.tourismGstCents));
 totals.appendChild(node('small','Tax and service charge are included in the total. No extra amount added.'));
 const paid=order.paymentStatus==='Paid'||order.paymentStatus==='Complimentary';
 pair(totals,'Paid',money(paid?total:0));
 pair(totals,'Balance',money(paid?0:total));
 pair(totals,'Payment',order.complimentary?'Complimentary':order.method==='Room'?'Room charge':String(order.method||'Not received'));
 const status=node('strong',String(order.complimentary?'Complimentary':order.paymentStatus||'Unpaid'));status.className='receipt-status';totals.appendChild(status);
 receipt.appendChild(totals);

 const footer=node('footer');footer.append(node('p','Thank you for dining with us.'),node('small','Arrive as a guest, leave as a friend.'));receipt.appendChild(footer);
 host.appendChild(receipt);document.body.appendChild(host);
 try{
  await directThermalPrint(settings.printer,settings);
  return settings.printer;
 }finally{
  host.remove();
 }
}
