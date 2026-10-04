import {authDb,currentUser,hasPermission,sameOrigin} from '../../../lib/auth';
import {billPaymentKey} from '../../../lib/bill-payment';
import {loadStays,folioFor} from '../../../lib/stays';
import {saveStayAccess} from '../../../lib/stay-login';

const headers={'Cache-Control':'private, no-store','Vary':'Cookie'};

function activePaymentTotal(payments:any[],reference:string){
  return (payments||[]).filter((payment:any)=>payment?.reference===reference&&!payment?.reversedAt)
    .reduce((sum:number,payment:any)=>sum+Math.round(Number(payment?.cents)||0),0);
}

export async function POST(request:Request){
  const user=await currentUser();
  if(!user||!hasPermission(user,'edit_bills')||!sameOrigin(request)){
    return Response.json({error:'Bill editing permission is required.'},{status:403,headers});
  }
  try{
    const input=await request.json();
    const billId=String(input?.billId||'').trim();
    const department=String(input?.department||'').trim();
    const bookingId=String(input?.bookingId||'').trim();
    if(!billId||!['Accommodation','Restaurant','Transfer','Excursions'].includes(department)){
      return Response.json({error:'Choose a valid bill.'},{status:400,headers});
    }

    const {state,revision}=await loadStays();
    state.stays??=[];state.orders??=[];

    let stay=bookingId?state.stays.find((item:any)=>String(item.id)===bookingId):null;
    let order:any=null;
    if(!stay&&department==='Excursions'){
      order=state.orders.find((item:any)=>item.kind==='excursion'&&String(item.id)===billId);
      if(order?.stayId)stay=state.stays.find((item:any)=>String(item.id)===String(order.stayId));
    }
    if(!stay&&department==='Transfer'){
      order=state.orders.find((item:any)=>item.kind==='transfer'&&String(item.id)===billId);
      if(order?.stayId)stay=state.stays.find((item:any)=>String(item.id)===String(order.stayId));
    }
    if(!stay&&department==='Restaurant'){
      stay=state.stays.find((item:any)=>Array.isArray(item.posBills)&&item.posBills.some((bill:any)=>String(bill.id)===billId));
    }
    if(!stay&&department==='Accommodation'){
      stay=state.stays.find((item:any)=>String(item.id)===billId||Array.isArray(item.extensions)&&item.extensions.some((extension:any)=>String(extension.id)===billId));
    }

    // Walk-in/external excursion bookings have no room folio. Mark the excursion itself paid.
    if(!stay&&department==='Excursions'){
      order??=state.orders.find((item:any)=>item.kind==='excursion'&&String(item.id)===billId);
      if(!order)return Response.json({error:'Excursion bill not found.'},{status:404,headers});
      const totalCents=Math.max(0,Math.round(Number(order.cents)||0));
      const already=(order.excursionPayments||[]).reduce((sum:number,p:any)=>sum+Math.round(Number(p?.cents)||0),0);
      const remaining=Math.max(0,totalCents-already);
      if(remaining>0){
        const now=new Date().toISOString();
        order.excursionPayments=[...(order.excursionPayments||[]),{id:crypto.randomUUID(),cents:remaining,method:'Marked paid',reference:'Excursion bill '+billId,date:now,by:user.username}];
        order.updatedAt=now;order.updatedBy=user.username;
      }
      const saved=await saveStayAccess(state,revision,user.userId);
      if(!saved)return Response.json({error:'This bill changed elsewhere. Refresh and try again.'},{status:409,headers});
      return Response.json({ok:true,paid:true,billId,department,roomLinked:false},{headers});
    }

    if(!stay)return Response.json({error:'Linked room booking not found.'},{status:404,headers});

    const folio=await folioFor(stay,state.orders);
    const bill=(folio.bills||[]).find((item:any)=>String(item.department)===department&&String(item.id)===billId);
    if(!bill||bill.status==='Cancelled')return Response.json({error:'Bill not found or cancelled.'},{status:404,headers});

    const totalCents=Math.max(0,Math.round(Number(bill.totalCents)||0));
    const key=billPaymentKey({department,id:billId});
    stay.paidBills??={};stay.payments??=[];stay.history??=[];

    if(stay.paidBills[key]===totalCents){
      return Response.json({ok:true,paid:true,billId,department,roomLinked:true,room:stay.room},{headers});
    }

    stay.markedUnpaid=false;
    const currentReference='Bill marked paid · '+key;
    const existingPayment=activePaymentTotal(stay.payments,currentReference);
    const amountToRecord=Math.max(0,Math.min(totalCents-existingPayment,Math.max(0,Math.round(Number(folio.balanceCents)||0))));
    const now=new Date().toISOString();
    if(amountToRecord>0){
      stay.payments.push({id:crypto.randomUUID(),cents:amountToRecord,method:'Marked paid',reference:currentReference,date:now,by:user.username});
    }
    stay.paidBills[key]=totalCents;
    stay.history.unshift({date:now,by:user.username,detail:department+' bill '+billId+' marked paid'+(amountToRecord>0?' · Payment received $'+(amountToRecord/100).toFixed(2):' · Covered by existing payment')});

    const saved=await saveStayAccess(state,revision,user.userId);
    if(!saved)return Response.json({error:'This bill changed elsewhere. Refresh and try again.'},{status:409,headers});
    return Response.json({ok:true,paid:true,billId,department,roomLinked:true,room:stay.room,recordedCents:amountToRecord},{headers});
  }catch(error){
    return Response.json({error:error instanceof Error?error.message:'Could not mark this bill paid.'},{status:400,headers});
  }
}
