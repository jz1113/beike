import { renderHook, cleanup } from '@testing-library/react';
import { afterEach, expect, it } from 'vitest';
import { useCanvasStore } from '../store/useCanvasStore';
import { useCanvasGenerationSync } from './useCanvasGenerationSync';
import type { GenerationTask } from '@/types/app-store';
afterEach(cleanup);
it('reads percentage strings from real generation tasks and reserves 100 for success', () => {
  useCanvasStore.setState({ projects: [{ id: 'progress-project', title: 'test', createdAt: 1, updatedAt: 1, nodes: [{ id: 'node', createdAt: 1, taskId: 'task', type: 'image', status: 'generating', progress: 15, x: 0, y: 0, width: 300, height: 300 }] }] });
  const project = useCanvasStore.getState().projects[0];
  const task: GenerationTask = { id: 'task', title: 'test', prompt: 'test', model: 'test', size: '1:1', quality: 'low', useReferenceImage: false, status: 'IN_PROGRESS', progress: '76%' };
  const { rerender } = renderHook(({ progress }) => useCanvasGenerationSync(project, [{ ...task, progress }], useCanvasStore.getState().updateNode), { initialProps: { progress: '76%' } });
  expect(useCanvasStore.getState().projects[0].nodes[0].progress).toBe(76);
  rerender({ progress: '100%' });
  expect(useCanvasStore.getState().projects[0].nodes[0]).toMatchObject({ status: 'generating', progress: 99 });
});
