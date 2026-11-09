import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { GenerationTask } from '@client/store';
import { prepareGenerationAttempt } from '@client/shared/media/generationAttempt';
import { apiFetch } from '@client/shared/api/apiClient';
import { getGatewayClientHeaders } from '@client/shared/api/gatewayClient';
import { failedTaskPollEndpoint, pollTasksOnce, probeFailedTasks } from './generationTaskPolling';

vi.mock('@client/store', () => ({ useAppStore: { getState: () => ({ generationTasks: [] }) } }));
vi.mock('@client/shared/api/apiClient', () => ({
  apiFetch: vi.fn(), storageConfigHeaders: () => ({ 'x-storage': 'configured' }),
}));
vi.mock('@client/shared/api/gatewayClient', () => ({
  getGatewayClientOverrides: () => ({ customBaseUrl: 'https://global.example' }),
  getGatewayClientHeaders: vi.fn(() => ({ 'x-custom-base-url': 'https://chosen.example', 'x-custom-api-key': 'chosen-key' })),
}));
vi.mock('@client/shared/utils/modelUsage', () => ({ recordMediaTaskUsage: vi.fn() }));

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(apiFetch).mockImplementation(async () => new Response(JSON.stringify({
    success: true, status: 'SUCCESS', resultUrl: '/storage/result.mp4',
  })));
});

function task(partial: Partial<GenerationTask>): GenerationTask {
  return {
    id: 't1',
    prompt: '',
    model: 'gpt-image-2',
    status: 'FAILURE',
    createdAt: 1,
    ...partial,
  } as GenerationTask;
}

describe('failedTaskPollEndpoint', () => {
  it('routes depth images away from the generic image poller', () => {
    expect(failedTaskPollEndpoint(task({ mediaType: 'depth-image' }))).toBe('/api/generate/depth-image');
    expect(failedTaskPollEndpoint(task({ mediaType: 'image' }))).toBe('/api/generate/image');
    expect(failedTaskPollEndpoint(task({ mediaType: 'audio' }))).toBe('/api/generate/audio');
  });
});

