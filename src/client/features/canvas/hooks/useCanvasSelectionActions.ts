import { useCallback, useEffect, useRef, useState } from 'react';
import type { VideoPromptOptimization } from '@client/shared/agent/videoPromptOptimizer';
import { canvasGroupPatches, canvasUngroupPatches, expandCanvasGroups } from '../model/canvasAlignment';
import { syncEdgesWithNodeReferences } from '../model/canvasGraph';
import { copyCanvasSpecialized } from '../model/canvasNodeFactory';
import type { VideoPromptReview } from '../model/studioPromptOperation';
import type { CanvasNode } from '../model/types';
import { saveCanvasProjects, useCanvasStore } from '../store/useCanvasStore';

/** Resolving this gate requires an explicit UI confirmation; cancellation returns no prompt. */
export function useVideoPromptReview() {
  const [pending, setPending] = useState<VideoPromptReview[]>([]);
  const stops = useRef(new Set<() => void>());
  useEffect(
    () => () => {
      for (const stop of stops.current) stop();
    },
    [],
  );
  const requestReview = useCallback(
    (optimization: VideoPromptOptimization, signal: AbortSignal, onDraft?: (prompt: string) => void) =>
      new Promise<string | undefined>((resolve) => {
        if (signal.aborted) {
          resolve(undefined);
          return;
        }
        const id = crypto.randomUUID();
        let finished = false;
        const finish = (prompt?: string) => {
          if (finished) return;
          finished = true;
          signal.removeEventListener('abort', cancel);
          stops.current.delete(cancel);
          setPending((items) => items.filter((item) => item.id !== id));
          resolve(signal.aborted ? undefined : prompt);
        };
        const cancel = () => finish();
        stops.current.add(cancel);
        signal.addEventListener('abort', cancel, { once: true });
        setPending((items) => [...items, { id, optimization, onDraft, confirm: finish, cancel }]);
      }),
    [],
  );
  return { requestReview, review: pending[0] };
}

let internalNodeClipboard: CanvasNode[] = [];

