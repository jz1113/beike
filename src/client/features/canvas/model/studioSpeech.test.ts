import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { apiFetch } from '@client/shared/api/apiClient';
import { getGatewayClientHeaders } from '@client/shared/api/gatewayClient';
import { studioChannels } from './studioGeneration';
import { canvasSpeechRequest, readStudioSpeechOperation, recoverStudioSpeechNode } from './studioSpeech';

vi.mock('@client/shared/api/apiClient', () => ({ apiFetch: vi.fn() }));
vi.mock('@client/shared/api/gatewayClient', () => ({ getGatewayClientHeaders: vi.fn() }));
vi.mock('./studioGeneration', () => ({ studioChannels: vi.fn() }));
const context = { projectId: 'project', nodeId: 'speech' };
const channel = { id: 'voice', kind: 'voice' as const, route: 'original-route', modelId: 'speech-2.8-hd', name: 'Voice', preferred: false };
let storage: Storage;
function operationKey() {
  return [...Array(storage.length)].map((_, index) => storage.key(index)!).find(key => key.startsWith('beike.canvas.speech-operation.v1:'))!;
}
const run = (id = 'studio-original', extra = {}) => canvasSpeechRequest('voice', '朗读文字', 'voice-a', id, { ...context, ...extra });
const success = () => Response.json({ success: true, audioUrl: '/original.mp3', usage: { totalTokens: 7 } });
beforeEach(() => {
  vi.resetAllMocks();
  const rows = new Map<string, string>();
  storage = { get length() { return rows.size; }, key: index => [...rows.keys()][index] ?? null,
    getItem: key => rows.get(key) ?? null, setItem: (key, value) => { rows.set(key, value); }, removeItem: key => { rows.delete(key); }, clear: () => rows.clear() };
  vi.stubGlobal('localStorage', storage);
  vi.stubGlobal('window', {});
  const locks = new Map<string, Promise<unknown>>();
  vi.stubGlobal('navigator', { locks: { request: (key: string, _options: unknown, callback: () => unknown) => {
    const next = (locks.get(key) || Promise.resolve()).catch(() => {}).then(callback);
    locks.set(key, next); return next;
  } } });
  storage.setItem('beike_workspace_secret', 'workspace-a-'.repeat(4));
  vi.mocked(studioChannels).mockReturnValue([channel]);
  vi.mocked(getGatewayClientHeaders).mockReturnValue({ 'x-custom-api-key': 'private-original', 'x-custom-base-url': 'https://original.test' });
});
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });

it('S10 persists and verifies the operation and saves its scene before the first POST', async () => {
  const saved = vi.fn(async (id: string) => {
    expect(readStudioSpeechOperation(context)).toMatchObject({ id, status: 'pending' });
    expect(apiFetch).not.toHaveBeenCalled();
  });
  vi.mocked(apiFetch).mockImplementation(async (_url, init) => {
    expect(saved).toHaveBeenCalledWith('studio-original');
    expect(JSON.parse(String(init?.body)).clientTaskId).toBe('studio-original');
    expect(new Headers(init?.headers).get('x-idempotency-key')).toBe('studio-original');
    return success();
  });
  expect(await run(undefined, { onOperation: saved })).toBe('/original.mp3');
  expect(readStudioSpeechOperation(context)).toMatchObject({ status: 'completed', audioUrl: '/original.mp3' });
  expect(storage.getItem(operationKey())).not.toContain('private-original');
});

it('S10 recovers a lost first receipt with its original key after reopening, without POSTing again', async () => {
  vi.mocked(apiFetch).mockRejectedValueOnce(new TypeError('response lost'));
  await expect(run()).rejects.toMatchObject({ recoveryRequired: true });
  const restored = recoverStudioSpeechNode('project', { id: 'speech', type: 'gen-speech', isGenerating: true, beikeLastTaskId: 'studio-original' });
  expect(restored).toMatchObject({ beikeSpeechOperationId: 'studio-original', beikeSpeechRecoveryRequired: true, isGenerating: false });
  vi.mocked(studioChannels).mockReturnValue([]);
  vi.mocked(apiFetch).mockResolvedValueOnce(success());
  const reopened = await import('./studioSpeech');
  expect(await reopened.canvasSpeechRequest('removed-model', '已改文字', 'changed', 'studio-new-proposal', context)).toBe('/original.mp3');
  expect(vi.mocked(apiFetch).mock.calls.map(([url, init]) => [url, init?.method || 'GET'])).toEqual([
    ['/api/generate/audio', 'POST'], ['/api/generate/audio?taskKey=studio-original', 'GET'],
  ]);
});

