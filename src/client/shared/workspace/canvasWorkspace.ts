import { useEffect, useState } from 'react';
import type { MediaAttachment } from '@client/store/appStoreTypes';

export type CanvasWorkspaceSelection = {
  activeNodeId: string | null;
  activeProject: {
    id: string;
    workflow: string;
    title: string;
    nodes: Array<{ id: string; title?: string; content?: string }>;
  } | undefined;
};

type CanvasWorkspaceBridge = {
  subscribe: (listener: () => void) => () => void;
  getSelection: () => CanvasWorkspaceSelection;
  getSnapshot: () => Record<string, unknown>;
  getAttachments: () => MediaAttachment[];
};

const emptyBridge: CanvasWorkspaceBridge = {
  subscribe: () => () => {},
  getSelection: () => ({ activeNodeId: null, activeProject: undefined }),
  getSnapshot: () => ({
    workspaceType: 'canvas',
    title: '未打开画布',
    summary: '当前没有已打开的画布项目。',
    nodeCount: 0,
  }),
  getAttachments: () => [],
};

let bridge = emptyBridge;

export function registerCanvasWorkspaceBridge(next: CanvasWorkspaceBridge) {
  bridge = next;
}

export function useCanvasWorkspaceSelection(): CanvasWorkspaceSelection {
  const [selection, setSelection] = useState(() => bridge.getSelection());
  useEffect(() => {
    setSelection(bridge.getSelection());
    return bridge.subscribe(() => setSelection(bridge.getSelection()));
  }, []);
  return selection;
}

export function getCanvasWorkspaceSnapshot(): Record<string, unknown> {
  return bridge.getSnapshot();
}

export function getCanvasWorkspaceAttachments(): MediaAttachment[] {
  return bridge.getAttachments();
}

export const canvasLibraryDragType = 'application/x-beike-library-media';

export function openCanvasMediaLibrary(nodeId?: string) {
  window.postMessage({ kind: 'canvas:library-open', nodeId }, window.location.origin);
}

export function canvasLibraryMedia(data: unknown) {
  if (!data || typeof data !== 'object') return undefined;
  const item = data as Record<string, unknown>;
  const validUrl = (value: unknown, kind: 'image' | 'video' | 'audio'): value is string =>
    typeof value === 'string' && (/^(https?:\/\/|\/(?!\/))[^\\\s]+$/i.test(value)
      || value.toLowerCase().startsWith(`data:${kind}/`));
  if ((item.kind !== 'image' && item.kind !== 'video' && item.kind !== 'audio') || !validUrl(item.url, item.kind)) return undefined;
  const type: 'image' | 'video' | 'audio' = item.kind;
  return {
    type, title: typeof item.name === 'string' ? item.name : '素材',
    imageUrl: item.kind === 'image' ? item.url : item.kind === 'video' && validUrl(item.cover, 'image') ? item.cover : undefined,
    videoUrl: item.kind === 'video' ? item.url : undefined,
    audioUrl: item.kind === 'audio' ? item.url : undefined,
    missingMedia: false,
  };
}