export function useCanvasSelectionActions(
  projectId: string,
  ids: string[],
  select: (ids: string[]) => void,
  history: { undo: () => void; redo: () => void },
) {
  const remove = (targetIds = ids) => {
    const state = useCanvasStore.getState();
    const allowed = new Set(
      state.projects
        .find((p) => p.id === projectId)
        ?.nodes.filter((n) => targetIds.includes(n.id) && !n.layerLocked && n.status !== 'generating')
        .map((n) => n.id),
    );
    allowed.forEach((id) => state.deleteNode(projectId, id));
    if (ids.some((id) => allowed.has(id))) select(ids.filter((id) => !allowed.has(id)));
  };

  const duplicateNodes = (sourceNodes: CanvasNode[]) => {
    if (!sourceNodes.length) return;
    const state = useCanvasStore.getState();
    const project = state.projects.find(item => item.id === projectId);
    if (!project) return;
    const mapping = new Map(sourceNodes.map((n) => [n.id, crypto.randomUUID()]));
    const groups = new Map<string, string>();
    for (const node of sourceNodes) {
      if (node.groupId && !groups.has(node.groupId)) groups.set(node.groupId, crypto.randomUUID());
    }
    const copies: CanvasNode[] = sourceNodes.map((n) => ({
      ...n,
      id: mapping.get(n.id)!,
      groupId: n.groupId ? groups.get(n.groupId) : undefined,
      x: n.x + 48,
      y: n.y + 48,
      title: `${n.title || '节点'} · 副本`,
      specialized: copyCanvasSpecialized(n.specialized, mapping),
      taskId: undefined,
      generationIntent: undefined,
      speechOperationId: undefined,
      speechRecoveryRequired: undefined,
      promptOperationId: undefined,
      promptRecoveryRequired: undefined,
      textOperationId: undefined,
      textRecoveryRequired: undefined,
      layerTask: undefined,
      layerOperationId: undefined,
      layerRetryAllowed: undefined,
      layerPrompt: undefined,
      layerSourceNodeId: undefined,
      status: n.status === 'generating' ? 'idle' : n.status,
      referenceNodeIds: n.referenceNodeIds?.map((id) => mapping.get(id) || id),
      createdAt: Date.now(),
    }));
    const nodes = [...project.nodes, ...copies];
    state.replaceGraph(projectId, nodes, syncEdgesWithNodeReferences(nodes, project.edges));
    select(copies.map((n) => n.id));
  };

  const duplicate = (targetIds = ids) => {
    const state = useCanvasStore.getState();
    const nodes = state.projects.find((p) => p.id === projectId)?.nodes.filter((n) => targetIds.includes(n.id)) || [];
    duplicateNodes(nodes);
  };

  const copySelection = () => {
    const state = useCanvasStore.getState();
    const nodes = state.projects.find((p) => p.id === projectId)?.nodes.filter((n) => ids.includes(n.id)) || [];
    if (nodes.length > 0) {
      internalNodeClipboard = nodes.map((n) => ({ ...n }));
    }
  };

  const pasteSelection = () => {
    if (!internalNodeClipboard.length) return;
    duplicateNodes(internalNodeClipboard);
    internalNodeClipboard = internalNodeClipboard.map((n) => ({ ...n, x: n.x + 24, y: n.y + 24 }));
  };

  const changeGroup = (ungroup: boolean) => {
    const state = useCanvasStore.getState();
    const nodes = state.projects.find((project) => project.id === projectId)?.nodes || [];
    const patches = ungroup ? canvasUngroupPatches(nodes, ids) : canvasGroupPatches(nodes, ids, crypto.randomUUID());
    if (!Object.keys(patches).length) return;
    const selected = expandCanvasGroups(nodes, ids);
    state.patchNodes(projectId, patches);
    select(selected);
  };

  useEffect(() => {
    const down = (event: KeyboardEvent) => {
      if (!document.querySelector('[data-testid="canvas-viewport"]')?.getClientRects().length) return;
      if (
        event.defaultPrevented ||
        event.isComposing ||
        (event.target as HTMLElement)?.closest?.(
          'input, textarea, select, [contenteditable="true"], [role="dialog"], [role="menu"], [data-connection-edge]',
        ) ||
        document.querySelector('[role="dialog"], [role="menu"]')
      ) {
        return;
      }
      const mod = event.metaKey || event.ctrlKey;
      if (mod && !event.altKey && event.key.toLowerCase() === 's') {
        event.preventDefault();
        void saveCanvasProjects().catch(() => {});
        return;
      }
      if (mod && !event.altKey && event.key.toLowerCase() === 'g') {
        event.preventDefault();
        changeGroup(event.shiftKey);
        return;
      }
      if (mod && ['z', 'y'].includes(event.key.toLowerCase())) {
        event.preventDefault();
        if (event.shiftKey || event.key.toLowerCase() === 'y') history.redo();
        else history.undo();
        return;
      }
      if (mod && event.key.toLowerCase() === 'd') {
        event.preventDefault();
        duplicate();
        return;
      }
      if (mod && event.key.toLowerCase() === 'c' && ids.length) {
        event.preventDefault();
        copySelection();
        return;
      }
      if (mod && event.key.toLowerCase() === 'v' && internalNodeClipboard.length) {
        event.preventDefault();
        pasteSelection();
        return;
      }
      if (mod && event.key.toLowerCase() === 'a') {
        event.preventDefault();
        select(
          useCanvasStore
            .getState()
            .projects.find((p) => p.id === projectId)
            ?.nodes.filter((n) => !n.layerHidden)
            .map((n) => n.id) || [],
        );
        return;
      }
      if (!mod && ['Delete', 'Backspace'].includes(event.key) && ids.length) {
        event.preventDefault();
        remove();
        return;
      }
      if (event.key === 'Escape') select([]);
    };
    window.addEventListener('keydown', down);
    return () => window.removeEventListener('keydown', down);
  });
  return { duplicate, remove };
}
