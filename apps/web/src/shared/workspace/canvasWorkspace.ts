import { useEffect, useState } from 'react';
import type { MediaAttachment } from '@/store/appStoreTypes';

export type CanvasWorkspaceSelection = {
  activeNodeId: string | null;
  activeProject: {
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
