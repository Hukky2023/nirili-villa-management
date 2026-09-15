'use client';
import {UiText,UiField,UiOption} from '../ui-language';


export default function RestaurantError({reset}:{error:Error;reset:()=>void}){
 return <main style={{minHeight:'100vh',background:'#edf5f2',color:'#173f47',display:'grid',placeItems:'center',padding:24}}><section style={{maxWidth:440,background:'white',padding:32,borderRadius:20}}><p><UiText>NIRILI VILLA · RESTAURANT</UiText></p><h1><UiText>Let’s reopen your restaurant</UiText></h1><p><UiText>The page could not finish loading. Try again or return to restaurant login.</UiText></p><button onClick={reset} style={{padding:'14px 20px',margin:'16px 12px 16px 0'}}><UiText>Try again</UiText></button><a href="/restaurant/login"><UiText>Restaurant login</UiText></a></section></main>;
}
