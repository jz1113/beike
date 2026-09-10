import React from 'react';
import { useCanvasStore } from './store/useCanvasStore';
import { CanvasHomeFeed } from './components/CanvasHomeFeed';
import { InfiniteCanvasEditor } from './components/InfiniteCanvasEditor';

export const CanvasWorkspaceView: React.FC = () => {
  const { activeProjectId } = useCanvasStore();

  if (activeProjectId) {
    return <InfiniteCanvasEditor projectId={activeProjectId} />;
  }

  return <CanvasHomeFeed />;
};

export default CanvasWorkspaceView;
