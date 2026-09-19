import { runLayerDecompositionTask } from '../layerDecompositionTask';
import {useRef, useState} from 'react';
import {createPortal} from 'react-dom';
import {Layers, X, Undo2, Redo2} from 'lucide-react';
import {apiFetch, proxyMediaUrl} from '@/shared/api/apiClient';
import type {CanvasNode} from '../types';

async function prepareImage(url: string) {
  const response = await apiFetch(proxyMediaUrl(url));
  if (!response.ok) throw new Error('无法读取原图');
  const blob = await response.blob();
  if (blob.size > 30 * 1024 * 1024) throw new Error('原图不能超过 30MB');
  const bitmap = await createImageBitmap(blob);
  try {
    const pixels = bitmap.width * bitmap.height;
    if (pixels < 512 * 512 || pixels > 6000 * 6000 || bitmap.width / bitmap.height > 16 || bitmap.height / bitmap.width > 16) throw new Error('图片总像素需在 512×512 至 6000×6000 之间，宽高比不超过 16:1');
    const canvas = document.createElement('canvas'); canvas.width=bitmap.width; canvas.height=bitmap.height;
    const context = canvas.getContext('2d'); if (!context) throw new Error('无法读取图片像素');
    context.drawImage(bitmap,0,0);
    const data = canvas.toDataURL('image/png');
    if (data.length > 42_000_000) throw new Error('转换后的 PNG 超过 30MB，请缩小图片');
    return data;
  } finally {bitmap.close();}
}
export function CanvasLayerDecomposition({node, projectId}: {node: CanvasNode; projectId: string}) {
  const [open,setOpen]=useState(false);
  const [host,setHost]=useState<HTMLElement | null>(null);
  const busy=false;

  const [prompt,setPrompt]=useState('');
  type Box = {x: number; y: number; w: number; h: number};
  const [boxes,setBoxes]=useState<Box[]>([]);
  const [redo,setRedo]=useState<Box[]>([]);
  const [draft,setDraft]=useState<Box | null>(null);
  const start=useRef<{x:number;y:number} | null>(null);
  const lock=useRef(false);
  const operation=useRef('');
  const run=async () => {
    if (lock.current || !node.imageUrl) return;
    lock.current=true;
    const source={...node};
    const text=[prompt.trim() || '自动拆分图片中的主要元素，保留底图和独立透明图层', ...boxes.map((box,index)=>`重点拆分区域${index+1}中的物体：左上角(${Math.round(box.x*100)}%, ${Math.round(box.y*100)}%)，右下角(${Math.round((box.x+box.w)*100)}%, ${Math.round((box.y+box.h)*100)}%)，坐标相对于原图宽高。`)].join('\n');
    const key=operation.current || crypto.randomUUID(); operation.current=key;
    setOpen(false);
    await runLayerDecompositionTask(projectId,source,()=>prepareImage(source.imageUrl!),text,key);
    lock.current=false;
  };
  return <>
    <button
      type="button"
      aria-label="图层分离"
      title="图层分离"
      disabled={!node.imageUrl || node.missingMedia}
      onClick={event => {
        event.stopPropagation();
        setHost(event.currentTarget.closest<HTMLElement>('.canvas-node-card'));
        setOpen(true);
      }}
      className="group/btn relative w-8 h-8 rounded-xl hover:bg-slate-100 text-slate-700 hover:text-slate-900 transition-colors flex items-center justify-center cursor-pointer disabled:opacity-30 disabled:pointer-events-none active:scale-95"
    >
      <Layers className="w-4 h-4" />
      <span className="absolute -top-9 left-1/2 -translate-x-1/2 px-2.5 py-1 rounded-lg bg-white/98 text-slate-800 text-[11px] font-medium opacity-0 group-hover/btn:opacity-100 transition-all duration-150 scale-95 group-hover/btn:scale-100 pointer-events-none whitespace-nowrap shadow-[0_4px_16px_rgba(0,0,0,0.08)] border border-slate-200/90 z-40">
        图层分离
      </span>
    </button>
    {open && host && createPortal(<div data-layer-editor className="pointer-events-none absolute left-0 top-0 z-50 w-full" style={{height:node.height}} onMouseDown={event=>event.stopPropagation()} onClick={event=>event.stopPropagation()} onKeyDown={event=>{event.stopPropagation();if(event.key==='Escape' && !busy)setOpen(false);}}>
      <section role="region" aria-label="图层分离" className="relative h-full w-full text-slate-700">
        <header className="pointer-events-auto absolute -top-16 left-1/2 z-10 flex -translate-x-1/2 items-center gap-3 whitespace-nowrap rounded-2xl border border-slate-200 bg-white px-3 py-2.5 shadow-sm">
          <button autoFocus type="button" aria-label="关闭图层分离" disabled={busy} onClick={()=>setOpen(false)} className="rounded-lg p-1 hover:bg-slate-100"><X className="h-4 w-4" /></button>
          <span className="h-5 w-px bg-slate-200" /><h2 className="flex items-center gap-2 text-xs font-medium"><Layers className="h-4 w-4" />图层分离</h2><span className="h-5 w-px bg-slate-200" />
          <button type="button" aria-label="撤销框选" disabled={busy || !boxes.length} onClick={()=>{setRedo([...redo,boxes[boxes.length-1]]);setBoxes(boxes.slice(0,-1));operation.current='';}} className="p-1 disabled:opacity-30"><Undo2 className="h-4 w-4" /></button>
          <button type="button" aria-label="重做框选" disabled={busy || !redo.length} onClick={()=>{setBoxes([...boxes,redo[redo.length-1]]);setRedo(redo.slice(0,-1));operation.current='';}} className="p-1 disabled:opacity-30"><Redo2 className="h-4 w-4" /></button>
        </header>
        <div aria-label="框选拆分区域" className="pointer-events-auto absolute inset-0 touch-none select-none" style={{cursor:busy?'default':'crosshair'}}
          onPointerDown={event=>{
            event.stopPropagation();
            if(busy || event.button!==0)return;
            const rect=event.currentTarget.getBoundingClientRect();
            start.current={x:(event.clientX-rect.left)/rect.width,y:(event.clientY-rect.top)/rect.height};
            setDraft({...start.current,w:0,h:0});event.currentTarget.setPointerCapture(event.pointerId);
          }}
          onPointerMove={event=>{
            if(!start.current)return;
            const rect=event.currentTarget.getBoundingClientRect();
            const x=Math.max(0,Math.min(1,(event.clientX-rect.left)/rect.width));const y=Math.max(0,Math.min(1,(event.clientY-rect.top)/rect.height));
            setDraft({x:Math.min(x,start.current.x),y:Math.min(y,start.current.y),w:Math.abs(x-start.current.x),h:Math.abs(y-start.current.y)});
          }}
          onPointerUp={()=>{if(draft && draft.w>0.01 && draft.h>0.01){setBoxes([...boxes,draft]);setRedo([]);operation.current='';}start.current=null;setDraft(null);}}
          onPointerCancel={()=>{start.current=null;setDraft(null);}}>
          {!boxes.length && !draft && <div className="pointer-events-none absolute inset-0 flex items-center justify-center"><span className="rounded-lg bg-black/65 px-3 py-2 text-xs text-white">框选你想要拆分的物体</span></div>}
          {[...boxes,...(draft?[draft]:[])].map((box,index)=><div key={index} className="pointer-events-none absolute border-2 border-indigo-500 bg-indigo-400/15" style={{left:`${box.x*100}%`,top:`${box.y*100}%`,width:`${box.w*100}%`,height:`${box.h*100}%`}}><span className="absolute left-0 top-0 bg-indigo-500 px-1 text-[10px] text-white">{index+1}</span></div>)}
        </div>
        <div className="pointer-events-auto absolute top-full left-1/2 mt-3 w-[420px] -translate-x-1/2 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <p className="mb-3 text-xs font-medium">图层分离</p>
          <textarea aria-label="拆分要求" disabled={busy} value={prompt} onChange={e=>{setPrompt(e.target.value);operation.current='';}} placeholder="描述或框选希望拆分的图层，留空将自动识别并拆分" className="h-20 w-full resize-none rounded-xl bg-slate-100 p-3 text-xs outline-none focus:ring-1 focus:ring-indigo-300" />
        <footer className="mt-3 flex gap-2"><button type="button" onClick={()=>setOpen(false)} className="flex-1 rounded-lg bg-slate-100 px-4 py-2 text-xs">取消</button><button type="button" onClick={run} className="flex-1 rounded-lg bg-slate-900 px-4 py-2 text-xs text-white">拆分</button></footer>
        </div>
      </section>
    </div>,host)}
  </>;
}
