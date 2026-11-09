import { useState, useRef, useEffect, useCallback, type RefObject, type MouseEvent as ReactMouseEvent } from 'react';
import { useCanvasStore } from '../store/useCanvasStore';
import { nodeBounds } from '../model/canvasGraph';
import { canvasGroupSelection, expandCanvasGroups } from '../model/canvasAlignment';
import { computeSnapGuides, type AlignmentGuide } from './useCanvasSnapping';
import type { CanvasNode, CanvasProject } from '../model/types';

export const canvasZoomMin = 0.15;
export const canvasZoomMax = 2;

export type { AlignmentGuide };
type Point = {x:number; y:number};
type Box = Point & {width:number; height:number};
const intersects = (a:Box,b:Box) => a.x <= b.x+b.width && a.x+a.width >= b.x && a.y <= b.y+b.height && a.y+a.height >= b.y;
export function fitCanvasNodes(nodes: CanvasNode[], width: number, height: number) {
  const valid = nodes.filter(n => !n.layerHidden && [n.x,n.y,n.width,n.height].every(Number.isFinite)).map(nodeBounds);
  if (!valid.length) return {pan:{x:0,y:0},zoom:1};
  const left=Math.min(...valid.map(n=>n.x)), top=Math.min(...valid.map(n=>n.y))-32;
  const right=Math.max(...valid.map(n=>n.x+n.width)), bottom=Math.max(...valid.map(n=>n.y+n.height));
  const availableWidth=Math.max(100,width-180), availableHeight=Math.max(100,height-200);
  const zoom=Math.max(0.1,Math.min(1,availableWidth/(right-left),availableHeight/(bottom-top)));
  return {zoom,pan:{x:width/2-(left+right)/2*zoom,y:80+availableHeight/2-(top+bottom)/2*zoom}};
}

