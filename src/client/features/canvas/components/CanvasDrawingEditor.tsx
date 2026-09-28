import { useCallback, useLayoutEffect, useRef, useState, type HTMLAttributes, type RefObject } from 'react';
import { createPortal } from 'react-dom';

/** Keep the canvas still when opening a node. Only its editor follows available screen space. */
export function CanvasDrawingEditor({anchor, ...props}: HTMLAttributes<HTMLDivElement> & {anchor:RefObject<HTMLDivElement|null>}) {
  const panel=useRef<HTMLDivElement>(null);
  const [placement,setPlacement]=useState({left:16,top:80,width:560,maxHeight:600,visible:false});
  const position=useCallback(()=>{
    const root=anchor.current;
    const viewport=root?.closest('[data-testid="canvas-viewport"]')?.getBoundingClientRect();
    const node=root?.querySelector('[data-testid="drawing-preview"]')?.getBoundingClientRect();
    if(!viewport || !node || !panel.current)return;
    if(!viewport.width || !viewport.height) {
      setPlacement(previous=>previous.visible?{...previous,visible:false}:previous);
      return;
    }
    const padding=16, gap=16;
    const viewportTop=viewport.top+72, viewportBottom=viewport.bottom-padding;
    let width=Math.min(680,Math.max(1,viewport.width-padding*2));
    let maxHeight=Math.max(1,viewportBottom-viewportTop);
    const height=Math.min(panel.current.scrollHeight,maxHeight);
    let left=node.x+node.width/2-width/2,top=node.bottom+gap;
    if(top+height>viewportBottom) {
      const rightSpace=viewport.right-padding-node.right-gap;
      const leftSpace=node.left-gap-viewport.left-padding;
      // Keep the preview visible; a narrower side editor is preferable to flipping above it.
      if(Math.max(rightSpace,leftSpace)>=360) {
        const onRight=rightSpace>=leftSpace;
        width=Math.min(width,onRight?rightSpace:leftSpace);
        left=onRight?node.right+gap:node.left-gap-width;
        top=Math.max(viewportTop,Math.min(node.top,viewportBottom-height));
        maxHeight=Math.max(1,viewportBottom-top);
      } else if(viewportBottom-top>=180) {
        maxHeight=viewportBottom-top;
      } else {
        const above=node.top-gap-viewportTop;
        const below=viewportBottom-top;
        if(above>below) {
          maxHeight=Math.max(1,Math.min(maxHeight,above));
          top=Math.max(viewportTop,node.top-gap-Math.min(height,maxHeight));
        } else {
          top=Math.max(viewportTop,Math.min(top,viewportBottom-1));
          maxHeight=Math.max(1,viewportBottom-top);
        }
      }
    }
    left=Math.max(viewport.left+padding,Math.min(viewport.right-padding-width,left));
    setPlacement(previous=>previous.visible && previous.left===left && previous.top===top && previous.width===width && previous.maxHeight===maxHeight?previous:{left,top,width,maxHeight,visible:true});
  },[anchor]);
  useLayoutEffect(position);
  useLayoutEffect(()=>{
    const observer=new ResizeObserver(position);
    if(panel.current)observer.observe(panel.current);
    const viewport=anchor.current?.closest('[data-testid="canvas-viewport"]');
    if(viewport)observer.observe(viewport);
    window.addEventListener('resize',position);
    return()=>{observer.disconnect();window.removeEventListener('resize',position);};
  },[anchor,position]);
  const {visible,...geometry}=placement;
  return createPortal(<div {...props} ref={panel} style={{...geometry,visibility:visible?'visible':'hidden',position:'fixed',zIndex:45,overflowY:'auto'}} />,document.body);
}
