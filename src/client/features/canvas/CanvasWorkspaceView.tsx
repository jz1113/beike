import { useCanvasHydrated } from './hooks/useCanvasGenerationSync';
import React from 'react';
import { useCanvasStore } from './store/useCanvasStore';
import { CanvasLoadingSurface } from './store/canvasArchiveStorage';
import { InfiniteCanvasEditor } from './components/editor/InfiniteCanvasEditor';
import { CanvasSaveStatus } from './components/projects/CanvasRecentProjects';

export const CanvasWorkspaceView: React.FC<{onHome: () => void}> = ({onHome}) => {
  const hydrated = useCanvasHydrated();
  const activeProjectId = useCanvasStore(state=>state.activeProjectId);

  if (!hydrated) return <><CanvasLoadingSurface /><div className="relative p-8 text-sm text-slate-400"><CanvasSaveStatus failuresOnly /></div></>;

  if (activeProjectId) {
    return <InfiniteCanvasEditor key={activeProjectId} projectId={activeProjectId} onHome={onHome} />;
  }

  return null;
};

export default CanvasWorkspaceView;
