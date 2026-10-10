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
  const invoiceDate=new Date().toISOString().slice(0,10);
  const guestCount=Number(s.pax||s.guests?.length||0);
  const bookingSource=String(s.source||s.bookingSource||s.channel||'Direct Booking');
  return <main className="print-bill">
   <nav className="print-control"><a href={'/?portal='+u.role+'&room='+s.room}><UiText>← Back to room</UiText></a><PrintBill/></nav>

   <header className="invoice-hero">
    <div className="invoice-island-art" aria-hidden="true"><span className="invoice-sun"/><span className="invoice-palm">🌴</span><span className="invoice-wave invoice-wave-one"/><span className="invoice-wave invoice-wave-two"/></div>
    <div className="invoice-brand"><div className="invoice-brand-mark"><span>☀</span><b>≋</b></div><div><h1>NIRILI <span>VILLA</span></h1><p>Dhiffushi Island, Maldives</p><small>Arrive as a guest, leave as a friend.</small></div></div>
    <div className="invoice-heading"><em>Island Life<br/>Lasts Longer</em><b>INVOICE</b><span>Invoice No: <strong>{s.id}</strong></span><span>Booking Ref: <strong>{s.id}</strong></span><span>Invoice Date: <strong>{invoiceDate}</strong></span><i className={statusClass(invoiceStatus)}>✓ {invoiceStatus}</i></div>
   </header>

   <section className="invoice-guest-card">
    <div className="invoice-card-title"><span>👤</span><div><small>GUEST & STAY INFORMATION</small><strong>{s.guest}</strong></div></div>
    <div><small>BOOKING REF</small><strong>{s.id}</strong></div>
    <div><small>ROOM NUMBER</small><strong>{s.room}</strong></div>
    <div><small>NUMBER OF GUESTS</small><strong>{guestCount||'—'}</strong></div>
    <div><small>STAY STATUS</small><strong>{s.status}</strong></div>
    <div><small>CHECK-IN</small><strong>{s.checkIn}</strong></div>
    <div><small>CHECK-OUT</small><strong>{s.checkOut}</strong></div>
    <div><small>MEAL PLAN</small><strong>{s.meal}</strong></div>
    <div><small>BOOKING SOURCE</small><strong>{bookingSource}</strong></div>
   </section>

   <section className="invoice-charges">
    <div className="invoice-section-title"><div><small>CHARGES</small><h2>Stay & services</h2></div><span>{s.folio.bills.length} bill{s.folio.bills.length===1?'':'s'}</span></div>
    {s.folio.bills.map((b:any)=>{const dept=String(b.department||'bill').toLowerCase().replace(/[^a-z0-9]+/g,'-');return <article className={'invoice-bill-card department-'+dept} key={b.department+b.id}>
     <header><div><small>{b.department}</small><strong>{b.id}</strong></div><i className={statusClass(b.status)}>{b.status}</i></header>
     <div className="invoice-table-wrap"><table><thead><tr><th>Item</th><th>Qty</th><th>Amount</th><th>Discount</th><th>Net</th></tr></thead><tbody>
      {b.items.map((item:any,n:number)=><tr key={n}><td>{item[0]}</td><td>{item[1]}</td><td>{money(Math.round(item[2]*100))}</td><td>{item[3]||0}%</td><td><b>{money(b.status==='Cancelled'?0:Math.round(item[2]*100*(1-(item[3]||0)/100)))}</b></td></tr>)}
     </tbody></table></div>
     <p className="bill-subtotal"><span>Bill total</span><b>{money(b.totalCents)}</b></p>
    </article>})}
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

   <section className="invoice-note"><div><b>ℹ Notes</b><span>All taxes and service charge are included in the total.</span><span>Guest price is unchanged.</span></div></section>
   <footer>
    <div className="invoice-contact-row"><span>✉ nirilivilla@gmail.com</span><span>🌐 www.nirilihotels.com</span><span>📍 Dhiffushi Island, Maldives</span></div>
    <div className="invoice-footer-message"><strong>Arrive as a guest,<br/>leave as a friend. ♡</strong><span>Good People · Good Places · Great Memories</span></div>
    <div className="invoice-footer-wave" aria-hidden="true"/>
   </footer>
  </main>
 }catch{return <main><UiText>Could not load your bill. Please reload to retry.</UiText></main>}
}