it.each([
  ['pending', 409, { submissionUnknown: true }], ['not found', 404, { error: 'not found' }],
  ['server error', 503, { error: 'unavailable' }], ['unauthorized', 401, { error: 'unauthorized' }],
  ['unknown beats rejection', 502, { submissionUnknown: true, submissionRejected: true }],
])('S10 %s keeps the same unknown operation across repeated clicks', async (_name, status, data) => {
  vi.mocked(apiFetch).mockRejectedValueOnce(new TypeError('lost'));
  await expect(run()).rejects.toMatchObject({ recoveryRequired: true });
  vi.mocked(apiFetch).mockImplementation(async () => Response.json(data, { status }));
  for (const id of ['new-1', 'new-2']) await expect(run(id)).rejects.toMatchObject({ recoveryRequired: true });
  expect(readStudioSpeechOperation(context)).toMatchObject({ id: 'studio-original', status: 'pending' });
  expect(vi.mocked(apiFetch).mock.calls.filter(([, init]) => init?.method === 'POST')).toHaveLength(1);
  expect(vi.mocked(apiFetch).mock.calls.slice(1).every(([url]) => String(url).includes('taskKey=studio-original'))).toBe(true);
});

it('S10 unreadable responses and later network errors retain the original key', async () => {
  vi.mocked(apiFetch).mockResolvedValueOnce(new Response('invalid-json'));
  await expect(run()).rejects.toMatchObject({ recoveryRequired: true });
  vi.mocked(apiFetch).mockRejectedValueOnce(Error('offline'));
  await expect(run('new')).rejects.toMatchObject({ recoveryRequired: true });
  expect(readStudioSpeechOperation(context)?.id).toBe('studio-original');
});

it('S10 concurrent tabs share one pending operation and dispatch at most one POST', async () => {
  let finish!: (value: Response) => void;
  const first = new Promise<Response>(resolve => { finish = resolve; });
  vi.mocked(apiFetch).mockImplementation(async (_url, init) => init?.method === 'POST' ? first : Response.json({ submissionUnknown: true }, { status: 409 }));
  const owner = run();
  await vi.waitFor(() => expect(apiFetch).toHaveBeenCalledOnce());
  await expect(run('second-tab')).rejects.toMatchObject({ recoveryRequired: true });
  finish(success());
  expect(await owner).toBe('/original.mp3');
  expect(vi.mocked(apiFetch).mock.calls.map(([, init]) => init?.method || 'GET')).toEqual(['POST', 'GET']);
});

it('S10 a stale tab reuses a completed receipt; only a new intent observing that completion can generate again', async () => {
  vi.mocked(apiFetch).mockImplementation(async () => success());
  await run();
  expect(await run('stale-tab')).toBe('/original.mp3');
  expect(apiFetch).toHaveBeenCalledOnce();
  await run('explicit-new', { previousOperationId: 'studio-original' });
  expect(apiFetch).toHaveBeenCalledTimes(2);
  expect(readStudioSpeechOperation(context)?.id).toBe('explicit-new');
});

it('S10 a confirmed rejection permits a new explicit operation but does not auto-resubmit', async () => {
  vi.mocked(apiFetch).mockResolvedValueOnce(Response.json({ submissionRejected: true, error: 'invalid voice' }, { status: 400 }));
  await expect(run()).rejects.toMatchObject({ submissionRejected: true });
  expect(readStudioSpeechOperation(context)?.status).toBe('rejected');
  vi.mocked(apiFetch).mockResolvedValueOnce(success());
  await run('corrected', { previousOperationId: 'studio-original' });
  expect(apiFetch).toHaveBeenCalledTimes(2);
});

it('S10 scene-only legacy intents query the saved ID even when local operation storage is missing', async () => {
  vi.mocked(apiFetch).mockResolvedValueOnce(success());
  const restored = recoverStudioSpeechNode('project', { id: 'speech', type: 'gen-speech', isGenerating: true, beikeTaskId: 'studio-legacy' });
  expect(restored).toMatchObject({ beikeSpeechOperationId: 'studio-legacy', beikeSpeechRecoveryRequired: true });
  await run('new-proposal', { previousOperationId: 'studio-legacy', recoveryOnly: true });
  expect(apiFetch).toHaveBeenCalledWith('/api/generate/audio?taskKey=studio-legacy', expect.anything());
});

