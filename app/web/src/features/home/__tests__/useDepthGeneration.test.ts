import { describe, expect, it } from 'vitest';
import {
  clearDepthSubmit,
  peekDepthSubmit,
  registerDepthSubmit,
  consumeDepthSubmit,
  cloneDepthSubmit,
  resolveDepthSubmit,
} from '../hooks/useDepthGeneration';

describe('depthSubmitRegistry', () => {
  const taskId = 'test-task-1';
  const payload = {
    file: new File(['x'], 'clip.mp4', { type: 'video/mp4' }),
    style: 'mocap' as const,
    quality: 'standard' as const,
    mode: 'depth-video' as const,
  };

  it('peekDepthSubmit does not remove payload', () => {
    registerDepthSubmit(taskId, payload);
    expect(peekDepthSubmit(taskId)).toEqual(payload);
    expect(peekDepthSubmit(taskId)).toEqual(payload);
    clearDepthSubmit(taskId);
  });

  it('clearDepthSubmit removes payload', () => {
    registerDepthSubmit(taskId, payload);
    clearDepthSubmit(taskId);
    expect(peekDepthSubmit(taskId)).toBeUndefined();
  });

  it('consumeDepthSubmit removes payload on read', () => {
    registerDepthSubmit(taskId, payload);
    expect(consumeDepthSubmit(taskId)).toEqual(payload);
    expect(peekDepthSubmit(taskId)).toBeUndefined();
  });

  it('cloneDepthSubmit duplicates payload to a new taskId', () => {
    registerDepthSubmit(taskId, payload);
    const cloned = cloneDepthSubmit(taskId, 'test-task-2');
    expect(cloned).toBe(true);
    expect(peekDepthSubmit('test-task-2')).toEqual(payload);
    clearDepthSubmit(taskId);
    clearDepthSubmit('test-task-2');
  });

  it('resolveDepthSubmit retrieves existing payload from memory', async () => {
    registerDepthSubmit(taskId, payload);
    const res = await resolveDepthSubmit(taskId);
    expect(res).toEqual(payload);
    clearDepthSubmit(taskId);
  });

  it('resolveDepthSubmit recovers via fallbackUrl and refMediaRegistry', async () => {
    const fallbackUrl = 'blob:http://localhost:5173/mock-video-url';
    const { registerRefMedia, unregisterRefMedia } = await import('@/lib/refMediaRegistry');
    registerRefMedia(fallbackUrl, payload.file);

    const res = await resolveDepthSubmit('non-existent-task-id', fallbackUrl, {
      mode: 'depth-video',
      style: 'mocap',
      quality: 'standard',
    });
    expect(res).toBeDefined();
    expect(res?.file).toBe(payload.file);
    expect(res?.mode).toBe('depth-video');

    unregisterRefMedia(fallbackUrl);
    clearDepthSubmit('non-existent-task-id');
  });

  it('resolveDepthSubmit recovers via latest registered payload fallback', async () => {
    registerDepthSubmit('earlier-task', payload);

    const res = await resolveDepthSubmit('unrelated-task-id', undefined, {
      mode: 'depth-video',
    });
    expect(res).toBeDefined();
    expect(res?.file).toBe(payload.file);
    expect(res?.mode).toBe('depth-video');

    clearDepthSubmit('earlier-task');
    clearDepthSubmit('unrelated-task-id');
  });

  it('clearDepthSubmit does NOT erase global latest fallback so retries succeed', async () => {
    registerDepthSubmit('task-to-clear', payload);
    clearDepthSubmit('task-to-clear');

    // Task is cleared from task map
    expect(peekDepthSubmit('task-to-clear')).toBeUndefined();

    // But global fallback still recovers the video file for a new or retried task
    const recovered = await resolveDepthSubmit('retry-task-id', undefined, {
      mode: 'depth-video',
    });
    expect(recovered).toBeDefined();
    expect(recovered?.file).toBe(payload.file);
    expect(recovered?.mode).toBe('depth-video');

    clearDepthSubmit('retry-task-id');
  });
});
