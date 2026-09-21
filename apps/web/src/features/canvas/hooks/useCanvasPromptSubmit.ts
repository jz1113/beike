import { useCanvasStore } from '../store/useCanvasStore';
import { buildCanvasPromptNodes } from './canvasPromptNodes';
import type { RefObject } from 'react';

interface PromptTask {
  id?: string;
  taskId?: string;
  prompt?: string;
  title?: string;
}

export { buildCanvasPromptNodes } from './canvasPromptNodes';

export function submitCanvasPrompt(options: {
  projectId: string;
  pan: { x: number; y: number };
  zoom: number;
  viewport: HTMLDivElement | null;
  promptText: string;
  refImage?: string;
  mode?: string;
  tasks?: PromptTask[];
}) {
  const { projectId } = options;
  const addNode = useCanvasStore.getState().addNode;
  for (const node of buildCanvasPromptNodes(options)) {
    addNode(projectId, node);
  }
}

export function useCanvasPromptSubmit(
  projectId: string | undefined,
  pan: { x: number; y: number },
  zoom: number,
  viewportRef: RefObject<HTMLDivElement | null>,
) {
  return (promptText: string, refImage?: string, mode?: string, tasks?: PromptTask[]) => {
    if (!projectId) return;
    submitCanvasPrompt({
      projectId,
      pan,
      zoom,
      viewport: viewportRef.current,
      promptText,
      refImage,
      mode,
      tasks,
    });
  };
}
