"use client";
import {useEffect,useState} from "react";

export default function TourOperatorBookingManager(){
 const [ready,setReady]=useState(false);
 useEffect(()=>{let active=true;async function check(){try{const r=await fetch("/api/tour-operator-portal/manage",{cache:"no-store"});if(active&&r.ok)setReady(true);}catch{}}void check();const timer=setInterval(check,3000);return()=>{active=false;clearInterval(timer)}},[]);
 if(!ready)return null;
 return <section className="to-booking-manager"><h2>Manage my bookings</h2></section>;
}
