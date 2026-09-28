import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ImagePlus, Video, Unplug, Plus } from 'lucide-react';
import { useCanvasStore } from '../store/useCanvasStore';
import { canConnect, connectionError, nodeBounds, referenceReady, isTextSource } from '../model/canvasGraph';
import type { CanvasNode } from '../model/types';

type Point = {x:number; y:number};
const edge = (node:CanvasNode, input=false):Point => {
  const b=nodeBounds(node);
  return {x:b.x+(input?0:b.width),y:b.y+b.height/2};
};
const curve = (a:Point,b:Point) => {
  const bend=Math.max(60,Math.abs(b.x-a.x)/2);
  return `M ${a.x} ${a.y} C ${a.x+bend} ${a.y}, ${b.x-bend} ${b.y}, ${b.x} ${b.y}`;
};
export function findConnectionTarget(nodes:CanvasNode[],sourceId:string,point:Point,zoom:number) {
  const tolerance=16/Math.max(zoom,0.1);
  return [...nodes].reverse().find(node=>{
    if(node.id===sourceId || node.type!=='drawing' || node.layerHidden || node.layerLocked)return false;
    const b=nodeBounds(node);
    return point.x>=b.x-tolerance && point.x<=b.x+b.width+tolerance && point.y>=b.y-tolerance && point.y<=b.y+b.height+tolerance;
  });
}
export function CanvasConnections({nodes,projectId,zoom}: {nodes:CanvasNode[]; projectId:string; zoom:number}) {
  const root=useRef<HTMLDivElement>(null), menuRef=useRef<HTMLDivElement>(null);
  const [sourceId,setSourceId]=useState<string|null>(null);
  const [cursor,setCursor]=useState<Point|null>(null);
  const [targetId,setTargetId]=useState<string|null>(null);
  const [selected,setSelected]=useState<{from:string;to:string}|null>(null);
  const [menu,setMenu]=useState<(Point & {world:Point})|null>(null);
  const [message,setMessage]=useState('');
  const source=nodes.find(n=>n.id===sourceId);
  const dismiss=useCallback(()=>{setSourceId(null);setCursor(null);setMenu(null);setTargetId(null);},[]);
  const connect=useCallback((target:CanvasNode)=>{
    if(!sourceId)return;
    const error=connectionError(nodes,sourceId,target.id);
    if(error){setMessage(error);dismiss();return;}
    useCanvasStore.getState().updateNode(projectId,target.id,{referenceNodeIds:[...(target.referenceNodeIds || []),sourceId]});
    dismiss();
  },[sourceId,nodes,projectId,dismiss]);
  const disconnect=useCallback(()=>{
    if(!selected)return;
    const node=nodes.find(n=>n.id===selected.to);
    if(node?.layerLocked){setMessage('请先解锁节点');return;}
    if(node)useCanvasStore.getState().updateNode(projectId,node.id,{referenceNodeIds:node.referenceNodeIds?.filter(id=>id!==selected.from)});
    setSelected(null);
  },[selected,nodes,projectId]);
  useEffect(()=>{dismiss();setSelected(null);setMessage('');},[projectId,dismiss]);
  useEffect(()=>{if(!message)return;const timer=setTimeout(()=>setMessage(''),3500);return()=>clearTimeout(timer);},[message]);
  useEffect(()=>{
    if(!selected)return;
    const key=(event:KeyboardEvent)=>{
      if(!root.current?.getClientRects().length)return;
      if((event.target as HTMLElement)?.closest?.('input,textarea,[contenteditable="true"],[role="dialog"],[role="menu"]'))return;
      if(['Delete','Backspace'].includes(event.key)){event.preventDefault();event.stopImmediatePropagation();disconnect();}
      if(event.key==='Escape')setSelected(null);
    };
    const outside=(event:PointerEvent)=>{if(!(event.target as Element)?.closest?.('[data-connection-edge]'))setSelected(null);};
    window.addEventListener('keydown',key,true);window.addEventListener('pointerdown',outside);
    return()=>{window.removeEventListener('keydown',key,true);window.removeEventListener('pointerdown',outside);};
  },[selected,nodes,projectId,disconnect]);
  useEffect(()=>{
    if(!sourceId)return;
    const point=(event:MouseEvent)=>{
      const rect=root.current?.getBoundingClientRect();
      return rect?{x:(event.clientX-rect.left)/zoom,y:(event.clientY-rect.top)/zoom}:null;
    };
    const move=(event:MouseEvent)=>{
      if(menu)return;
      const p=point(event);if(!p)return;
      const target=findConnectionTarget(nodes,sourceId,p,zoom);
      setTargetId(target?.id || null);setCursor(target?edge(target,true):p);
    };
    const up=(event:MouseEvent)=>{
      if(menu || (event.target as Element)?.closest?.('[data-connection-port]'))return;
      const element=event.target as Element, p=point(event);
      if(!p || event.button!==0)return;
      const target=findConnectionTarget(nodes,sourceId,p,zoom);
      if(target){connect(target);return;}
      if(element.closest?.('[data-testid="canvas-viewport"]') && !element.closest('.canvas-node-card,.canvas-fixed-ui,button,input,textarea'))setMenu({x:event.clientX,y:event.clientY,world:p});
      else dismiss();
    };
    const key=(event:KeyboardEvent)=>{if(event.key==='Escape')dismiss();};
    window.addEventListener('mousemove',move);window.addEventListener('mouseup',up,true);window.addEventListener('keydown',key);
    return()=>{window.removeEventListener('mousemove',move);window.removeEventListener('mouseup',up,true);window.removeEventListener('keydown',key);};
  },[sourceId,zoom,nodes,menu,projectId,connect,dismiss]);
  useEffect(()=>{
    if(!menu)return;
    menuRef.current?.querySelector('button')?.focus();
    const outside=(event:PointerEvent)=>{if(!menuRef.current?.contains(event.target as Node))dismiss();};
    document.addEventListener('pointerdown',outside);return()=>document.removeEventListener('pointerdown',outside);
  },[menu,dismiss]);
  const createNext=(video:boolean)=>{
    if(!source || !menu)return;
    useCanvasStore.getState().addNode(projectId,{type:'drawing',generationKind:video?'video':'image',title:video?'视频生成':'图片生成',x:menu.world.x-140,y:menu.world.y-100,width:560,height:500,referenceNodeIds:[source.id]});
    dismiss();
  };
  return <div ref={root} className="pointer-events-none absolute inset-0">
    {message && createPortal(<div role="status" className="pointer-events-none fixed left-1/2 top-20 z-[200] -translate-x-1/2 rounded-xl border border-amber-100 bg-white px-4 py-3 text-xs text-slate-600 shadow-lg">{message}</div>,document.body)}
    {menu && source && createPortal(<div ref={menuRef} role="menu" aria-label="连接下一步" className="fixed z-[200] w-52 rounded-2xl border border-slate-100 bg-white p-2 text-xs text-slate-700 shadow-xl" style={{left:Math.max(8,Math.min(menu.x,window.innerWidth-216)),top:Math.max(8,Math.min(menu.y,window.innerHeight-140))}} onMouseDown={e=>e.stopPropagation()}>
      <p className="px-3 py-2 text-[10px] text-slate-400">继续创作 · 自动引用上游</p>
      <button role="menuitem" className="flex w-full items-center gap-3 rounded-xl p-3 hover:bg-indigo-50" onClick={()=>createNext(false)}><ImagePlus size={16}/>图片生成</button>
      <button role="menuitem" className="flex w-full items-center gap-3 rounded-xl p-3 hover:bg-indigo-50" onClick={()=>createNext(true)}><Video size={16}/>视频生成</button>
    </div>,document.body)}
    <svg className="absolute left-0 top-0 h-px w-px overflow-visible" aria-label="画布参考连线">
      {nodes.flatMap(target=>(target.referenceNodeIds || []).map(id=>{
        const from=nodes.find(n=>n.id===id);if(!from || from.layerHidden || target.layerHidden)return null;
        const active=selected?.from===id && selected.to===target.id;
        const color=active?'#6366f1':!referenceReady(from)?'#d3a95c':isTextSource(from)?'#a5a0cd':'#a6b5b2';
        const a=edge(from),b=edge(target,true),path=curve(a,b);
        return <g key={`${id}-${target.id}`}>
          <path d={path} fill="none" stroke={color} strokeOpacity={active?1:0.45} strokeWidth={active?2:1.25} strokeDasharray={!referenceReady(from)?'5 5':undefined} vectorEffect="non-scaling-stroke" />
          <path data-connection-edge="true" role="button" tabIndex={0} aria-label={`选择连线 ${from.title || '节点'} → ${target.title || '节点'}`} className="pointer-events-auto cursor-pointer focus:stroke-indigo-300/30 focus:outline-none" d={path} fill="none" stroke="transparent" strokeWidth={14} vectorEffect="non-scaling-stroke" onMouseDown={e=>e.stopPropagation()} onClick={e=>{e.stopPropagation();setSelected({from:id,to:target.id});}} onKeyDown={e=>{if(e.key==='Enter' || e.key===' '){e.preventDefault();setSelected({from:id,to:target.id});}}} />
        </g>;
      }))}
      {source && cursor && <path d={curve(edge(source),cursor)} fill="none" stroke="#818cf8" strokeWidth={2} strokeDasharray="5 4" vectorEffect="non-scaling-stroke" />}
    </svg>
    {selected && (()=>{
      const from=nodes.find(n=>n.id===selected.from),to=nodes.find(n=>n.id===selected.to);
      if(!from || !to || !to.referenceNodeIds?.includes(from.id))return null;
      const a=edge(from),b=edge(to,true);
      return <button data-connection-edge="true" className="pointer-events-auto absolute z-40 flex items-center gap-1.5 whitespace-nowrap rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs text-slate-600 shadow-lg" style={{left:(a.x+b.x)/2,top:(a.y+b.y)/2,transform:`translate(-50%,-50%) scale(${1/zoom})`}} onMouseDown={e=>e.stopPropagation()} onClick={disconnect}><Unplug size={13}/>断开连线</button>;
    })()}
    {nodes.filter(n=>!n.layerLocked && !n.layerHidden).flatMap(node=>[false,true].map(input=>{
      if(input?node.type!=='drawing':!canConnect(node))return null;
      const p=edge(node,input),active=sourceId===node.id || (input && targetId===node.id);
      return <button key={`${node.id}-${input}`} type="button" data-connection-port="true" aria-label={`${input?'连接到':'从此节点连线'} ${node.title || node.id}`} title={input?'拖入图片或提示词连线':'拖到下一节点；拖到空白处创建下一步'} className={`pointer-events-auto absolute z-30 flex items-center justify-center rounded-full border-0 bg-transparent p-0 transition-opacity duration-150 focus:outline-none focus-visible:opacity-100 hover:opacity-100 ${active?'opacity-100 text-indigo-600':'opacity-0 text-slate-500 hover:text-indigo-500'}`} style={{left:p.x+(input?-30:30)/zoom,top:p.y,width:64,height:64,transform:`translate(-50%,-50%) scale(${1/zoom})`}}
        onMouseDown={e=>{e.preventDefault();e.stopPropagation();setSelected(null);if(!input){setSourceId(node.id);setCursor(p);}}}
        onMouseUp={e=>{e.stopPropagation();if(input)connect(node);}}
        onClick={e=>{e.stopPropagation();if(input)connect(node);else if(!sourceId){setSourceId(node.id);setCursor(p);}}}>
        <span className={`flex h-7 w-7 items-center justify-center rounded-full border-[1.5px] bg-white shadow-sm ${active?'border-indigo-500 ring-4 ring-indigo-100':'border-current'}`}><Plus size={18} strokeWidth={1.5} aria-hidden="true" /></span>
      </button>;
    }))}
  </div>;
}
