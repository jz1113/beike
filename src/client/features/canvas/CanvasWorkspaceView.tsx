import { useCanvasHydrated } from './hooks/useCanvasHydrated';
import React from 'react';
import { useCanvasStore } from './store/useCanvasStore';
import { CanvasHomeFeed } from './components/CanvasHomeFeed';
import { InfiniteCanvasEditor } from './components/InfiniteCanvasEditor';
import { submitCanvasPrompt } from './hooks/useCanvasPromptSubmit';

export const CanvasWorkspaceView: React.FC = () => {
  const hydrated = useCanvasHydrated();
  const { activeProjectId } = useCanvasStore();

  if (!hydrated) return <div role="status" className="p-8 text-sm text-slate-400">正在读取画布…</div>;

  if (activeProjectId) {
    return <InfiniteCanvasEditor key={activeProjectId} projectId={activeProjectId} />;
  }

  return <CanvasHomeFeed onSubmitSuccess={info => {
    if (!info.tasks.length) return;
    const project = useCanvasStore.getState().createProject(info.prompt.trim().slice(0, 30) || 'AI 画布创作');
    submitCanvasPrompt({ projectId: project.id, pan: { x: 0, y: 0 }, zoom: 1, viewport: null,
      promptText: info.prompt, refImage: info.refImages[0], mode: info.mode, tasks: info.tasks });
  }} />;
};

export default CanvasWorkspaceView;
