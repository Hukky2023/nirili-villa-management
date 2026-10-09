'use client';
import {useEffect,useRef,useState} from 'react';

/** True equirectangular 360° panorama rendered onto a virtual sphere. */
export default function Panorama360({src,onError}:{src:string;onError:()=>void}){
 const canvasRef=useRef<HTMLCanvasElement>(null);
 const errorCallback=useRef(onError);
 errorCallback.current=onError;
 const [status,setStatus]=useState<'loading'|'ready'|'error'>('loading');
 useEffect(()=>{
  const canvas=canvasRef.current;if(!canvas)return;
  let disposed=false,frame=0,yaw=0,pitch=0,fov=1.25;
  const gl=canvas.getContext('webgl',{alpha:false,antialias:true});
  if(!gl){setStatus('error');errorCallback.current();return;}
  const vert='attribute vec2 a; varying vec2 v; void main(){v=a;gl_Position=vec4(a,0.,1.);}';
  const frag=`precision highp float;
  varying vec2 v;uniform sampler2D tex;uniform vec2 rot;uniform float fov;uniform float aspect;
  const float PI=3.141592653589793;
  void main(){
   vec3 d=normalize(vec3(v.x*aspect*tan(fov*.5),v.y*tan(fov*.5),-1.));
   float cp=cos(rot.y),sp=sin(rot.y);
   d=vec3(d.x,cp*d.y-sp*d.z,sp*d.y+cp*d.z);
   float cy=cos(rot.x),sy=sin(rot.x);
   d=vec3(cy*d.x+sy*d.z,d.y,-sy*d.x+cy*d.z);
   vec2 uv=vec2(atan(d.x,-d.z)/(2.*PI)+.5,asin(clamp(d.y,-1.,1.))/PI+.5);
   gl_FragColor=texture2D(tex,vec2(uv.x,1.-uv.y));
  }`;
  const compile=(type:number,source:string)=>{const shader=gl.createShader(type);if(!shader)throw Error();gl.shaderSource(shader,source);gl.compileShader(shader);if(!gl.getShaderParameter(shader,gl.COMPILE_STATUS))throw Error(gl.getShaderInfoLog(shader)||'');return shader;};
  let program:WebGLProgram|null=null,texture:WebGLTexture|null=null,buffer:WebGLBuffer|null=null;
  try{
   program=gl.createProgram();if(!program)throw Error();
   gl.attachShader(program,compile(gl.VERTEX_SHADER,vert));gl.attachShader(program,compile(gl.FRAGMENT_SHADER,frag));gl.linkProgram(program);
   if(!gl.getProgramParameter(program,gl.LINK_STATUS))throw Error();
   gl.useProgram(program);buffer=gl.createBuffer();gl.bindBuffer(gl.ARRAY_BUFFER,buffer);
   gl.bufferData(gl.ARRAY_BUFFER,new Float32Array([-1,-1,1,-1,-1,1,-1,1,1,-1,1,1]),gl.STATIC_DRAW);
   const loc=gl.getAttribLocation(program,'a');gl.enableVertexAttribArray(loc);gl.vertexAttribPointer(loc,2,gl.FLOAT,false,0,0);
   texture=gl.createTexture();gl.bindTexture(gl.TEXTURE_2D,texture);
   gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE);
   gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);
   gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.LINEAR);
   gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.LINEAR);
  }catch{setStatus('error');errorCallback.current();return;}
  const rotation=gl.getUniformLocation(program,'rot'),field=gl.getUniformLocation(program,'fov'),aspect=gl.getUniformLocation(program,'aspect');
  const img=new Image();img.crossOrigin='anonymous';
  const draw=()=>{
   if(disposed)return;
   const w=Math.max(1,Math.round(canvas.clientWidth*Math.min(window.devicePixelRatio||1,3)));
   const h=Math.max(1,Math.round(canvas.clientHeight*Math.min(window.devicePixelRatio||1,2)));
   if(canvas.width!==w||canvas.height!==h){canvas.width=w;canvas.height=h;}
   gl.viewport(0,0,w,h);gl.uniform2f(rotation,yaw,pitch);gl.uniform1f(field,fov);gl.uniform1f(aspect,w/h);
   gl.drawArrays(gl.TRIANGLES,0,6);
  };
  img.onload=()=>{
   if(disposed)return;
   try{
    gl.bindTexture(gl.TEXTURE_2D,texture);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL,false);
    const maxTexture=gl.getParameter(gl.MAX_TEXTURE_SIZE) as number;
    if(img.naturalWidth>maxTexture||img.naturalHeight>maxTexture){const scaled=document.createElement('canvas');const scale=Math.min(maxTexture/img.naturalWidth,maxTexture/img.naturalHeight);scaled.width=Math.floor(img.naturalWidth*scale);scaled.height=Math.floor(img.naturalHeight*scale);scaled.getContext('2d')?.drawImage(img,0,0,scaled.width,scaled.height);gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,gl.RGBA,gl.UNSIGNED_BYTE,scaled);}else gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,gl.RGBA,gl.UNSIGNED_BYTE,img);
    setStatus('ready');draw();
   }catch{setStatus('error');errorCallback.current();}
  };
  img.onerror=()=>{if(!disposed){setStatus('error');errorCallback.current();}};
  img.src=src;
  let startX=0,startY=0,oldYaw=0,oldPitch=0,dragging=false;
  const down=(e:PointerEvent)=>{dragging=true;startX=e.clientX;startY=e.clientY;oldYaw=yaw;oldPitch=pitch;canvas.setPointerCapture(e.pointerId);};
  const move=(e:PointerEvent)=>{if(!dragging)return;yaw=oldYaw-(e.clientX-startX)/Math.max(canvas.clientWidth,1)*2.5;pitch=Math.max(-1.5,Math.min(1.5,oldPitch+(e.clientY-startY)/Math.max(canvas.clientHeight,1)*1.7));draw();};
  const up=()=>{dragging=false;};
  const wheel=(e:WheelEvent)=>{e.preventDefault();fov=Math.max(.45,Math.min(2.2,fov+e.deltaY*.001));draw();};
  const key=(e:KeyboardEvent)=>{if(e.key==='ArrowLeft')yaw+=.12;else if(e.key==='ArrowRight')yaw-=.12;else if(e.key==='ArrowUp')pitch=Math.min(1.5,pitch+.12);else if(e.key==='ArrowDown')pitch=Math.max(-1.5,pitch-.12);else return;e.preventDefault();draw();};
  const resize=new ResizeObserver(draw);resize.observe(canvas);
  canvas.addEventListener('pointerdown',down);canvas.addEventListener('pointermove',move);canvas.addEventListener('pointerup',up);canvas.addEventListener('pointercancel',up);canvas.addEventListener('wheel',wheel,{passive:false});canvas.addEventListener('keydown',key);
  return()=>{disposed=true;cancelAnimationFrame(frame);img.onload=null;img.onerror=null;resize.disconnect();canvas.removeEventListener('pointerdown',down);canvas.removeEventListener('pointermove',move);canvas.removeEventListener('pointerup',up);canvas.removeEventListener('pointercancel',up);canvas.removeEventListener('wheel',wheel);canvas.removeEventListener('keydown',key);if(texture)gl.deleteTexture(texture);if(buffer)gl.deleteBuffer(buffer);if(program)gl.deleteProgram(program);};
 },[src]);
 return <div className="nh-panorama-wrap">
  <canvas ref={canvasRef} className="nh-panorama-canvas" tabIndex={0} aria-label="Pan panoramic image"/>
  {status==='loading'&&<div className="nh-panorama-message">Look around</div>}
 </div>;
}
