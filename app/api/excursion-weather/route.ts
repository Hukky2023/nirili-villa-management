import {currentUser} from '../../../lib/auth';

const LAT=4.4410,LON=73.7130;
const WEATHER_URL=`https://api.open-meteo.com/v1/forecast?latitude=${LAT}&longitude=${LON}&timezone=Indian%2FMaldives&forecast_days=7&current=temperature_2m,apparent_temperature,weather_code,precipitation,wind_speed_10m,wind_direction_10m,wind_gusts_10m&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max,wind_speed_10m_max,wind_gusts_10m_max,sunrise,sunset`;
const MARINE_URL=`https://marine-api.open-meteo.com/v1/marine?latitude=${LAT}&longitude=${LON}&timezone=Indian%2FMaldives&forecast_days=7&cell_selection=sea&current=wave_height,wave_direction,wave_period,sea_surface_temperature,ocean_current_velocity,ocean_current_direction&hourly=sea_level_height_msl,wave_height,wave_period`;

const conditions:Record<number,string>={
 0:'Clear sky',1:'Mainly clear',2:'Partly cloudy',3:'Overcast',45:'Fog',48:'Rime fog',51:'Light drizzle',53:'Drizzle',55:'Heavy drizzle',56:'Freezing drizzle',57:'Heavy freezing drizzle',61:'Light rain',63:'Rain',65:'Heavy rain',66:'Freezing rain',67:'Heavy freezing rain',71:'Light snow',73:'Snow',75:'Heavy snow',77:'Snow grains',80:'Light rain showers',81:'Rain showers',82:'Heavy rain showers',85:'Snow showers',86:'Heavy snow showers',95:'Thunderstorm',96:'Thunderstorm with hail',99:'Severe thunderstorm with hail'
};
const condition=(code:number)=>conditions[code]||'Weather conditions';
const finite=(n:any)=>Number.isFinite(Number(n));
const rounded=(n:any,d=2)=>finite(n)?Number(Number(n).toFixed(d)):null;
function tideExtremes(times:string[],levels:any[]){
 const byDay:Record<string,any[]>={};
 for(let i=1;i<times.length-1;i++){
  const a=Number(levels[i-1]),b=Number(levels[i]),c=Number(levels[i+1]);if(![a,b,c].every(Number.isFinite))continue;
  const type=b>a&&b>=c?'High':b<a&&b<=c?'Low':'';if(!type)continue;
  const date=times[i].slice(0,10);(byDay[date]??=[]).push({type,time:times[i].slice(11,16),heightM:rounded(b)});
 }
 return byDay;
}
function maxByDay(times:string[],values:any[]){
 const byDay:Record<string,number>={};
 for(let i=0;i<times.length;i++){
  const value=Number(values[i]);if(!Number.isFinite(value))continue;
  const date=times[i].slice(0,10);byDay[date]=Math.max(byDay[date]??-Infinity,value);
 }
 return Object.fromEntries(Object.entries(byDay).map(([date,value])=>[date,rounded(value,1)]));
}

export async function GET(){
 const user=await currentUser();
 if(!user||user.role==='guest')return Response.json({error:'Staff login required.'},{status:403});
 try{
  const [weatherResponse,marineResponse]=await Promise.all([
   fetch(WEATHER_URL,{headers:{Accept:'application/json'},next:{revalidate:900}}),
   fetch(MARINE_URL,{headers:{Accept:'application/json'},next:{revalidate:900}})
  ]);
  if(!weatherResponse.ok)throw Error('weather provider unavailable');
  const w=await weatherResponse.json();
  const m=marineResponse.ok?await marineResponse.json():null;
  const marineTimes=m?.hourly?.time||[];
  const tideByDay=m?tideExtremes(marineTimes,m.hourly?.sea_level_height_msl||[]):{};
  const waveByDay=m?maxByDay(marineTimes,m.hourly?.wave_height||[]):{};
  const days=(w.daily?.time||[]).map((date:string,i:number)=>({
   date,condition:condition(w.daily.weather_code?.[i]),weatherCode:w.daily.weather_code?.[i],maxC:w.daily.temperature_2m_max?.[i],minC:w.daily.temperature_2m_min?.[i],rainChance:w.daily.precipitation_probability_max?.[i],windKmh:w.daily.wind_speed_10m_max?.[i],gustKmh:w.daily.wind_gusts_10m_max?.[i],sunrise:w.daily.sunrise?.[i],sunset:w.daily.sunset?.[i],waveMaxM:(waveByDay as any)[date]??null,tides:(tideByDay as any)[date]||[]
  }));
  return Response.json({
   location:'Dhiffushi, Maldives',timezone:w.timezone||'Indian/Maldives',
   current:{time:w.current?.time,condition:condition(w.current?.weather_code),weatherCode:w.current?.weather_code,tempC:w.current?.temperature_2m,feelsC:w.current?.apparent_temperature,precipitationMm:w.current?.precipitation,windKmh:w.current?.wind_speed_10m,windDirection:w.current?.wind_direction_10m,gustKmh:w.current?.wind_gusts_10m},
   marine:m?{waveHeightM:rounded(m.current?.wave_height),waveDirection:m.current?.wave_direction,wavePeriodS:rounded(m.current?.wave_period,1),seaSurfaceC:rounded(m.current?.sea_surface_temperature,1),currentKmh:rounded(m.current?.ocean_current_velocity,1),currentDirection:m.current?.ocean_current_direction,source:'Open-Meteo Marine'}:null,
   days
  },{headers:{'Cache-Control':'private, max-age=300'}});
 }catch{return Response.json({error:'Weather and tide forecast is temporarily unavailable.'},{status:503});}
}