it('S10 restores a completed local receipt when the final scene save was lost', async () => {
  vi.mocked(apiFetch).mockResolvedValueOnce(success()); await run();
  expect(recoverStudioSpeechNode('project', { id: 'speech', type: 'gen-speech', isGenerating: true })).toMatchObject({
    content: '/original.mp3', beikeSpeechOperationId: 'studio-original', beikeSpeechRecoveryRequired: false, isGenerating: false,
  });
});

it.each(['write', 'readback', 'corrupt', 'locks'])('S10 %s storage/locking failure prevents any submission', async failure => {
  if (failure === 'write') vi.spyOn(storage, 'setItem').mockImplementation(() => { throw Error('quota'); });
  if (failure === 'readback') vi.spyOn(storage, 'setItem').mockImplementation(() => {});
  if (failure === 'corrupt') {
    vi.mocked(apiFetch).mockRejectedValueOnce(Error('offline')); await expect(run()).rejects.toThrow();
    storage.setItem(operationKey(), '{broken'); vi.mocked(apiFetch).mockClear();
  }
  if (failure === 'locks') vi.stubGlobal('navigator', {});
  await expect(run()).rejects.toMatchObject({ recoveryRequired: true });
  expect(apiFetch).not.toHaveBeenCalled();
});

it('S10 scene-save failure blocks dispatch and allows a corrected explicit attempt', async () => {
  await expect(run(undefined, { onOperation: async () => { throw Error('scene save failed'); } })).rejects.toMatchObject({ submissionRejected: true });
  expect(apiFetch).not.toHaveBeenCalled();
  expect(readStudioSpeechOperation(context)?.status).toBe('rejected');
  vi.mocked(apiFetch).mockResolvedValueOnce(success());
  await run('after-save', { previousOperationId: 'studio-original' });
});

it('S10 completion storage failure keeps the old pending identity for GET recovery', async () => {
  vi.mocked(apiFetch).mockImplementationOnce(async () => {
    vi.spyOn(storage, 'setItem').mockImplementation(() => { throw Error('quota'); });
    return success();
  });
  await expect(run()).rejects.toMatchObject({ recoveryRequired: true });
  vi.restoreAllMocks();
  expect(readStudioSpeechOperation(context)).toMatchObject({ id: 'studio-original', status: 'pending' });
  vi.mocked(apiFetch).mockResolvedValueOnce(success());
  await run('never-submit-this');
  expect(vi.mocked(apiFetch).mock.calls.at(-1)?.[0]).toBe('/api/generate/audio?taskKey=studio-original');
});

it('S10 workspace, project and node identifiers isolate operations', async () => {
  vi.mocked(apiFetch).mockImplementation(async () => success());
  await run();
  await run('other-node', { nodeId: 'other' });
  await run('other-project', { projectId: 'other' });
  storage.setItem('beike_workspace_secret', 'workspace-b-'.repeat(4));
  await run('other-workspace');
  expect(vi.mocked(apiFetch).mock.calls.every(([, init]) => init?.method === 'POST')).toBe(true);
  expect(apiFetch).toHaveBeenCalledTimes(4);
});


it('S10 a client disconnect after dispatch preserves the key; reopening only queries it', async () => {
  const controller = new AbortController();
  vi.mocked(apiFetch).mockImplementationOnce(async (_url, init) => {
    controller.abort(); init?.signal?.throwIfAborted(); return success();
  });
  await expect(run(undefined, { signal: controller.signal })).rejects.toMatchObject({ recoveryRequired: true });
  expect(readStudioSpeechOperation(context)).toMatchObject({ id: 'studio-original', status: 'pending' });
  vi.mocked(apiFetch).mockResolvedValueOnce(success());
  await run('reopened', { previousOperationId: 'studio-original', recoveryOnly: true });
  expect(vi.mocked(apiFetch).mock.calls.map(([, init]) => init?.method || 'GET')).toEqual(['POST', 'GET']);
});

it('S10 cancellation during scene saving never reaches the model', async () => {
  const controller = new AbortController();
  await expect(run(undefined, { signal: controller.signal, onOperation: () => { controller.abort(); } })).rejects.toMatchObject({ submissionRejected: true });
  expect(apiFetch).not.toHaveBeenCalled();
  expect(readStudioSpeechOperation(context)?.status).toBe('rejected');
});


