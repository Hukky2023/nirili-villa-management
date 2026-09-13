'use client';

export default function RestaurantError({reset}:{error:Error;reset:()=>void}){
 return <main style={{minHeight:'100vh',background:'#edf5f2',color:'#173f47',display:'grid',placeItems:'center',padding:24}}><section style={{maxWidth:440,background:'white',padding:32,borderRadius:20}}><p>NIRILI VILLA · RESTAURANT</p><h1>Let’s reopen your restaurant</h1><p>The page could not finish loading. Try again or return to restaurant login.</p><button onClick={reset} style={{padding:'14px 20px',margin:'16px 12px 16px 0'}}>Try again</button><a href="/restaurant/login">Restaurant login</a></section></main>;
}
