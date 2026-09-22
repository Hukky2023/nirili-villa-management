import {env} from "cloudflare:workers";
import {currentUser,hasPermission} from "./auth";
import {initialBill,total} from "./restaurant";
import {readRestaurantBillRecord} from "./supabase-bridge";
export async function isAdmin(){const user=await currentUser();return user?.role==="admin"?user:null;}
export function billDb(){if(!env.DB)throw new Error("Billing unavailable");return env.DB;}
export async function readBill(room:string,id:string){const seed=initialBill(room,id);if(!seed)return null;let row:any=null;try{row=await readRestaurantBillRecord(room+":"+id);}catch{}if(!row)row=await billDb().prepare("SELECT payload,revision FROM restaurant_bills WHERE key = ?").bind(room+":"+id).first<{payload:string;revision:number}>();const bill=row?{...(typeof row.payload==='string'?JSON.parse(row.payload):row.payload),revision:row.revision}:seed;const record=await billDb().prepare("SELECT payload FROM operation_records WHERE key='hotel-stays-v1'").first<{payload:string}>();const stay=record?JSON.parse(record.payload).stays.find((s:any)=>s.billRoom===room):null;if(bill.status!=='Cancelled'&&stay?.markedUnpaid)bill.status='Unpaid';else if(bill.status!=='Cancelled'&&stay?.paidBills?.['Restaurant:'+id]===Math.round(total(bill)*100))bill.status='Paid';else if(bill.status==='Paid'&&Number.isInteger(stay?.paidBills?.['Restaurant:'+id]))bill.status='Posted';return bill;}

export async function billEditor(){const user=await currentUser();return hasPermission(user,"edit_bills")?user:null;}
