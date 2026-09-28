import { useCanvasHydrated } from './hooks/useCanvasHydrated';
import React from 'react';
import { useCanvasStore } from './store/useCanvasStore';
import { CanvasHomeFeed } from './components/CanvasHomeFeed';
import { InfiniteCanvasEditor } from './components/InfiniteCanvasEditor';

export const CanvasWorkspaceView: React.FC = () => {
  const hydrated = useCanvasHydrated();
  const { activeProjectId } = useCanvasStore();

  if (!hydrated) return <div role="status" className="p-8 text-sm text-slate-400">正在读取画布…</div>;

  if (activeProjectId) {
    return <InfiniteCanvasEditor projectId={activeProjectId} />;
  }

  return <CanvasHomeFeed />;
};

export default CanvasWorkspaceView;
