import {drawingGeometry} from '../drawingGeometry';
import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { createPortal } from 'react-dom';
import { CanvasDrawingIcon, CanvasVideoIcon } from '@/shared/icons';
import { useCanvasStore } from '../store/useCanvasStore';
import type { CanvasNode } from '../types';

export const canReference = (node: CanvasNode) => Boolean(node.generationKind !== 'video' && node.imageUrl && !node.missingMedia && (node.type === 'image' || node.type === 'drawing'));
// Drawing outputs can be wired before generation; readiness is checked when generating.
const canConnect = (node: CanvasNode) => (node.type === 'drawing' && node.generationKind !== 'video') || canReference(node);
const getEdge = (node: CanvasNode, input = false) => ({
  x: node.x + (node.type === 'drawing' ? node.width / 2 + (input ? -1 : 1) * 140 : (input ? 0 : node.width)),
  y: node.y + (node.type === 'drawing' ? drawingGeometry(node).height/2 : node.height / 2),
});
const getPort = (node: CanvasNode, input = false, zoom = 1) => {
  const edge = getEdge(node, input);
  return {...edge, x: edge.x + (input ? -1 : 1) * 44 / zoom};
};
const curve = (a: {x: number; y: number}, b: {x: number; y: number}) => {
  const bend = Math.max(60, Math.abs(b.x - a.x) / 2);
  return `M ${a.x} ${a.y} C ${a.x + bend} ${a.y}, ${b.x - bend} ${b.y}, ${b.x} ${b.y}`;
};

export function findConnectionTarget(nodes:CanvasNode[],sourceId:string,point:{x:number;y:number},zoom:number) {
  const tolerance=14/Math.max(zoom,0.1);
  return [...nodes].reverse().find(node=>{
    if(node.id===sourceId || node.type!=='drawing' || node.layerHidden || node.layerLocked)return false;
    const left=node.x+node.width/2-140;
    return point.x>=left-tolerance && point.x<=left+280+tolerance && point.y>=node.y-tolerance && point.y<=node.y+drawingGeometry(node).height+tolerance;
  });
}

