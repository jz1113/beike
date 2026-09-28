import { useEffect } from 'react';
import { useCanvasStore } from '../store/useCanvasStore';
import type { CanvasNode } from '../model/types';

export function useCanvasSelectionActions(projectId: string, ids: string[], select: (ids: string[]) => void, history: {undo: () => void; redo: () => void}) {
  const remove = () => {
    const state = useCanvasStore.getState();
    const allowed = new Set(state.projects.find(p => p.id === projectId)?.nodes.filter(n => ids.includes(n.id) && !n.layerLocked && n.status !== 'generating').map(n => n.id));
    useCanvasStore.setState({projects:state.projects.map(p => p.id === projectId ? {...p, updatedAt:Date.now(), nodes:p.nodes.filter(n => !allowed.has(n.id)).map(n => ({...n, referenceNodeIds:n.referenceNodeIds?.filter(id => !allowed.has(id))}))} : p)});
    select(ids.filter(id => !allowed.has(id)));
  };
  const duplicate = () => {
    const state = useCanvasStore.getState();
    const nodes = state.projects.find(p => p.id === projectId)?.nodes.filter(n => ids.includes(n.id)) || [];
    const mapping = new Map(nodes.map(n => [n.id, crypto.randomUUID()]));
    const copies: CanvasNode[] = nodes.map(n => ({...n, id:mapping.get(n.id)!, x:n.x + 48, y:n.y + 48, title:`${n.title || '节点'} · 副本`, taskId:undefined, layerTask:undefined, layerGroupId:undefined, status:n.status === 'generating' ? 'idle' : n.status, referenceNodeIds:n.referenceNodeIds?.map(id => mapping.get(id) || id), createdAt:Date.now()}));
    useCanvasStore.setState({projects:state.projects.map(p => p.id === projectId ? {...p, nodes:[...p.nodes,...copies], updatedAt:Date.now()} : p)});
    select(copies.map(n => n.id));
  };
  useEffect(() => {
    const down = (event: KeyboardEvent) => {
      if (!document.querySelector('[data-testid="canvas-viewport"]')?.getClientRects().length) return;
      if (event.defaultPrevented || event.isComposing || (event.target as HTMLElement)?.closest?.('input, textarea, select, [contenteditable="true"], [role="dialog"], [role="menu"], [data-connection-edge]') || document.querySelector('[role="dialog"], [role="menu"]')) return;
      const mod = event.metaKey || event.ctrlKey;
      if (mod && event.key.toLowerCase() === 'z') {event.preventDefault(); if (event.shiftKey) history.redo(); else history.undo();}
      if (mod && event.key.toLowerCase() === 'd') {event.preventDefault(); duplicate();}
      if (mod && event.key.toLowerCase() === 'a') {event.preventDefault(); select(useCanvasStore.getState().projects.find(p => p.id === projectId)?.nodes.filter(n => !n.layerHidden).map(n => n.id) || []);}
      if (!mod && ['Delete','Backspace'].includes(event.key) && ids.length) {event.preventDefault(); remove();}
      if (event.key === 'Escape') select([]);
    };
    window.addEventListener('keydown', down);
    return () => window.removeEventListener('keydown', down);
  });
}
