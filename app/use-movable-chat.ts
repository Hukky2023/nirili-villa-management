'use client';
import {useEffect,useRef,useState,type PointerEvent,type MouseEvent} from 'react';
type Point={x:number;y:number};
const key='nv-chat-button-position';
function constrain(p:Point):Point{return {x:Math.max(12,Math.min(p.x,window.innerWidth-60)),y:Math.max(12,Math.min(p.y,window.innerHeight-60))};}
export function useMovableChat(){
 const [position,setPosition]=useState<Point|null>(null),[dragging,setDragging]=useState(false);
 const gesture=useRef<{id:number;start:Point;origin:Point;last:Point;moved:boolean}|null>(null),skipClick=useRef(false);
 useEffect(()=>{try{const p=JSON.parse(localStorage.getItem(key)||'null');if(p&&Number.isFinite(p.x)&&Number.isFinite(p.y))setPosition(constrain(p));}catch{}const resize=()=>setPosition(p=>p?constrain(p):null);window.addEventListener('resize',resize);return()=>window.removeEventListener('resize',resize);},[]);
 function onPointerDown(e:PointerEvent<HTMLButtonElement>){if(!e.isPrimary||e.button!==0)return;skipClick.current=false;const r=e.currentTarget.getBoundingClientRect();gesture.current={id:e.pointerId,start:{x:e.clientX,y:e.clientY},origin:{x:r.left,y:r.top},last:{x:r.left,y:r.top},moved:false};e.currentTarget.setPointerCapture(e.pointerId);}
 function onPointerMove(e:PointerEvent<HTMLButtonElement>){const g=gesture.current;if(!g||g.id!==e.pointerId)return;const dx=e.clientX-g.start.x,dy=e.clientY-g.start.y;if(!g.moved&&Math.hypot(dx,dy)<6)return;g.moved=true;skipClick.current=true;g.last=constrain({x:g.origin.x+dx,y:g.origin.y+dy});setPosition(g.last);setDragging(true);}
 function finish(e:PointerEvent<HTMLButtonElement>){const g=gesture.current;if(!g||g.id!==e.pointerId)return;if(g.moved){try{localStorage.setItem(key,JSON.stringify(g.last));}catch{}}gesture.current=null;setDragging(false);if(e.currentTarget.hasPointerCapture(e.pointerId))e.currentTarget.releasePointerCapture(e.pointerId);}
 function allowClick(e:MouseEvent<HTMLButtonElement>){if(skipClick.current&&e.detail!==0){e.preventDefault();skipClick.current=false;return false;}return true;}
 return {style:position?{left:position.x,top:position.y,bottom:'auto',right:'auto'}:undefined,dragging,onPointerDown,onPointerMove,onPointerUp:finish,onPointerCancel:finish,onLostPointerCapture:finish,allowClick};
}
