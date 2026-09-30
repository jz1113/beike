import { useEffect, useRef, useState } from 'react';
import { useCanvasStore } from '../store/useCanvasStore';
import type { CanvasNode } from '../model/types';

type Change = { id: string; before?: CanvasNode; after?: CanvasNode; keys?: (keyof CanvasNode)[] };
type Edit = { changes: Change[]; at: number };
// Execution results are not editor commands. Undoing a move must never rewind a completed task.
const editable: (keyof CanvasNode)[] = ['x', 'y', 'width', 'height', 'title', 'content', 'drawing', 'referenceNodeIds', 'layerHidden', 'layerLocked', 'layerOpacity', 'layerOrder', 'layerGroupId', 'groupId'];
export function useCanvasHistory(projectId: string) {
  const past = useRef<Edit[]>([]);
  const future = useRef<Edit[]>([]);
  const applying = useRef(false);
  const [, refresh] = useState(0);
  useEffect(() => {
    past.current = []; future.current = []; refresh(n => n + 1);
    return useCanvasStore.subscribe((state, previous) => {
      if (applying.current) return;
      const before = previous.projects.find(p => p.id === projectId)?.nodes;
      const after = state.projects.find(p => p.id === projectId)?.nodes;
      if (!before || !after || before === after) return;
      const changes: Change[] = [];
      const ids = new Set([...before, ...after].map(n => n.id));
      for (const id of ids) {
        const a = before.find(n => n.id === id), b = after.find(n => n.id === id);
        if (!a || !b) { changes.push({id, before:a, after:b}); continue; }
        const keys = editable.filter(key => JSON.stringify(a[key]) !== JSON.stringify(b[key]));
        if (keys.length && a.status === b.status && a.taskId === b.taskId) changes.push({id, before:a, after:b, keys});
      }
      if (!changes.length) return;
      const last = past.current.at(-1);
      const typing = changes.length === 1 && changes[0].keys?.every(key => key === 'content' || key === 'title' || key === 'width' || key === 'height');
      if (typing && last && Date.now() - last.at < 800 && last.changes.length === 1 && last.changes[0].id === changes[0].id && JSON.stringify(last.changes[0].keys) === JSON.stringify(changes[0].keys)) {
        last.changes[0].after = changes[0].after; last.at = Date.now();
      } else past.current = [...past.current.slice(-49), {changes, at:Date.now()}];
      future.current = []; refresh(n => n + 1);
    });
  }, [projectId]);
  const apply = (undo: boolean) => {
    const from = undo ? past : future, to = undo ? future : past;
    const edit = from.current.pop();
    if (!edit) return;
    applying.current = true;
    try {
      useCanvasStore.setState(state => ({projects:state.projects.map(project => {
        if (project.id !== projectId) return project;
        let nodes = [...project.nodes];
        for (const change of edit.changes) {
          const value = undo ? change.before : change.after;
          if (!change.keys) {
            nodes = nodes.filter(n => n.id !== change.id);
            if (value) nodes.push(value);
          } else if (value) nodes = nodes.map(node => node.id === change.id ? {...node, ...Object.fromEntries(change.keys!.map(key => [key, value[key]]))} : node);
        }
        return {...project, nodes, updatedAt:Date.now()};
      })}));
      to.current.push(edit);
    } finally { applying.current = false; refresh(n => n + 1); }
  };
  return { undo: () => apply(true), redo: () => apply(false), canUndo: !!past.current.length, canRedo: !!future.current.length };
}
