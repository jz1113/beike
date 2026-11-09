import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { GenerationTask } from '@client/store/appStoreTypes';
import { mergeAndSortTasks, syncTasksWithDatabase } from '@client/store/generateSliceHelpers';
import { apiFetch } from '@client/shared/api/apiClient';
import { getUsageLogs } from '@client/shared/utils/usageTracker';
import { pollTasksOnce } from './generationTaskPolling';
import {
  claimSubmissionFlight,
  isSubmissionInFlight,
  nextSubmissionRecovery,
  prepareAudioReferences,
  prepareVideoReferences,
  prepareVideoSubmissionInput,
  releaseSubmissionFlight,
  shouldAbandonSubmissionRecovery,
  SUBMISSION_RECOVERY_TIMEOUT,
} from './generationTaskSubmitter';

const mocks = vi.hoisted(() => ({ apiFetch: vi.fn(), resolve: vi.fn() }));
vi.mock('@client/store', () => ({ useAppStore: { getState: () => ({ generationTasks: [] }) } }));
vi.mock('@client/shared/api/apiClient', () => ({
  apiFetch: mocks.apiFetch,
  readClientStorageConfig: () => ({}),
  storageConfigHeaders: () => ({}),
}));
vi.mock('@client/shared/api/gatewayClient', () => ({
  getGatewayClientHeaders: () => ({}),
  getGatewayClientOverrides: () => ({}),
}));
vi.mock('@client/store/persist/index', () => ({ isGenerationDeleted: () => false }));
vi.mock('@client/shared/media/refMediaRegistry', () => ({ resolveRefMediaFile: mocks.resolve }));

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal('window', { location: { origin: 'http://localhost:5173' } });
});
afterEach(() => vi.unstubAllGlobals());

it('retains workspace video URLs for backend Veo preparation without requiring OSS', async () => {
  const refs = ['/storage/local/azhuo/refs/source.mp4', 'https://cdn.example/clip.mp4'];
  expect(await prepareVideoReferences(refs, undefined, true)).toEqual(refs);
  expect(mocks.apiFetch).not.toHaveBeenCalled();
});

it('uploads local Veo video files to workspace storage and keeps them out of the JSON request', async () => {
  mocks.resolve.mockReturnValue(new File(['video'], 'source.mp4', { type: 'video/mp4' }));
  mocks.apiFetch.mockResolvedValue(new Response(JSON.stringify({ success: true, url: '/storage/local/azhuo/refs/videos/source.mp4' })));
  expect(await prepareVideoReferences(['blob:source'], undefined, true)).toEqual(['/storage/local/azhuo/refs/videos/source.mp4']);
  const [endpoint, options] = mocks.apiFetch.mock.calls[0];
  expect(endpoint).toBe('/api/assets/storage/upload');
  expect(JSON.parse(options.body.get('customConfig'))).toEqual({ persistResults: false });
  expect(options.body.get('file')).toBeInstanceOf(File);
});

it('continues requiring a public reference for providers that download videos themselves', async () => {
  mocks.resolve.mockReturnValue(new File(['video'], 'source.mp4', { type: 'video/mp4' }));
  mocks.apiFetch.mockResolvedValue(new Response(JSON.stringify({ success: true, url: '/storage/local/clip.mp4' })));
  await expect(prepareVideoReferences(['blob:source'])).rejects.toThrow('公网');
  expect(mocks.apiFetch.mock.calls[0][0]).toBe('/api/generate/upload-ref');
});

it('reuses an absolute same-origin workspace video for backend preparation without reading or uploading it', async () => {
  vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('unauthenticated direct fetch'); }));
  mocks.resolve.mockReturnValue(undefined);
  expect(await prepareVideoReferences(['http://localhost:5173/storage/local/azhuo/clip.mp4?version=2'], undefined, true))
    .toEqual(['/storage/local/azhuo/clip.mp4?version=2']);
  expect(mocks.apiFetch).not.toHaveBeenCalled();
  expect(fetch).not.toHaveBeenCalled();
});

it('uses the authenticated API fetch when a same-origin workspace video needs a public upload', async () => {
  vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('unauthenticated direct fetch'); }));
  mocks.resolve.mockReturnValue(undefined);
  mocks.apiFetch.mockResolvedValueOnce(new Response(new Blob(['video'], { type: 'video/mp4' })))
    .mockResolvedValueOnce(new Response(JSON.stringify({ success: true, url: 'https://cdn.example/clip.mp4' })));
  expect(await prepareVideoReferences(['http://localhost:5173/storage/local/azhuo/clip.mp4']))
    .toEqual(['https://cdn.example/clip.mp4']);
  expect(mocks.apiFetch.mock.calls[0][0]).toBe('/storage/local/azhuo/clip.mp4');
  expect(fetch).not.toHaveBeenCalled();
});