export function useCanvasGestures(currentProject: CanvasProject | undefined, _updateNode: ReturnType<typeof useCanvasStore.getState>['updateNode'], onBackgroundSelect: () => void, viewportRef: RefObject<HTMLDivElement | null>) {
  const [pan,setPan]=useState<Point>({x:0,y:0}), [zoom,setZoom]=useState(1);
  const [isPanning,setIsPanning]=useState(false), [handTool,setHandTool]=useState(false), [spaceHeld,setSpaceHeld]=useState(false);
  const [selectedNodeIds,setSelectedNodeIds]=useState<string[]>([]);
  const [selectionBox,setSelectionBox]=useState<Box|null>(null);
  const [dragPositions,setDragPositions]=useState<Record<string,Point>>({});
  const [draggingNodeId,setDraggingNodeId]=useState<string|null>(null);
  const [alignmentGuides, setAlignmentGuides]=useState<AlignmentGuide[]>([]);
  const live=useRef({pan,zoom});
  const renderedView=useRef(live.current);
  const readView=useCallback(()=>live.current,[]);
  const viewFrame=useRef<number | undefined>(undefined);
  const viewSave=useRef<number | undefined>(undefined);
  const projectId=currentProject?.id;
  const paintView=useCallback(()=>{
    const viewport=viewportRef.current;
    if(!viewport)return;
    const {pan,zoom}=live.current;
    const world=viewport.querySelector<HTMLElement>('[data-native-canvas-world]');
    if(world)world.style.transform=`translate(${pan.x}px, ${pan.y}px) scale(${zoom})`;
    const grid=viewport.querySelector<SVGPatternElement>('[data-canvas-world-grid] pattern');
    if(grid){
      const spacing=20*zoom;
      grid.setAttribute('x',String(pan.x%spacing));
      grid.setAttribute('y',String(pan.y%spacing));
      grid.setAttribute('width',String(spacing));
      grid.setAttribute('height',String(spacing));
      const dot=grid.firstElementChild;
      dot?.setAttribute('cx',String(zoom/2));
      dot?.setAttribute('cy',String(zoom/2));
      dot?.setAttribute('r',String(zoom/2));
    }
    const rendered=renderedView.current;
    const ratio=zoom/rendered.zoom;
    if (ratio<0.8 || Math.abs(pan.x-rendered.pan.x*ratio)>210 || Math.abs(pan.y-rendered.pan.y*ratio)>210) {
      renderedView.current=live.current;
      setPan(pan);
      setZoom(zoom);
    }

  },[viewportRef]);
  const flushView=useCallback(()=>{
    if(viewSave.current===undefined)return;
    window.clearTimeout(viewSave.current);
    viewSave.current=undefined;
    const view=live.current;
    renderedView.current=view;
    setPan(view.pan);
    setZoom(view.zoom);
    if(projectId)useCanvasStore.getState().updateViewport(projectId,{...view.pan,zoom:view.zoom});
  },[projectId]);
  const cleanup=useRef<(() => void)|null>(null);
  const suppressClick=useRef(false);
  const suppressPromptPan=useRef(false);
  const fitted=useRef<string|null>(null);
  const isHandMode=handTool || spaceHeld;
  const selectedNodeId=selectedNodeIds.at(-1) || null;
  const projectNodes=()=>useCanvasStore.getState().projects.find(project=>project.id===currentProject?.id)?.nodes || currentProject?.nodes || [];
  const groupSelection=(id:string)=>{
    const ids=canvasGroupSelection(projectNodes(),id);
    return [...ids.filter(memberId=>memberId!==id),...(ids.includes(id)?[id]:[])];
  };
  const setSelectedNodeId=(id:string|null) => {
    suppressPromptPan.current=false;
    setSelectedNodeIds(id ? groupSelection(id) : []);
  };
  const toggleGroupSelection=(id:string)=>{
    const group=groupSelection(id), members=new Set(group);
    setSelectedNodeIds(ids=>group.length && group.every(memberId=>ids.includes(memberId))
      ? ids.filter(memberId=>!members.has(memberId)) : [...new Set([...ids,...group])]);
  };
  const world=(x:number,y:number) => {
    const rect=viewportRef.current?.getBoundingClientRect();
    return {x:(x-(rect?.left || 0)-live.current.pan.x)/live.current.zoom,y:(y-(rect?.top || 0)-live.current.pan.y)/live.current.zoom};
  };
  const applyView=useCallback((view:{pan:Point;zoom:number})=>{
    const previous=live.current;
    if(previous.pan.x===view.pan.x && previous.pan.y===view.pan.y && previous.zoom===view.zoom)return;
    live.current=view;
    viewFrame.current ??= requestAnimationFrame(()=>{
      viewFrame.current=undefined;
      paintView();
    });
    window.clearTimeout(viewSave.current);
    viewSave.current=window.setTimeout(flushView,150);
  },[flushView,paintView]);
  const panForPrompt = useCallback((x: number, y: number) => {
    if (cleanup.current || suppressPromptPan.current || viewFrame.current !== undefined) return;
    const { pan, zoom } = live.current;
    applyView({ pan: { x: pan.x + x, y: pan.y + y }, zoom });
  }, [applyView]);
  const zoomAt=useCallback((next:number, point?:Point) => {
    const previous=live.current;
    const z=Math.max(canvasZoomMin,Math.min(canvasZoomMax,next));
    const anchor=point || {x:(viewportRef.current?.clientWidth || 900)/2,y:(viewportRef.current?.clientHeight || 600)/2};
    const nextPan={x:anchor.x-(anchor.x-previous.pan.x)*z/previous.zoom,y:anchor.y-(anchor.y-previous.pan.y)*z/previous.zoom};
    applyView({pan:nextPan,zoom:z});
  },[applyView,viewportRef]);
  const handleZoom=useCallback((delta:number)=>zoomAt(live.current.zoom+delta),[zoomAt]);
  const handleResetView=useCallback(()=>{
    onBackgroundSelect();
    const viewport=viewportRef.current;
    const view=fitCanvasNodes(currentProject?.nodes || [],viewport?.clientWidth || 900,viewport?.clientHeight || 600);
    applyView(view);
  },[currentProject,viewportRef,onBackgroundSelect,applyView]);
  useEffect(()=>{
    cleanup.current?.();setIsPanning(false);suppressClick.current=false;suppressPromptPan.current=false;setSelectedNodeIds([]);setDragPositions({});setDraggingNodeId(null);setSelectionBox(null);setAlignmentGuides([]);setPan({x:0,y:0});setZoom(1);fitted.current=null;
    window.addEventListener('pagehide',flushView);
    return ()=>{
      window.removeEventListener('pagehide',flushView);
      cleanup.current?.();
      if(viewFrame.current!==undefined)cancelAnimationFrame(viewFrame.current);
      viewFrame.current=undefined;
      flushView();
    };
  },[flushView]);
  useEffect(()=>{
    if (!currentProject || fitted.current===currentProject.id) return;
    // Do not recenter when creating the first node in an empty project.
    fitted.current=currentProject.id;
    const saved=currentProject.viewport;
    if(saved && [saved.x,saved.y,saved.zoom].every(Number.isFinite) && saved.zoom>=0.1 && saved.zoom<=2.5){
      const view={pan:{x:saved.x,y:saved.y},zoom:saved.zoom};
      live.current=view;renderedView.current=view;setPan(view.pan);setZoom(view.zoom);
    }else if(currentProject.nodes.length) handleResetView();
    else {live.current={pan:{x:0,y:0},zoom:1};renderedView.current=live.current;}
  },[currentProject,handleResetView]);
  useEffect(()=>{
    const existing = new Set(currentProject?.nodes.filter(node=>!node.layerHidden).map(node=>node.id));
    setSelectedNodeIds(ids=>ids.every(id=>existing.has(id))?ids:ids.filter(id=>existing.has(id)));
  },[currentProject?.nodes]);
  useEffect(()=>{
    const down=(event:KeyboardEvent)=>{
      if(!viewportRef.current?.getClientRects().length)return;
      if(event.defaultPrevented || event.isComposing || (event.target as HTMLElement)?.closest?.('input,textarea,select,[contenteditable="true"],[role="dialog"],[role="menu"]'))return;
      if(event.ctrlKey || event.metaKey){
        if(['+','=','-','0','1'].includes(event.key)){
          event.preventDefault();if(event.key==='0')handleResetView();else if(event.key==='1')zoomAt(1);else handleZoom(event.key==='-'?-0.1:0.1);
        }return;
      }
      if(event.code==='Space'){event.preventDefault();if(!event.repeat)setSpaceHeld(true);}
      if(event.key.toLowerCase()==='h')setHandTool(true);
      if(event.key.toLowerCase()==='v')setHandTool(false);
    };
    const up=(event:KeyboardEvent)=>{if(event.code==='Space')setSpaceHeld(false);};
    const blur=()=>setSpaceHeld(false);
    window.addEventListener('keydown',down);window.addEventListener('keyup',up);window.addEventListener('blur',blur);
    return()=>{window.removeEventListener('keydown',down);window.removeEventListener('keyup',up);window.removeEventListener('blur',blur);};
  },[handleResetView,handleZoom,setHandTool,setSpaceHeld,viewportRef,zoomAt]);
  const track=(move:(e:MouseEvent)=>void, finish:()=>void, buttons=1)=>{
    cleanup.current?.();
    const end=()=>{window.removeEventListener('mousemove',guardedMove);window.removeEventListener('mouseup',end);window.removeEventListener('blur',end);cleanup.current=null;finish();};
    const guardedMove=(event:MouseEvent)=>{if(!(event.buttons & buttons)){end();return;}move(event);};
    window.addEventListener('mousemove',guardedMove);window.addEventListener('mouseup',end);window.addEventListener('blur',end);
    cleanup.current=()=>{window.removeEventListener('mousemove',guardedMove);window.removeEventListener('mouseup',end);window.removeEventListener('blur',end);};
  };
  const startPan=(event:ReactMouseEvent)=>{
    event.preventDefault();setIsPanning(true);
    const start={x:event.clientX-live.current.pan.x,y:event.clientY-live.current.pan.y};
    track(e=>applyView({pan:{x:e.clientX-start.x,y:e.clientY-start.y},zoom:live.current.zoom}),()=>{
      setIsPanning(false);
      flushView();
    },[1,4,2][event.button] || 1);
  };
  const handleMouseDownCanvas=(event:ReactMouseEvent)=>{
    if((event.target as HTMLElement).closest('.canvas-node-card,button,input,textarea,.canvas-fixed-ui,[data-connection-edge]'))return;
    if(isHandMode || event.button===1 || event.button===2 || (event.button===0 && !event.metaKey && !event.ctrlKey && !event.shiftKey)){
      if(event.button===0 && !isHandMode){onBackgroundSelect();setSelectedNodeIds([]);}
      startPan(event);return;
    }
    if(event.button!==0)return;
    event.preventDefault();onBackgroundSelect();
    const start=world(event.clientX,event.clientY), keep=event.shiftKey?selectedNodeIds:[];
    setSelectedNodeIds(keep);
    track(e=>{
      const end=world(e.clientX,e.clientY);
      const box={x:Math.min(start.x,end.x),y:Math.min(start.y,end.y),width:Math.abs(end.x-start.x),height:Math.abs(end.y-start.y)};
      setSelectionBox(box);
      const nodes=projectNodes();
      setSelectedNodeIds(expandCanvasGroups(nodes,[...keep,...nodes.filter(n=>!n.layerHidden && n.type!=='frame' && intersects(box,nodeBounds(n))).map(n=>n.id)]));
    },()=>setSelectionBox(null));
  };
  const handleNodeDragStart=(node:CanvasNode,event:ReactMouseEvent)=>{
    if(event.button===2)return;
    if(isHandMode || event.button===1){event.stopPropagation();startPan(event);return;}
    if(event.button!==0)return;
    if((event.target as HTMLElement).closest('button,input,textarea,select,a,audio,[contenteditable]:not([contenteditable="false"])'))return;
    if(node.layerHidden)return;
    suppressClick.current=false;
    event.preventDefault();event.stopPropagation();
    if(event.shiftKey || event.metaKey || event.ctrlKey){toggleGroupSelection(node.id);suppressClick.current=true;return;}
    const nodes=projectNodes();
    let ids=selectedNodeIds.includes(node.id)?expandCanvasGroups(nodes,selectedNodeIds):groupSelection(node.id);
    if(node.type==='frame'){
      const area=nodeBounds(node);
      ids=expandCanvasGroups(nodes,[...ids,...nodes.filter(n=>{const b=nodeBounds(n);return n.id!==node.id && !n.layerHidden && b.x>=area.x && b.y>=area.y && b.x+b.width<=area.x+area.width && b.y+b.height<=area.y+area.height;}).map(n=>n.id)]);
    }
    setSelectedNodeIds(ids);
    if(node.layerLocked)return;
    const selected=new Set(ids);
    const moving=nodes.filter(n=>selected.has(n.id) && !n.layerLocked && !n.layerHidden);
    const start={x:event.clientX,y:event.clientY}, dragZoom=live.current.zoom;let latest:Record<string,Point>={};let moved=false;
    track(e=>{
      const rawDx=(e.clientX-start.x)/dragZoom, rawDy=(e.clientY-start.y)/dragZoom;
      if(!moved && Math.hypot(rawDx,rawDy)*dragZoom<3)return;
      // A selected node's editor can reappear after dragging. Keep the drop point under the pointer.
      suppressPromptPan.current=true;
      moved=true;setDraggingNodeId(node.id);

      // Smart snapping calculation
      const snap = computeSnapGuides(moving, nodes, rawDx, rawDy, dragZoom);
      setAlignmentGuides(snap.guides);

      latest=Object.fromEntries(moving.map(n=>[n.id,{x:n.x+Math.round(snap.dx),y:n.y+Math.round(snap.dy)}]));
      setDragPositions(latest);
    },()=>{
      setAlignmentGuides([]);
      if(moved && currentProject)useCanvasStore.getState().patchNodes(currentProject.id,latest);
      suppressClick.current=moved;setDraggingNodeId(null);setDragPositions({});
    });
  };
  const handleNodeClick=(node:CanvasNode,event:ReactMouseEvent)=>{
    if(suppressClick.current){suppressClick.current=false;return false;}
    if(event.shiftKey || event.metaKey || event.ctrlKey){toggleGroupSelection(node.id);return false;}
    setSelectedNodeId(node.id);
    return true;
  };
  const handleWheel=(event:globalThis.WheelEvent)=>{
    if(cleanup.current || event.defaultPrevented)return;
    const target=event.target;
    if(!(target instanceof Element) || target.closest('input,textarea,select,[contenteditable="true"],.canvas-fixed-ui,[data-drawing-settings],[role="dialog"]'))return;
    const viewport=viewportRef.current;
    if(!viewport)return;
    for(let element:Element|null=target;element && element!==viewport;element=element.parentElement){
      if(element.scrollHeight>element.clientHeight && /^(auto|scroll)$/.test(getComputedStyle(element).overflowY))return;
    }
    if(event.cancelable)event.preventDefault();
    const rect=viewport.getBoundingClientRect();
    const units=event.deltaMode===1?16:event.deltaMode===2?rect.height:1;
    // Use the same percentage-point change at every zoom level and cap large wheel events.
    const wheelDelta = Math.max(-100, Math.min(100, event.deltaY * units));
    zoomAt(live.current.zoom - (wheelDelta / 100) * 0.05, {
      x: event.clientX - rect.left,
      y: event.clientY - rect.top,
    });
  };
  const centerAt=(x:number,y:number)=>applyView({pan:{x:(viewportRef.current?.clientWidth || 900)/2-x*live.current.zoom,y:(viewportRef.current?.clientHeight || 600)/2-y*live.current.zoom},zoom:live.current.zoom});
  return {
    centerAt,panForPrompt,pan,zoom,readView,isPanning,isHandMode,handTool,setHandTool,
    selectedNodeIds,setSelectedNodeIds,selectedNodeId,setSelectedNodeId,
    selectionBox,dragPositions,draggingNodeId,
    draggingNodePos:draggingNodeId?dragPositions[draggingNodeId]:null,
    alignmentGuides,
    handleZoom,setZoom:zoomAt,handleResetView,handleWheel,handleMouseDownCanvas,handleNodeDragStart,handleNodeClick
  };
}
