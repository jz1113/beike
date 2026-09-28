import { useEffect, useState, type RefObject } from 'react';
import { Map as MapIcon, Minus } from 'lucide-react';
import { nodeBounds } from '../model/canvasGraph';
import type { CanvasNode } from '../model/types';

export function CanvasMinimap({nodes, pan, zoom, viewportRef, onCenter}: {nodes:CanvasNode[]; pan:{x:number;y:number}; zoom:number; viewportRef:RefObject<HTMLDivElement|null>; onCenter:(x:number,y:number)=>void}) {
  const [size,setSize]=useState({width:900,height:600}), [open,setOpen]=useState(true);
  useEffect(()=>{
    const element=viewportRef.current;if(!element)return;
    const update=()=>setSize({width:element.clientWidth,height:element.clientHeight});
    update();const observer=new ResizeObserver(update);observer.observe(element);return()=>observer.disconnect();
  },[viewportRef]);
  const visible=nodes.filter(n=>!n.layerHidden);
  if(visible.length<2)return null;
  const viewport={x:-pan.x/zoom,y:-pan.y/zoom,width:size.width/zoom,height:size.height/zoom};
  const bounds=[viewport,...visible.map(nodeBounds)];
  const x=Math.min(...bounds.map(b=>b.x))-60,y=Math.min(...bounds.map(b=>b.y))-60;
  const width=Math.max(...bounds.map(b=>b.x+b.width))-x+60,height=Math.max(...bounds.map(b=>b.y+b.height))-y+60;
  const scale=Math.min(152/width,92/height), offsetX=(168-width*scale)/2,offsetY=(108-height*scale)/2;
  return <aside aria-label="画布导航" className="canvas-fixed-ui absolute bottom-20 right-4 z-30 hidden overflow-hidden rounded-xl border border-white bg-white/90 shadow-[0_4px_20px_rgba(15,23,42,0.05)] sm:block">
    <button className="flex w-full items-center justify-between gap-6 px-3 py-2 text-[10px] text-slate-400" aria-expanded={open} onClick={()=>setOpen(!open)}><span className="flex items-center gap-1.5"><MapIcon size={12}/>导航</span>{open && <Minus size={11}/>}</button>
    {open && <svg role="img" aria-label="点击缩略图定位画布" width="168" height="108" className="cursor-crosshair" onClick={event=>{
      const rect=event.currentTarget.getBoundingClientRect();
      onCenter((event.clientX-rect.left-offsetX)/scale+x,(event.clientY-rect.top-offsetY)/scale+y);
    }}>
      {visible.map(node=>{const b=nodeBounds(node);return <rect key={node.id} x={(b.x-x)*scale+offsetX} y={(b.y-y)*scale+offsetY} width={b.width*scale} height={b.height*scale} rx={2} fill={node.type==='frame'?'#f1f5f9':node.type==='prompt'?'#c7c4df':node.type==='note'?'#f1d8a0':node.generationKind==='video'?'#a8d1d4':'#b5c9c3'} stroke="#fff" strokeWidth={0.5}/>;})}
      <rect x={(viewport.x-x)*scale+offsetX} y={(viewport.y-y)*scale+offsetY} width={viewport.width*scale} height={viewport.height*scale} rx={3} fill="#6366f108" stroke="#a5a3d6" strokeWidth={1}/>
    </svg>}
  </aside>;
}
