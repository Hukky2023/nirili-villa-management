'use client';

import {useEffect, useId, useRef, useState} from 'react';
import type {FormEvent} from 'react';
import type {ExcursionPricing} from '../lib/excursion-billing';
import './excursion-billing-actions.css';

const money = (cents: number) => '$' + (cents / 100).toFixed(2);
type Action = 'free' | 'discount' | 'restore';
type ExcursionBill = {
  id:string; items:any[]; date?:string; status?:string; revision?:number; totalCents?:number;
};
type Props = {
  booking: {id: string; guest: string; excursion: string; totalCents: number;
    pricing?: ExcursionPricing; billingHistory?: any[]; bill?:ExcursionBill};
  canAdjust: boolean; revision: number; onUpdated: () => Promise<void>;
};

export default function ExcursionBillingActions({booking, canAdjust, revision, onUpdated}: Props) {
  const p = booking.pricing || {originalCents: booking.totalCents, totalCents: booking.totalCents,
    discountCents: 0, discountPercent: 0, complimentary: false, adjusted: false};
  const [action, setAction] = useState<Action | null>(null);
  const [snapshot, setSnapshot] = useState({revision, originalCents: p.originalCents, totalCents: p.totalCents, requestId: ''});
  const [percent, setPercent] = useState(''), [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false), [error, setError] = useState(''), [notice, setNotice] = useState('');
  const [conflict, setConflict] = useState(false);
  const [billEdit,setBillEdit]=useState<any|null>(null),[billBusy,setBillBusy]=useState(false),[billError,setBillError]=useState('');
  const [deleteBusy,setDeleteBusy]=useState(false);
  const dialog = useRef<HTMLDialogElement>(null),editDialog=useRef<HTMLDialogElement>(null), saving = useRef(false);
  const titleId = useId(),editTitleId=useId();

  useEffect(() => {if (action && dialog.current && !dialog.current.open) dialog.current.showModal();}, [action]);
  useEffect(() => {if (billEdit && editDialog.current && !editDialog.current.open) editDialog.current.showModal();}, [billEdit]);
  useEffect(() => {if (!canAdjust) {dialog.current?.close();editDialog.current?.close(); setAction(null);setBillEdit(null);}}, [canAdjust]);

  function open(next: Action) {
    setSnapshot({revision, originalCents: p.originalCents, totalCents: p.totalCents, requestId: crypto.randomUUID()});
    setPercent(p.discountPercent > 0 && p.discountPercent < 100 ? String(p.discountPercent) : '');
    setReason(''); setError(''); setNotice(''); setConflict(false); setAction(next);
  }
  function close() {if (!saving.current) {dialog.current?.close(); setAction(null);}}
  function openBill(){
    const source=booking.bill||{id:booking.id,date:'',status:'Posted',revision:0,items:[[booking.excursion,1,p.originalCents/100,p.discountPercent]]};
    const items=(Array.isArray(source.items)&&source.items.length?source.items:[[booking.excursion,1,p.originalCents/100,p.discountPercent]])
      .map((item:any)=>[String(item[0]||'Excursion'),Math.max(1,Number(item[1])||1),Number(item[2])||0,Number(item[3])||0]);
    setBillError('');setNotice('');setBillEdit({
      globalRevision:revision,revision:Number(source.revision)||0,date:String(source.date||''),
      status:['Posted','Pending','Unpaid'].includes(String(source.status||''))?String(source.status):'Posted',
      items
    });
  }
  function closeBill(){if(!billBusy){editDialog.current?.close();setBillEdit(null);}}
  function billTotal(items:any[]){return Math.round(items.reduce((sum:number,item:any)=>sum+Math.round(Number(item[2]||0)*100)*(1-Math.min(100,Math.max(0,Number(item[3]||0)))/100),0));}
  function updateBillItem(index:number,field:number,value:string){
    setBillEdit((old:any)=>({...old,items:old.items.map((item:any,i:number)=>{
      if(i!==index)return item;
      const next=[...item];next[field]=field===0?value:Number(value);return next;
    })}));
  }
  const value = action === 'free' ? 100 : action === 'restore' ? 0 : Number(percent);
  const valid = action !== 'discount' || (/^\d{1,3}(\.\d{1,2})?$/.test(percent) && value > 0 && value <= 100);
  const finalCents = valid ? Math.round(snapshot.originalCents * (10000 - Math.round(value * 100)) / 10000) : snapshot.originalCents;

  async function save(event: FormEvent) {
    event.preventDefault();
    if (!canAdjust || !action || !valid || saving.current || conflict) return;
    saving.current = true; setBusy(true); setError('');
    try {
      const response = await fetch('/api/excursion-bookings', {method: 'PATCH', headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({id: booking.id, action, revision: snapshot.revision, requestId: snapshot.requestId,
          discountPercent: value, reason})});
      const result = await response.json();
      if (!response.ok) {
        if (response.status === 409) setConflict(true);
        throw new Error(result.error || 'Could not save the billing adjustment.');
      }
      dialog.current?.close(); setAction(null);
      setNotice('Saved. The excursion charge and linked bill have been updated.');
      await onUpdated();
      window.dispatchEvent(new Event('services-updated'));
      window.dispatchEvent(new Event('nirili:auto-refresh'));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not save. Please retry.');
    } finally {saving.current = false; setBusy(false);}
  }

  async function deleteBooking(){
    if(!canAdjust||busy||billBusy||deleteBusy)return;
    const ok=window.confirm(
      'Delete '+booking.excursion+' for '+booking.guest+'?\n\nThis permanently removes the excursion booking and its linked bill. Payments already received are kept and are not automatically refunded.'
    );
    if(!ok)return;
    setDeleteBusy(true);setError('');setBillError('');setNotice('');
    try{
      const response=await fetch('/api/excursion-bookings',{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify({
        action:'delete-booking',id:booking.id,revision
      })});
      const result=await response.json();
      if(!response.ok)throw new Error(result.error||'Could not delete the excursion booking.');
      await onUpdated();
      window.dispatchEvent(new Event('services-updated'));
      window.dispatchEvent(new Event('nirili:auto-refresh'));
    }catch(cause){
      setError(cause instanceof Error?cause.message:'Could not delete the excursion booking. Please retry.');
    }finally{setDeleteBusy(false);}
  }

  async function saveBill(event:FormEvent){
    event.preventDefault();
    if(!canAdjust||!billEdit||billBusy||!billEdit.items.length)return;
    setBillBusy(true);setBillError('');
    try{
      const response=await fetch('/api/excursion-bookings',{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify({
        action:'edit-bill',id:booking.id,revision:billEdit.globalRevision,billRevision:billEdit.revision,
        requestId:crypto.randomUUID(),date:billEdit.date||new Date().toLocaleString('en-GB',{timeZone:'Indian/Maldives',hour12:false}),
        status:billEdit.status,items:billEdit.items
      })});
      const result=await response.json();
      if(!response.ok)throw new Error(result.error||'Could not save the excursion bill.');
      editDialog.current?.close();setBillEdit(null);
      setNotice('Excursion bill updated everywhere.');
      await onUpdated();
      window.dispatchEvent(new Event('services-updated'));
      window.dispatchEvent(new Event('nirili:auto-refresh'));
    }catch(cause){setBillError(cause instanceof Error?cause.message:'Could not save the excursion bill.');}
    finally{setBillBusy(false);}
  }

  return <div className="excursion-billing-actions">
    {p.adjusted && <div className="excursion-price-summary">
      <span>Original <b>{money(p.originalCents)}</b></span>
      <span>{p.complimentary ? 'Complimentary / Free' : p.discountPercent>0 ? `Discount ${p.discountPercent}%` : 'Bill adjusted'} <b>−{money(p.discountCents)}</b></span>
      <span>Total <b>{money(p.totalCents)}</b></span>
    </div>}
    {canAdjust && <div className="excursion-price-buttons">
      <button type="button" className="excursion-secondary-btn" disabled={busy||billBusy||deleteBusy} onClick={openBill}>Edit Bill</button>
      <button type="button" className="excursion-secondary-btn" disabled={busy || billBusy || deleteBusy || p.complimentary} onClick={() => open('free')}>Make Free</button>
      <button type="button" className="excursion-secondary-btn" disabled={busy||billBusy||deleteBusy} onClick={() => open('discount')}>{p.adjusted && !p.complimentary ? 'Edit Discount' : 'Add Discount'}</button>
      <button type="button" className="excursion-secondary-btn excursion-delete-btn" disabled={busy||billBusy||deleteBusy} onClick={()=>void deleteBooking()}>{deleteBusy?'Deleting…':'Delete'}</button>
      {p.adjusted && <button type="button" className="excursion-secondary-btn" disabled={busy||billBusy||deleteBusy} onClick={() => open('restore')}>Remove adjustment</button>}
    </div>}
    {notice && <p className="excursion-price-notice" role="status">{notice}</p>}
    {canAdjust && !!booking.billingHistory?.length && <details className="excursion-price-history">
      <summary>Billing adjustment history</summary>
      <div>{[...booking.billingHistory].reverse().map((entry:any,index:number) => <p key={entry.requestId||entry.at||index}>
        <b>{entry.action === 'edit' ? 'Bill edited' : entry.action === 'free' ? 'Made free' : entry.action === 'restore' ? 'Original price restored' : `${entry.discountPercent}% discount`}</b>
        <span>{money(Number(entry.previousCents)||0)} → {money(Number(entry.totalCents)||0)} · {entry.by}</span>
        <small>{entry.at?new Date(entry.at).toLocaleString('en-GB', {timeZone: 'Indian/Maldives',hour12:false}):'Time not recorded'} · Maldives time{entry.reason ? ' · ' + entry.reason : ''}</small>
      </p>)}</div>
    </details>}

    {action && <dialog ref={dialog} className="excursion-price-dialog" aria-labelledby={titleId}
      onCancel={event => {event.preventDefault(); close();}} onClose={() => {if (!saving.current) setAction(null);}}>
      <form onSubmit={save}>
        <h3 id={titleId}>{action === 'free' ? 'Make excursion free' : action === 'restore' ? 'Remove billing adjustment' : 'Add / edit discount'}</h3>
        <p>{booking.guest} · {booking.excursion}<small>{booking.id}</small></p>
        <p>This changes the total for the whole booking / group, not the price per guest.</p>
        {action === 'discount' && <label>Discount (%)<input autoFocus type="number" min="0.01" max="100" step="0.01" inputMode="decimal" required value={percent} disabled={busy || conflict}
          onChange={event => {setPercent(event.target.value); setSnapshot(old => ({...old, requestId: crypto.randomUUID()}));}} placeholder="Enter percentage"/></label>}
        <label>Reason (optional)<textarea maxLength={500} rows={2} value={reason} disabled={busy || conflict}
          onChange={event => {setReason(event.target.value); setSnapshot(old => ({...old, requestId: crypto.randomUUID()}));}} placeholder="For example, included in guest package"/></label>
        <dl className="excursion-price-preview">
          <div><dt>Original booking amount</dt><dd>{money(snapshot.originalCents)}</dd></div>
          <div><dt>Current bill amount</dt><dd>{money(snapshot.totalCents)}</dd></div>
          <div><dt>{action === 'free' ? 'Complimentary discount' : 'Discount'}</dt><dd>−{money(snapshot.originalCents - finalCents)}</dd></div>
          <div><dt>New bill total</dt><dd>{money(finalCents)}</dd></div>
        </dl>
        <p className="excursion-price-help">The existing linked bill will be updated. Payments already received are kept; any resulting credit needs review. This does not issue a refund.</p>
        {error && <p className="excursion-booking-error" role="alert">{error}</p>}
        <footer><button type="button" className="excursion-secondary-btn" disabled={busy} onClick={close}>Cancel</button>
          <button type="submit" className="excursion-secondary-btn excursion-price-confirm" disabled={busy || !valid || conflict}>{busy ? 'Saving…' : action === 'free' ? 'Confirm Make Free' : action === 'restore' ? 'Restore original price' : 'Apply Discount'}</button></footer>
      </form>
    </dialog>}

    {billEdit&&<dialog ref={editDialog} className="excursion-price-dialog excursion-bill-edit-dialog" aria-labelledby={editTitleId}
      onCancel={event=>{event.preventDefault();closeBill();}} onClose={()=>{if(!billBusy)setBillEdit(null)}}>
      <form onSubmit={saveBill}>
        <h3 id={editTitleId}>Edit excursion bill</h3>
        <p>{booking.guest} · {booking.excursion}<small>{booking.id}</small></p>
        <label>Bill date / note<input required maxLength={100} value={billEdit.date} onChange={e=>setBillEdit({...billEdit,date:e.target.value})}/></label>
        <label>Bill status<select value={billEdit.status} onChange={e=>setBillEdit({...billEdit,status:e.target.value})}>
          <option>Posted</option><option>Pending</option><option>Unpaid</option>
        </select><small>Payments and cancellations are changed from their dedicated workflows.</small></label>
        <div className="excursion-bill-edit-items">
          {billEdit.items.map((item:any,index:number)=><section key={index} className="excursion-bill-edit-line">
            <label>Bill item<input required maxLength={200} value={item[0]} onChange={e=>updateBillItem(index,0,e.target.value)}/></label>
            <div>
              <label>Qty<input required type="number" min="1" max="10000" value={item[1]} onChange={e=>updateBillItem(index,1,e.target.value)}/></label>
              <label>Amount USD<input required type="number" min="0" max="1000000" step="0.01" value={item[2]} onChange={e=>updateBillItem(index,2,e.target.value)}/></label>
              <label>Discount %<input required type="number" min="0" max="100" step="0.01" value={item[3]} onChange={e=>updateBillItem(index,3,e.target.value)}/></label>
            </div>
            <button type="button" className="excursion-secondary-btn" disabled={billEdit.items.length===1} onClick={()=>setBillEdit((old:any)=>({...old,items:old.items.filter((_:any,i:number)=>i!==index)}))}>Remove item</button>
          </section>)}
        </div>
        <button type="button" className="excursion-secondary-btn" onClick={()=>setBillEdit((old:any)=>({...old,items:[...old.items,['New charge',1,0,0]]}))}>Add bill item</button>
        <dl className="excursion-price-preview">
          <div><dt>Updated bill total</dt><dd>{money(billTotal(billEdit.items))}</dd></div>
        </dl>
        <p className="excursion-price-help">Quantity is shown on the bill only. The excursion booking guest count and trip assignment are not changed here. Saving updates the guest folio, excursion booking, Admin views, and Supabase mirror.</p>
        {billError&&<p className="excursion-booking-error" role="alert">{billError}</p>}
        <footer><button type="button" className="excursion-secondary-btn" disabled={billBusy} onClick={closeBill}>Cancel</button>
          <button type="submit" className="excursion-secondary-btn excursion-price-confirm" disabled={billBusy||!billEdit.items.length}>{billBusy?'Saving…':'Save Bill Changes'}</button></footer>
      </form>
    </dialog>}
  </div>;
}