it('does not mistake a public hostname beginning with localhost for a local service', async () => {
  vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('unnecessary remote download'); }));
  expect(await prepareVideoReferences(['https://localhost.cdn.example/clip.mp4']))
    .toEqual(['https://localhost.cdn.example/clip.mp4']);
  expect(mocks.apiFetch).not.toHaveBeenCalled();
  expect(fetch).not.toHaveBeenCalled();
});

it('stores inline audio once for backend validation and keeps existing workspace audio references', async () => {
  mocks.resolve.mockReturnValue(undefined);
  const data = 'data:audio/wav;base64,d2F2ZQ==';
  vi.stubGlobal('fetch', vi.fn(async () => new Response(new Blob(['wave'], { type: 'audio/wav' }))));
  mocks.apiFetch.mockResolvedValueOnce(Response.json({ success: true, url: '/storage/local/refs/audio/new.wav' }));
  expect(await prepareAudioReferences(['/storage/local/refs/audio/old.wav', data])).toEqual([
    '/storage/local/refs/audio/old.wav', '/storage/local/refs/audio/new.wav',
  ]);
  expect(mocks.apiFetch).toHaveBeenCalledTimes(1);
  const [endpoint, options] = mocks.apiFetch.mock.calls[0];
  expect(endpoint).toBe('/api/assets/storage/upload');
  expect(options.body.get('category')).toBe('refs/audio');
  expect(options.body.get('file').type).toBe('audio/wav');
});

it('P1 restores same-number channel tasks, polls each original record and accounts cumulative usage separately', async () => {
  const values = new Map<string, string>();
  const storage = { get length() { return values.size; }, key: (i: number) => [...values.keys()][i] ?? null,
    getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => { values.set(key, value); }, removeItem: (key: string) => { values.delete(key); } };
  vi.stubGlobal('localStorage', storage); vi.stubGlobal('window', { localStorage: storage, dispatchEvent: () => true });
  const tasks = ['a', 'b'].map(channel => ({ id: `local-${channel}`, dbId: `record-${channel}`, taskId: 'same-provider',
    model: 'gpt-image-2', mediaType: 'image', prompt: channel, status: 'IN_PROGRESS', createdAt: 1,
    usageScope: { workspaceId: 'original-workspace', channelId: channel, mediaType: 'image' } } as GenerationTask));
  let restored = mergeAndSortTasks([], JSON.parse(JSON.stringify(tasks)));
  expect(restored).toHaveLength(2);
  vi.mocked(apiFetch).mockImplementation(async (_url, init) => {
    const record = new Headers(init?.headers).get('x-task-record-id');
    if (!['record-a', 'record-b'].includes(record || '')) throw new Error('lost original record');
    return Response.json({ status: 'SUCCESS', taskId: 'same-provider', recordId: record, resultUrl: `/${record}.png`, usage: { totalTokens: record === 'record-a' ? 5 : 9 } });
  });
  const update = (id: string, patch: Partial<GenerationTask>) => { restored = restored.map(task => task.id === id ? { ...task, ...patch } : task); };
  await pollTasksOnce(restored, update, {}, new Set());
  restored = mergeAndSortTasks([], JSON.parse(JSON.stringify(restored)));
  const synced = syncTasksWithDatabase(restored, [{ id: 'session', title: 'test', createdAt: 1, tasks: restored }],
    restored.map(task => ({ ...task, id: task.dbId!, dbId: undefined, usageScope: undefined })));
  expect(synced.sessions[0].tasks).toHaveLength(2);
  for (const task of synced.generationTasks) expect(task).toMatchObject({ resultUrl: `/${task.dbId}.png`, status: 'SUCCESS', usageScope: tasks.find(row => row.dbId === task.dbId)!.usageScope });
  await pollTasksOnce(synced.generationTasks, update, {}, new Set());
  expect(getUsageLogs()).toHaveLength(2);
  expect(getUsageLogs().find(row => row.recordId === 'record-a')).toMatchObject({ totalTokens: 5, scope: tasks[0].usageScope });
  expect(getUsageLogs().find(row => row.recordId === 'record-b')).toMatchObject({ totalTokens: 9, scope: tasks[1].usageScope });
  expect(vi.mocked(apiFetch).mock.calls.every(([, init]) => !init?.method || init.method === 'GET')).toBe(true);
});

