import {useState} from 'react';
import {ArrowUp, ArrowDown, Eye, EyeOff, Lock, Unlock, Layers, ChevronDown, ChevronUp} from 'lucide-react';
import {proxyMediaUrl} from '@client/shared/api/apiClient';
import {useCanvasStore} from '../../store/useCanvasStore';
import {mergeCanvasLayers, orderedLayers, layerBounds} from '../../model/canvasLayers';
import type {CanvasNode, CanvasProject} from '../../model/types';

export function CanvasLayersPanel({project,selectedId,onSelect}:{project:CanvasProject;selectedId:string|null;onSelect:(id:string)=>void}) {
  const [chosen,setChosen]=useState('');
  const [collapsed,setCollapsed]=useState(false);
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState('');
  const store=useCanvasStore();
  const groups=[...new Set(project.nodes.map(n=>n.layerGroupId).filter((id):id is string=>!!id))];
  const selected=project.nodes.find(n=>n.id===selectedId);
  const group=selected?.layerGroupId || (groups.includes(chosen)?chosen:groups.at(-1));
  if(!group) return selected?.type==='image' && selected.imageUrl ? <button className="canvas-fixed-ui absolute left-4 bottom-20 z-40 rounded-xl border border-slate-200 dark:border-white/10 bg-white dark:bg-[#1B1B1E] text-slate-800 dark:text-slate-200 px-4 py-2 text-xs shadow" onMouseDown={e=>e.stopPropagation()} onClick={()=>{const id=crypto.randomUUID();setChosen(id);store.updateNode(project.id,selected.id,{layerGroupId:id,layerOrder:0});}}>创建图层组</button> : null;
  const layers=orderedLayers(project.nodes.filter(n=>n.layerGroupId===group));
  const active=layers.find(n=>n.id===selectedId);
  const patch=(node:CanvasNode,values:Partial<CanvasNode>)=>store.updateNode(project.id,node.id,values);
  const move=(node:CanvasNode,delta:number)=>{
    const index=layers.findIndex(n=>n.id===node.id), other=layers[index+delta];
    if(!other || node.layerLocked || other.layerLocked)return;
    store.patchNodes(project.id,{[node.id]:{layerOrder:other.layerOrder ?? index+delta},[other.id]:{layerOrder:node.layerOrder ?? index}});
  };
  const arrange=(stack:boolean)=>{
    const bounds=layerBounds(layers);
    let x=bounds.x;
    const patches:Record<string,Partial<CanvasNode>>={};
    layers.forEach(layer=>{if(!layer.layerLocked)patches[layer.id]={x:stack?bounds.x:x,y:bounds.y};x+=layer.width+40;});
    store.patchNodes(project.id,patches);
  };
  const merge=async()=>{
    if(busy)return;
    setBusy(true);setError('');
    try {
      const media=await mergeCanvasLayers(layers);
      if(useCanvasStore.getState().projects.some(p=>p.id===project.id))store.addNode(project.id,media);
    } catch(reason){setError(reason instanceof Error?reason.message:'合并失败');}
    finally{setBusy(false);}
  };
  return <aside aria-label="图层面板" className="canvas-fixed-ui absolute left-4 bottom-20 z-40 w-64 max-w-[calc(100%-2rem)] max-h-[calc(100%-10rem)] overflow-y-auto overscroll-contain rounded-2xl border border-slate-200 dark:border-white/10 bg-white/95 dark:bg-[#1B1B1E]/95 p-3 text-xs text-slate-700 dark:text-[#C7C7CC] shadow-lg dark:shadow-[0_16px_40px_rgba(0,0,0,0.6)] backdrop-blur" onMouseDown={e=>e.stopPropagation()} onWheel={e=>e.stopPropagation()} onKeyDown={e=>e.stopPropagation()}>
    <button className="flex w-full items-center gap-2 text-left font-medium text-slate-900 dark:text-white" onClick={()=>setCollapsed(!collapsed)}><Layers size={15}/>图层 <span className="ml-auto text-slate-400 dark:text-slate-500">{layers.length}</span>{collapsed?<ChevronDown size={14}/>:<ChevronUp size={14}/>}</button>
    {!collapsed && <>
      {groups.length>1 && <select aria-label="图层组" className="mt-3 w-full bg-transparent text-slate-800 dark:text-slate-200" value={group} onChange={e=>{setChosen(e.target.value);onSelect(project.nodes.find(n=>n.layerGroupId===e.target.value)!.id);}}>{groups.map((id,index)=><option key={id} value={id} className="dark:bg-[#1B1B1E]">拆分组 {index+1}</option>)}</select>}
      {selected?.type==='image' && selected.imageUrl && !selected.layerGroupId && <button className="mt-3 w-full rounded-lg bg-indigo-50 dark:bg-indigo-950/60 text-indigo-700 dark:text-indigo-300 p-2 font-medium" onClick={()=>patch(selected,{layerGroupId:group,layerOrder:Math.max(...layers.map(n=>n.layerOrder ?? 0))+1})}>将选中图片加入此组</button>}
      <div className="my-3 flex gap-2"><button className="rounded-lg bg-slate-100 dark:bg-white/10 hover:bg-slate-200 dark:hover:bg-white/20 text-slate-700 dark:text-slate-300 px-3 py-1.5 transition-colors" onClick={()=>arrange(true)}>叠放</button><button className="rounded-lg bg-slate-100 dark:bg-white/10 hover:bg-slate-200 dark:hover:bg-white/20 text-slate-700 dark:text-slate-300 px-3 py-1.5 transition-colors" onClick={()=>arrange(false)}>展开</button><span className="ml-auto self-center text-[10px] text-slate-400 dark:text-slate-500">上层在前</span></div>
      <div className="max-h-[38vh] space-y-1 overflow-y-auto">
        {[...layers].reverse().map((layer,index)=><div key={layer.id} className={`flex items-center gap-1 rounded-lg p-1.5 ${layer.id===selectedId?'bg-indigo-50 dark:bg-indigo-950/60 text-indigo-900 dark:text-indigo-200':'hover:bg-slate-50 dark:hover:bg-white/[0.06] text-slate-700 dark:text-slate-300'}`}>
          <button aria-label={`${layer.layerHidden?'显示':'隐藏'} ${layer.title}`} onClick={()=>patch(layer,{layerHidden:!layer.layerHidden})}>{layer.layerHidden?<EyeOff size={14}/>:<Eye size={14}/>}</button>
          <button aria-label={`选择 ${layer.title}`} onClick={()=>onSelect(layer.id)} className="flex min-w-0 flex-1 items-center gap-2 text-left"><img src={proxyMediaUrl(layer.imageUrl)} alt="" className="h-8 w-8 rounded border border-slate-200 dark:border-white/10 object-contain"/><span className="truncate">{layer.title || `图层 ${layers.length-index}`}</span></button>
          <button aria-label={`${layer.layerLocked?'解锁':'锁定'} ${layer.title}`} onClick={()=>patch(layer,{layerLocked:!layer.layerLocked})}>{layer.layerLocked?<Lock size={13}/>:<Unlock size={13}/>}</button>
          <div className="flex flex-col"><button aria-label={`上移 ${layer.title}`} disabled={index===0 || layer.layerLocked} onClick={()=>move(layer,1)} className="disabled:opacity-20"><ArrowUp size={12}/></button><button aria-label={`下移 ${layer.title}`} disabled={index===layers.length-1 || layer.layerLocked} onClick={()=>move(layer,-1)} className="disabled:opacity-20"><ArrowDown size={12}/></button></div>
        </div>)}
      </div>
      {active && <div className="mt-3 space-y-2 border-t border-slate-100 dark:border-white/10 pt-3">
        <input aria-label="图层名称" className="w-full rounded bg-slate-50 dark:bg-white/5 border border-transparent dark:border-white/10 text-slate-800 dark:text-slate-200 px-2 py-1.5 outline-none" value={active.title || ''} onChange={e=>patch(active,{title:e.target.value})}/>
        <label className="flex items-center gap-2 text-slate-700 dark:text-slate-300">不透明度<input aria-label="不透明度" type="range" className="min-w-0 flex-1" min="0" max="100" disabled={active.layerLocked} value={Math.round((active.layerOpacity ?? 1)*100)} onChange={e=>patch(active,{layerOpacity:Number(e.target.value)/100})}/><span>{Math.round((active.layerOpacity ?? 1)*100)}%</span></label>
        <div className="flex gap-2">{(['x','y'] as const).map(axis=><label key={axis} className="flex min-w-0 items-center gap-1 text-slate-700 dark:text-slate-300">{axis.toUpperCase()}<input aria-label={`图层 ${axis.toUpperCase()}`} type="number" disabled={active.layerLocked} className="w-full rounded bg-slate-50 dark:bg-white/5 border border-transparent dark:border-white/10 text-slate-800 dark:text-slate-200 p-1 outline-none" value={Math.round(active[axis])} onChange={e=>{if(e.target.value && Number.isFinite(e.target.valueAsNumber))patch(active,{[axis]:e.target.valueAsNumber});}}/></label>)}</div>
      </div>}
      <button className="mt-3 w-full rounded-lg bg-slate-900 py-2 text-white disabled:opacity-40 dark:bg-white dark:text-slate-950" disabled={busy || !layers.some(n=>!n.layerHidden && (n.layerOpacity ?? 1)>0)} onClick={merge}>{busy?'合并中…':'合并可见图层为副本'}</button>
      <p className="mt-2 text-[10px] text-slate-400">原图层保留；在画布上拖动、缩放选中图层。</p>
      {error && <p role="alert" className="mt-2 text-red-600">{error}</p>}
    </>}
  </aside>;
}
