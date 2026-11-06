import { useCanvasHydrated } from './hooks/useCanvasHydrated';
import React from 'react';
import { useCanvasStore } from './store/useCanvasStore';
import { StudioWorkspace } from './components/editor/StudioWorkspace';
import { InfiniteCanvasEditor } from './components/editor/InfiniteCanvasEditor';

import type { CanvasProject } from './model/types';

export const CanvasWorkspaceView: React.FC<{onHome: () => void; renderBusiness?: (project: CanvasProject) => React.ReactNode}> = ({onHome, renderBusiness}) => {
  const hydrated = useCanvasHydrated();
  const { activeProjectId } = useCanvasStore();

  if (!hydrated) return <div role="status" className="p-8 text-sm text-slate-400">正在读取画布…</div>;

  if (activeProjectId) {
    const project = useCanvasStore.getState().projects.find(item => item.id === activeProjectId);
    if (project && (project.studioScene || !project.nodes.length)) {
      return <><StudioWorkspace key={activeProjectId} projectId={activeProjectId} onHome={onHome} />{renderBusiness?.(project)}</>;
    }
    return <InfiniteCanvasEditor key={activeProjectId} projectId={activeProjectId} onHome={onHome} />;
  }

  return null;
};

export default CanvasWorkspaceView;
