import DiningMenu from './menu';
export default async function GuestRestaurant({searchParams}:{searchParams:Promise<{mode?:string}>}){const p=await searchParams;return <DiningMenu mode={p.mode==='inhouse'?'inhouse':'walkin'}/>;}