it('S10 an old saved speech error is restored as GET-only recovery', () => {
  expect(recoverStudioSpeechNode('project', { id: 'speech', type: 'gen-speech', isGenerating: false, beikeLastTaskId: 'studio-legacy', errorMsg: 'network error' }))
    .toMatchObject({ beikeSpeechOperationId: 'studio-legacy', beikeSpeechRecoveryRequired: true });
});

it('S10 missing historical identity blocks submission instead of inventing a recovery key', async () => {
  await expect(run('new-proposal', { recoveryOnly: true })).rejects.toMatchObject({ recoveryRequired: true });
  expect(apiFetch).not.toHaveBeenCalled();
  expect(readStudioSpeechOperation(context)).toBeUndefined();
});

it('S10 changing workspace during scene saving cannot dispatch under a different workspace', async () => {
  await expect(run(undefined, { onOperation: () => { storage.setItem('beike_workspace_secret', 'new-workspace-'.repeat(4)); } }))
    .rejects.toMatchObject({ submissionRejected: true });
  expect(apiFetch).not.toHaveBeenCalled();
});

it('P2 accounts studio speech under original scope after unknown recovery and cached replay', async () => {
  const { getUsageLogs } = await import('@client/shared/utils/usageTracker');
  vi.stubGlobal('window', { dispatchEvent: () => true });
  vi.mocked(apiFetch).mockResolvedValueOnce(Response.json({ submissionUnknown: true, usage: { prompt_tokens: 3 } }, { status: 409 }));
  await expect(run()).rejects.toMatchObject({ recoveryRequired: true });
  expect(getUsageLogs()).toHaveLength(1);
  const scope = getUsageLogs()[0].scope;
  expect(getUsageLogs()[0]).toMatchObject({ totalTokens: 3, success: false, mediaCount: 0 });
  vi.mocked(studioChannels).mockReturnValue([]);
  vi.mocked(getGatewayClientHeaders).mockReturnValue({ 'x-custom-api-key': 'changed' });
  vi.mocked(apiFetch).mockResolvedValueOnce(Response.json({ success: true, audioUrl: '/original.mp3', usage: { completion_tokens: 7, total_tokens: 10 } }));
  await run('new-proposal');
  await run('cached-proposal');
  expect(getUsageLogs()).toHaveLength(1);
  expect(getUsageLogs()[0]).toMatchObject({ scope, promptTokens: 3, completionTokens: 7, totalTokens: 10, mediaCount: 1, success: true });
  expect(apiFetch).toHaveBeenCalledTimes(2);
});

it('P2 completed canvas usage replays after scene-save loss but never revives cleared statistics', async () => {
  const { getUsageLogs, clearUsageLogs } = await import('@client/shared/utils/usageTracker');
  vi.stubGlobal('window', { dispatchEvent: () => true });
  vi.mocked(apiFetch).mockResolvedValueOnce(success());
  await run();
  expect(getUsageLogs()[0]).toMatchObject({ totalTokens: 7, mediaCount: 1, success: true });
  for (const key of [...Array(storage.length)].map((_, i) => storage.key(i)!)) if (key.startsWith('beike.usage-receipt.')) storage.removeItem(key);
  recoverStudioSpeechNode('project', { id: 'speech', type: 'gen-speech', isGenerating: true });
  expect(getUsageLogs()).toHaveLength(1);
  clearUsageLogs();
  recoverStudioSpeechNode('project', { id: 'speech', type: 'gen-speech', isGenerating: true });
  await run('cached-after-clear');
  expect(getUsageLogs()).toHaveLength(0);
  expect(apiFetch).toHaveBeenCalledOnce();
});

it('P2 historical speech without a captured scope restores its URL without guessing current usage ownership', async () => {
  const { getUsageLogs } = await import('@client/shared/utils/usageTracker');
  vi.stubGlobal('window', { dispatchEvent: () => true });
  vi.mocked(apiFetch).mockResolvedValueOnce(success());
  await run('proposal', { previousOperationId: 'legacy-original', recoveryOnly: true });
  expect(getUsageLogs()).toHaveLength(0);
  expect(apiFetch).toHaveBeenCalledWith('/api/generate/audio?taskKey=legacy-original', expect.anything());
});