describe('generation receipt query routing', () => {
  it('still accepts an explicit terminal task failure when the query is rate limited', async () => {
    vi.mocked(apiFetch).mockResolvedValueOnce(Response.json({ status: 'FAILURE', failReason: 'provider rejected input' }, { status: 429 }));
    const update = vi.fn();
    await pollTasksOnce([task({ mediaType: 'video', taskId: 'original-upstream', status: 'IN_PROGRESS' })], update, {}, new Set());
    expect(update).toHaveBeenLastCalledWith('t1', expect.objectContaining({ status: 'FAILURE', submissionRecoveryRequired: false }));
  });
  it.each([401, 403, 429])('keeps accepted image/video tasks recoverable after a %s query response', async httpStatus => {
    for (const mediaType of ['image', 'video'] as const) {
      vi.mocked(apiFetch).mockResolvedValueOnce(Response.json({ success: false, error: 'query unavailable' }, { status: httpStatus }));
      const saved = task({ mediaType, taskId: 'original-upstream', status: 'IN_PROGRESS' });
      const update = vi.fn();
      await pollTasksOnce([saved], update, {}, new Set());
      expect(update.mock.calls.some(call => call[1].status === 'FAILURE')).toBe(false);
      vi.mocked(apiFetch).mockResolvedValueOnce(Response.json({ status: 'SUCCESS', resultUrl: '/storage/original.png' }));
      await pollTasksOnce([saved], update, {}, new Set());
      expect(update).toHaveBeenLastCalledWith(saved.id, expect.objectContaining({ status: 'SUCCESS', resultUrl: '/storage/original.png' }));
    }
  });
  it.each(['depth-image', 'depth-video'] as const)('P1 preserves a pending %s after ten recovery queries and accepts its original completion', async mediaType => {
    vi.mocked(apiFetch).mockImplementation(async () => Response.json({ status: 'QUERY_FAILED', submissionPending: true, submissionUnknown: true }));
    const saved = task({ mediaType, status: 'IN_PROGRESS', submissionRecoveryRequired: true });
    const update = vi.fn(); const counts: Record<string, number> = { t1: 5 };
    for (let i = 0; i < 10; i++) await pollTasksOnce([saved], update, counts, new Set());
    expect(update.mock.calls.some(call => call[1].status === 'FAILURE' || call[1].submissionRecoveryRequired === false)).toBe(false);
    vi.mocked(apiFetch).mockResolvedValueOnce(Response.json({ success: true, status: 'SUCCESS', resultUrl: '/original.png' }));
    await pollTasksOnce([saved], update, counts, new Set());
    expect(update).toHaveBeenLastCalledWith('t1', expect.objectContaining({ status: 'SUCCESS', resultUrl: '/original.png', submissionRecoveryRequired: false }));
  });
  it('S09 does not treat an unavailable receipt database as a confirmed missing submission', async () => {
    vi.mocked(apiFetch).mockImplementation(async () => Response.json({ success: false, status: 'QUERY_FAILED', error: 'database unavailable' }, { status: 503 }));
    const saved = task({ mediaType: 'audio', status: 'IN_PROGRESS', submissionRecoveryRequired: true });
    const update = vi.fn();
    for (let i = 0; i < 8; i++) await pollTasksOnce([saved], update, { t1: 5 }, new Set());
    expect(update.mock.calls.some(call => call[1].status === 'FAILURE' || call[1].submissionRecoveryRequired === false)).toBe(false);
  });
  it('S09 never abandons a durable unknown audio receipt as if no operation existed', async () => {
    vi.mocked(apiFetch).mockImplementation(async () => Response.json({ success: false, status: 'QUERY_FAILED', submissionUnknown: true, error: '原音频结果待核对，不会重新提交' }));
    const saved = task({ mediaType: 'audio', status: 'IN_PROGRESS', submissionRecoveryRequired: true });
    const update = vi.fn(); const counts: Record<string, number> = { t1: 5 };
    for (let i = 0; i < 8; i++) await pollTasksOnce([saved], update, counts, new Set());
    expect(update.mock.calls.some(call => call[1].status === 'FAILURE' || call[1].submissionRecoveryRequired === false)).toBe(false);
    expect(update).toHaveBeenLastCalledWith('t1', expect.objectContaining({ failReason: '原音频结果待核对，不会重新提交' }), expect.anything());
    expect(vi.mocked(apiFetch).mock.calls.every(call => new URL(String(call[0]), 'http://localhost').searchParams.get('taskKey') === 't1')).toBe(true);
  });
  it.each(['image', 'video'] as const)('keeps the selected channel and upstream model for %s polling', async mediaType => {
    const saved = task({ mediaType, model: 'upstream-model', modelRouteKey: 'chosen-route', taskId: 'upstream/task', status: 'IN_PROGRESS' });
    const update = vi.fn();
    await pollTasksOnce([saved], update, {}, new Set());
    const [input, init] = vi.mocked(apiFetch).mock.calls[0];
    const url = new URL(String(input), 'http://localhost');
    expect(url.pathname).toBe(`/api/generate/${mediaType}`);
    expect(url.searchParams.get('taskId')).toBe('upstream/task');
    expect(url.searchParams.get('model')).toBe('upstream-model');
    expect(getGatewayClientHeaders).toHaveBeenCalledWith('chosen-route');
    expect(init?.headers).toMatchObject({ 'x-custom-base-url': 'https://chosen.example', 'x-custom-api-key': 'chosen-key' });
    expect(update).toHaveBeenLastCalledWith('t1', expect.objectContaining({ status: 'SUCCESS', resultUrl: '/storage/result.mp4' }));
  });

  it('keeps the selected channel when recovering a disconnected submission', async () => {
    const saved = task({ mediaType: 'video', model: 'upstream-model', modelRouteKey: 'chosen-route', status: 'IN_PROGRESS', submissionRecoveryRequired: true });
    await pollTasksOnce([saved], vi.fn(), {}, new Set());
    const [input, init] = vi.mocked(apiFetch).mock.calls[0];
    expect(new URL(String(input), 'http://localhost').searchParams.get('taskKey')).toBe('t1');
    expect(init?.headers).toMatchObject({ 'x-custom-base-url': 'https://chosen.example' });
  });

  it('links an uncertain receipt with an upstream ID instead of treating it as a missing submission', async () => {
    vi.mocked(apiFetch).mockResolvedValue(new Response(JSON.stringify({
      success: false, status: 'QUERY_FAILED', submissionUnknown: true,
      taskId: 'accepted-original', recordId: 'saved-receipt', model: 'upstream-model',
    })));
    const saved = task({ mediaType: 'video', status: 'IN_PROGRESS', submissionRecoveryRequired: true });
    const update = vi.fn();
    await pollTasksOnce([saved], update, { t1: 5 }, new Set());
    expect(update).toHaveBeenLastCalledWith('t1', expect.objectContaining({
      taskId: 'accepted-original', dbId: 'saved-receipt', submissionRecoveryRequired: false,
    }));
    expect(update.mock.calls.some(([, patch]) => patch.status === 'FAILURE')).toBe(false);
  });

  it('asks the backend to recheck the failed receipt without resubmitting generation', async () => {
    const saved = task({ mediaType: 'video', model: 'upstream-model', modelRouteKey: 'chosen-route', taskId: 'original/task' });
    const update = vi.fn();
    const recovered = new Set<string>();
    await probeFailedTasks([saved], update, recovered, new Set());
    const [input, init] = vi.mocked(apiFetch).mock.calls[0];
    const url = new URL(String(input), 'http://localhost');
    expect(url.searchParams.get('model')).toBe('upstream-model');
    expect(url.searchParams.get('recheck_failed')).toBe('1');
    expect(init?.method).not.toBe('POST');
    expect(init?.headers).toMatchObject({ 'x-custom-base-url': 'https://chosen.example' });
    expect(recovered.has('t1')).toBe(true);
  });
});