export function CanvasConnections({nodes, projectId, zoom}: {nodes: CanvasNode[]; projectId: string; zoom: number}) {
  const port = (node: CanvasNode, input = false) => getPort(node, input, Math.max(zoom, 0.1));
  const [hoveredPort, setHoveredPort] = useState<string | null>(null);
  const root = useRef<HTMLDivElement>(null);
  const [sourceId, setSourceId] = useState<string | null>(null);
  const [cursor, setCursor] = useState<{x: number; y: number} | null>(null);
  const [menu, setMenu] = useState<{x: number; y: number; worldX: number; worldY: number} | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const dismiss = () => {setMenu(null); setSourceId(null); setCursor(null);};
  const source = nodes.find(node => node.id === sourceId);
  const updateNode = useCanvasStore(s => s.updateNode);
  useEffect(() => {
    setSourceId(null); setCursor(null); setMenu(null); setHoveredPort(null);
  }, [projectId]);
  useEffect(() => {
    if (!menu) return;
    menuRef.current?.querySelector('button')?.focus();
    const outside = (event: PointerEvent) => {if (!menuRef.current?.contains(event.target as Node)) dismiss();};
    document.addEventListener('pointerdown', outside);
    return () => document.removeEventListener('pointerdown', outside);
  }, [menu]);
  useEffect(() => {
    if (!sourceId) return;
    const move = (event: MouseEvent) => {
      if (menu) return;
      const rect = root.current?.getBoundingClientRect();
      if (rect) {
        const point={x:(event.clientX-rect.left)/zoom,y:(event.clientY-rect.top)/zoom};
        const target=findConnectionTarget(nodes,sourceId,point,zoom);
        setCursor(target?getEdge(target,true):point);
      }
    };
    const cancel = (event: KeyboardEvent) => { if (event.key === 'Escape') dismiss(); };
    const up = (event: MouseEvent) => {
      if (menu || (event.target as Element)?.closest?.('[data-connection-port]')) return;
      const element = event.target as Element;
      const rect = root.current?.getBoundingClientRect();
      if(event.button===0 && rect && !element.closest?.('.canvas-fixed-ui, input, textarea, [contenteditable="true"]')) {
        const point={x:(event.clientX-rect.left)/zoom,y:(event.clientY-rect.top)/zoom};
        const target=findConnectionTarget(nodes,sourceId,point,zoom);
        if(target){connect(target);return;}
      }
      if (event.button === 0 && rect && element.closest?.('[data-testid="canvas-viewport"]') && !element.closest('.canvas-node-card, .canvas-fixed-ui, button, input, textarea')) {
        const worldX = (event.clientX - rect.left) / zoom;
        const worldY = (event.clientY - rect.top) / zoom;
        setCursor({x:worldX,y:worldY});
        setMenu({x:event.clientX,y:event.clientY,worldX,worldY});
      } else dismiss();
    };
    window.addEventListener('mousemove', move);
    window.addEventListener('mouseup', up, true);
    window.addEventListener('keydown', cancel);
    return () => { window.removeEventListener('mousemove', move); window.removeEventListener('mouseup', up, true); window.removeEventListener('keydown', cancel); };
  }, [sourceId, zoom, menu, nodes, projectId]);
  const connect = (target: CanvasNode) => {
    if (!source || source.id === target.id || !canConnect(source)) return;
    // Reject cycles even when generated drawing nodes are used as references.
    const seen = new Set<string>();
    const reachesTarget = (id: string): boolean => {
      if (id === target.id) return true;
      if (seen.has(id)) return false;
      seen.add(id);
      return (nodes.find(node => node.id === id)?.referenceNodeIds || []).some(reachesTarget);
    };
    if (reachesTarget(source.id)) { dismiss(); return; }
    updateNode(projectId, target.id, {referenceNodeIds: [...new Set([...(target.referenceNodeIds || []), source.id])]});
    setSourceId(null); setCursor(null);
  };
  return <div ref={root} className="pointer-events-none absolute inset-0">
    {menu && source && createPortal(<div ref={menuRef} role="menu" aria-label="添加节点" className="pointer-events-auto fixed z-[200] w-44 rounded-2xl border border-slate-200 bg-white p-2 text-slate-700 shadow-lg" style={{left:Math.max(8,Math.min(menu.x,window.innerWidth-184)),top:Math.max(8,Math.min(menu.y,window.innerHeight-100))}}
      onMouseDown={event => event.stopPropagation()} onMouseUp={event => event.stopPropagation()} onClick={event => event.stopPropagation()} onDoubleClick={event => event.stopPropagation()}>
      <p className="px-3 py-1.5 text-[11px] text-slate-500">添加节点</p>
      <button type="button" role="menuitem" className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-xs hover:bg-indigo-50 focus-visible:bg-indigo-50 focus-visible:outline-none" onClick={() => {
        const currentSource = useCanvasStore.getState().projects.find(project => project.id === projectId)?.nodes.find(node => node.id === source.id);
        if (currentSource && canConnect(currentSource)) {
          useCanvasStore.getState().addNode(projectId, {type:'drawing',title:'绘图',x:menu.worldX - 140 + 44 / Math.max(zoom, 0.1),y:menu.worldY - 140,width:560,height:500,referenceNodeIds:[source.id]});
        }
        dismiss();
      }}><CanvasDrawingIcon />绘图</button>
      <button type="button" role="menuitem" className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-xs hover:bg-indigo-50 focus-visible:bg-indigo-50 focus-visible:outline-none" onClick={() => {
        const currentSource = useCanvasStore.getState().projects.find(project => project.id === projectId)?.nodes.find(node => node.id === source.id);
        if (currentSource && canConnect(currentSource)) {
          useCanvasStore.getState().addNode(projectId, {type:'drawing',generationKind:'video',title:'视频生成',x:menu.worldX - 140 + 44 / Math.max(zoom, 0.1),y:menu.worldY - 140,width:560,height:500,referenceNodeIds:[source.id]});
        }
        dismiss();
      }}><CanvasVideoIcon />视频生成</button>
    </div>, document.body)}
    <svg className="absolute left-0 top-0 h-px w-px overflow-visible" aria-label="画布参考连线">
      {nodes.filter(node => node.type === 'drawing' || node.referenceNodeIds?.length).flatMap(target => (target.referenceNodeIds || []).map(id => {
        const from = nodes.find(node => node.id === id);
        if (!from) return null;
        return <path key={`${id}-${target.id}`} d={curve(getEdge(from), getEdge(target, true))} fill="none" stroke={canReference(from) ? '#94a3b8' : '#f59e0b'} strokeWidth={2} vectorEffect="non-scaling-stroke" />;
      }))}
      {source && cursor && <path d={curve(port(source), cursor)} fill="none" stroke="#818cf8" strokeWidth={2} strokeDasharray="5 4" vectorEffect="non-scaling-stroke" />}
    </svg>
    {nodes.flatMap(node => [false, true].map(input => {
      if (input ? node.type !== 'drawing' : !canConnect(node)) return null;
      const portId = `${node.id}-${input}`;
      const position = port(node, input);
      return <button key={`${node.id}-${input}`} type="button" data-connection-port="true" aria-label={`${input ? '连接参考图到' : '从此图片连线'} ${node.title || node.id}`} title={input ? '拖入连线或先点击图片输出端，再点击此处' : '拖到绘图节点左侧，或点击后选择目标；Esc 取消'}
        className={`group/port pointer-events-auto absolute z-30 flex items-center justify-center rounded-full border-0 bg-transparent p-0 [--canvas-handle-bg:#fff] [--canvas-handle-icon:currentColor] transition-colors focus-visible:outline-2 focus-visible:outline-indigo-400 ${sourceId ? 'text-indigo-500' : 'text-slate-600 hover:text-indigo-600'}`}
        style={{left: position.x, top: position.y, width:80, height:80, '--port-opacity': hoveredPort === portId ? 1 : 0, transform:`translate(-50%, -50%) scale(${1 / Math.max(zoom, 0.1)})`} as CSSProperties}
        onMouseEnter={() => setHoveredPort(portId)}
        onMouseMove={event => {
          const button = event.currentTarget;
          if (sourceId || event.buttons || window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) {
            button.style.setProperty('--handle-offset-x', '0px');
            button.style.setProperty('--handle-offset-y', '0px');
            return;
          }
          const rect = button.getBoundingClientRect();
          const dx = event.clientX - rect.left - rect.width / 2;
          const dy = event.clientY - rect.top - rect.height / 2;
          const distance = Math.hypot(dx, dy);
          const strength = distance ? Math.min(0.8, 24 / distance) : 0;
          button.style.setProperty('--handle-offset-x', `${dx * strength}px`);
          button.style.setProperty('--handle-offset-y', `${dy * strength}px`);
        }}
        onMouseLeave={event => {
          setHoveredPort(current => current === portId ? null : current);
          event.currentTarget.style.setProperty('--handle-offset-x', '0px');
          event.currentTarget.style.setProperty('--handle-offset-y', '0px');
        }}
        onBlur={event => {
          event.currentTarget.style.setProperty('--handle-offset-x', '0px');
          event.currentTarget.style.setProperty('--handle-offset-y', '0px');
        }}
        onMouseDown={event => { event.preventDefault(); event.stopPropagation(); event.currentTarget.style.setProperty('--handle-offset-x', '0px'); event.currentTarget.style.setProperty('--handle-offset-y', '0px'); if (!input) {setSourceId(node.id); setCursor(position);} }}
        onMouseUp={event => {event.stopPropagation(); if (input) connect(node);}}
        onClick={event => {event.stopPropagation(); if (input) connect(node); else {setSourceId(node.id); setCursor(position);} }}>
        <svg width="34" height="34" viewBox="0 0 20 20" fill="none" aria-hidden="true" className="pointer-events-none shrink-0 opacity-[var(--port-opacity)] group-focus-visible/port:opacity-100 transition-[transform,opacity] duration-200 ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:transition-none" style={{transform: sourceId ? 'translate(0px, 0px)' : 'translate(var(--handle-offset-x, 0px), var(--handle-offset-y, 0px))'}}>
          <circle cx="10" cy="10" r="9.35" fill="var(--canvas-handle-bg)" />
          <circle cx="10" cy="10" r="9.35" stroke="var(--canvas-handle-icon)" strokeWidth="1.35" />
          <path d="M10 6.5v7M6.5 10h7" stroke="var(--canvas-handle-icon)" strokeWidth="1.5" strokeLinecap="round" />
        </svg>
      </button>;
    }))}
  </div>;
}
