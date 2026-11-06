import { afterEach, describe, expect, it, vi } from 'vitest';
import { apiFetch } from '@client/shared/api/apiClient';
import { fetchMediaBlob } from '@client/shared/media/downloadMedia';
import { registerDepthSubmit } from '@client/shared/api/generation/depthGeneration';
import { useAppStore } from '@client/store';
import { composeStudioVideo } from './studioCompose';
import { submitStudioDepth } from './studioDepth';
import { runStudioTextNode } from './studioTextRunner';
import { createStudioVideoPosterQueue } from './studioVideoPosters';
import type { StudioTaskCommands } from './studioTaskState';
import type { StudioScene } from './types';

vi.mock('@client/shared/api/apiClient', () => ({ apiFetch: vi.fn(), proxyMediaUrl: (url: string) => url }));
vi.mock('@client/shared/media/downloadMedia', () => ({ fetchMediaBlob: vi.fn() }));
vi.mock('@client/shared/api/generation/depthGeneration', () => ({ registerDepthSubmit: vi.fn() }));
vi.mock('@client/store', () => ({ useAppStore: { getState: vi.fn() } }));

afterEach(() => { vi.clearAllMocks(); vi.unstubAllGlobals(); });

describe('canvas runtime safety', () => {
  it('does not download source assets when the browser cannot assemble a WebM', async () => {
    vi.stubGlobal('MediaRecorder', { isTypeSupported: () => false });
    await expect(composeStudioVideo(['/storage/raw.mp4', '/storage/clip.mp4'])).rejects.toThrow('不支持 WebM');
    expect(fetchMediaBlob).not.toHaveBeenCalled();
  });

  it('does not read media or enqueue depth processing when the local model is unavailable', async () => {
    const addGenerationTask = vi.fn();
    vi.mocked(useAppStore.getState).mockReturnValue({ generationHistoryReady: true, generationTasks: [], addGenerationTask } as unknown as ReturnType<typeof useAppStore.getState>);
    vi.mocked(apiFetch).mockResolvedValue(Response.json({ depthModelReady: false, message: '本机深度模型尚未安装' }));
    await expect(submitStudioDepth({
      taskId: 'depth', model: 'video-depth-anything', prompt: '提取深度', refs: [{ type: 'video', url: '/storage/source.mp4' }],
    }, 'project')).rejects.toThrow('本机深度模型尚未安装');
    expect(apiFetch).toHaveBeenCalledWith('/api/system/depth-env');
    expect(fetchMediaBlob).not.toHaveBeenCalled();
    expect(registerDepthSubmit).not.toHaveBeenCalled();
    expect(addGenerationTask).not.toHaveBeenCalled();
  });

  it('stops the active native text analysis when the caller cancels', async () => {
    const cancel = vi.fn();
    let finish!: () => void;
    const pending = new Promise<void>(resolve => { finish = resolve; });
    const run = vi.fn(() => pending);
    const commands: StudioTaskCommands = {
      read: (): StudioScene => ({
        nodes: [{ id: 'analysis', type: 'text-node', settings: { _chatCompletedAt: 1 } }],
        connections: [], groups: [], textBoxes: [], strokes: [], view: { x: 0, y: 0, zoom: 1 },
      }),
      update: vi.fn(), run: vi.fn(), stop: vi.fn(),
    };
    const controller = new AbortController();
    const result = runStudioTextNode({ taskCommands: commands, textRunners: new Map([['analysis', { ready: () => true, run, cancel }]]) }, 'analysis', controller.signal);
    expect(run).toHaveBeenCalledOnce();
    controller.abort();
    finish();
    await expect(result).rejects.toMatchObject({ name: 'AbortError' });
    expect(cancel).toHaveBeenCalledOnce();
  });

  it('keeps one decoder running for two readers even when one reader cancels', async () => {
    let finish!: (poster: string) => void;
    let decoderSignal!: AbortSignal;
    const extract = vi.fn((_url: string, signal: AbortSignal) => {
      decoderSignal = signal;
      return new Promise<string>(resolve => { finish = resolve; });
    });
    const queue = createStudioVideoPosterQueue({ extract });
    const controller = new AbortController();
    const first = queue.request('/storage/clip.mp4', controller.signal);
    const second = queue.request('/storage/clip.mp4');
    await Promise.resolve();
    controller.abort();
    await expect(first).rejects.toMatchObject({ name: 'AbortError' });
    expect(decoderSignal.aborted).toBe(false);
    finish('poster');
    await expect(second).resolves.toBe('poster');
    await expect(queue.request('/storage/clip.mp4')).resolves.toBe('poster');
    expect(extract).toHaveBeenCalledOnce();
    queue.dispose();
  });
});