describe('submission recovery fuse', () => {
  it('does not abandon a task while its submit request is still in flight', () => {
    expect(claimSubmissionFlight('task-1')).toBe(true);
    expect(isSubmissionInFlight('task-1')).toBe(true);
    expect(shouldAbandonSubmissionRecovery(6, true)).toBe(false);
    releaseSubmissionFlight('task-1');
    expect(isSubmissionInFlight('task-1')).toBe(false);
    expect(shouldAbandonSubmissionRecovery(6, false)).toBe(true);
    expect(shouldAbandonSubmissionRecovery(5, false)).toBe(false);
  });

  it('keeps waiting while the server says the submission is still in progress', () => {
    expect(nextSubmissionRecovery(4, 'pending')).toEqual({ count: 0, abandon: false });
    expect(nextSubmissionRecovery(6, 'inflight')).toEqual({ count: 0, abandon: false });
  });

  it('shows the request error after the post ended and the server has no record', () => {
    let count = 0;
    for (let attempt = 0; attempt < 5; attempt += 1) {
      const step = nextSubmissionRecovery(count, 'missing', '上游返回 400：尺寸不合法');
      expect(step.abandon).toBe(false);
      count = step.count;
    }
    expect(nextSubmissionRecovery(count, 'missing', '上游返回 400：尺寸不合法')).toEqual({
      count: 6,
      abandon: true,
      reason: '上游返回 400：尺寸不合法',
    });
  });

  it('uses the timeout copy only when the request itself has no error', () => {
    expect(nextSubmissionRecovery(5, 'missing')).toEqual({
      count: 6,
      abandon: true,
      reason: SUBMISSION_RECOVERY_TIMEOUT,
    });
  });

  it('refuses a second claim until the first request finishes', () => {
    expect(claimSubmissionFlight('task-2')).toBe(true);
    expect(claimSubmissionFlight('task-2')).toBe(false);
    releaseSubmissionFlight('task-2');
    expect(claimSubmissionFlight('task-2')).toBe(true);
    releaseSubmissionFlight('task-2');
  });
});

const h3Task: GenerationTask = {
  id: 'h3-input', title: 'H3 task', useReferenceImage: false, model: 'MiniMax-H3', modelRouteKey: 'chosen-metaso-channel', prompt: '镜头推进',
  mediaType: 'video', size: '16:9', quality: '1080P', videoResolution: '1080P', videoRefMode: 'text', videoDuration: 30,
  status: 'IN_PROGRESS', progress: '0%', createdAt: 1,
};

describe('final video submission input', () => {
  it.each(['480P', '768P', '1080P', '2K'])('allows fifteen-second %s and rejects longer Metaso output before dispatch', (resolution) => {
    expect(prepareVideoSubmissionInput({ ...h3Task, videoResolution: resolution, videoDuration: 15 }, 'https://metaso.cn/api', [], [])).toEqual({ resolution, context_ir_enabled: true });
    for (const duration of [16, 30]) expect(() => prepareVideoSubmissionInput({ ...h3Task, videoResolution: resolution, videoDuration: duration }, 'https://metaso.cn/api', [], [])).toThrow('时长');
  });

  it('rejects unsupported output durations before dispatch and retains distinct 2K', () => {
    expect(() => prepareVideoSubmissionInput({ ...h3Task, videoResolution: '2K' }, 'https://metaso.cn', [], [])).toThrow('时长');
    expect(prepareVideoSubmissionInput({ ...h3Task, videoResolution: '2K', videoDuration: 15 }, 'https://metaso.cn', [], [])).toEqual({ resolution: '2K', context_ir_enabled: true });
    expect(() => prepareVideoSubmissionInput(h3Task, 'https://api.minimax.cn', [], [])).toThrow('时长');
    expect(() => prepareVideoSubmissionInput(h3Task, 'https://ai.comfly.org', [], [])).toThrow('时长');
  });

  it('sends explicit Context IR false to Metaso and omits it for other channels', () => {
    expect(prepareVideoSubmissionInput({ ...h3Task, videoDuration: 15, videoContextIrEnabled: false }, 'https://metaso.cn/api', [], []))
      .toEqual({ resolution: '1080P', context_ir_enabled: false });
    for (const base of ['https://api.minimax.cn', 'https://ai.comfly.org', 'https://metaso.cn.example.org']) {
      expect(prepareVideoSubmissionInput({ ...h3Task, videoDuration: 15, videoContextIrEnabled: false }, base, [], []))
        .toEqual({ resolution: '1080P' });
    }
  });
});

it('routes Veo extension media to the backend with the selected channel duration', () => {
  const video = { ...h3Task, model: 'veo3.1', videoRefMode: 'extend', videoResolution: '720P', videoDuration: 8 };
  expect(prepareVideoSubmissionInput(video, 'https://ai.comfly.org', [], ['/storage/local/clip.mp4'])).toEqual({ resolution: '720P', backendReadable: true });
  expect(() => prepareVideoSubmissionInput({ ...video, videoDuration: 7 }, 'https://ai.comfly.org', [], ['/storage/local/clip.mp4'])).toThrow('时长');
  expect(prepareVideoSubmissionInput({ ...video, videoDuration: 7 }, 'https://us-central1-aiplatform.googleapis.com/v1/projects/p/locations/us-central1/publishers/google', [], ['/storage/local/clip.mp4'])).toEqual({ resolution: '720P', backendReadable: true });
});
