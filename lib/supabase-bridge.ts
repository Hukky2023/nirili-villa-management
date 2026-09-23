import {env} from 'cloudflare:workers';
import {reconcileRestaurantRoomBills} from './pos-room-billing';

type LegacyAccountRow={
  id:string;
  username:string;
  email?:string|null;
  name:string;
  password_hash?:string;
  salt?:string;
  role:'admin'|'staff'|'guest';
  permissions?:string|string[];
  active?:number|boolean;
};

const projectUrl='https://vjbyrjqibzebpzontxgc.supabase.co';
const publishableFallback='sb_publishable_78tYy6PCg8n0LSQeOvCacw_Y45t--Xk';

function config(){
  const values=env as unknown as Record<string,string|undefined>;
  const nodeEnv=(typeof process!=='undefined'&&process.env?process.env:{}) as Record<string,string|undefined>;
  const readRaw=(...keys:string[])=>{
    for(const key of keys){
      const value=values[key]??nodeEnv[key];
      if(typeof value==='string'&&value.trim())return value;
    }
    return '';
  };
  const normalizeKey=(value:string)=>{
    const trimmed=value.trim().replace(/^["']|["']$/g,'');
    // Supabase sb_* keys contain no whitespace. Remove accidental line breaks,
    // spaces and zero-width characters introduced while copying from a dashboard.
    return trimmed.replace(/[\s\u200B-\u200D\uFEFF]+/g,'');
  };
  const secretRaw=readRaw('SUPABASE_SECRET_KEY');
  const publishableRaw=readRaw('NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY','SUPABASE_PUBLISHABLE_KEY');
  return {
    url:readRaw('NEXT_PUBLIC_SUPABASE_URL','SUPABASE_URL').trim()||projectUrl,
    publishable:normalizeKey(publishableRaw)||publishableFallback,
    secret:normalizeKey(secretRaw),
    secretWasNormalized:!!secretRaw&&normalizeKey(secretRaw)!==secretRaw.trim()
  };
}

export function supabaseBridgeConfigured(){return !!config().secret;}

export async function supabaseBridgeHealth(){
  const cfg=config();
  const redact=(value:unknown)=>String(value||'').replace(/sb_(?:secret|publishable)_[A-Za-z0-9_-]+/g,'[redacted]');
  let publicReachable=false,publicError='';
  try{
    await sb('/rest/v1/rooms?select=room_number&limit=1',{headers:{Accept:'application/json'}},'publishable');
    publicReachable=true;
  }catch(error){
    publicError=redact(error instanceof Error?error.message:error);
  }
  if(!cfg.secret)return {
    configured:false,
    reachable:false,
    publicReachable,
    publicError:publicReachable?undefined:publicError,
    secretFormat:false,
    projectRef:'vjbyrjqibzebpzontxgc',
    diagnosticVersion:'supabase-health-v2',
    error:'SUPABASE_SECRET_KEY is not available to this deployment.'
  };
  try{
    const rows=await restSelect('rooms','select=room_number&limit=1');
    return {
      configured:true,
      reachable:true,
      publicReachable,
      roomsVisible:Array.isArray(rows)?rows.length:0,
      secretFormat:cfg.secret.startsWith('sb_secret_'),
      secretLength:cfg.secret.length,
      secretWasNormalized:cfg.secretWasNormalized,
      projectRef:'vjbyrjqibzebpzontxgc',
      diagnosticVersion:'supabase-health-v2'
    };
  }catch(error){
    const message=redact(error instanceof Error?error.message:'Supabase connection failed.');
    return {
      configured:true,
      reachable:false,
      publicReachable,
      publicError:publicReachable?undefined:publicError,
      secretFormat:cfg.secret.startsWith('sb_secret_'),
      secretLength:cfg.secret.length,
      secretWasNormalized:cfg.secretWasNormalized,
      projectRef:'vjbyrjqibzebpzontxgc',
      diagnosticVersion:'supabase-health-v2',
      error:message
    };
  }
}

function permissions(value:LegacyAccountRow['permissions']){
  if(Array.isArray(value))return value;
  try{return JSON.parse(String(value||'[]'));}catch{return [];}
}

function appRole(role:string):'admin'|'staff'|'guest'{
  return role==='admin'||role==='staff'?role:'guest';
}

function syntheticEmail(username:string){
  const safe=username.trim().toLowerCase().replace(/[^a-z0-9._-]/g,'-').slice(0,64)||'user';
  return safe+'@accounts.nirili.local';
}

async function sb(path:string,init:RequestInit={},kind:'secret'|'publishable'='secret'){
  const cfg=config(),key=kind==='secret'?cfg.secret:cfg.publishable;
  if(!key)throw Error('Supabase bridge is not configured.');
  const headers=new Headers(init.headers||{});
  headers.set('apikey',key);
  if(init.body&&!headers.has('content-type'))headers.set('content-type','application/json');
  const response=await fetch(cfg.url+path,{...init,headers});
  const text=await response.text();
  let body:any=null;try{body=text?JSON.parse(text):null}catch{body=text}
  if(!response.ok)throw Error(body?.msg||body?.message||body?.error_description||body?.error||('Supabase request failed ('+response.status+')'));
  return body;
}

async function restSelect(table:string,query:string){
  return await sb('/rest/v1/'+table+'?'+query,{headers:{Accept:'application/json'}},'secret') as any[];
}

async function restUpsert(table:string,rows:any[],onConflict:string){
  if(!rows.length)return [];
  return await sb('/rest/v1/'+table+'?on_conflict='+encodeURIComponent(onConflict),{
    method:'POST',
    headers:{Prefer:'resolution=merge-duplicates,return=representation'},
    body:JSON.stringify(rows)
  },'secret') as any[];
}

function parseRestaurantOrderPayload(value:any){
  if(value&&typeof value==='object')return value;
  if(typeof value==='string')try{return JSON.parse(value)}catch{}
  return null;
}

function restaurantOrderVersion(order:any){
  const values:any[]=[order?.updatedAt,order?.paidAt,order?.createdAt];
  if(Array.isArray(order?.history))for(const entry of order.history)values.push(entry?.date,entry?.at);
  return values.reduce((latest:number,value:any)=>{
    const time=Date.parse(String(value||''));
    return Number.isFinite(time)&&time>latest?time:latest;
  },0);
}

function mergeRestaurantOrdersIntoHotelState(state:any,orders:any[]){
  if(!state||typeof state!=='object')return state;
  state.posOrders=Array.isArray(state.posOrders)?state.posOrders:[];
  state.stays=Array.isArray(state.stays)?state.stays:[];
  state.deletedPOSOrders=Array.isArray(state.deletedPOSOrders)?state.deletedPOSOrders:[];
  const deleted=new Set(state.deletedPOSOrders.map((order:any)=>String(order?.id||'')).filter(Boolean));
  const indexById=new Map<string,number>();
  state.posOrders.forEach((order:any,index:number)=>{const id=String(order?.id||'');if(id)indexById.set(id,index);});

  for(const raw of orders||[]){
    const incoming=parseRestaurantOrderPayload(raw?.payload??raw);
    const id=String(incoming?.id||raw?.id||'');
    if(!id||deleted.has(id)||!incoming)continue;
    const index=indexById.get(id);
    if(index===undefined){
      state.posOrders.push(incoming);
      indexById.set(id,state.posOrders.length-1);
      continue;
    }
    const current=state.posOrders[index];
    if(restaurantOrderVersion(incoming)>restaurantOrderVersion(current))state.posOrders[index]=incoming;
  }

  reconcileRestaurantRoomBills(state);

  for(const order of state.posOrders){
    const id=String(order?.id||'');
    if(!id||deleted.has(id))continue;
    const stay=state.stays.find((item:any)=>String(item?.id||'')===String(order.stayId||''));
    if(!stay)continue;
    stay.payments=Array.isArray(stay.payments)?stay.payments:[];
    if(['Cash','Card','Bank transfer'].includes(String(order.method||''))&&Number(order.cents)>0&&!stay.payments.some((payment:any)=>payment?.reference===id&&Number(payment?.cents)>0&&!payment?.reversedAt)){
      const payment:any={
        id:'recovered-pos:'+id,
        cents:Number(order.cents),
        method:String(order.method),
        reference:id,
        date:order.paidAt||order.updatedAt||order.createdAt||new Date().toISOString(),
        by:order.updatedBy||order.createdBy||'POS recovery'
      };
      if(['Cash','Card'].includes(String(order.method||''))){
        payment.currency=['MVR','EUR'].includes(String(order.paymentCurrency||''))?order.paymentCurrency:'USD';
        if(payment.currency==='MVR'){payment.exchangeRate=Number(order.exchangeRate)||0;payment.paidMvr=Number(order.paidMvr)||0;}
        if(payment.currency==='EUR'){payment.exchangeRate=Number(order.exchangeRate)||0;payment.paidEur=Number(order.paidEur)||0;}
      }
      stay.payments.push(payment);
    }
  }
  return state;
}

export async function readRestaurantOrdersPrimary(){
  if(!supabaseBridgeConfigured())return [];
  const rows=await restSelect('restaurant_orders','select=id,payload,created_at,synced_at&order=created_at.asc');
  return rows||[];
}

export async function restoreRestaurantOrdersPrimary(state:any){
  if(!state||typeof state!=='object'||!supabaseBridgeConfigured())return state;
  return mergeRestaurantOrdersIntoHotelState(state,await readRestaurantOrdersPrimary());
}

export async function deleteRestaurantOrderPrimary(id:string){
  if(!supabaseBridgeConfigured()||!id)return false;
  await sb('/rest/v1/restaurant_orders?id=eq.'+encodeURIComponent(id),{
    method:'DELETE',
    headers:{Prefer:'return=minimal'}
  },'secret');
  return true;
}

async function protectHotelStatePayload(key:string,payload:any){
  if(key!=='hotel-stays-v1')return payload;
  try{return await restoreRestaurantOrdersPrimary(payload);}catch{return payload;}
}


export async function mirrorLegacyAccounts(rows:LegacyAccountRow[]){
  if(!supabaseBridgeConfigured()||!Array.isArray(rows)||!rows.length)return 0;
  const now=new Date().toISOString();
  const values=rows.map(row=>({
    id:row.id,
    username:row.username,
    email:row.email||null,
    name:row.name,
    password_hash:row.password_hash||'',
    salt:row.salt||'',
    role:appRole(row.role),
    permissions:permissions(row.permissions),
    active:row.active===undefined?true:!!row.active,
    updated_at:now
  }));
  await restUpsert('legacy_accounts',values,'id');
  return values.length;
}

export async function mirrorOperationalSnapshot(records:any[],bills:any[]){
  if(!supabaseBridgeConfigured())return {operations:0,schedules:0,bills:0,transport:false};
  const now=new Date().toISOString(),batch=crypto.randomUUID();
  const parse=(value:any)=>{if(typeof value!=='string')return value??{};try{return JSON.parse(value||'{}')}catch{return value}};
  const [currentOps,currentBills,restaurantOrders]=await Promise.all([
    restSelect('operational_records','select=key,revision'),
    restSelect('restaurant_bills','select=key,revision'),
    readRestaurantOrdersPrimary()
  ]);
  const opRevisions=new Map((currentOps||[]).map((row:any)=>[String(row.key),Number(row.revision)||0]));
  const billRevisions=new Map((currentBills||[]).map((row:any)=>[String(row.key),Number(row.revision)||0]));
  const opRows=(records||[]).map((record:any)=>{
    const key=String(record.key),revision=Number(record.revision)||0;
    let payload=parse(record.payload);
    if(key==='hotel-stays-v1')payload=mergeRestaurantOrdersIntoHotelState(payload,restaurantOrders);
    return {key,payload,revision,updated_by:record.updated_by||null,synced_at:now,sync_batch_id:batch};
  }).filter((row:any)=>row.key&&(!opRevisions.has(row.key)||row.revision>(opRevisions.get(row.key)||0)));
  await restUpsert('operational_records',opRows,'key');

  const scheduleRows=opRows.filter((row:any)=>row.key.startsWith('excursion-schedule:')).map((row:any)=>{
    const schedule=row.payload||{};
    return {
      source_key:row.key,
      schedule_id:String(schedule.id||''),
      schedule_date:schedule.date||null,
      departure_time:schedule.time||null,
      end_time:schedule.endTime||null,
      excursion_name:schedule.name||null,
      vessel_id:schedule.vesselId||null,
      capacity:Number.isFinite(Number(schedule.capacity))?Number(schedule.capacity):null,
      status:schedule.status||null,
      payload:schedule,
      synced_at:now,
      sync_batch_id:batch
    };
  });
  await restUpsert('excursion_schedules',scheduleRows,'source_key');

  const billRows=(bills||[]).map((bill:any)=>({
    key:String(bill.key),
    payload:parse(bill.payload),
    revision:Number(bill.revision)||0,
    updated_by:bill.updated_by||null,
    synced_at:now,
    sync_batch_id:batch
  })).filter((row:any)=>row.key&&(!billRevisions.has(row.key)||row.revision>(billRevisions.get(row.key)||0)));
  await restUpsert('restaurant_bills',billRows,'key');

  const transport=opRows.find((row:any)=>row.key==='transport-bookings-v1');
  if(transport)await mirrorTransportState(transport.payload);

  return {operations:opRows.length,schedules:scheduleRows.length,bills:billRows.length,transport:!!transport};
}


async function syncMappedEmployeeMetadata(row:LegacyAccountRow){
  if(!['admin','staff'].includes(row.role))return;
  const mapped=await restSelect('legacy_accounts','id=eq.'+encodeURIComponent(row.id)+'&select=auth_user_id&limit=1');
  const authUserId=mapped[0]?.auth_user_id as string|undefined;
  if(!authUserId)return;
  const p=new Set(permissions(row.permissions));
  await restUpsert('profiles',[{
    id:authUserId,
    username:row.username,
    full_name:row.name,
    email:row.email||syntheticEmail(row.username),
    role:appRole(row.role),
    active:row.active===undefined?true:!!row.active,
    legacy_account_id:row.id,
    updated_at:new Date().toISOString()
  }],'id');
  if(row.role==='staff')await restUpsert('staff_permissions',[{
    user_id:authUserId,
    guesthouse_reception:p.has('guesthouse_reception'),
    excursions_manager:p.has('excursions_manager'),
    waiter_pos:p.has('waiter_pos'),
    restaurant_pos:p.has('restaurant_pos'),
    kitchen_pos:p.has('kitchen_pos'),
    edit_bills:p.has('edit_bills'),
    edit_excursions:p.has('edit_excursions'),
    edit_transfers:p.has('edit_transfers'),
    buggy_driver:p.has('buggy_driver'),
    crew_location:p.has('crew_location'),
    updated_at:new Date().toISOString()
  }],'user_id');
}

export async function mirrorLegacyAccount(row:LegacyAccountRow){
  if(!supabaseBridgeConfigured())return false;
  const legacy={
    id:row.id,
    username:row.username,
    email:row.email||null,
    name:row.name,
    password_hash:row.password_hash||'',
    salt:row.salt||'',
    role:appRole(row.role),
    permissions:permissions(row.permissions),
    active:row.active===undefined?true:!!row.active,
    updated_at:new Date().toISOString()
  };
  await restUpsert('legacy_accounts',[legacy],'id');
  try{await syncMappedEmployeeMetadata(row);}catch{}
  return true;
}







export async function updatePublicBookingRequestStatus(id:string,status:string,extra:any={}){
  if(!supabaseBridgeConfigured())return false;
  await sb('/rest/v1/public_booking_requests?id=eq.'+encodeURIComponent(id),{
    method:'PATCH',
    headers:{Prefer:'return=minimal'},
    body:JSON.stringify({
      status,
      updated_at:new Date().toISOString(),
      payload:{...extra,status}
    })
  },'secret');
  return true;
}

export async function submitPublicBookingRequest(request:any){
  if(!supabaseBridgeConfigured())throw Error('Booking service is unavailable.');
  return await sb('/rest/v1/rpc/submit_public_booking_request',{
    method:'POST',
    body:JSON.stringify({p_request:request})
  },'secret');
}

export async function hitSupabaseRateLimit(key:string,max:number){
  if(!supabaseBridgeConfigured())throw Error('Supabase bridge is not configured.');
  const result=await sb('/rest/v1/rpc/hit_rate_limit',{
    method:'POST',
    body:JSON.stringify({p_key:key,p_max:max})
  },'secret');
  return result===true;
}

export async function readLegacySessionAccount(tokenHash:string,nowMs:number){
  if(!supabaseBridgeConfigured())return null;
  const result=await sb('/rest/v1/rpc/get_legacy_session_account',{
    method:'POST',
    body:JSON.stringify({p_token_hash:tokenHash,p_now_ms:nowMs})
  },'secret');
  return result&&typeof result==='object'?result:null;
}

export async function upsertLegacySession(tokenHash:string,accountId:string,expiresAt:number){
  if(!supabaseBridgeConfigured())return false;
  await restUpsert('legacy_sessions',[{
    token_hash:tokenHash,
    account_id:accountId,
    expires_at:expiresAt,
    created_at:new Date().toISOString()
  }],'token_hash');
  return true;
}

export async function deleteLegacySession(tokenHash:string){
  if(!supabaseBridgeConfigured())return false;
  await sb('/rest/v1/legacy_sessions?token_hash=eq.'+encodeURIComponent(tokenHash),{
    method:'DELETE',
    headers:{Prefer:'return=minimal'}
  },'secret');
  return true;
}

export async function deleteLegacySessionsForAccount(accountId:string){
  if(!supabaseBridgeConfigured())return false;
  await sb('/rest/v1/legacy_sessions?account_id=eq.'+encodeURIComponent(accountId),{
    method:'DELETE',
    headers:{Prefer:'return=minimal'}
  },'secret');
  return true;
}

export async function deactivateSupabaseAccount(legacyAccountId:string){
  if(!supabaseBridgeConfigured())return false;
  const rows=await restSelect('legacy_accounts','id=eq.'+encodeURIComponent(legacyAccountId)+'&select=auth_user_id&limit=1');
  const authUserId=rows[0]?.auth_user_id as string|undefined;
  await sb('/rest/v1/legacy_accounts?id=eq.'+encodeURIComponent(legacyAccountId),{
    method:'PATCH',
    headers:{Prefer:'return=minimal'},
    body:JSON.stringify({active:false,updated_at:new Date().toISOString()})
  },'secret');
  if(authUserId)await sb('/rest/v1/profiles?id=eq.'+encodeURIComponent(authUserId),{
    method:'PATCH',
    headers:{Prefer:'return=minimal'},
    body:JSON.stringify({active:false,updated_at:new Date().toISOString()})
  },'secret');
  await sb('/rest/v1/guest_accounts?legacy_account_id=eq.'+encodeURIComponent(legacyAccountId),{
    method:'PATCH',
    headers:{Prefer:'return=minimal'},
    body:JSON.stringify({active:false,valid_until:new Date().toISOString()})
  },'secret');
  return true;
}

export async function updateSupabaseEmployeePassword(legacyAccountId:string,password:string){
  if(!supabaseBridgeConfigured())return {mapped:false,updated:false};
  const rows=await restSelect('legacy_accounts','id=eq.'+encodeURIComponent(legacyAccountId)+'&select=auth_user_id,role&limit=1');
  const row=rows[0];
  const authUserId=row?.auth_user_id as string|undefined;
  if(!authUserId||!['admin','staff'].includes(String(row?.role||'')))return {mapped:false,updated:false};
  await sb('/auth/v1/admin/users/'+encodeURIComponent(authUserId),{
    method:'PUT',
    body:JSON.stringify({password})
  },'secret');
  return {mapped:true,updated:true};
}

export async function ensureSupabaseEmployee(row:LegacyAccountRow,password:string){
  if(!supabaseBridgeConfigured()||!['admin','staff'].includes(row.role))return null;
  await mirrorLegacyAccount(row);
  const existing=await restSelect('legacy_accounts','id=eq.'+encodeURIComponent(row.id)+'&select=auth_user_id,email,username,name,role');
  let authUserId=existing[0]?.auth_user_id as string|undefined;
  const authEmail=(row.email||syntheticEmail(row.username)).toLowerCase();

  if(!authUserId){
    const profile=await restSelect('profiles','email=eq.'+encodeURIComponent(authEmail)+'&select=id&limit=1');
    authUserId=profile[0]?.id;
  }

  if(!authUserId){
    try{
      const created=await sb('/auth/v1/admin/users',{
        method:'POST',
        body:JSON.stringify({
          email:authEmail,
          password,
          email_confirm:true,
          user_metadata:{username:row.username,full_name:row.name}
        })
      },'secret');
      authUserId=created?.id||created?.user?.id;
    }catch(error){
      const profile=await restSelect('profiles','email=eq.'+encodeURIComponent(authEmail)+'&select=id&limit=1');
      authUserId=profile[0]?.id;
      if(!authUserId)throw error;
    }
  }

  if(!authUserId)throw Error('Supabase user migration did not return a user id.');

  // A legacy staff login is authoritative during cutover. If a synthetic-email
  // Auth user already exists with stale guest metadata, repair it and align the
  // password so subsequent logins can use Supabase directly.
  await sb('/auth/v1/admin/users/'+encodeURIComponent(authUserId),{
    method:'PUT',
    body:JSON.stringify({password,user_metadata:{username:row.username,full_name:row.name}})
  },'secret');

  await sb('/rest/v1/legacy_accounts?id=eq.'+encodeURIComponent(row.id),{
    method:'PATCH',
    headers:{Prefer:'return=minimal'},
    body:JSON.stringify({auth_user_id:authUserId,updated_at:new Date().toISOString()})
  },'secret');

  await restUpsert('profiles',[{
    id:authUserId,
    username:row.username,
    full_name:row.name,
    email:authEmail,
    role:appRole(row.role),
    active:row.active===undefined?true:!!row.active,
    legacy_account_id:row.id,
    updated_at:new Date().toISOString()
  }],'id');

  if(row.role==='staff'){
    const p=new Set(permissions(row.permissions));
    await restUpsert('staff_permissions',[{
      user_id:authUserId,
      guesthouse_reception:p.has('guesthouse_reception'),
      excursions_manager:p.has('excursions_manager'),
      waiter_pos:p.has('waiter_pos'),
      restaurant_pos:p.has('restaurant_pos'),
      kitchen_pos:p.has('kitchen_pos'),
      edit_bills:p.has('edit_bills'),
      edit_excursions:p.has('edit_excursions'),
      edit_transfers:p.has('edit_transfers'),
      buggy_driver:p.has('buggy_driver'),
      crew_location:p.has('crew_location'),
      updated_at:new Date().toISOString()
    }],'user_id');
  }
  return authUserId;
}

export async function authenticateSupabaseEmployee(identifier:string,password:string){
  if(!supabaseBridgeConfigured())return null;
  const encoded=encodeURIComponent(identifier.toLowerCase());
  let rows=await restSelect('legacy_accounts','username=eq.'+encoded+'&active=eq.true&select=id,username,email,name,role,permissions,active,auth_user_id&limit=1');
  if(!rows.length)rows=await restSelect('legacy_accounts','email=eq.'+encoded+'&active=eq.true&select=id,username,email,name,role,permissions,active,auth_user_id&limit=1');
  const row=rows[0];
  if(!row||!['admin','staff'].includes(row.role)||!row.auth_user_id)return null;
  const email=(row.email||syntheticEmail(row.username)).toLowerCase();
  try{
    await sb('/auth/v1/token?grant_type=password',{
      method:'POST',
      body:JSON.stringify({email,password})
    },'publishable');
    return {legacyId:String(row.id),account:row};
  }catch{return null;}
}

function roomStatus(value:any){
  const v=String(value||'Available').toLowerCase().replace(/\s+/g,'_');
  return ['available','occupied','cleaning','maintenance'].includes(v)?v:'available';
}
function bookingStatus(value:any){
  const v=String(value||'Confirmed').toLowerCase();
  if(v==='in house')return 'checked_in';
  if(v==='checked out')return 'checked_out';
  if(v==='cancelled')return 'cancelled';
  if(v==='pending')return 'pending';
  return 'confirmed';
}



export async function listSystemNotifications(limit=150){
  if(!supabaseBridgeConfigured())return [];
  const rows=await restSelect('system_notifications','select=id,event_key,event_type,title,detail,created_at,read_at,payload&order=created_at.desc&limit='+Math.max(1,Math.min(200,limit)));
  return rows.map((row:any)=>({
    id:row.event_key||row.id,
    type:row.event_type,
    title:row.title,
    detail:row.detail||'',
    at:row.created_at,
    read:!!row.read_at
  }));
}

export async function saveSystemNotifications(notices:any[]){
  if(!supabaseBridgeConfigured()||!Array.isArray(notices)||!notices.length)return 0;
  const rows=notices.slice(0,100).map((n:any)=>({
    event_key:String(n.id||crypto.randomUUID()).slice(0,250),
    event_type:String(n.type||'change').slice(0,80),
    title:String(n.title||'Notification').slice(0,200),
    detail:String(n.detail||'').slice(0,1000),
    created_at:n.at||new Date().toISOString(),
    read_at:n.read?new Date().toISOString():null,
    payload:n
  }));
  await restUpsert('system_notifications',rows,'event_key');
  return rows.length;
}

export async function markSystemNotificationsRead(eventKeys?:string[]){
  if(!supabaseBridgeConfigured())return false;
  const now=new Date().toISOString();
  const filter=Array.isArray(eventKeys)&&eventKeys.length
    ?'event_key=in.('+eventKeys.map(x=>encodeURIComponent(String(x))).join(',')+')'
    :'read_at=is.null';
  await sb('/rest/v1/system_notifications?'+filter,{
    method:'PATCH',
    headers:{Prefer:'return=minimal'},
    body:JSON.stringify({read_at:now})
  },'secret');
  return true;
}

export async function clearSystemNotifications(){
  if(!supabaseBridgeConfigured())return false;
  await sb('/rest/v1/system_notifications?id=not.is.null',{method:'DELETE',headers:{Prefer:'return=minimal'}},'secret');
  return true;
}





export async function readOperationalRecordsPrimary(prefix:string){
  if(!supabaseBridgeConfigured())return [];
  const rows=await restSelect('operational_records','select=key,payload,revision,updated_by&key=like.'+encodeURIComponent(prefix+'*')+'&order=key.asc');
  return rows||[];
}

export async function readOperationalRecordPrimary(key:string){
  if(!supabaseBridgeConfigured())return null;
  const rows=await restSelect('operational_records','select=key,payload,revision,updated_by&key=eq.'+encodeURIComponent(key)+'&limit=1');
  return rows[0]||null;
}

export async function readOperationalRecordsPrimaryByPrefix(prefix:string){
  if(!supabaseBridgeConfigured())return [];
  const rows=await restSelect('operational_records','select=key,payload,revision,updated_by&key=like.'+encodeURIComponent(prefix+'*')+'&order=key.asc');
  return rows||[];
}

export async function readExcursionSchedulesPrimary(date:string){
  if(!supabaseBridgeConfigured())return [];
  const pattern='excursion-schedule:'+date+':*';
  const rows=await restSelect('operational_records','select=key,payload,revision&key=like.'+encodeURIComponent(pattern)+'&order=key.asc');
  return rows.map((row:any)=>({...row.payload,revision:Number(row.revision)||0,__key:row.key}));
}


export async function saveOperationalPairPrimary(
  keyA:string,payloadA:any,expectedRevisionA:number,
  keyB:string,payloadB:any,expectedRevisionB:number,
  updatedBy:string
){
  if(!supabaseBridgeConfigured())return null;
  const result=await sb('/rest/v1/rpc/save_operational_pair',{
    method:'POST',
    body:JSON.stringify({
      p_key_a:keyA,
      p_payload_a:await protectHotelStatePayload(keyA,payloadA),
      p_expected_revision_a:expectedRevisionA,
      p_key_b:keyB,
      p_payload_b:await protectHotelStatePayload(keyB,payloadB),
      p_expected_revision_b:expectedRevisionB,
      p_updated_by:updatedBy
    })
  },'secret');
  if(!result||typeof result!=='object')return null;
  return {revisionA:Number(result.revisionA)||0,revisionB:Number(result.revisionB)||0};
}

export async function saveOperationalRecordPrimary(key:string,payload:any,expectedRevision:number,updatedBy:string){
  if(!supabaseBridgeConfigured())return 0;
  const result=await sb('/rest/v1/rpc/save_operational_record',{
    method:'POST',
    body:JSON.stringify({
      p_key:key,
      p_payload:await protectHotelStatePayload(key,payload),
      p_expected_revision:expectedRevision,
      p_updated_by:updatedBy
    })
  },'secret');
  return Number(result)||0;
}

export async function readDashboardOperationalSnapshot(today:string){
  if(!supabaseBridgeConfigured())throw Error('Supabase bridge is not configured.');
  const [hotelRows,transportRows,scheduleRows]=await Promise.all([
    restSelect('operational_records','select=key,payload&key=eq.hotel-stays-v1&limit=1'),
    restSelect('operational_records','select=key,payload&key=eq.transport-bookings-v1&limit=1'),
    restSelect('operational_records','select=key,payload&key=like.'+encodeURIComponent('excursion-schedule:'+today+':*')+'&order=key.asc')
  ]);
  return {
    hotel:hotelRows[0]?.payload||null,
    transport:transportRows[0]?.payload||null,
    schedules:scheduleRows.map((row:any)=>row.payload).filter(Boolean)
  };
}


export async function deleteOperationalRecordPrimary(key:string){
  if(!supabaseBridgeConfigured())return false;
  await sb('/rest/v1/operational_records?key=eq.'+encodeURIComponent(key),{
    method:'DELETE',
    headers:{Prefer:'return=minimal'}
  },'secret');
  return true;
}

export async function mirrorOperationalRecord(key:string,payload:any,revision:number=0,updatedBy:string=''){
  if(!supabaseBridgeConfigured())return false;
  const batch=crypto.randomUUID();
  const protectedPayload=await protectHotelStatePayload(key,payload);
  await restUpsert('operational_records',[{
    key,
    payload:protectedPayload,
    revision:Number(revision)||0,
    updated_by:updatedBy||null,
    synced_at:new Date().toISOString(),
    sync_batch_id:batch
  }],'key');
  return true;
}


export async function readRestaurantBillRecord(key:string){
  if(!supabaseBridgeConfigured())return null;
  const rows=await restSelect('restaurant_bills','key=eq.'+encodeURIComponent(key)+'&select=key,payload,revision,updated_by&limit=1');
  return rows[0]||null;
}

export async function saveRestaurantBillPrimary(key:string,payload:any,expectedRevision:number,updatedBy:string){
  if(!supabaseBridgeConfigured())return 0;
  const result=await sb('/rest/v1/rpc/save_restaurant_bill',{
    method:'POST',
    body:JSON.stringify({
      p_key:key,
      p_payload:payload,
      p_expected_revision:expectedRevision,
      p_updated_by:updatedBy
    })
  },'secret');
  return Number(result)||0;
}

export async function mirrorRestaurantBillRecord(key:string,payload:any,revision:number=0,updatedBy:string=''){
  if(!supabaseBridgeConfigured())return false;
  await restUpsert('restaurant_bills',[{
    key,
    payload,
    revision:Number(revision)||0,
    updated_by:updatedBy||null,
    synced_at:new Date().toISOString(),
    sync_batch_id:crypto.randomUUID()
  }],'key');
  return true;
}

export async function mirrorExcursionScheduleRecord(key:string,schedule:any){
  if(!supabaseBridgeConfigured()||!schedule)return false;
  await mirrorOperationalRecord(key,schedule,Number(schedule.revision||0),String(schedule.updatedBy||''));
  await restUpsert('excursion_schedules',[{
    source_key:key,
    schedule_id:String(schedule.id||''),
    schedule_date:schedule.date||null,
    departure_time:schedule.time||null,
    end_time:schedule.endTime||null,
    excursion_name:schedule.name||null,
    vessel_id:schedule.vesselId||null,
    capacity:Number.isFinite(Number(schedule.capacity))?Number(schedule.capacity):null,
    status:schedule.status||null,
    payload:schedule,
    synced_at:new Date().toISOString(),
    sync_batch_id:crypto.randomUUID()
  }],'source_key');
  return true;
}

export async function mirrorTransportState(state:any){
  if(!supabaseBridgeConfigured()||!state)return false;
  const batch=crypto.randomUUID(),now=new Date().toISOString();
  const bookings=(state.bookings||[]).map((b:any)=>({
    id:String(b.id),
    owner_id:b.owner||null,
    stay_id:b.stayId||null,
    room:b.room||null,
    guest:b.guest||b.name||null,
    status:b.status||null,
    payment_status:b.paymentStatus||b.payment||null,
    created_at:b.created||b.createdAt||null,
    payload:b,
    synced_at:now,
    sync_batch_id:batch
  })).filter((x:any)=>x.id);
  await restUpsert('transfer_bookings',bookings,'id');
  const sailings=(state.sailings||[]).map((s:any)=>({
    id:String(s.id),
    boat:s.boat||null,
    from_location:s.from||null,
    to_location:s.to||null,
    depart_time:s.depart||null,
    arrive_time:s.arrive||null,
    capacity:Number.isFinite(Number(s.capacity))?Number(s.capacity):null,
    fare_cents:Number.isFinite(Number(s.fare))?Number(s.fare):null,
    room_fare_cents:Number.isFinite(Number(s.roomFare))?Number(s.roomFare):null,
    active:s.active!==false,
    payload:s,
    synced_at:now,
    sync_batch_id:batch
  })).filter((x:any)=>x.id);
  await restUpsert('transport_sailings',sailings,'id');
  const payments:any[]=[];
  for(const booking of state.bookings||[]){
    for(const p of booking.paymentHistory||[])payments.push({
      id:'transfer:'+String(p.id||crypto.randomUUID()),
      module:'transfer',
      reference_id:String(booking.id||''),
      booking_reference:booking.stayId||null,
      amount_cents:Number(p.cents||0),
      currency:'MVR',
      method:p.method||'Transfer payment',
      status:Number(p.cents||0)>=0?'Paid':'Reversed',
      paid_at:p.date||p.at||null,
      payload:p,
      synced_at:now,
      sync_batch_id:batch
    });
  }
  await restUpsert('payments',payments,'id');
  return true;
}

export async function mirrorHotelState(state:any){
  if(!supabaseBridgeConfigured())return false;
  const now=new Date().toISOString();
  const rooms=(state.rooms||[]).map((room:any)=>({
    room_number:String(room.number),
    status:roomStatus(room.status),
    max_adults:3,
    max_children:1,
    notes:room.note||null,
    updated_at:now
  }));
  await restUpsert('rooms',rooms,'room_number');

  const bookings=(state.stays||[]).filter((stay:any)=>stay?.id&&stay?.checkIn&&stay?.checkOut).map((stay:any)=>({
    booking_reference:String(stay.id),
    legacy_id:String(stay.id),
    room_number:String(stay.room||''),
    status:bookingStatus(stay.status),
    meal_plan:stay.meal||null,
    check_in:stay.checkIn,
    check_out:stay.checkOut,
    adults:Number(stay.adults??stay.pax??1),
    children:Number(stay.children??0),
    pax:Number(stay.pax??1),
    primary_guest_name:String(stay.guest||'Guest'),
    primary_guest_phone:stay.whatsapp||stay.guests?.[0]?.phone||null,
    source:stay.source||null,
    rate_cents:Number(stay.rateCents||0),
    total_cents:Number(stay.base||0),
    legacy_payload:stay,
    legacy_synced_at:now,
    updated_at:now
  }));
  await restUpsert('bookings',bookings,'booking_reference');

  const guests:any[]=[];
  for(const stay of state.stays||[]){
    const list=Array.isArray(stay.guests)&&stay.guests.length?stay.guests:[{name:stay.guest,phone:stay.whatsapp||null,kind:'adult'}];
    list.forEach((guest:any,index:number)=>guests.push({
      legacy_key:String(stay.id)+':'+index,
      booking_reference:String(stay.id),
      full_name:String(guest.name||stay.guest||'Guest'),
      phone:guest.phone||null,
      kind:guest.kind||'adult',
      legacy_passport_id:guest.passportId||null,
      is_primary:index===0,
      legacy_payload:guest
    }));
  }
  await restUpsert('guests',guests,'legacy_key');

  const guestAccounts=(state.stays||[])
    .filter((stay:any)=>stay?.accountId&&stay?.id)
    .map((stay:any)=>({
      legacy_account_id:String(stay.accountId),
      booking_reference:String(stay.id),
      room_number:String(stay.room||''),
      active:stay.status==='In House'||stay.status==='Confirmed',
      valid_from:stay.loginIssuedAt||stay.checkedInAt||null,
      valid_until:stay.checkedOutAt||null
    }));
  await restUpsert('guest_accounts',guestAccounts,'legacy_account_id');

  const batch=crypto.randomUUID();
  const restaurantOrders=(state.posOrders||[]).map((o:any)=>({
    id:String(o.id),
    stay_id:o.stayId||null,
    room:o.room||null,
    customer:o.customer||null,
    table_number:o.table||null,
    status:o.kitchen||o.status||null,
    payment_method:o.method||null,
    total_cents:Number(o.cents||0),
    created_at:o.createdAt||null,
    payload:o,
    synced_at:now,
    sync_batch_id:batch
  })).filter((x:any)=>x.id);
  await restUpsert('restaurant_orders',restaurantOrders,'id');

  const excursionBookings=(state.orders||[]).filter((o:any)=>o.kind==='excursion').map((o:any)=>({
    id:String(o.id),
    stay_id:o.stayId||null,
    room:o.room||null,
    guest:o.guest||null,
    excursion_name:o.name||null,
    booking_date:o.date||o.schedule?.date||null,
    booking_time:o.time||o.schedule?.time||null,
    status:o.status||null,
    payment_status:o.paymentStatus||null,
    total_cents:Number(o.cents||0),
    schedule_id:o.scheduleId||null,
    payload:o,
    synced_at:now,
    sync_batch_id:batch
  })).filter((x:any)=>x.id);
  await restUpsert('excursion_bookings',excursionBookings,'id');

  const payments:any[]=[];
  for(const stay of state.stays||[]){
    for(const p of stay.payments||[])payments.push({
      id:'hotel:'+String(p.id||crypto.randomUUID()),
      module:'hotel',
      reference_id:String(stay.id||''),
      booking_reference:String(stay.id||''),
      amount_cents:Number(p.cents||0),
      currency:'USD',
      method:p.method||null,
      status:Number(p.cents||0)>=0?'Paid':'Reversed',
      paid_at:p.date||p.at||null,
      payload:p,
      synced_at:now,
      sync_batch_id:batch
    });
  }
  for(const order of state.posOrders||[]){
    if(['Cash','Card','Bank transfer'].includes(String(order.method||'')))payments.push({
      id:'restaurant:'+String(order.id),
      module:'restaurant',
      reference_id:String(order.id),
      booking_reference:order.stayId||null,
      amount_cents:Number(order.cents||0),
      currency:order.currency||'USD',
      method:order.method||null,
      status:'Paid',
      paid_at:order.paidAt||order.updatedAt||order.createdAt||null,
      payload:order,
      synced_at:now,
      sync_batch_id:batch
    });
  }
  for(const order of state.orders||[]){
    if(order.kind!=='excursion')continue;
    for(const p of order.excursionPayments||[])payments.push({
      id:'excursion:'+String(p.id||crypto.randomUUID()),
      module:'excursion',
      reference_id:String(order.id),
      booking_reference:order.stayId||null,
      amount_cents:Number(p.cents||0),
      currency:'USD',
      method:p.method||null,
      status:Number(p.cents||0)>=0?'Paid':'Reversed',
      paid_at:p.at||p.date||null,
      payload:p,
      synced_at:now,
      sync_batch_id:batch
    });
  }
  await restUpsert('payments',payments,'id');

  return true;
}
