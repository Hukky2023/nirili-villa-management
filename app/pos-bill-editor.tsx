'use client';
import {UiText,UiField,UiOption} from './ui-language';

import {useEffect,useState} from 'react';
import {hasMealPlan,mealItemIncluded} from '../lib/meal-access';
import {restaurantTables} from '../lib/restaurant-tables';

export default function POSBillEditor({order,rooms=[],canDiscount,onSave,onClose}:{order:any;rooms?:any[];canDiscount:boolean;onSave:(body:any)=>Promise<any>;onClose:()=>void}){
 const [stayId,setStayId]=useState(order.stayId||''),[reprice,setReprice]=useState(false);
 const selectedRoom=rooms.find(r=>r.id===stayId);
 const meal=selectedRoom?.meal;
 const currentOrderIncluded=order.stayId===stayId&&order.items.some((i:any)=>i.included===true);
 const limit=Number(selectedRoom?.dailyFreeOrderLimit||0);
 const usedWithoutThis=Math.max(0,Number(selectedRoom?.includedOrdersToday||0)-(currentOrderIncluded?1:0));
 const freeOrderAvailable=limit>usedWithoutThis;
 const mealPlanPricing=hasMealPlan(meal);
 const [items,setItems]=useState<any[]>(order.items.map((i:any)=>({...i,price:(i.unitCents/100).toFixed(2),discount:i.discount||0})));
 const [table,setTable]=useState(order.table),[notes,setNotes]=useState(order.notes),[menu,setMenu]=useState<any[]>([]),[busy,setBusy]=useState(false),[error,setError]=useState('');

 useEffect(()=>{fetch('/api/menu').then(async r=>{const d=await r.json();if(!r.ok)throw Error(d.error);setMenu(d.items)}).catch(e=>setError(e.message))},[]);

 function update(n:number,key:string,value:any){setItems(rows=>rows.map((i,j)=>j===n?{...i,[key]:value}:i));}
 function priced(i:any,roomId:string){
  const room=rooms.find(r=>r.id===roomId),product=menu.find(p=>p.id===i.id);
  const sameOrderIncluded=order.stayId===roomId&&order.items.some((x:any)=>x.included===true);
  const roomLimit=Number(room?.dailyFreeOrderLimit||0);
  const roomUsed=Math.max(0,Number(room?.includedOrdersToday||0)-(sameOrderIncluded?1:0));
  const available=roomLimit>roomUsed;
  const included=product?mealItemIncluded(room?.meal,product,available):false;
  const fallbackCents=Number(i.included?product?.cents??i.menuCents??i.unitCents:i.unitCents??product?.cents??i.menuCents??Math.round(Number(i.price)*100))||0;
  return {...i,included,price:((included?0:fallbackCents)/100).toFixed(2),discount:included?0:(Number(i.discount)||0)};
 }
 function chooseRoom(id:string){setStayId(id);setReprice(true);setItems(rows=>rows.map(i=>priced(i,id)));}

 const total=items.reduce((n,i)=>n+Math.round(Math.round(Number(i.price)*100)*Number(i.quantity)*(1-Number(i.discount)/100)),0);
 const recalculateMealPlan=reprice||mealPlanPricing||order.items.some((i:any)=>i.included===true);

 return <div className="menu-overlay"><form className="menu-dialog pos-edit-dialog" role="dialog" aria-modal="true" onSubmit={async e=>{
  e.preventDefault();setBusy(true);setError('');
  try{
   await onSave({
    action:'edit',id:order.id,stayId,repriceMeal:recalculateMealPlan,table,notes,
    items:items.map(i=>({id:i.id,name:i.name,quantity:Number(i.quantity),unitCents:Math.round(Number(i.price)*100),discount:Number(i.discount)}))
   });
   onClose();
  }catch(e){setError((e as Error).message);}finally{setBusy(false)}
 }}>
  <h2><UiText>Edit Bill · </UiText><UiText>{order.id}</UiText></h2>
  <p>{order.customer} · <UiText>{order.room?'Room '+order.room:'Walk-in'}</UiText></p>
  <label><UiText>Guest room</UiText><select disabled={busy||!menu.length} value={stayId} onChange={e=>chooseRoom(e.target.value)}>
   <UiOption value="">Walk-in guest</UiOption>
   {order.stayId&&!rooms.some(r=>r.id===order.stayId)&&<option value={order.stayId}>Room {order.room} (unavailable)</option>}
   {rooms.map(r=><option key={r.id} value={r.id}>Room {r.room} · {r.guest} · {r.meal}</option>)}
  </select></label>
  {recalculateMealPlan&&<p>Meal-plan allowance is recalculated when you save. This order is checked without counting itself.</p>}
  <label><UiText>Table</UiText><select required value={table} onChange={e=>setTable(e.target.value)}>
   <UiOption value="">Select table</UiOption><UiText>{restaurantTables.map(t=><UiOption key={t}>{t}</UiOption>)}</UiText>
  </select></label>
  <fieldset disabled={busy} style={{border:0,padding:0}}>
   <UiText>{items.map((i,n)=><section className="pos-edit-line" key={i.id}>
    <label><UiText>Item</UiText><input required maxLength={200} value={i.name} onChange={e=>update(n,'name',e.target.value)}/></label>
    {recalculateMealPlan&&<p>{i.included?'Included in meal plan':'Paid extra'}</p>}
    <div>
     <label><UiText>Quantity</UiText><input required type="number" min="1" max="100" value={i.quantity} onChange={e=>update(n,'quantity',e.target.value)}/></label>
     <label><UiText>Unit price USD</UiText><input required readOnly={i.included===true} type="number" min="0" max="100000" step=".01" value={i.price} onChange={e=>update(n,'price',e.target.value)}/></label>
     <label><UiText>Discount %</UiText><input required disabled={!canDiscount||i.included===true} type="number" min="0" max="100" step=".01" value={i.discount} onChange={e=>update(n,'discount',e.target.value)}/></label>
    </div>
    <button type="button" onClick={()=>setItems(rows=>rows.filter((_,j)=>j!==n))}><UiText>Remove item</UiText></button>
   </section>)}</UiText>
   <label><UiText>Add menu item</UiText><select value="" onChange={e=>{
    const product=menu.find(i=>i.id===e.target.value);if(!product)return;
    const n=items.findIndex(i=>i.id===product.id);
    if(n>=0)update(n,'quantity',Math.min(100,Number(items[n].quantity)+1));
    else{
     const line={id:product.id,name:product.category+' · '+product.name,quantity:1,unitCents:product.cents,price:(product.cents/100).toFixed(2),discount:0};
     setItems([...items,(reprice||mealPlanPricing)?priced(line,stayId):line]);
    }
   }}>
    <UiOption value="">Choose an item…</UiOption>
    <UiText>{menu.map(i=><UiOption key={i.id} value={i.id}>{i.category} · {i.name} · {mealItemIncluded(meal,i,freeOrderAvailable)?'Included':'$'+(i.cents/100).toFixed(2)+' · Paid extra'}</UiOption>)}</UiText>
   </select></label>
   <label><UiText>Kitchen notes</UiText><textarea maxLength={1000} value={notes} onChange={e=>setNotes(e.target.value)}/></label>
  </fieldset>
  <h3><UiText>Updated total $</UiText><UiText>{(total/100).toFixed(2)}</UiText></h3>
  <p><UiText>Changes update the room folio and kitchen ticket. Cashiers and Admin can change discounts on paid-extra items.</UiText></p>
  <UiText>{error&&<p role="alert"><UiText>{error}</UiText></p>}</UiText>
  <footer><button type="button" disabled={busy} onClick={onClose}><UiText>Cancel</UiText></button><button className="primary" disabled={busy||!items.length}><UiText>{busy?'Saving…':'Save changes'}</UiText></button></footer>
 </form></div>;
}
