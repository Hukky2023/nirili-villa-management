import {currentUser} from '../../../lib/auth';

const WEATHER_URL='https://api.open-meteo.com/v1/forecast?latitude=4.4410&longitude=73.7130&timezone=Indian%2FMaldives&forecast_days=7&current=temperature_2m,apparent_temperature,weather_code,precipitation,wind_speed_10m,wind_direction_10m,wind_gusts_10m&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max,wind_speed_10m_max,wind_gusts_10m_max,sunrise,sunset';

const conditions:Record<number,string>={
 0:'Clear sky',1:'Mainly clear',2:'Partly cloudy',3:'Overcast',
 45:'Fog',48:'Rime fog',51:'Light drizzle',53:'Drizzle',55:'Heavy drizzle',
 56:'Freezing drizzle',57:'Heavy freezing drizzle',61:'Light rain',63:'Rain',65:'Heavy rain',
 66:'Freezing rain',67:'Heavy freezing rain',71:'Light snow',73:'Snow',75:'Heavy snow',77:'Snow grains',
 80:'Light rain showers',81:'Rain showers',82:'Heavy rain showers',85:'Snow showers',86:'Heavy snow showers',
 95:'Thunderstorm',96:'Thunderstorm with hail',99:'Severe thunderstorm with hail'
};

const condition=(code:number)=>conditions[code]||'Weather conditions';

export async function GET(){
 const user=await currentUser();
 if(!user||user.role==='guest')return Response.json({error:'Staff login required.'},{status:403});
 try{
  const response=await fetch(WEATHER_URL,{headers:{Accept:'application/json'},next:{revalidate:900}});
  if(!response.ok)throw Error('weather provider unavailable');
  const w=await response.json();
  const days=(w.daily?.time||[]).map((date:string,i:number)=>({
   date,
   condition:condition(w.daily.weather_code?.[i]),
   weatherCode:w.daily.weather_code?.[i],
   maxC:w.daily.temperature_2m_max?.[i],
   minC:w.daily.temperature_2m_min?.[i],
   rainChance:w.daily.precipitation_probability_max?.[i],
   windKmh:w.daily.wind_speed_10m_max?.[i],
   gustKmh:w.daily.wind_gusts_10m_max?.[i],
   sunrise:w.daily.sunrise?.[i],
   sunset:w.daily.sunset?.[i]
  }));
  return Response.json({
   location:'Dhiffushi, Maldives',
   timezone:w.timezone||'Indian/Maldives',
   current:{
    time:w.current?.time,
    condition:condition(w.current?.weather_code),
    weatherCode:w.current?.weather_code,
    tempC:w.current?.temperature_2m,
    feelsC:w.current?.apparent_temperature,
    precipitationMm:w.current?.precipitation,
    windKmh:w.current?.wind_speed_10m,
    windDirection:w.current?.wind_direction_10m,
    gustKmh:w.current?.wind_gusts_10m
   },
   days
  },{headers:{'Cache-Control':'private, max-age=300'}});
 }catch{
  return Response.json({error:'Weather forecast is temporarily unavailable.'},{status:503});
 }
}