it('closes a saved video intent before retry and keeps uncertain paid submissions in recovery',async()=>{
 const saved=task({mediaType:'video',status:'IN_PROGRESS',submissionRecoveryRequired:true});
 const update=vi.fn();
 vi.mocked(apiFetch).mockResolvedValueOnce(Response.json({status:'FAILURE',model:'',submissionRejected:true,failReason:'原任务键已关闭'}));
 await pollTasksOnce([saved],update,{},new Set());
 expect(String(vi.mocked(apiFetch).mock.calls[0][0])).toContain('closeMissing=true');
 expect(update).toHaveBeenLastCalledWith(saved.id,expect.objectContaining({status:'FAILURE',submissionRecoveryRequired:false}));
 expect(update.mock.calls.at(-1)?.[1]).not.toHaveProperty('model');
 update.mockClear();
 vi.mocked(apiFetch).mockResolvedValueOnce(Response.json({status:'QUERY_FAILED',submissionUnknown:true}));
 await pollTasksOnce([saved],update,{},new Set());
 expect(update.mock.calls.some(call=>call[1].status==='FAILURE'||call[1].submissionRecoveryRequired===false)).toBe(false);
});

it.each(['image', 'audio'] as const)('P1 keeps missing %s receipts unknown until the backend closes the original key', async mediaType => {
  const saved = task({ mediaType, status: 'IN_PROGRESS', submissionRecoveryRequired: true });
  vi.mocked(apiFetch).mockImplementation(async () => Response.json({ status: 'QUERY_FAILED', retryable: true }));
  expect(await prepareGenerationAttempt(saved, 'retry-batch')).toBeNull();
  const update = vi.fn(); const counts: Record<string, number> = {};
  for (let i = 0; i < 10; i++) await pollTasksOnce([saved], update, counts, new Set());
  expect(vi.mocked(apiFetch).mock.calls.every(([url]) => String(url).includes('closeMissing=true'))).toBe(true);
  expect(update.mock.calls.some(([, patch]) => patch.status === 'FAILURE' || patch.submissionRecoveryRequired === false)).toBe(false);
  vi.mocked(apiFetch).mockResolvedValueOnce(Response.json({ success: false, status: 'FAILURE', submissionRejected: true, submissionClosed: true, failReason: '原操作已关闭，可重试' }));
  await pollTasksOnce([saved], update, counts, new Set());
  expect(update).toHaveBeenLastCalledWith(saved.id, expect.objectContaining({ status: 'FAILURE', submissionRecoveryRequired: false }));
  const settled = { ...saved, ...update.mock.calls.at(-1)?.[1] };
  const retry = await prepareGenerationAttempt(settled, 'retry-batch');
  expect(retry?.id).not.toBe(saved.id);
  expect(retry).toMatchObject({ status: 'IN_PROGRESS', mediaType });
});

it('keeps a switched-channel receipt read-only and pins the record returned after restoring the channel',async()=>{
 const saved=task({id:'studio-route',canvasProjectId:'canvas-1',status:'IN_PROGRESS',mediaType:'image',taskId:'original'});
 const update=vi.fn();
 vi.mocked(apiFetch).mockResolvedValueOnce(Response.json({success:false,code:'task_route_changed',submissionUnknown:true,error:'恢复原渠道'},{status:409}));
 await pollTasksOnce([saved],update,{},new Set());
 expect(update).toHaveBeenLastCalledWith(saved.id,{routeQueryBlock:'恢复原渠道'},{persist:false});
 expect(String(vi.mocked(apiFetch).mock.calls[0][0])).toContain('requireRoute=true');
 vi.mocked(apiFetch).mockResolvedValueOnce(Response.json({success:true,status:'IN_PROGRESS',recordId:'pinned-record'}));
 await pollTasksOnce([{...saved,routeQueryBlock:'恢复原渠道'}],update,{},new Set());
 expect(update).toHaveBeenCalledWith(saved.id,{routeQueryBlock:undefined},{persist:false});
 expect(update).toHaveBeenLastCalledWith(saved.id,{dbId:'pinned-record'});
 await pollTasksOnce([{...saved,dbId:'pinned-record'}],update,{},new Set());
 expect(vi.mocked(apiFetch).mock.calls.at(-1)?.[1]?.headers).toMatchObject({'x-task-record-id':'pinned-record'});
 expect(vi.mocked(apiFetch).mock.calls.every(([,init])=>init?.method!=='POST')).toBe(true);
});

it('keeps the original audio and route when starting a confirmed failed task as a new attempt',async()=>{
 const failed=task({id:'studio-audio',canvasProjectId:'canvas-1',mediaType:'video',taskId:'old-video',modelRouteKey:'comfly-h3',referenceAudioUrls:['/storage/local/audio/old.wav']});
 const next=await prepareGenerationAttempt(failed,'retry-batch');
 expect(next).toMatchObject({modelRouteKey:failed.modelRouteKey,referenceAudioUrls:failed.referenceAudioUrls});
 expect(next?.taskId).toBeUndefined();
 expect(next?.id).not.toBe(failed.id);
 expect(await prepareGenerationAttempt({...failed,referenceMediaMissing:true},'retry-batch')).toBeNull();
});
