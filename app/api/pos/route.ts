import {deletePOSBill} from '../../../lib/pos-bill-delete';
import {waiterLine} from '../../../lib/waiter-pricing';
import {discountPOSBill} from '../../../lib/pos-discount';
import {changePOSPayment} from '../../../lib/pos-payment';
import {restaurantTables} from '../../../lib/restaurant-tables';
import {authDb,currentUser,sameOrigin,hasPermission} from '../../../lib/auth';
import {canPOS,canTakePayment} from '../../../lib/pos-access';
import {loadStays,stayKey} from '../../../lib/stays';
import {loadMenu} from '../../../lib/menu-server';
import {loadRestaurantPaymentSettings} from '../../../lib/restaurant-payment-settings';
async function view(){const {state,revision}=await loadStays();const actor=await currentUser();const paymentSettings=await loadRestaurantPaymentSettings();return {revision,canPay:canTakePayment(actor),canEdit:canTakePayment(actor),canDiscount:canTakePayment(actor),canSetExchange:actor?.role==='admin',paymentSettings,guestOrders:state.orders.filter((o:any)=>o.kind==='food'&&o.status!=='Cancelled').map((o:any)=>({id:o.id,createdAt:o.createdAt,customer:o.guest,room:state.stays.find((s:any)=>s.id===o.stayId)?.room||o.room,notes:o.notes,name:o.name,quantity:o.quantity,kitchen:o.status==='Completed'?'Served':o.kitchen||'Sent'})),rooms:state.stays.filter((s:any)=>s.status==='In House').map((s:any)=>({id:s.id,room:s.room,guest:s.guest,meal:s.meal})),orders:(state.posOrders||[]).map((o:any)=>{const s=state.stays.find((s:any)=>s.id===o.stayId);return {...o,paymentStatus:o.complimentary?'Complimentary':['Cash','Card','Bank transfer'].includes(o.method)?'Paid':s?.paidBills?.['Restaurant:'+o.id]===o.cents?'Paid':o.method==='Room'?'Charged to room':'Unpaid'};})};}
export async function GET(){if(!canPOS(await currentUser()))return Response.json({error:'Restaurant access required.'},{status:403});return Response.json(await view(),{headers:{'Cache-Control':'no-store'}});}
export async function POST(r:Request){const u=await currentUser();if(!canPOS(u)||!sameOrigin(r))return Response.json({error:'Restaurant access required.'},{status:403});try{const b=await r.json(),{state,revision}=await loadStays();state.posOrders??=[];
if(b.action==='create'&&state.posOrders.some((o:any)=>o.token===b.token&&o.by===u!.userId))return Response.json(await view());
if(b.revision!==revision)return Response.json({error:'Orders changed. Refresh and try again.'},{status:409});
if(b.action==='create'){
 if(!restaurantTables.includes(b.table))throw Error('Select a table before preparing the bill or sending it to the kitchen.');
 if(typeof b.token!=='string'||!/^[-a-zA-Z0-9]{12,80}$/.test(b.token)||!Array.isArray(b.items)||!b.items.length||b.items.length>100||typeof b.table!=='string'||b.table.length>40||typeof b.customer!=='string'||b.customer.length>100||typeof b.notes!=='string'||b.notes.length>1000)throw Error('Check the order details.');
 const s=b.stayId?state.stays.find((s:any)=>s.id===b.stayId&&s.status==='In House'):null;if(b.stayId&&!s)throw Error('Select a currently checked-in guest.');
 const menu=(await loadMenu()).items;const items=b.items.map((x:any)=>{const i=menu.find(i=>i.id===x.id);if(!i||!Number.isInteger(x.quantity)||x.quantity<1||x.quantity>100)throw Error('An item is unavailable or its quantity is invalid.');if(x.cents!==i.cents)throw Error('A menu price changed. Refresh the menu and reselect that item.');return !canTakePayment(u)?waiterLine(i,x.quantity,s?.meal,x.included):{id:i.id,name:i.category+' · '+i.name,quantity:x.quantity,unitCents:i.cents,cents:i.cents*x.quantity};});
 const id='POS-'+crypto.randomUUID().slice(0,8).toUpperCase(),cents=items.reduce((n:number,i:any)=>n+i.cents,0),date=new Date().toISOString();
 state.posOrders.push({id,token:b.token,by:u!.userId,createdBy:u!.username,createdAt:date,stayId:s?.id||'',room:s?.room||'',customer:s?.guest||b.customer.trim()||'Walk-in guest',table:b.table,notes:b.notes.trim(),items,cents,kitchen:'Awaiting cashier',method:s&&!canTakePayment(u)?'Room':'',history:[{date,by:u!.username,detail:'Order sent to cashier'}]});
 if(s){s.posBills??=[];s.posBills.push({department:'Restaurant',id,items:items.map((i:any)=>[i.name,i.quantity,i.cents/100,0]),status:'Posted',totalCents:cents});s.history.unshift({date,by:u!.username,detail:'Restaurant bill '+id+' · $'+(cents/100).toFixed(2)});}
}else if(b.action==='sendguestkitchen'){if(!canTakePayment(u))return Response.json({error:'Cashier access required.'},{status:403});const o=state.orders.find((o:any)=>o.id===b.id&&o.kind==='food');if(!o||o.kitchen!=='Awaiting cashier'||o.status==='Cancelled')throw Error('Order is no longer awaiting cashier.');o.kitchen='Sent';o.status='Confirmed';o.updatedBy=u!.username;}else if(b.action==='guestkitchen'){const o=state.orders.find((o:any)=>o.id===b.id&&o.kind==='food');if(!o||o.status==='Completed'||o.status==='Cancelled')throw Error('Order is no longer active.');const next:Record<string,string>={Sent:'Preparing',Preparing:'Ready',Ready:'Served'};if(next[o.kitchen||'Sent']!==b.status)throw Error('Choose the next kitchen status.');o.kitchen=b.status;o.status=b.status==='Served'?'Completed':'Confirmed';o.updatedBy=u!.username;}else{
 const o=state.posOrders.find((o:any)=>o.id===b.id);if(!o)throw Error('Bill not found.');const date=new Date().toISOString();
 if(b.action==='sendkitchen'){if(!canTakePayment(u))return Response.json({error:'Cashier access required.'},{status:403});if(o.kitchen!=='Awaiting cashier')throw Error('Order is no longer awaiting cashier.');o.kitchen='Sent';o.history.push({date,by:u!.username,detail:'Cashier sent order to kitchen'});}
 else if(b.action==='kitchen'){const next:Record<string,string>={Sent:'Preparing',Preparing:'Ready',Ready:'Served'};if(next[o.kitchen]!==b.status)throw Error('Choose the next kitchen status.');o.kitchen=b.status;o.history.push({date,by:u!.username,detail:'Kitchen: '+b.status});}
 else if(b.action==='delete'){if(!canTakePayment(u))return Response.json({error:'Cashier access required.'},{status:403});deletePOSBill(state,o,u!.username);}
 else if(b.action==='edit'){
 if(!canTakePayment(u))return Response.json({error:'Bill editing permission required.'},{status:403});
 const s=state.stays.find((s:any)=>s.id===o.stayId);
 if(o.method==='Cash'||o.method==='Card'||s?.paidBills?.['Restaurant:'+o.id]===o.cents)throw Error('This bill is paid. Reverse the room payment before editing, or review cash/card payments with Admin.');
 if(s?.status==='Checked Out')throw Error('Check the guest back in before editing this room bill.');
 const nextStayId=b.stayId===undefined?(o.stayId||''):b.stayId;
 if(typeof nextStayId!=='string')throw Error('Choose a valid guest room.');
 const target=nextStayId?state.stays.find((x:any)=>x.id===nextStayId&&x.status==='In House'):null;
 if(nextStayId&&!target)throw Error('Choose a checked-in room.');
 if(o.stayId&&!s)throw Error('Original room is missing. Ask Admin to review.');
 if(s&&!s.posBills?.some((x:any)=>x.id===o.id))throw Error('Linked room bill is missing. Please refresh.');
 const changingRoom=nextStayId!==(o.stayId||'');
 const reprice=changingRoom||b.repriceMeal===true;
 if(!Array.isArray(b.items)||b.items.length<1||b.items.length>100||typeof b.notes!=='string'||b.notes.length>1000||!restaurantTables.includes(b.table))throw Error('Choose a table and keep at least one item.');
 const ids=new Set();let items=b.items.map((x:any)=>{if(typeof x.id!=='string'||x.id.length>100||ids.has(x.id)||typeof x.name!=='string'||!x.name.trim()||x.name.length>200||!Number.isInteger(x.quantity)||x.quantity<1||x.quantity>100||!Number.isInteger(x.unitCents)||x.unitCents<0||x.unitCents>10000000||!Number.isFinite(x.discount)||x.discount<0||x.discount>100)throw Error('Check item names, quantities, prices and discounts.');ids.add(x.id);const old=o.items.find((i:any)=>i.id===x.id);if(!canTakePayment(u)&&x.discount!==(old?.discount||0))throw Error('Cashier access is required to change discounts.');return {id:x.id,name:x.name.trim(),quantity:x.quantity,unitCents:x.unitCents,discount:x.discount,cents:Math.round(x.unitCents*x.quantity*(1-x.discount/100))};});
 if(reprice){const menu=(await loadMenu()).items;items=items.map((line:any)=>{const product=menu.find((i:any)=>i.id===line.id);if(product)return {...waiterLine(product,line.quantity,target?.meal),discount:0};const old=o.items.find((i:any)=>i.id===line.id);if(old?.included&&!Number.isInteger(old.menuCents))throw Error('An included item is no longer on the menu. Remove it and select a current menu item.');const unitCents=old?.menuCents??line.unitCents;return {...line,unitCents,cents:unitCents*line.quantity,discount:0,included:false};});}
 const before={items:o.items,cents:o.cents,table:o.table,notes:o.notes};o.items=items;o.cents=items.reduce((n:number,i:any)=>n+i.cents,0);o.complimentary=items.every((i:any)=>i.discount===100);delete o.billDiscountPercent;o.table=b.table;o.notes=b.notes.trim();o.updatedAt=date;o.updatedBy=u!.username;o.history.push({date,by:u!.username,detail:'Bill edited — review updated items',before,after:{items,cents:o.cents,table:o.table,notes:o.notes}});
 if(s){delete s.paidBills?.['Restaurant:'+o.id];s.posBills=s.posBills.filter((x:any)=>x.id!==o.id);s.history.unshift({date,by:u!.username,detail:'Restaurant bill '+o.id+(changingRoom?' moved out of room':' edited')+' · $'+(before.cents/100).toFixed(2)+' → $'+(o.cents/100).toFixed(2)});}
 if(target){target.posBills??=[];target.posBills.push({department:'Restaurant',id:o.id,items:items.map((i:any)=>[i.name,i.quantity,i.unitCents*i.quantity/100,i.discount||0]),totalCents:o.cents,status:o.complimentary?'Complimentary':'Posted',complimentary:o.complimentary});if(changingRoom){target.history??=[];target.history.unshift({date,by:u!.username,detail:'Restaurant bill '+o.id+' moved to room · $'+(o.cents/100).toFixed(2)});}}
 o.stayId=target?.id||'';o.room=target?.room||'';o.customer=target?.guest||(changingRoom?'Walk-in guest':o.customer);if(changingRoom)o.method=target?'Room':'';

 }
 else if(b.action==='discount'||b.action==='free'){if(!canTakePayment(u))return Response.json({error:'Cashier access required to discount bills.'},{status:403});discountPOSBill(state,o,b,u!.username);}
 else if(b.action==='pay'){
 if(!canTakePayment(u))return Response.json({error:'Cashier access required to record payments.'},{status:403});
 const settings=await loadRestaurantPaymentSettings();
 if(b.method==='Cash'){
  const currency=b.currency==='MVR'?'MVR':'USD';
  b.currency=currency;
  if(currency==='MVR'){
   if(!Number.isFinite(settings.usdToMvrRate)||settings.usdToMvrRate<=0)throw Error('Set the USD to MVR exchange rate first.');
   b.exchangeRate=settings.usdToMvrRate;
   b.paidMvr=Math.round((o.cents/100)*settings.usdToMvrRate*100)/100;
  }
 }
 if(b.method==='Bank transfer'){
  if(!settings.accountNumber)throw Error('Admin must set the restaurant bank account number before recording a bank transfer.');
  b.bankName=settings.bankName;b.accountName=settings.accountName;b.accountNumber=settings.accountNumber;
 }
 changePOSPayment(state,o,b,u!.username);
}
 else throw Error('Unknown action.');
}
const saved=revision===0?await authDb().prepare('INSERT OR IGNORE INTO operation_records(key,payload,revision,updated_by) VALUES(?,?,1,?)').bind(stayKey,JSON.stringify(state),u!.userId).run():await authDb().prepare('UPDATE operation_records SET payload=?,revision=revision+1,updated_by=? WHERE key=? AND revision=?').bind(JSON.stringify(state),u!.userId,stayKey,revision).run();if(!saved.meta.changes)return Response.json({error:'Orders changed. Refresh and try again.'},{status:409});return Response.json(await view());
}catch(e){return Response.json({error:(e as Error).message},{status:400});}}
