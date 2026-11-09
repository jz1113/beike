import { useEffect, useRef, useState } from 'react';
import { useCanvasStore } from '../store/useCanvasStore';
import type { CanvasNode, CanvasEdge } from '../model/types';

export interface CanvasHistorySnapshot {
  nodes: CanvasNode[];
  edges?: CanvasEdge[];
  editedNodes: CanvasNode[];
  editedEdges?: CanvasEdge[];
  description?: string;
  at: number;
}

// Editable properties of a canvas node that represent user layout/design changes
const editable: (keyof CanvasNode)[] = [
  'x', 'y', 'width', 'height', 'title', 'content', 'drawing',
  'referenceNodeIds', 'layerHidden', 'layerLocked',
  'groupId',
  'compareMode', 'compareSplit', 'compareBeforeUrl', 'compareAfterUrl',
  'previewFit', 'savePrefix', 'saveFormat', 'audioUrl',
];

export function useCanvasHistory(projectId: string) {
  const past = useRef<CanvasHistorySnapshot[]>([]);
  const future = useRef<CanvasHistorySnapshot[]>([]);
  const applying = useRef(false);
  const [, refresh] = useState(0);

  useEffect(() => {
    past.current = [];
    future.current = [];
    refresh(n => n + 1);

    return useCanvasStore.subscribe((state, previous) => {
      if (applying.current) return;
      const prevProject = previous.projects.find(p => p.id === projectId);
      const currProject = state.projects.find(p => p.id === projectId);
      if (!prevProject || !currProject || prevProject.nodes === currProject.nodes) return;

      const before = prevProject.nodes;
      const after = currProject.nodes;

      // Check if actual design/layout changes occurred
      let hasSignificantChange = false;
      if (before.length !== after.length) {
        hasSignificantChange = true;
      } else {
        const byId = new Map(after.map(node => [node.id, node]));
        for (const a of before) {
          const b = byId.get(a.id);
          if (a === b) continue;
          if (!b) { hasSignificantChange = true; break; }
          const hasDiff = editable.some(key => JSON.stringify(a[key]) !== JSON.stringify(b[key]));
          if (hasDiff && a.status === b.status && a.taskId === b.taskId) {
            hasSignificantChange = true;
            break;
          }
        }
      }

      if (!hasSignificantChange) return;

      const now = Date.now();
      const last = past.current.at(-1);

      // Debounce continuous typing within 600ms
      const isQuickSuccession = last && (now - last.at < 600) && before === last.editedNodes && before.length === last.nodes.length;
      if (isQuickSuccession) {
        // Keep the earlier "before" snapshot as base point
        last.at = now;
        last.editedNodes = after;
        last.editedEdges = currProject.edges;
      } else {
        past.current = [
          ...past.current.slice(-49),
          {
            nodes: before,
            editedNodes: after,
            editedEdges: currProject.edges,
            edges: prevProject.edges,
            at: now,
          },
        ];
      }

      future.current = [];
      refresh(n => n + 1);
    });
  }, [projectId]);

  const apply = (undo: boolean) => {
    const from = undo ? past : future;
    const to = undo ? future : past;
    const targetSnapshot = from.current.pop();
    if (!targetSnapshot) return;

    applying.current = true;
    try {
      const currentProject = useCanvasStore.getState().projects.find(p => p.id === projectId);
      if (!currentProject) return;

      to.current.push({
        nodes: targetSnapshot.editedNodes,
        edges: targetSnapshot.editedEdges,
        editedNodes: targetSnapshot.nodes,
        editedEdges: targetSnapshot.edges,
        at: Date.now(),
      });

      const currentNodes = new Map(currentProject.nodes.map(node => [node.id, node]));
      const editedNodes = new Map(targetSnapshot.editedNodes.map(node => [node.id, node]));
      const validNodeIds = new Set(targetSnapshot.nodes.map(node => node.id));
      const restoredNodes = targetSnapshot.nodes.map(node => {
        const current = currentNodes.get(node.id);
        const edited = editedNodes.get(node.id);
        const restored = current && edited ? { ...current } : { ...node };
        if (current && edited) {
          for (const key of editable) {
            if (JSON.stringify(node[key]) !== JSON.stringify(edited[key]) &&
                JSON.stringify(current[key]) === JSON.stringify(edited[key])) {
              Object.assign(restored, { [key]: node[key] });
            }
          }
        }
        restored.referenceNodeIds = (restored.referenceNodeIds || []).filter(id => validNodeIds.has(id));
        return restored;
      });
      const edges = targetSnapshot.edges === targetSnapshot.editedEdges ? currentProject.edges : targetSnapshot.edges;
      useCanvasStore.getState().replaceGraph(projectId, restoredNodes, edges);
    } finally {
      applying.current = false;
      refresh(n => n + 1);
    }
  };

  return {
    undo: () => apply(true),
    redo: () => apply(false),
    canUndo: !!past.current.length,
    canRedo: !!future.current.length,
  };
}
