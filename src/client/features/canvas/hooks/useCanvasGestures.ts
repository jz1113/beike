import { useState, useRef, useEffect, useCallback, type RefObject, type MouseEvent as ReactMouseEvent, type WheelEvent } from 'react';
import { useCanvasStore } from '../store/useCanvasStore';
import { nodeBounds } from '../model/canvasGraph';
import { canvasGroupSelection, expandCanvasGroups } from '../model/canvasGroups';
import { computeSnapGuides, type AlignmentGuide } from './useCanvasSnapping';
import type { CanvasNode, CanvasProject } from '../model/types';

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
  const live=useRef({pan,zoom}); live.current={pan,zoom};
  const cleanup=useRef<(() => void)|null>(null);
  const suppressClick=useRef(false);
  const fitted=useRef<string|null>(null);
  const isHandMode=handTool || spaceHeld;
  const selectedNodeId=selectedNodeIds.at(-1) || null;
  const projectNodes=()=>useCanvasStore.getState().projects.find(project=>project.id===currentProject?.id)?.nodes || currentProject?.nodes || [];
  const groupSelection=(id:string)=>{
    const ids=canvasGroupSelection(projectNodes(),id);
    return [...ids.filter(memberId=>memberId!==id),...(ids.includes(id)?[id]:[])];
  };
  const setSelectedNodeId=(id:string|null) => setSelectedNodeIds(id ? groupSelection(id) : []);
  const toggleGroupSelection=(id:string)=>{
    const group=groupSelection(id), members=new Set(group);
    setSelectedNodeIds(ids=>group.length && group.every(memberId=>ids.includes(memberId))
      ? ids.filter(memberId=>!members.has(memberId)) : [...new Set([...ids,...group])]);
  };
  const world=(x:number,y:number) => {
    const rect=viewportRef.current?.getBoundingClientRect();
    return {x:(x-(rect?.left || 0)-live.current.pan.x)/live.current.zoom,y:(y-(rect?.top || 0)-live.current.pan.y)/live.current.zoom};
  };
  const zoomAt=(next:number, point?:Point) => {
    const previous=live.current;
    const z=Math.max(0.1,Math.min(2.5,next));
    const anchor=point || {x:(viewportRef.current?.clientWidth || 900)/2,y:(viewportRef.current?.clientHeight || 600)/2};
    const nextPan={x:anchor.x-(anchor.x-previous.pan.x)*z/previous.zoom,y:anchor.y-(anchor.y-previous.pan.y)*z/previous.zoom};
    live.current={pan:nextPan,zoom:z};setPan(nextPan);setZoom(z);
  };
  const handleZoom=(delta:number)=>zoomAt(live.current.zoom+delta);
  const handleResetView=useCallback(()=>{
    onBackgroundSelect();
    const viewport=viewportRef.current;
    const view=fitCanvasNodes(currentProject?.nodes || [],viewport?.clientWidth || 900,viewport?.clientHeight || 600);
    setPan(view.pan);setZoom(view.zoom);
  },[currentProject,viewportRef,onBackgroundSelect]);
  useEffect(()=>{
    cleanup.current?.();setIsPanning(false);suppressClick.current=false;setSelectedNodeIds([]);setDragPositions({});setDraggingNodeId(null);setSelectionBox(null);setAlignmentGuides([]);setPan({x:0,y:0});setZoom(1);fitted.current=null;
    return ()=>cleanup.current?.();
  },[currentProject?.id]);
  useEffect(()=>{
    if (!currentProject || fitted.current===currentProject.id) return;
    // Do not recenter when creating the first node in an empty project.
    fitted.current=currentProject.id;
    if(currentProject.nodes.length) handleResetView();
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
      if(event.code==='Space'){event.preventDefault();setSpaceHeld(true);}
      if(event.key.toLowerCase()==='h')setHandTool(true);
      if(event.key.toLowerCase()==='v')setHandTool(false);
    };
    const up=(event:KeyboardEvent)=>{if(event.code==='Space')setSpaceHeld(false);};
    const blur=()=>setSpaceHeld(false);
    window.addEventListener('keydown',down);window.addEventListener('keyup',up);window.addEventListener('blur',blur);
    return()=>{window.removeEventListener('keydown',down);window.removeEventListener('keyup',up);window.removeEventListener('blur',blur);};
  });
  const track=(move:(e:MouseEvent)=>void, finish:()=>void, buttons=1)=>{
    cleanup.current?.();
    const end=()=>{window.removeEventListener('mousemove',guardedMove);window.removeEventListener('mouseup',end);window.removeEventListener('blur',end);cleanup.current=null;finish();};
    const guardedMove=(event:MouseEvent)=>{if(!(event.buttons & buttons)){end();return;}move(event);};
    window.addEventListener('mousemove',guardedMove);window.addEventListener('mouseup',end);window.addEventListener('blur',end);
    cleanup.current=()=>{window.removeEventListener('mousemove',guardedMove);window.removeEventListener('mouseup',end);window.removeEventListener('blur',end);};
  };
  const startPan=(event:ReactMouseEvent)=>{
    event.preventDefault();setIsPanning(true);
    const start={x:event.clientX-pan.x,y:event.clientY-pan.y};
    track(e=>setPan({x:e.clientX-start.x,y:e.clientY-start.y}),()=>setIsPanning(false),[1,4,2][event.button] || 1);
  };
  const handleMouseDownCanvas=(event:ReactMouseEvent)=>{
    if((event.target as HTMLElement).closest('.canvas-node-card,button,input,textarea,.canvas-fixed-ui,[data-connection-edge]'))return;
    if(isHandMode || event.button===1 || event.button===2){startPan(event);return;}
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
    if(isHandMode || event.button===1 || event.button===2){event.stopPropagation();startPan(event);return;}
    if(event.button!==0)return;
    if((event.target as HTMLElement).closest('button,input,textarea,video,audio,[contenteditable="true"]'))return;
    if(node.layerHidden)return;
    event.preventDefault();event.stopPropagation();
    if(event.shiftKey){toggleGroupSelection(node.id);suppressClick.current=true;return;}
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
    const start={x:event.clientX,y:event.clientY}, dragZoom=zoom;let latest:Record<string,Point>={};let moved=false;
    track(e=>{
      const rawDx=(e.clientX-start.x)/dragZoom, rawDy=(e.clientY-start.y)/dragZoom;
      if(!moved && Math.hypot(rawDx,rawDy)*zoom<3)return;
      moved=true;setDraggingNodeId(node.id);

      // Smart snapping calculation
      const snap = computeSnapGuides(moving, nodes, rawDx, rawDy, zoom);
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
    if(suppressClick.current){suppressClick.current=false;return;}
    if(event.shiftKey)toggleGroupSelection(node.id);else setSelectedNodeId(node.id);
  };
  const handleWheel=(event:WheelEvent)=>{
    if(cleanup.current)return;
    const targetEl = event.target as HTMLElement | null;
    if(targetEl?.closest('textarea,[contenteditable="true"],.canvas-fixed-ui,[data-drawing-settings],[role="dialog"]'))return;
    if(event.ctrlKey || event.metaKey){
      const rect=viewportRef.current?.getBoundingClientRect();
      zoomAt(live.current.zoom*Math.exp(-event.deltaY*0.002),{x:event.clientX-(rect?.left || 0),y:event.clientY-(rect?.top || 0)});
    }else {
      // If user is scrolling an internal scrollable container, don't pan canvas
      if (targetEl && targetEl !== viewportRef.current) {
        const scrollContainer = targetEl.closest('.overflow-y-auto, .overflow-auto, .overflow-y-scroll');
        if (scrollContainer && scrollContainer !== viewportRef.current) return;
      }
      setPan(prev=>({x:prev.x-event.deltaX,y:prev.y-event.deltaY}));
    }
  };
  useEffect(()=>{
    const element=viewportRef.current;
    const prevent=(event:globalThis.WheelEvent)=>{if(event.ctrlKey || event.metaKey)event.preventDefault();};
    element?.addEventListener('wheel',prevent,{passive:false});
    return()=>element?.removeEventListener('wheel',prevent);
  },[viewportRef]);
  const centerAt=(x:number,y:number)=>setPan({x:(viewportRef.current?.clientWidth || 900)/2-x*zoom,y:(viewportRef.current?.clientHeight || 600)/2-y*zoom});
  return {
    centerAt,pan,zoom,isPanning,isHandMode,handTool,setHandTool,
    selectedNodeIds,setSelectedNodeIds,selectedNodeId,setSelectedNodeId,
    selectionBox,dragPositions,draggingNodeId,
    draggingNodePos:draggingNodeId?dragPositions[draggingNodeId]:null,
    alignmentGuides,
    handleZoom,handleResetView,handleWheel,handleMouseDownCanvas,handleNodeDragStart,handleNodeClick
  };
}
