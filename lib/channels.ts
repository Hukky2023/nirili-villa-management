import {env} from 'cloudflare:workers';
import {authDb} from './auth';
import {nextBookingReference} from './booking-reference';
import {nightly} from './guest-catalog';
import {updateRoomInventory} from './rooms';
import {stayKey} from './stays';
import {
  mirrorHotelState,
  readOperationalRecordPrimary,
  saveOperationalRecordPrimary,
  saveSystemNotifications
} from './supabase-bridge';

const connectionId='booking-com';
const projectUrl='https://vjbyrjqibzebpzontxgc.supabase.co';
const allowedMeals=new Set(['Bed & Breakfast','Half Board','Full Board']);
const stagingSandboxKey='booking-com-staging-hotel-v1';
const stagingBookingHotelId='6519420';

type ChannelConnection={
  id:string;
  channel:string;
  provider:string;
  enabled:boolean;
  mode:'staging'|'production';
  status:string;
  property_id?:string|null;
  channel_property_id?:string|null;
  display_name?:string|null;
  last_health_at?:string|null;
  last_inbound_at?:string|null;
  last_outbound_at?:string|null;
  last_error?:string|null;
  settings?:Record<string,any>|null;
};

function runtime(){
  const values=env as unknown as Record<string,string|undefined>;
  const nodeEnv=(typeof process!=='undefined'&&process.env?process.env:{}) as Record<string,string|undefined>;
  const read=(...keys:string[])=>{
    for(const key of keys){
      const value=values[key]??nodeEnv[key];
      if(typeof value==='string'&&value.trim())return value.trim().replace(/^["']|["']$/g,'');
    }
    return '';
  };
  const clean=(value:string)=>value.replace(/[\s\u200B-\u200D\uFEFF]+/g,'');
  return {
    supabaseUrl:read('NEXT_PUBLIC_SUPABASE_URL','SUPABASE_URL')||projectUrl,
    supabaseSecret:clean(read('SUPABASE_SECRET_KEY')),
    channexKey:clean(read('CHANNEX_API_KEY')),
    channexWebhookToken:clean(read('CHANNEX_WEBHOOK_TOKEN')),
    channexBaseOverride:read('CHANNEX_API_BASE_URL').replace(/\/$/,'')
  };
}

async function supabase(path:string,init:RequestInit={}){
  const cfg=runtime();
  if(!cfg.supabaseSecret)throw Error('Supabase secret is not configured.');
  const headers=new Headers(init.headers||{});
  headers.set('apikey',cfg.supabaseSecret);
  if(init.body&&!headers.has('content-type'))headers.set('content-type','application/json');
  const response=await fetch(cfg.supabaseUrl+path,{...init,headers});
  const text=await response.text();
  let body:any=null;try{body=text?JSON.parse(text):null}catch{body=text}
  if(!response.ok)throw Error(body?.message||body?.error||body?.msg||('Supabase request failed ('+response.status+')'));
  return body;
}

async function select(table:string,query:string){
  return await supabase('/rest/v1/'+table+'?'+query,{headers:{Accept:'application/json'}}) as any[];
}

async function upsert(table:string,rows:any[],onConflict:string){
  if(!rows.length)return [];
  return await supabase('/rest/v1/'+table+'?on_conflict='+encodeURIComponent(onConflict),{
    method:'POST',
    headers:{Prefer:'resolution=merge-duplicates,return=representation'},
    body:JSON.stringify(rows)
  }) as any[];
}

async function patch(table:string,filter:string,values:any){
  await supabase('/rest/v1/'+table+'?'+filter,{
    method:'PATCH',
    headers:{Prefer:'return=minimal'},
    body:JSON.stringify(values)
  });
}

async function getConnection():Promise<ChannelConnection>{
  const rows=await select('channel_connections','id=eq.'+connectionId+'&select=*&limit=1');
  if(!rows[0])throw Error('Booking.com channel configuration is missing.');
  return rows[0] as ChannelConnection;
}

function channexBase(connection:ChannelConnection){
  const cfg=runtime();
  if(cfg.channexBaseOverride)return cfg.channexBaseOverride;
  return connection.mode==='production'?'https://secure.channex.io/api/v1':'https://staging.channex.io/api/v1';
}

async function channex(connection:ChannelConnection,path:string,init:RequestInit={}){
  const key=runtime().channexKey;
  if(!key)throw Error('CHANNEX_API_KEY is not configured on Cloudflare.');
  const headers=new Headers(init.headers||{});
  headers.set('user-api-key',key);
  headers.set('Accept','application/json');
  if(init.body&&!headers.has('content-type'))headers.set('content-type','application/json');
  const response=await fetch(channexBase(connection)+path,{...init,headers});
  const text=await response.text();
  let body:any=null;try{body=text?JSON.parse(text):null}catch{body=text}
  if(!response.ok){
    const errors=body?.errors;
    const detail=errors?.details&&typeof errors.details==='object'
      ?Object.entries(errors.details).map(([field,value])=>field+': '+(Array.isArray(value)?value.join(', '):String(value))).join(' · ')
      :'';
    const title=errors?.title||errors?.code||body?.message||('Channex request failed ('+response.status+')');
    throw Error(detail?title+' · '+detail:title);
  }
  return body;
}

function rowsOf(result:any){return Array.isArray(result?.data)?result.data:Array.isArray(result)?result:result?.data?[result.data]:[];}
function attrsOf(item:any){return item?.attributes||item||{};}
function isoNow(){return new Date().toISOString();}
function seedStagingHotel(){
  const rooms=['101','102','103','104','105','106','201','202','203','204','301','302','303','304']
    .map(number=>({number,capacity:3,status:'Available',note:''}));
  return {rooms,stays:[],requests:[],orders:[],posOrders:[],deletedBookings:[],nextBookingNumber:9001};
}

async function loadStagingHotel(){
  const rows=await select('integration_state','key=eq.'+encodeURIComponent(stagingSandboxKey)+'&select=key,payload,updated_at&limit=1');
  const state=rows[0]?.payload&&typeof rows[0].payload==='object'?rows[0].payload:seedStagingHotel();
  state.rooms??=seedStagingHotel().rooms;state.stays??=[];state.requests??=[];state.orders??=[];state.posOrders??=[];
  updateRoomInventory(state);
  return state;
}

async function saveStagingHotel(state:any){
  await upsert('integration_state',[{key:stagingSandboxKey,payload:state,updated_at:isoNow()}],'key');
  return state;
}

function maldivesToday(){
  const parts=new Intl.DateTimeFormat('en-CA',{timeZone:'Indian/Maldives',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date());
  const get=(type:string)=>parts.find(part=>part.type===type)?.value||'';
  return get('year')+'-'+get('month')+'-'+get('day');
}
function addDays(date:string,days:number){return new Date(Date.parse(date+'T00:00:00Z')+days*86400000).toISOString().slice(0,10);}
function safeNumber(value:any,fallback=0){const n=Number(value);return Number.isFinite(n)?n:fallback;}
function text(value:any,max=500){return String(value??'').trim().slice(0,max);}
function truthy(value:any){return value===true||value==='true'||value===1||value==='1';}

export async function getBookingComChannelState(){
  const cfg=runtime();
  const [connection,roomMappings,rateMappings,recentReservations,recentEvents]=await Promise.all([
    getConnection(),
    select('channel_room_mappings','connection_id=eq.'+connectionId+'&select=*&order=created_at.asc'),
    select('channel_rate_mappings','connection_id=eq.'+connectionId+'&select=*&order=created_at.asc'),
    select('channel_reservations','connection_id=eq.'+connectionId+'&select=id,external_reservation_id,external_revision_id,booking_reference,status,guest_name,check_in,check_out,adults,children,total_amount,currency,received_at,processed_at,updated_at&order=received_at.desc&limit=30'),
    select('channel_events','connection_id=eq.'+connectionId+'&select=id,event_key,direction,event_type,status,error,created_at,processed_at&order=created_at.desc&limit=40')
  ]);
  return {
    connection,
    roomMappings,
    rateMappings,
    recentReservations,
    recentEvents,
    credentials:{
      apiKeyConfigured:!!cfg.channexKey,
      webhookTokenConfigured:!!cfg.channexWebhookToken||!!connection.settings?.webhookTokenHash,
      supabaseConfigured:!!cfg.supabaseSecret
    },
    webhookPath:'/api/channels/booking-com/webhook'
  };
}

export async function updateBookingComConnection(input:any){
  const current=await getConnection();
  const mode=input?.mode==='production'?'production':'staging';
  const propertyId=text(input?.propertyId,100)||null;
  const channelPropertyId=text(input?.channelPropertyId,100)||null;
  const requestedStagingHotelId=text(input?.stagingBookingHotelId,20)||String(current.settings?.stagingBookingHotelId||stagingBookingHotelId);
  if(mode==='staging'&&!/^\d{5,12}$/.test(requestedStagingHotelId))throw Error('Enter a valid numeric Booking.com staging Hotel ID.');
  const enabled=truthy(input?.enabled);
  const settings={
    ...(current.settings||{}),
    inventoryMode:'room_type',
    roomTypeName:'Double Room',
    stagingBookingHotelId:requestedStagingHotelId,
    autoImportReservations:input?.autoImportReservations!==false,
    autoPushAvailability:truthy(input?.autoPushAvailability),
    dryRun:input?.dryRun!==false
  };
  if(enabled&&(!runtime().channexKey||!propertyId))throw Error('Add the Channex API key and Channex property ID before enabling this channel.');
  if(enabled&&settings.dryRun===false){
    const [rooms,rates]=await Promise.all([
      select('channel_room_mappings','connection_id=eq.'+connectionId+'&active=eq.true&select=id&limit=1'),
      select('channel_rate_mappings','connection_id=eq.'+connectionId+'&active=eq.true&pms_meal_plan=not.is.null&select=id&limit=1')
    ]);
    if(!rooms.length||!rates.length)throw Error('Discover and save at least one room mapping and one meal-plan rate mapping before leaving dry-run mode.');
  }
  const status=enabled?(current.status==='connected'?'connected':'configured'):(propertyId&&runtime().channexKey?'configured':'disconnected');
  await patch('channel_connections','id=eq.'+connectionId,{
    enabled,mode,status,property_id:propertyId,channel_property_id:channelPropertyId,
    settings,updated_at:isoNow(),last_error:null
  });
  return getBookingComChannelState();
}

export async function testBookingComConnection(){
  const connection=await getConnection();
  if(!runtime().channexKey)throw Error('CHANNEX_API_KEY is not configured on Cloudflare.');
  try{
    const result=connection.property_id
      ?await channex(connection,'/properties/'+encodeURIComponent(connection.property_id))
      :await channex(connection,'/properties?pagination[limit]=20');
    const properties=rowsOf(result).map((item:any)=>{
      const a=attrsOf(item);return {id:item?.id||a.id,title:a.title||a.name||'Property'};
    });
    await patch('channel_connections','id=eq.'+connectionId,{
      status:connection.enabled?'connected':'configured',
      last_health_at:isoNow(),last_error:null,updated_at:isoNow()
    });
    return {ok:true,properties,selectedProperty:connection.property_id||null};
  }catch(error){
    const message=error instanceof Error?error.message:'Channex connection failed.';
    await patch('channel_connections','id=eq.'+connectionId,{status:'error',last_health_at:isoNow(),last_error:message,updated_at:isoNow()});
    throw error;
  }
}

export async function bootstrapBookingComStaging(){
  const connection=await getConnection();
  if(connection.mode!=='staging')throw Error('Staging bootstrap is blocked in production mode.');
  if(!runtime().channexKey)throw Error('CHANNEX_API_KEY is not configured on Cloudflare.');
  if(connection.property_id)throw Error('A Channex property is already selected. Use Discover from Channex instead.');

  const propertyResult=await channex(connection,'/properties',{
    method:'POST',
    body:JSON.stringify({property:{
      title:'Nirili Villa Staging',
      currency:'GBP',
      country:'MV',
      property_type:'guest_house',
      city:'Dhiffushi',
      address:'Dhiffushi, Kaafu Atoll',
      timezone:'Indian/Maldives',
      facilities:[]
    }})
  });
  const propertyRow=rowsOf(propertyResult)[0]||propertyResult?.data||propertyResult;
  const propertyId=String(propertyRow?.id||attrsOf(propertyRow)?.id||'');
  if(!propertyId)throw Error('Channex did not return the new staging property ID.');

  const roomResult=await channex(connection,'/room_types',{
    method:'POST',
    body:JSON.stringify({room_type:{
      property_id:propertyId,
      title:'Double Room',
      count_of_rooms:14,
      occ_adults:3,
      occ_children:0,
      occ_infants:0,
      default_occupancy:2,
      room_kind:'room',
      facilities:[]
    }})
  });
  const roomRow=rowsOf(roomResult)[0]||roomResult?.data||roomResult;
  const roomTypeId=String(roomRow?.id||attrsOf(roomRow)?.id||'');
  if(!roomTypeId)throw Error('Channex did not return the Double Room type ID.');

  const plans=[
    {title:'Bed & Breakfast',meal:'Bed & Breakfast',mealType:'bed_and_breakfast',rates:[50,60,70]},
    {title:'Half Board',meal:'Half Board',mealType:'half_board',rates:[70,80,90]},
    {title:'Full Board',meal:'Full Board',mealType:'full_board',rates:[80,100,120]}
  ];
  const rateRows:any[]=[];
  for(const plan of plans){
    const result=await channex(connection,'/rate_plans',{
      method:'POST',
      body:JSON.stringify({rate_plan:{
        title:plan.title,
        property_id:propertyId,
        room_type_id:roomTypeId,
        currency:'GBP',
        sell_mode:'per_person',
        rate_mode:'manual',
        meal_type:plan.mealType,
        options:[
          {occupancy:1,is_primary:false,rate:plan.rates[0]},
          {occupancy:2,is_primary:true,rate:plan.rates[1]},
          {occupancy:3,is_primary:false,rate:plan.rates[2]}
        ]
      }})
    });
    const row=rowsOf(result)[0]||result?.data||result;
    const id=String(row?.id||attrsOf(row)?.id||'');
    if(!id)throw Error('Channex did not return a rate plan ID for '+plan.title+'.');
    rateRows.push({
      connection_id:connectionId,
      channel_rate_id:id,
      channel_rate_name:plan.title,
      pms_meal_plan:plan.meal,
      currency:'GBP',
      active:true,
      settings:{roomTypeId},
      updated_at:isoNow()
    });
  }

  await Promise.all([
    patch('channel_connections','id=eq.'+connectionId,{
      property_id:propertyId,
      status:'configured',
      settings:{...(connection.settings||{}),stagingBootstrapped:true,stagingRoomTypeId:roomTypeId,stagingBookingHotelId:String(connection.settings?.stagingBookingHotelId||stagingBookingHotelId),stagingCurrency:'GBP'},
      last_error:null,
      updated_at:isoNow()
    }),
    upsert('channel_room_mappings',[{
      connection_id:connectionId,
      channel_room_id:roomTypeId,
      channel_room_name:'Double Room',
      pms_room_type:'Double Room',
      active:true,
      settings:{},
      updated_at:isoNow()
    }],'connection_id,channel_room_id'),
    upsert('channel_rate_mappings',rateRows,'connection_id,channel_rate_id')
  ]);

  return {
    ...(await getBookingComChannelState()),
    bootstrap:{
      propertyId,
      roomTypeId,
      ratePlanIds:rateRows.map(row=>row.channel_rate_id),
      bookingComTestHotelId:stagingBookingHotelId,
      currency:'GBP',
      message:'Nirili Villa staging property created with 14 Double Rooms and GBP BB/HB/FB test rates for the Channex Booking.com test account.'
    }
  };
}

export async function ensureBookingComStagingRoomTypes(){
  const connection=await getConnection();
  if(connection.mode!=='staging')throw Error('Booking.com test room setup is only available in staging.');
  if(!runtime().channexKey)throw Error('CHANNEX_API_KEY is not configured on Cloudflare.');
  if(!connection.property_id)throw Error('Channex staging property ID is missing.');

  const property=encodeURIComponent(connection.property_id);
  const [roomResult,rateResult]=await Promise.all([
    channex(connection,'/room_types?filter[property_id]='+property+'&pagination[limit]=100'),
    channex(connection,'/rate_plans?filter[property_id]='+property+'&pagination[limit]=100')
  ]);
  const existingRooms=rowsOf(roomResult);
  const existingRates=rowsOf(rateResult);

  const stagingHotelId=String(connection.settings?.stagingBookingHotelId||stagingBookingHotelId);
  const roomSpecs=stagingHotelId==='10745030'
    ?[
      {title:'Holiday Home',occupancy:11},
      {title:'Studio',occupancy:2}
    ]
    :[
      {title:'Double Room',occupancy:2},
      {title:'Single Room',occupancy:1},
      {title:'Suite',occupancy:3}
    ];
  const rateSpecs=[
    {title:'Bed & Breakfast',meal:'Bed & Breakfast',mealType:'bed_and_breakfast',rates:[50,60,70]},
    {title:'Half Board',meal:'Half Board',mealType:'half_board',rates:[70,80,90]},
    {title:'Full Board',meal:'Full Board',mealType:'full_board',rates:[80,100,120]}
  ];

  const createdRooms:any[]=[];
  const roomRows:any[]=[];
  const rateRows:any[]=[];

  for(const spec of roomSpecs){
    let room=existingRooms.find((item:any)=>String(attrsOf(item).title||attrsOf(item).name||'').trim().toLowerCase()===spec.title.toLowerCase());
    if(!room){
      const result=await channex(connection,'/room_types',{
        method:'POST',
        body:JSON.stringify({room_type:{
          property_id:connection.property_id,
          title:spec.title,
          count_of_rooms:14,
          occ_adults:spec.occupancy,
          occ_children:0,
          occ_infants:0,
          default_occupancy:spec.occupancy,
          room_kind:'room',
          facilities:[]
        }})
      });
      room=rowsOf(result)[0]||result?.data||result;
      createdRooms.push(spec.title);
    }
    const roomId=String(room?.id||attrsOf(room)?.id||'');
    if(!roomId)throw Error('Channex did not return a room type ID for '+spec.title+'.');

    roomRows.push({
      connection_id:connectionId,
      channel_room_id:roomId,
      channel_room_name:spec.title,
      pms_room_type:'Double Room',
      active:true,
      settings:{stagingOnly:true,stagingHotelId,stagingOccupancy:spec.occupancy},
      updated_at:isoNow()
    });

    for(const plan of rateSpecs){
      const uniqueRateTitle=spec.title==='Double Room'?plan.title:(spec.title+' · '+plan.title);
      let rate=existingRates.find((item:any)=>{
        const a=attrsOf(item);
        return String(a.title||a.name||'').trim().toLowerCase()===uniqueRateTitle.toLowerCase();
      });
      if(!rate){
        const amount=plan.rates[Math.min(3,Math.max(1,spec.occupancy))-1];
        const result=await channex(connection,'/rate_plans',{
          method:'POST',
          body:JSON.stringify({rate_plan:{
            title:uniqueRateTitle,
            property_id:connection.property_id,
            room_type_id:roomId,
            currency:'GBP',
            sell_mode:'per_room',
            rate_mode:'manual',
            meal_type:plan.mealType,
            options:[{occupancy:spec.occupancy,is_primary:true,rate:amount}]
          }})
        });
        rate=rowsOf(result)[0]||result?.data||result;
        if(rate)existingRates.push(rate);
      }
      const rateId=String(rate?.id||attrsOf(rate)?.id||'');
      if(!rateId)throw Error('Channex did not return a rate plan ID for '+spec.title+' / '+plan.title+'.');
      rateRows.push({
        connection_id:connectionId,
        channel_rate_id:rateId,
        channel_rate_name:uniqueRateTitle,
        pms_meal_plan:plan.meal,
        currency:'GBP',
        active:true,
        settings:{roomTypeId:roomId,stagingOnly:true,stagingHotelId,stagingOccupancy:spec.occupancy},
        updated_at:isoNow()
      });
    }
  }

  await Promise.all([
    upsert('channel_room_mappings',roomRows,'connection_id,channel_room_id'),
    upsert('channel_rate_mappings',rateRows,'connection_id,channel_rate_id'),
    patch('channel_connections','id=eq.'+connectionId,{
      settings:{...(connection.settings||{}),stagingBookingRoomTypesReady:true},
      updated_at:isoNow(),
      last_error:null
    })
  ]);

  return {
    ...(await getBookingComChannelState()),
    stagingRooms:{
      createdRooms,
      roomTypes:roomRows.map(row=>({id:row.channel_room_id,name:row.channel_room_name,occupancy:row.settings.stagingOccupancy})),
      ratePlans:rateRows.length,
      stagingHotelId,
      message:'Booking.com staging room types and rates are ready for test Hotel ID '+stagingHotelId+'. Return to Channex Mapping and click Refresh.'
    }
  };
}

export async function ensureBookingComWebhook(callbackUrl:string){
  const connection=await getConnection();
  const cfg=runtime();
  if(!cfg.channexKey)throw Error('CHANNEX_API_KEY is not configured on Cloudflare.');
  if(!connection.property_id)throw Error('Enter and save the Channex property ID first.');
  if(!/^https:\/\//i.test(callbackUrl))throw Error('Webhook callback URL must use HTTPS.');

  const bytes=new Uint8Array(32);crypto.getRandomValues(bytes);
  const generatedToken=Array.from(bytes).map(x=>x.toString(16).padStart(2,'0')).join('');
  const webhookToken=cfg.channexWebhookToken||generatedToken;
  const tokenHash=await hashText(webhookToken);

  const propertyId=encodeURIComponent(connection.property_id);
  const existingResult=await channex(connection,'/webhooks?filter[property_id]='+propertyId+'&pagination[limit]=100');
  const existing=rowsOf(existingResult).find((item:any)=>{
    const a=attrsOf(item);
    return String(a.callback_url||'')===callbackUrl&&String(a.event_mask||'')==='booking';
  });
  const payload={
    webhook:{
      property_id:connection.property_id,
      callback_url:callbackUrl,
      event_mask:'booking',
      headers:{'X-Nirili-Channel-Secret':webhookToken},
      is_active:true,
      send_data:true
    }
  };
  const result=existing
    ?await channex(connection,'/webhooks/'+encodeURIComponent(String(existing.id||attrsOf(existing).id)),{method:'PUT',body:JSON.stringify(payload)})
    :await channex(connection,'/webhooks',{method:'POST',body:JSON.stringify(payload)});
  const row=rowsOf(result)[0]||result?.data||result;
  const webhookId=String(row?.id||attrsOf(row)?.id||existing?.id||'');
  await patch('channel_connections','id=eq.'+connectionId,{
    settings:{...(connection.settings||{}),webhookId,webhookCallbackUrl:callbackUrl,webhookTokenHash:tokenHash},
    updated_at:isoNow(),
    last_error:null
  });
  return {ok:true,created:!existing,webhookId,callbackUrl,eventMask:'booking'};
}

export async function discoverBookingComMappings(){
  const connection=await getConnection();
  if(!connection.property_id)throw Error('Enter and save the Channex property ID first.');
  const property=encodeURIComponent(connection.property_id);
  const [roomResult,rateResult,existingRooms,existingRates]=await Promise.all([
    channex(connection,'/room_types?filter[property_id]='+property+'&pagination[limit]=100'),
    channex(connection,'/rate_plans?filter[property_id]='+property+'&pagination[limit]=100'),
    select('channel_room_mappings','connection_id=eq.'+connectionId+'&select=*'),
    select('channel_rate_mappings','connection_id=eq.'+connectionId+'&select=*')
  ]);
  const oldRooms=new Map(existingRooms.map((row:any)=>[String(row.channel_room_id),row]));
  const oldRates=new Map(existingRates.map((row:any)=>[String(row.channel_rate_id),row]));
  const roomRows=rowsOf(roomResult).map((item:any)=>{
    const a=attrsOf(item),id=String(item?.id||a.id||'');if(!id)return null;
    const old=oldRooms.get(id);
    return {
      connection_id:connectionId,channel_room_id:id,channel_room_name:a.title||a.name||id,
      pms_room_type:old?.pms_room_type||'Double Room',active:old?.active!==false,
      settings:old?.settings||{},updated_at:isoNow()
    };
  }).filter(Boolean);
  const rateRows=rowsOf(rateResult).map((item:any)=>{
    const a=attrsOf(item),id=String(item?.id||a.id||'');if(!id)return null;
    const old=oldRates.get(id);
    return {
      connection_id:connectionId,channel_rate_id:id,channel_rate_name:a.title||a.name||id,
      pms_meal_plan:old?.pms_meal_plan||null,currency:a.currency||old?.currency||'USD',
      active:old?.active!==false,settings:{...(old?.settings||{}),roomTypeId:a.room_type_id||null},updated_at:isoNow()
    };
  }).filter(Boolean);
  await Promise.all([
    upsert('channel_room_mappings',roomRows,'connection_id,channel_room_id'),
    upsert('channel_rate_mappings',rateRows,'connection_id,channel_rate_id')
  ]);
  return getBookingComChannelState();
}

export async function saveBookingComMappings(input:any){
  const roomRows=Array.isArray(input?.roomMappings)?input.roomMappings:[];
  const rateRows=Array.isArray(input?.rateMappings)?input.rateMappings:[];
  const rooms=roomRows.map((row:any)=>({
    connection_id:connectionId,
    channel_room_id:text(row.channel_room_id,100),
    channel_room_name:text(row.channel_room_name,255)||null,
    pms_room_type:'Double Room',
    active:row.active!==false,
    settings:row.settings||{},
    updated_at:isoNow()
  })).filter((row:any)=>row.channel_room_id);
  const rates=rateRows.map((row:any)=>{
    const meal=text(row.pms_meal_plan,100);
    if(meal&&!allowedMeals.has(meal))throw Error('Choose a valid Nirili Villa meal plan.');
    return {
      connection_id:connectionId,
      channel_rate_id:text(row.channel_rate_id,100),
      channel_rate_name:text(row.channel_rate_name,255)||null,
      pms_meal_plan:meal||null,
      currency:text(row.currency,3).toUpperCase()||'USD',
      active:row.active!==false,
      settings:row.settings||{},
      updated_at:isoNow()
    };
  }).filter((row:any)=>row.channel_rate_id);
  await Promise.all([
    upsert('channel_room_mappings',rooms,'connection_id,channel_room_id'),
    upsert('channel_rate_mappings',rates,'connection_id,channel_rate_id')
  ]);
  return getBookingComChannelState();
}

export async function runBookingComSelfTest(){
  const connection=await getConnection();
  const sourceState=connection.mode==='staging'
    ?await loadStagingHotel()
    :(await readOperationalRecordPrimary(stayKey))?.payload;
  if(!sourceState)throw Error('Hotel state is unavailable in Supabase.');
  const state=structuredClone(sourceState);
  state.stays??=[];state.rooms??=[];
  updateRoomInventory(state);
  const sandbox=connection.mode==='staging';

  const startBase=maldivesToday();
  let checkIn='',checkOut='';
  for(let i=1;i<360;i++){
    const a=addDays(startBase,i),b=addDays(startBase,i+1);
    const room=availableRoom(state,a,b,2);
    if(room){checkIn=a;checkOut=b;break;}
  }
  if(!checkIn)throw Error('Self-test could not find an available future room.');

  const mappings={
    rooms:new Map([['self-test-room',{channel_room_id:'self-test-room',pms_room_type:'Double Room',active:true}]]),
    rates:new Map([['self-test-rate',{channel_rate_id:'self-test-rate',pms_meal_plan:'Bed & Breakfast',active:true}]])
  };
  const externalReservationId='SELFTEST-'+crypto.randomUUID();
  const base:any={
    externalReservationId,
    revisionId:'REV-NEW-'+crypto.randomUUID(),
    otaReservationCode:externalReservationId,
    status:'new',
    arrivalDate:checkIn,
    departureDate:checkOut,
    adults:2,children:0,amount:120,currency:sandbox?'GBP':'USD',
    guestName:'Booking.com Self Test',
    phone:null,email:null,notes:'Synthetic self-test only',paymentCollect:null,
    rooms:[{
      room_type_id:'self-test-room',
      rate_plan_id:'self-test-rate',
      checkin_date:checkIn,
      checkout_date:checkOut,
      occupancy:{adults:2,children:0},
      amount:120,
      guests:[{name:'Booking.com',surname:'Self Test'}]
    }]
  };

  const beforeCount=state.stays.length;
  const newRefs=mutateHotelState(state,base,mappings,{sandbox});
  if(newRefs.length!==1||state.stays.length!==beforeCount+1)throw Error('New-booking simulation did not create exactly one PMS stay.');
  const reference=newRefs[0];
  const created=state.stays.find((stay:any)=>stay.id===reference);
  if(!created||created.source!=='Booking.com'||created.status!=='Confirmed'||created.guest!=='Booking.com Self Test')throw Error('New-booking simulation produced an invalid PMS stay.');

  const modified=structuredClone(base);
  modified.status='modified';
  modified.revisionId='REV-MOD-'+crypto.randomUUID();
  modified.rooms=modified.rooms.map((room:any)=>({...room,guests:[{name:'Booking.com',surname:'Self Test Modified'}]}));
  const beforeModifyCount=state.stays.length;
  const modifiedRefs=mutateHotelState(state,modified,mappings,{sandbox});
  const changed=state.stays.find((stay:any)=>stay.id===reference);
  if(
    !modifiedRefs.includes(reference)||
    state.stays.length!==beforeModifyCount||
    changed?.guest!=='Booking.com Self Test Modified'||
    changed?.channel?.revisionId!==modified.revisionId
  )throw Error('Modification simulation did not update the existing PMS stay in place.');

  const cancelled=structuredClone(modified);
  cancelled.status='cancelled';
  cancelled.revisionId='REV-CAN-'+crypto.randomUUID();
  cancelled.rooms=[];
  const beforeCancelCount=state.stays.length;
  const cancelledRefs=mutateHotelState(state,cancelled,mappings,{sandbox});
  const cancelledStay=state.stays.find((stay:any)=>stay.id===reference);
  if(
    !cancelledRefs.includes(reference)||
    state.stays.length!==beforeCancelCount||
    cancelledStay?.status!=='Cancelled'
  )throw Error('Cancellation simulation did not cancel the existing PMS stay.');

  return {
    ok:true,
    persisted:false,
    environment:connection.mode,
    checks:['new_booking','modification_in_place','no_duplicate_stay','cancellation','room_assignment','booking_reference'],
    simulatedReference:reference,
    simulatedRoom:created.room,
    checkIn,
    checkOut,
    message:'Self-test passed without changing PMS or Channex data.'
  };
}

export async function previewBookingComAvailability(days=30,startDate=maldivesToday()){
  const count=Math.max(1,Math.min(365,Math.trunc(Number(days)||30)));
  if(!/^\d{4}-\d{2}-\d{2}$/.test(startDate))startDate=maldivesToday();
  const connection=await getConnection();
  const state=connection.mode==='staging'
    ?await loadStagingHotel()
    :(await readOperationalRecordPrimary(stayKey))?.payload;
  if(!state)throw Error('Hotel inventory is not available in Supabase.');
  const rooms=(Array.isArray(state.rooms)?state.rooms:[]).filter((room:any)=>String(room.status||'').toLowerCase()!=='maintenance');
  const stays=Array.isArray(state.stays)?state.stays:[];
  const values=Array.from({length:count},(_,i)=>{
    const date=addDays(startDate,i);
    const occupied=new Set(stays.filter((stay:any)=>
      !['Cancelled','Checked Out'].includes(String(stay.status||''))&&
      stay.room&&String(stay.checkIn||'')<=date&&String(stay.checkOut||'')>date
    ).map((stay:any)=>String(stay.room)));
    return {date,availability:Math.max(0,rooms.length-occupied.size)};
  });
  return {startDate,days:count,totalInventory:rooms.length,roomType:'Double Room',values};
}

function collapseAvailability(values:{date:string;availability:number}[]){
  const ranges:any[]=[];
  for(const item of values){
    const previous=ranges[ranges.length-1];
    if(previous&&previous.availability===item.availability&&addDays(previous.date_to,1)===item.date){
      previous.date_to=item.date;
    }else ranges.push({date_from:item.date,date_to:item.date,availability:item.availability});
  }
  return ranges;
}

async function recordEvent(eventKey:string,direction:'inbound'|'outbound',eventType:string,status:string,payload:any,error?:string|null){
  const rows=await upsert('channel_events',[{
    connection_id:connectionId,event_key:eventKey,direction,event_type:eventType,status,
    payload:payload||{},error:error||null,processed_at:['processed','ignored','error'].includes(status)?isoNow():null
  }],'connection_id,event_key');
  return rows[0]||null;
}

export async function pushBookingComAvailability(days=30,startDate=maldivesToday()){
  const connection=await getConnection();
  if(!connection.enabled)throw Error('Enable the Booking.com channel before sending inventory.');
  const preview=await previewBookingComAvailability(days,startDate);
  if(connection.settings?.dryRun!==false)return {ok:true,dryRun:true,preview};
  if(!connection.property_id)throw Error('Channex property ID is missing.');
  const mappings=await select('channel_room_mappings','connection_id=eq.'+connectionId+'&active=eq.true&pms_room_type=eq.'+encodeURIComponent('Double Room')+'&select=*');
  if(!mappings.length)throw Error('No active room mapping is configured.');
  const selectedMappings=connection.mode==='staging'?mappings:mappings.slice(0,1);
  const ranges=collapseAvailability(preview.values);
  const values=selectedMappings.flatMap((mapping:any)=>ranges.map(range=>({
    property_id:connection.property_id,
    room_type_id:mapping.channel_room_id,
    ...range
  })));
  const result=await channex(connection,'/availability',{method:'POST',body:JSON.stringify({values})});
  const now=isoNow();
  await Promise.all([
    recordEvent('availability:'+preview.startDate+':'+now,'outbound','availability','processed',{values,response:result}),
    patch('channel_connections','id=eq.'+connectionId,{last_outbound_at:now,last_error:null,updated_at:now})
  ]);
  return {ok:true,dryRun:false,sentRanges:values.length,preview,response:result};
}

export async function autoPushBookingComAvailability(days=365){
  try{
    const connection=await getConnection();
    if(!connection.enabled||connection.settings?.dryRun!==false||connection.settings?.autoPushAvailability!==true)return {ok:true,skipped:true};
    return await pushBookingComAvailability(days,maldivesToday());
  }catch(error){
    const message=error instanceof Error?error.message:'Automatic Booking.com availability sync failed.';
    try{await patch('channel_connections','id=eq.'+connectionId,{last_error:message,updated_at:isoNow()});}catch{}
    return {ok:false,skipped:false,error:message};
  }
}

function sanitizedRevision(revision:any){
  const source=revision?.data?{...revision,data:{...revision.data}}:{...revision};
  const target=source?.data||source;
  const attrs={...(target?.attributes||target||{})};
  delete attrs.guarantee;
  if(Array.isArray(attrs.rooms))attrs.rooms=attrs.rooms.map((room:any)=>{const safe={...room};delete safe.guarantee;return safe;});
  if(target?.attributes)target.attributes=attrs;
  else Object.assign(target,attrs);
  return source;
}

function parseRevision(revision:any){
  const resource=revision?.data||revision||{};
  const attrs=resource?.attributes||resource;
  const rooms=Array.isArray(attrs.rooms)?attrs.rooms:[];
  const customer=attrs.customer||{};
  const externalReservationId=text(attrs.unique_id||attrs.ota_reservation_code||attrs.booking_id||resource.id||attrs.id,160);
  const revisionId=text(attrs.revision_id||resource.id||attrs.id,160);
  const status=text(attrs.status||'new',30).toLowerCase();
  return {
    attrs,rooms,customer,
    externalReservationId,revisionId,
    otaReservationCode:text(attrs.ota_reservation_code,100)||externalReservationId,
    status,
    arrivalDate:text(attrs.arrival_date,10),
    departureDate:text(attrs.departure_date,10),
    adults:Math.max(0,Math.trunc(safeNumber(attrs.occupancy?.adults,0))),
    children:Math.max(0,Math.trunc(safeNumber(attrs.occupancy?.children,0))),
    amount:safeNumber(attrs.amount,0),
    currency:text(attrs.currency,3).toUpperCase()||'USD',
    guestName:text([customer.name,customer.surname].filter(Boolean).join(' '),120)||'Booking.com Guest',
    phone:text(customer.phone,40)||null,
    email:text(customer.mail,254)||null,
    notes:text(attrs.notes,1000)||null,
    paymentCollect:text(attrs.payment_collect,30)||null,
    safePayload:sanitizedRevision(revision)
  };
}

function roomGuestName(room:any,fallback:string){
  const guest=Array.isArray(room?.guests)&&room.guests[0]?room.guests[0]:null;
  return text(guest?[guest.name,guest.surname].filter(Boolean).join(' '):fallback,120)||fallback;
}

function availableRoom(state:any,checkIn:string,checkOut:string,pax:number,excludeStayId?:string){
  const rooms=Array.isArray(state.rooms)?state.rooms:[];
  const stays=Array.isArray(state.stays)?state.stays:[];
  return rooms.find((room:any)=>{
    const capacity=Number(room.capacity)||3;
    if(String(room.status||'').toLowerCase()==='maintenance'||capacity<pax)return false;
    return !stays.some((stay:any)=>stay.id!==excludeStayId&&stay.room===room.number&&!['Checked Out','Cancelled'].includes(String(stay.status||''))&&stay.checkIn<checkOut&&stay.checkOut>checkIn);
  });
}

async function mapRows(){
  const [rooms,rates]=await Promise.all([
    select('channel_room_mappings','connection_id=eq.'+connectionId+'&active=eq.true&select=*'),
    select('channel_rate_mappings','connection_id=eq.'+connectionId+'&active=eq.true&select=*')
  ]);
  return {
    rooms:new Map(rooms.map((row:any)=>[String(row.channel_room_id),row])),
    rates:new Map(rates.map((row:any)=>[String(row.channel_rate_id),row]))
  };
}

function roomAmount(parsed:any,room:any){
  if(parsed.rooms.length===1)return safeNumber(room.amount,parsed.amount);
  const amount=safeNumber(room.amount,0);
  return amount>0?amount:parsed.amount/Math.max(1,parsed.rooms.length);
}

function mutateHotelState(state:any,parsed:any,mappings:any,options:{sandbox?:boolean}={}){
  state.stays??=[];state.rooms??=[];
  const existing=state.stays.filter((stay:any)=>stay?.channel?.connectionId===connectionId&&stay?.channel?.externalReservationId===parsed.externalReservationId);
  if(parsed.status==='cancelled'){
    const refs:string[]=[];
    for(const stay of existing){
      if(stay.status==='In House')throw Error('Booking.com sent a cancellation for an in-house guest. Review it manually before changing the stay.');
      if(stay.status!=='Checked Out'){
        stay.status='Cancelled';
        stay.history??=[];
        stay.history.unshift({date:isoNow(),by:'channel:booking-com',detail:'Booking.com cancellation received via Channex · '+parsed.otaReservationCode});
      }
      refs.push(stay.id);
    }
    updateRoomInventory(state);
    return refs;
  }
  if(!['new','modified'].includes(parsed.status))throw Error('Unsupported Booking.com revision status: '+parsed.status);
  if(!parsed.externalReservationId||!parsed.arrivalDate||!parsed.departureDate||parsed.departureDate<=parsed.arrivalDate)throw Error('Booking.com revision is missing a valid reservation ID or stay dates.');
  if(!options.sandbox&&parsed.currency!=='USD')throw Error('Booking.com booking currency is '+parsed.currency+'. Automatic import is paused until a USD rate/currency mapping is configured.');

  const bookingRooms=parsed.rooms.length?parsed.rooms:[{
    checkin_date:parsed.arrivalDate,checkout_date:parsed.departureDate,
    occupancy:{adults:parsed.adults,children:parsed.children},
    amount:parsed.amount,guests:[]
  }];
  const refs:string[]=[];
  const touched=new Set<string>();
  for(let index=0;index<bookingRooms.length;index++){
    const incoming=bookingRooms[index]||{};
    const roomTypeId=text(incoming.room_type_id,100);
    const ratePlanId=text(incoming.rate_plan_id,100);
    const roomMapping=mappings.rooms.get(roomTypeId);
    const rateMapping=mappings.rates.get(ratePlanId);
    if(!roomTypeId||!roomMapping)throw Error('Booking.com room type '+(roomTypeId||'(unmapped)')+' is not mapped to Nirili Double Room.');
    if(!ratePlanId||!rateMapping?.pms_meal_plan)throw Error('Booking.com rate plan '+(ratePlanId||'(unmapped)')+' is not mapped to a Nirili meal plan.');
    const meal=String(rateMapping.pms_meal_plan);
    if(!allowedMeals.has(meal))throw Error('The mapped Nirili meal plan is invalid.');

    const checkIn=text(incoming.checkin_date,10)||parsed.arrivalDate;
    const checkOut=text(incoming.checkout_date,10)||parsed.departureDate;
    const adults=Math.max(1,Math.trunc(safeNumber(incoming.occupancy?.adults,parsed.adults||1)));
    const children=Math.max(0,Math.trunc(safeNumber(incoming.occupancy?.children,parsed.children||0)));
    const pax=adults+children;
    if(pax<1||pax>3)throw Error('Booking.com room '+(index+1)+' has '+pax+' guests; Nirili rooms allow up to 3 guests.');
    const nights=Math.max(1,Math.round((Date.parse(checkOut)-Date.parse(checkIn))/86400000));
    const externalAmount=roomAmount(parsed,incoming);
    const amountCents=options.sandbox?nightly(meal,pax)*nights:Math.max(0,Math.round(externalAmount*100));
    const rateCents=options.sandbox?nightly(meal,pax):Math.max(0,Math.round(amountCents/nights));
    const guest=roomGuestName(incoming,parsed.guestName);
    let stay=existing.find((item:any)=>Number(item?.channel?.roomIndex)===index);

    if(stay){
      if(stay.status==='Checked Out')throw Error('Booking.com modified a booking that is already checked out. Review it manually.');
      if(stay.status==='In House'&&parsed.status==='modified')throw Error('Booking.com modified an in-house booking. Review it manually before changing the stay.');
      let target=availableRoom(state,checkIn,checkOut,pax,stay.id);
      if(stay.room){
        const current=state.rooms.find((room:any)=>room.number===stay.room);
        const conflict=state.stays.some((other:any)=>other.id!==stay.id&&other.room===stay.room&&!['Checked Out','Cancelled'].includes(String(other.status||''))&&other.checkIn<checkOut&&other.checkOut>checkIn);
        if(current&&String(current.status||'').toLowerCase()!=='maintenance'&&(Number(current.capacity)||3)>=pax&&!conflict)target=current;
      }
      if(!target)throw Error('No Nirili room is available for the modified Booking.com dates.');
      Object.assign(stay,{
        guest,room:target.number,checkIn,checkOut,pax,adults,children,meal,
        source:'Booking.com',rateCents,base:amountCents,whatsapp:parsed.phone,email:parsed.email,
        channelAmount:roomAmount(parsed,incoming),channelCurrency:parsed.currency,
        channelPaymentCollect:parsed.paymentCollect,
        channel:{...stay.channel,connectionId,provider:'Channex',externalReservationId:parsed.externalReservationId,
          revisionId:parsed.revisionId,otaReservationCode:parsed.otaReservationCode,roomIndex:index,
          roomTypeId,ratePlanId}
      });
      stay.history??=[];
      stay.history.unshift({date:isoNow(),by:'channel:booking-com',detail:'Booking.com booking '+parsed.status+' via Channex · '+parsed.otaReservationCode});
    }else{
      const target=availableRoom(state,checkIn,checkOut,pax);
      if(!target)throw Error('No Nirili room is available for Booking.com reservation '+parsed.otaReservationCode+'.');
      const id=nextBookingReference(state);
      stay={
        id,createdBy:'channel:booking-com',guest,room:target.number,billRoom:id,checkIn,checkOut,pax,adults,children,meal,
        source:'Booking.com',rateCents,status:'Confirmed',legacyFolio:false,base:amountCents,initialPaid:0,payments:[],extensions:[],
        whatsapp:parsed.phone,email:parsed.email,notes:parsed.notes||'',
        channelAmount:roomAmount(parsed,incoming),channelCurrency:parsed.currency,channelPaymentCollect:parsed.paymentCollect,
        channel:{connectionId,provider:'Channex',externalReservationId:parsed.externalReservationId,revisionId:parsed.revisionId,
          otaReservationCode:parsed.otaReservationCode,roomIndex:index,roomTypeId,ratePlanId},
        history:[{date:isoNow(),by:'channel:booking-com',detail:'Imported from Booking.com via Channex · Room '+target.number+' assigned'}]
      };
      state.stays.push(stay);
    }
    refs.push(stay.id);
    touched.add(stay.id);
  }
  if(parsed.status==='modified')for(const old of existing){
    if(touched.has(old.id))continue;
    if(old.status==='In House')throw Error('Booking.com removed a room from an in-house booking. Review it manually.');
    if(old.status!=='Checked Out'){
      old.status='Cancelled';old.history??=[];
      old.history.unshift({date:isoNow(),by:'channel:booking-com',detail:'Room removed by Booking.com booking modification · '+parsed.otaReservationCode});
      refs.push(old.id);
    }
  }
  updateRoomInventory(state);
  return refs;
}

async function saveD1Rollback(state:any,revision:number){
  try{
    await authDb().prepare("INSERT INTO operation_records(key,payload,revision,updated_by) VALUES(?,?,?,?) ON CONFLICT(key) DO UPDATE SET payload=excluded.payload,revision=excluded.revision,updated_by=excluded.updated_by")
      .bind(stayKey,JSON.stringify(state),revision,'channel:booking-com').run();
  }catch{}
}

async function updateChannelReservation(parsed:any,status:string,refs:string[]=[],error?:string|null){
  const safePayload={
    ...parsed.safePayload,
    nirili:{localBookingReferences:refs,error:error||null}
  };
  await upsert('channel_reservations',[{
    connection_id:connectionId,
    external_reservation_id:parsed.externalReservationId||('revision:'+parsed.revisionId),
    external_revision_id:parsed.revisionId||null,
    booking_reference:refs[0]||null,
    status,
    guest_name:parsed.guestName||null,
    check_in:parsed.arrivalDate||null,
    check_out:parsed.departureDate||null,
    adults:parsed.adults,
    children:parsed.children,
    total_amount:parsed.amount,
    currency:parsed.currency,
    payload:safePayload,
    processed_at:['processed','cancelled','dry_run','ignored','mapping_required','error'].includes(status)?isoNow():null,
    updated_at:isoNow()
  }],'connection_id,external_reservation_id');
}

export async function processBookingComRevision(revision:any,eventKey?:string){
  const connection=await getConnection();
  const parsed=parseRevision(revision);
  const key=eventKey||('booking-revision:'+(parsed.revisionId||parsed.externalReservationId||crypto.randomUUID()));
  await recordEvent(key,'inbound','booking_revision','received',parsed.safePayload);
  if(!parsed.externalReservationId){
    await recordEvent(key,'inbound','booking_revision','error',parsed.safePayload,'Booking revision has no reservation identifier.');
    throw Error('Booking revision has no reservation identifier.');
  }
  const autoImport=connection.settings?.autoImportReservations!==false;
  if(!connection.enabled||!autoImport||connection.settings?.dryRun!==false){
    const reason=!connection.enabled?'Channel is disabled.':!autoImport?'Automatic booking import is disabled.':'Dry-run mode is active.';
    await updateChannelReservation(parsed,!autoImport?'ignored':'dry_run');
    await recordEvent(key,'inbound','booking_revision','ignored',parsed.safePayload,reason);
    return {processed:false,dryRun:true,revisionId:parsed.revisionId,externalReservationId:parsed.externalReservationId,refs:[]};
  }

  try{
    const mappings=await mapRows();
    let savedRefs:string[]=[];
    let savedState:any=null;
    let savedRevision=0;
    if(connection.mode==='staging'){
      const state=structuredClone(await loadStagingHotel());
      savedRefs=mutateHotelState(state,parsed,mappings,{sandbox:true});
      savedState=await saveStagingHotel(state);
    }else{
      for(let attempt=0;attempt<4;attempt++){
        const hotel=await readOperationalRecordPrimary(stayKey);
        if(!hotel?.payload)throw Error('Hotel state is unavailable in Supabase.');
        const state=structuredClone(hotel.payload);
        const refs=mutateHotelState(state,parsed,mappings);
        const next=await saveOperationalRecordPrimary(stayKey,state,Number(hotel.revision)||0,'channel:booking-com');
        if(next>Number(hotel.revision||0)){
          savedRefs=refs;savedState=state;savedRevision=next;break;
        }
      }
      if(!savedState)throw Error('Hotel inventory changed repeatedly while applying the Booking.com reservation. The revision was not acknowledged.');
      await Promise.all([mirrorHotelState(savedState),saveD1Rollback(savedState,savedRevision)]);
    }
    await Promise.all([
      updateChannelReservation(parsed,parsed.status==='cancelled'?'cancelled':'processed',savedRefs),
      patch('channel_connections','id=eq.'+connectionId,{last_inbound_at:isoNow(),last_error:null,updated_at:isoNow()})
    ]);
    const detail=parsed.status==='cancelled'
      ?'Booking.com cancellation · '+parsed.guestName+' · '+parsed.arrivalDate+' → '+parsed.departureDate
      :'Booking.com '+(parsed.status==='modified'?'booking modified':'new booking')+' · '+parsed.guestName+' · '+parsed.arrivalDate+' → '+parsed.departureDate+(savedRefs.length?' · '+savedRefs.join(', '):'');
    if(connection.mode==='production')await saveSystemNotifications([{
      id:'booking-com:'+parsed.revisionId,
      type:'hotel-booking',
      title:parsed.status==='cancelled'?'Booking.com cancellation':parsed.status==='modified'?'Booking.com booking modified':'New Booking.com reservation',
      detail,at:isoNow(),read:false
    }]);
    await recordEvent(key,'inbound','booking_revision','processed',{revisionId:parsed.revisionId,externalReservationId:parsed.externalReservationId,refs:savedRefs});
    await autoPushBookingComAvailability(365);
    return {processed:true,dryRun:false,revisionId:parsed.revisionId,externalReservationId:parsed.externalReservationId,refs:savedRefs};
  }catch(error){
    const message=error instanceof Error?error.message:'Booking.com revision processing failed.';
    const status=/not mapped|meal plan|room type/i.test(message)?'mapping_required':'error';
    await Promise.all([
      updateChannelReservation(parsed,status,[],message),
      recordEvent(key,'inbound','booking_revision','error',parsed.safePayload,message),
      patch('channel_connections','id=eq.'+connectionId,{last_error:message,updated_at:isoNow()})
    ]);
    throw error;
  }
}

async function pullRevision(connection:ChannelConnection,revisionId:string){
  return await channex(connection,'/booking_revisions/'+encodeURIComponent(revisionId));
}

async function ackRevision(connection:ChannelConnection,revisionId:string){
  return await channex(connection,'/booking_revisions/'+encodeURIComponent(revisionId)+'/ack',{method:'POST',body:'{}'});
}

export async function pullBookingComFeed(){
  const connection=await getConnection();
  if(!connection.enabled)throw Error('Enable the Booking.com channel before pulling booking revisions.');
  if(!connection.property_id)throw Error('Channex property ID is missing.');
  const result=await channex(connection,'/booking_revisions/feed?filter[property_id]='+encodeURIComponent(connection.property_id)+'&order[inserted_at]=asc');
  const revisions=rowsOf(result);
  const processed:any[]=[];
  for(const item of revisions.slice(0,100)){
    const attrs=attrsOf(item);
    const revisionId=text(attrs.revision_id||item?.id||attrs.id,160);
    if(!revisionId)continue;
    try{
      const full=await pullRevision(connection,revisionId);
      const outcome=await processBookingComRevision(full,'booking-revision:'+revisionId);
      if(outcome.processed)await ackRevision(connection,revisionId);
      processed.push({...outcome,acknowledged:outcome.processed});
    }catch(error){
      processed.push({revisionId,error:error instanceof Error?error.message:'Processing failed',acknowledged:false});
    }
  }
  return {ok:true,received:revisions.length,processed};
}

async function hashText(value:string){
  const bytes=new TextEncoder().encode(value);
  const digest=await crypto.subtle.digest('SHA-256',bytes);
  return Array.from(new Uint8Array(digest)).map(x=>x.toString(16).padStart(2,'0')).join('');
}

function equalSecret(a:string,b:string){
  const aa=new TextEncoder().encode(a),bb=new TextEncoder().encode(b);
  if(aa.length!==bb.length)return false;
  let diff=0;for(let i=0;i<aa.length;i++)diff|=aa[i]^bb[i];
  return diff===0;
}

function webhookRevisionId(payload:any){
  const candidates=[
    payload?.revision_id,payload?.booking_revision_id,payload?.event_id,
    payload?.payload?.revision_id,payload?.payload?.booking_revision_id,payload?.payload?.id,
    payload?.data?.id,payload?.data?.attributes?.revision_id,payload?.data?.attributes?.id
  ];
  return text(candidates.find(Boolean),160);
}

export async function handleBookingComWebhook(request:Request){
  const cfg=runtime();
  const connection=await getConnection();
  const supplied=request.headers.get('x-nirili-channel-secret')||'';
  if(!supplied)throw Object.assign(Error('Missing webhook token.'),{status:401});
  let valid=false;
  if(cfg.channexWebhookToken)valid=equalSecret(supplied,cfg.channexWebhookToken);
  else if(connection.settings?.webhookTokenHash)valid=equalSecret(await hashText(supplied),String(connection.settings.webhookTokenHash));
  if(!valid)throw Object.assign(Error('Invalid webhook token.'),{status:401});
  const raw=await request.text();
  let payload:any;try{payload=JSON.parse(raw||'{}')}catch{throw Object.assign(Error('Invalid webhook JSON.'),{status:400})}
  const revisionId=webhookRevisionId(payload);
  const eventType=text(payload?.event||payload?.event_type||payload?.type||'booking',80);
  const eventKey='webhook:'+(revisionId||payload?.event_id||await hashText(raw));
  const existing=await select('channel_events','connection_id=eq.'+connectionId+'&event_key=eq.'+encodeURIComponent(eventKey)+'&select=status&limit=1');
  if(existing[0]?.status==='processed')return {ok:true,duplicate:true,revisionId:revisionId||null};

  await recordEvent(eventKey,'inbound',eventType,'received',payload);
  if(!connection.enabled){
    await recordEvent(eventKey,'inbound',eventType,'ignored',payload,'Channel is disabled.');
    return {ok:true,ignored:true,reason:'disabled'};
  }
  if(!revisionId){
    await recordEvent(eventKey,'inbound',eventType,'ignored',payload,'Webhook did not include a booking revision ID.');
    return {ok:true,ignored:true,reason:'no_revision_id'};
  }
  try{
    const full=await pullRevision(connection,revisionId);
    const outcome=await processBookingComRevision(full,'booking-revision:'+revisionId);
    if(outcome.processed)await ackRevision(connection,revisionId);
    await recordEvent(eventKey,'inbound',eventType,'processed',{revisionId,outcome});
    return {ok:true,revisionId,acknowledged:outcome.processed,...outcome};
  }catch(error){
    const message=error instanceof Error?error.message:'Webhook processing failed.';
    await recordEvent(eventKey,'inbound',eventType,'error',payload,message);
    throw error;
  }
}
