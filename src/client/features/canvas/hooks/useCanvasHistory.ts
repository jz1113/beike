import { useEffect, useRef, useState } from 'react';
import { useCanvasStore } from '../store/useCanvasStore';
import type { CanvasNode, CanvasEdge } from '../model/types';

export interface CanvasHistorySnapshot {
  nodes: CanvasNode[];
  edges?: CanvasEdge[];
  description?: string;
  at: number;
}

// Editable properties of a canvas node that represent user layout/design changes
const editable: (keyof CanvasNode)[] = [
  'x', 'y', 'width', 'height', 'title', 'content', 'drawing',
  'referenceNodeIds', 'layerHidden', 'layerLocked', 'layerOpacity',
  'layerOrder', 'layerGroupId', 'groupId',
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
        for (let i = 0; i < before.length; i++) {
          const a = before[i];
          const b = after.find(n => n.id === a.id);
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
      const isQuickSuccession = last && (now - last.at < 600) && before.length === last.nodes.length;
      if (isQuickSuccession) {
        // Keep the earlier "before" snapshot as base point
        last.at = now;
      } else {
        past.current = [
          ...past.current.slice(-49),
          {
            nodes: JSON.parse(JSON.stringify(before)),
            edges: prevProject.edges ? JSON.parse(JSON.stringify(prevProject.edges)) : undefined,
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

      // Save current state into target stack before restoring
      to.current.push({
        nodes: JSON.parse(JSON.stringify(currentProject.nodes)),
        edges: currentProject.edges ? JSON.parse(JSON.stringify(currentProject.edges)) : undefined,
        at: Date.now(),
      });

      // Restore nodes and edges while ensuring no dangling referenceNodeIds
      const validNodeIds = new Set(targetSnapshot.nodes.map(n => n.id));
      const sanitizedNodes = targetSnapshot.nodes.map(node => ({
        ...node,
        referenceNodeIds: (node.referenceNodeIds || []).filter(id => validNodeIds.has(id)),
      }));

      useCanvasStore.setState(state => ({
        projects: state.projects.map(project => {
          if (project.id !== projectId) return project;
          return {
            ...project,
            nodes: sanitizedNodes,
            edges: targetSnapshot.edges,
            updatedAt: Date.now(),
          };
        }),
      }));
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
