import {UiText} from '../../ui-language';
import {restaurantOnly} from '../../../lib/pos-access';
import {currentUser} from '../../../lib/auth';
import {stayView,money} from '../../../lib/stays';
import {stayInclusiveTaxBreakdown,SERVICE_CHARGE_RATE,TOURISM_GST_RATE,GREEN_TAX_USD_PER_PERSON_DAY} from '../../../lib/tax-inclusive';
import PrintBill from './print';
import './print.css';

export const dynamic='force-dynamic';

const statusClass=(status:string)=>'invoice-status '+String(status||'').toLowerCase().replace(/[^a-z0-9]+/g,'-');

export default async function BillPage({params}:{params:Promise<{id:string}>}){
 const u=await currentUser();
 if(!u||restaurantOnly(u)||u.role==='guest')return <main><UiText>Staff login is required to view this bill. </UiText><a href="/"><UiText>Return to login</UiText></a></main>;
 const {id}=await params;
 try{
  const d=await stayView(),s=d.stays.find((x:any)=>x.id===id);
  if(!s)return <main><UiText>Bill not found.</UiText></main>;
  const tax=stayInclusiveTaxBreakdown(s.folio.totalCents,s);
  const invoiceStatus=s.folio.balanceCents<=0?'Paid':s.folio.paidCents>0?'Partially Paid':'Unpaid';
  return <main className="print-bill">
   <nav className="print-control"><a href={'/?portal='+u.role+'&room='+s.room}><UiText>← Back to room</UiText></a><PrintBill/></nav>

   <header className="invoice-hero">
    <div className="invoice-brand"><div className="invoice-brand-mark">☀〰</div><div><h1>NIRILI <span>VILLA</span></h1><p>Dhiffushi Island · Kaafu Atoll · Maldives</p><small>Arrive as a Guest, Leave as a Friend.</small></div></div>
    <div className="invoice-heading"><b>INVOICE</b><span>Invoice No · {s.id}</span><span>Booking Ref · {s.id}</span><i className={statusClass(invoiceStatus)}>{invoiceStatus}</i></div>
   </header>

   <section className="invoice-guest-card">
    <div><small>GUEST</small><strong>{s.guest}</strong></div>
    <div><small>ROOM</small><strong>{s.room}</strong></div>
    <div><small>CHECK-IN</small><strong>{s.checkIn}</strong></div>
    <div><small>CHECK-OUT</small><strong>{s.checkOut}</strong></div>
    <div><small>MEAL PLAN</small><strong>{s.meal}</strong></div>
    <div><small>STAY STATUS</small><strong>{s.status}</strong></div>
   </section>

   <section className="invoice-charges">
    <div className="invoice-section-title"><div><small>CHARGES</small><h2>Stay & services</h2></div><span>{s.folio.bills.length} bill{s.folio.bills.length===1?'':'s'}</span></div>
    {s.folio.bills.map((b:any)=><article className="invoice-bill-card" key={b.department+b.id}>
     <header><div><small>{b.department}</small><strong>{b.id}</strong></div><i className={statusClass(b.status)}>{b.status}</i></header>
     <div className="invoice-table-wrap"><table><thead><tr><th>Item</th><th>Qty</th><th>Amount</th><th>Discount</th><th>Net</th></tr></thead><tbody>
      {b.items.map((item:any,n:number)=><tr key={n}><td>{item[0]}</td><td>{item[1]}</td><td>{money(Math.round(item[2]*100))}</td><td>{item[3]||0}%</td><td><b>{money(b.status==='Cancelled'?0:Math.round(item[2]*100*(1-(item[3]||0)/100)))}</b></td></tr>)}
     </tbody></table></div>
     <p className="bill-subtotal"><span>Bill total</span><b>{money(b.totalCents)}</b></p>
    </article>)}
   </section>

   <section className="invoice-bottom-grid">
    <div className="invoice-payments">
     <div className="invoice-section-title"><div><small>PAYMENTS</small><h2>Payments received</h2></div></div>
     <div className="payment-row"><span>Opening payments</span><b>{money(s.initialPaid)}</b></div>
     {s.payments.length?s.payments.map((p:any)=><div className="payment-row" key={p.id}><span><b>{p.date.slice(0,10)}</b><small>{p.method}{p.reference?' · '+p.reference:''}</small></span><b>{money(p.cents)}</b></div>):<p className="invoice-empty">No additional payments recorded.</p>}
    </div>

    <aside className="invoice-summary">
     <small>INVOICE SUMMARY</small>
     <div><span>Price before tax/service</span><b>{money(tax.baseCents)}</b></div>
     <div><span>Service charge {Math.round(SERVICE_CHARGE_RATE*100)}%</span><b>{money(tax.serviceChargeCents)}</b></div>
     <div><span>Tourism GST {Math.round(TOURISM_GST_RATE*100)}%</span><b>{money(tax.tourismGstCents)}</b></div>
     <div><span>Green Tax</span><b>{money(tax.greenTaxCents)}</b></div>
     <small className="invoice-tax-note">USD {GREEN_TAX_USD_PER_PERSON_DAY} per taxable guest/day</small>
     <div className="summary-total"><span>Total charges</span><b>{money(s.folio.totalCents)}</b></div>
     <div className="summary-paid"><span>Payments received</span><b>{money(s.folio.paidCents)}</b></div>
     <div className={'summary-balance '+(s.folio.balanceCents<=0?'settled':'due')}><span>Balance due</span><b>{money(s.folio.balanceCents)}</b></div>
    </aside>
   </section>

   <section className="invoice-note"><b>All taxes and service charge are included in the total.</b><span>Guest price is unchanged.</span></section>
   <footer><strong>Thank you for staying with us!</strong><span>Arrive as a Guest, Leave as a Friend.</span><small>Nirili Villa · Dhiffushi Island, Maldives</small></footer>
  </main>
 }catch{return <main><UiText>Could not load your bill. Please reload to retry.</UiText></main>}
}
