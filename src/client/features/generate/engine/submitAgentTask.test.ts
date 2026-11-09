import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { configureDomainRuntime } from '@shared/domain/core/runtime';
import { getBuiltinAssistantSkill } from '@shared/domain/assistant/skills/builtin';
import type { AssistantSkill } from '@shared/domain/assistant/skills/types';
import type { GenerationTask } from '@client/store/appStoreTypes';
import { clearRefMediaRegistry, registerRefMedia } from '@client/shared/media/refMediaRegistry';

const mocks = vi.hoisted(() => ({
  state: { generationTasks: [] as GenerationTask[], sessions: [] as Array<{ id: string; tasks: GenerationTask[] }>, assistantSessions: [], getActiveAssistantSkill: (): AssistantSkill | undefined => undefined, getAllAssistantSkills: () => [] },
  events: [] as Record<string, unknown>[], fetch: vi.fn(), execute: vi.fn(),
  streamError: null as Error | null,
}));
vi.mock('@client/store', () => ({ useAppStore: { getState: () => mocks.state } }));
vi.mock('@client/shared/api/apiClient', () => ({ apiFetch: mocks.fetch }));
vi.mock('@client/shared/api/sseStream', () => ({ readSseEvents: async function* () { yield* mocks.events; if (mocks.streamError) throw mocks.streamError; } }));
vi.mock('@client/shared/agent/dispatchGenerationBatch', async importOriginal => ({ ...await importOriginal<typeof import('@client/shared/agent/dispatchGenerationBatch')>(), executeGenerationBatchAction: mocks.execute }));
vi.mock('@shared/domain/assistant/skills', async importOriginal => ({ ...await importOriginal<typeof import('@shared/domain/assistant/skills')>(), composeSkillCatalog: () => [] }));
vi.mock('@client/shared/prompt-bar/promptBarPreferencesTypes', () => ({ loadPromptPreferences: () => ({ reasoning: {} }) }));

import { submitAgentTask } from './submitAgentTask';
import { restoreStoredAgentTask } from './recoverAgentTurn';
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });
import { getUsageLogs, getUsageSummary } from '@client/shared/utils/usageTracker';

const task: GenerationTask = { id: 'agent-task-current', batchId: 'agent-batch', sessionId: 'session-a', mediaType: 'agent', title: '生成', prompt: '把上面这些全部生成', model: 'chat-model', size: '-', quality: 'high', status: 'IN_PROGRESS', progress: '0%', useReferenceImage: false, createdAt: 2 };
const action = { action: 'generate_batch', sourceId: 'source-a', entryIds: ['entry-1'], operationId: 'operation-a' };
const completed = { type: 'item/toolCall/completed', itemId: 'tool-a', name: 'trigger_generate_batch', status: 'done', action };
const reply = [{ type: 'item/started', kind: 'agentMessage', itemId: 'reply' }, { type: 'item/agentMessage/completed', itemId: 'reply', content: '已请求提交，请在清单查看进度。' }, { type: 'turn/completed' }];

beforeEach(() => {
  vi.clearAllMocks();
  mocks.events = [];
  mocks.streamError = null;
  mocks.state.generationTasks = [];
  mocks.state.sessions = [];
  mocks.state.getActiveAssistantSkill = () => undefined;
  clearRefMediaRegistry();
  mocks.fetch.mockResolvedValue({ ok: true, body: {} });
  mocks.execute.mockReturnValue([{ taskIds: ['generated-task'] }]);
});

describe('Agent batch action stream integration', () => {
  it.each(['beike-prompt-extraction', 'beike-cinematic-storyboard', 'beike-character-three-view', 'beike-ugc-product-sales'])('sends selected creation skill %s to the real runtime composer', async id => {
    const skill = getBuiltinAssistantSkill(id)!;
    expect(skill).toBeDefined();
    mocks.state.getActiveAssistantSkill = () => skill;
    mocks.events = reply;
    await submitAgentTask({ ...task, prompt: '按照选用技能处理本次素材' }, vi.fn());
    const body = JSON.parse(mocks.fetch.mock.calls[0][1].body);
    expect(body.skillId).toBe(id);
    expect(body.enableAgentTools).toBe(true);
    expect(body.systemPrompt).toContain(skill.prompt);
    expect(body.allowedTools).toEqual(expect.arrayContaining(skill.tools || []));
    expect(body.allowedTools).not.toContain('trigger_generate_batch');
    expect(body.skillResources).toEqual(expect.arrayContaining([expect.objectContaining({ path: 'agents/beike.json' })]));
  });
  it('uploads local video before the turn and saves its durable URL for follow-ups', async () => {
    const file = new File(['video'], 'reference.webm', { type: 'video/webm' });
    registerRefMedia('blob:reference', file);
    mocks.fetch.mockResolvedValueOnce({ ok: true, json: async () => ({ success: true, url: '/storage/local/assistant-attachments/reference.webm' }) });
    mocks.events = reply;
    const update = vi.fn();
    await submitAgentTask({ ...task, prompt: '分析视频并生成逐镜提示词', referenceImages: ['blob:reference'] }, update);
    expect(mocks.fetch.mock.calls[0]).toEqual(['/api/assistant/media', expect.objectContaining({ body: file, headers: { 'Content-Type': 'video/webm' } })]);
    const body = JSON.parse(mocks.fetch.mock.calls[1][1].body);
    expect(body.messages.at(-1).attachments).toEqual([expect.objectContaining({ type: 'video', url: '/storage/local/assistant-attachments/reference.webm', name: 'reference.webm' })]);
    expect(body.enableAgentTools).toBe(false);
    expect(body.skillCatalog).toBeUndefined();
    expect(update).toHaveBeenCalledWith(task.id, { referenceImages: ['/storage/local/assistant-attachments/reference.webm'] });
  });
  it('does not call the model after a failed media upload', async () => {
    registerRefMedia('blob:reference', new File(['video'], 'reference.mp4', { type: 'video/mp4' }));
    mocks.fetch.mockResolvedValueOnce({ ok: false, json: async () => ({ error: '视频内容与文件格式不匹配' }) });
    const update = vi.fn();
    await submitAgentTask({ ...task, referenceImages: ['blob:reference'] }, update);
    expect(mocks.fetch).toHaveBeenCalledTimes(1);
    expect(update).toHaveBeenLastCalledWith(task.id, expect.objectContaining({ status: 'FAILURE', failReason: expect.stringContaining('视频内容与文件格式不匹配') }));
  });
  it('continues restored conversation history with its video and actual assistant reply', async () => {
    mocks.state.sessions = [{ id: 'session-a', tasks: [{ ...task, id: 'old', createdAt: 1, prompt: '分析视频', referenceImages: ['/storage/local/assistant-attachments/reference.mp4'], agentTurn: { items: [{ id: 'reply-old', kind: 'agentMessage', content: '第一镜头是全景。', createdAt: 1 }] } }] }];
    mocks.state.generationTasks = [{ ...task, id: 'other', sessionId: 'session-b', createdAt: 1, prompt: '其他对话' }];
    mocks.events = reply;
    await submitAgentTask(task, vi.fn());
    const body = JSON.parse(mocks.fetch.mock.calls[0][1].body);
    expect(body.messages).toEqual([
      { role: 'user', content: '分析视频', attachments: [expect.objectContaining({ type: 'video', url: '/storage/local/assistant-attachments/reference.mp4' })] },
      { role: 'assistant', content: '第一镜头是全景。' },
      { role: 'user', content: task.prompt, attachments: [] },
    ]);
    expect(body.enableAgentTools).toBe(true); // The current prompt explicitly requests real media generation.
  });
  it('passes the selected channel entry to the API routing layer', async () => {
    const entries = JSON.stringify([
      { id: 'relay-entry', modelId: task.model, channelId: 'relay' },
      { id: 'default-entry', modelId: task.model },
    ]);
    configureDomainRuntime({ storage: {
      getItem: key => key === 'beike_modality_models_v1_chat' ? entries : null,
      setItem: vi.fn(), removeItem: vi.fn(),
    } });
    try {
      mocks.events = reply;
      await submitAgentTask({ ...task, modelRouteKey: 'default-entry' }, vi.fn());
      expect(JSON.parse(mocks.fetch.mock.calls[0][1].body).model).toBe('default-entry');
    } finally {
      configureDomainRuntime({ storage: null });
    }
  });
  it('executes only completed actions once despite duplicate streamed events', async () => {
    mocks.events = [completed, { ...completed }, ...reply];
    const update = vi.fn();
    await submitAgentTask(task, update);
    expect(mocks.execute).toHaveBeenCalledExactlyOnceWith(action, 'agent', 'session-a', task.prompt);
    expect(update).toHaveBeenLastCalledWith(task.id, expect.objectContaining({ status: 'SUCCESS', agentTurn: expect.objectContaining({ generationNotice: expect.stringContaining('1 项提交记录') }) }));
    const body = JSON.parse(mocks.fetch.mock.calls[0][1].body);
    expect(body.clientContext.generationBatches).toEqual([]);
    expect(body.messages.at(-1).content).toBe(task.prompt);
  });
  it('ignores incomplete, failed and legacy replay events', async () => {
    mocks.events = [{ ...completed, status: 'error' }, { type: 'tool_result', action }, { type: 'snapshot', items: [completed] }, ...reply];
    await submitAgentTask(task, vi.fn());
    expect(mocks.execute).not.toHaveBeenCalled();
  });
  it('reports client-side rejection without claiming generation success', async () => {
    mocks.execute.mockImplementation(() => { throw new Error('生成历史正在恢复'); });
    mocks.events = [completed, ...reply];
    const update = vi.fn();
    await submitAgentTask(task, update);
    expect(update).toHaveBeenLastCalledWith(task.id, expect.objectContaining({ agentTurn: expect.objectContaining({ generationNotice: '批量生成未提交：生成历史正在恢复' }) }));
  });
  it.each(['network error', 'EOF'])('recovers the original turn after %s without resubmitting', async (failure) => {
    const original = { ...task, agentTurn: { turnId: 'original-turn' } };
    mocks.events = reply.slice(0, -1);
    if (failure !== 'EOF') mocks.streamError = new Error(failure);
    mocks.fetch.mockResolvedValueOnce({ ok: true, body: {} }).mockResolvedValueOnce({ ok: true, json: async () => ({ success: true, snapshot: {
      id: 'original-turn', threadId: task.sessionId, status: 'completed', modelUsed: 'resolved-model',
      items: [{ id: 'reply', kind: 'agentMessage', content: '服务端完整分析', createdAt: 1 }],
    } }) });
    const update = vi.fn();
    await submitAgentTask(original, update);
    expect(mocks.fetch.mock.calls.map(call => call[0])).toEqual(['/api/assistant/turn/start', '/api/assistant/turns/original-turn/snapshot']);
    expect(update).toHaveBeenLastCalledWith(task.id, expect.objectContaining({ status: 'SUCCESS', agentTurn: expect.objectContaining({ reply: '服务端完整分析', modelUsed: 'resolved-model' }) }));
    expect(mocks.execute).not.toHaveBeenCalled();
  });
  it('stops reading after completion so a later socket error cannot fail the turn', async () => {
    mocks.events = reply;
    mocks.streamError = new Error('network error after completion');
    const update = vi.fn();
    await submitAgentTask(task, update);
    expect(mocks.fetch).toHaveBeenCalledTimes(1);
    expect(update).toHaveBeenLastCalledWith(task.id, expect.objectContaining({ status: 'SUCCESS' }));
  });
  it('renders a completed replay snapshot even without live item events', async () => {
    mocks.events = [{ type: 'turn/snapshot', snapshot: { id: 'original-turn', threadId: task.sessionId, status: 'completed', items: [{ id: 'saved', kind: 'agentMessage', content: '已保存的分析', createdAt: 1 }] } }];
    const update = vi.fn();
    await submitAgentTask({ ...task, agentTurn: { turnId: 'original-turn' } }, update);
    expect(update).toHaveBeenLastCalledWith(task.id, expect.objectContaining({ status: 'SUCCESS', agentTurn: expect.objectContaining({ reply: '已保存的分析' }) }));
  });
  it('keeps streamed text when recovery reports an interrupted turn with older items', async () => {
    mocks.events = reply.slice(0, -1);
    mocks.streamError = new Error('network error');
    mocks.fetch.mockResolvedValueOnce({ ok: true, body: {} }).mockResolvedValueOnce({ ok: true, json: async () => ({ success: true, snapshot: {
      id: 'original-turn', threadId: task.sessionId, status: 'interrupted', items: [], error: '任务时限已到',
    } }) });
    const update = vi.fn();
    await submitAgentTask({ ...task, agentTurn: { turnId: 'original-turn' } }, update);
    expect(update).toHaveBeenLastCalledWith(task.id, expect.objectContaining({ status: 'FAILURE', failReason: expect.stringContaining('任务时限已到'), agentTurn: expect.objectContaining({ reply: '已请求提交，请在清单查看进度。' }) }));
  });
});


describe('Agent unknown submission receipt recovery', () => {
  it.each(['disconnect', '409', '503', 'empty-body'])('retains the original identity after %s and restores via GET only', async failure => {
    const current = { ...task, agentTurn: { turnId: 'original-turn', threadId: task.sessionId } };
    mocks.state.generationTasks = [current];
    const update = vi.fn((_id: string, patch: Partial<GenerationTask>) => Object.assign(current, patch));
    if (failure === 'disconnect') mocks.fetch.mockRejectedValueOnce(new Error('delivery lost'));
    else mocks.fetch.mockResolvedValueOnce({ ok: failure === 'empty-body', status: failure === '409' ? 409 : failure === '503' ? 503 : 200,
      body: null, json: async () => ({ error: '结果待核实', submissionUnknown: failure !== 'empty-body' }) });
    await submitAgentTask(current, update);
    expect(current).toMatchObject({ status: 'IN_PROGRESS', submissionRecoveryRequired: true, taskId: 'original-turn' });
    mocks.fetch.mockResolvedValueOnce({ ok: true, json: async () => ({ success: true, snapshot: {
      id: 'original-turn', threadId: task.sessionId, status: 'completed', items: [{ id: 'answer', kind: 'agentMessage', content: '原任务完整结果', createdAt: 1 }],
    } }) });
    await restoreStoredAgentTask(current, update, new AbortController().signal);
    expect(current).toMatchObject({ status: 'SUCCESS', submissionRecoveryRequired: false, agentTurn: { reply: '原任务完整结果' } });
    expect(mocks.fetch.mock.calls.map(call => call[0])).toEqual(['/api/assistant/turn/start', '/api/assistant/turns/original-turn/snapshot']);
    expect(mocks.execute).not.toHaveBeenCalled();
  });
  it('preserves the recovery marker and received text when snapshot reads are unavailable', async () => {
    vi.useFakeTimers();
    mocks.events = reply.slice(0, -1);
    mocks.fetch.mockResolvedValueOnce({ ok: true, body: {} }).mockRejectedValue(new Error('offline'));
    const update = vi.fn();
    const pending = submitAgentTask({ ...task, agentTurn: { turnId: 'original-turn' } }, update);
    await vi.advanceTimersByTimeAsync(4000); await pending;
    expect(update).toHaveBeenLastCalledWith(task.id, expect.objectContaining({ status: 'IN_PROGRESS', submissionRecoveryRequired: true,
      agentTurn: expect.objectContaining({ reply: '已请求提交，请在清单查看进度。' }) }));
    expect(mocks.fetch.mock.calls.filter(([url]) => url === '/api/assistant/turn/start')).toHaveLength(1);
  });
  it('keeps an explicit validation rejection retryable without polling', async () => {
    mocks.fetch.mockResolvedValueOnce({ ok: false, status: 400, json: async () => ({ error: '参数不正确' }) });
    const update = vi.fn(); await submitAgentTask(task, update);
    expect(update).toHaveBeenLastCalledWith(task.id, expect.objectContaining({ status: 'FAILURE', submissionRecoveryRequired: false }));
    expect(mocks.fetch).toHaveBeenCalledOnce();
  });
});


it('accounts live Agent usage and refreshed snapshots once in the original scope', async () => {
  const values = new Map<string, string>();
  vi.stubGlobal('localStorage', {
    get length() { return values.size; }, key: (i: number) => [...values.keys()][i] ?? null,
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => { values.set(key, value); }, removeItem: (key: string) => { values.delete(key); },
  });
  vi.stubGlobal('window', { dispatchEvent: vi.fn() });
  const scope = { workspaceId: 'original-workspace', channelId: 'original-channel', mediaType: 'chat' };
  const current = { ...task, usageScope: scope, agentTurn: { turnId: 'accounted-turn', threadId: task.sessionId } };
  mocks.state.generationTasks = [current];
  const update = vi.fn((_id: string, patch: Partial<GenerationTask>) => Object.assign(current, patch));
  mocks.events = [{ type: 'usage', usage: { prompt_tokens: 5 } }, ...reply];
  await submitAgentTask(current, update);
  expect(getUsageLogs()).toHaveLength(1);
  expect(getUsageLogs()[0]).toMatchObject({ taskId: 'text:agent:accounted-turn', promptTokens: 5, scope });
  // A reload recovers the same turn after the active credentials have changed.
  localStorage.setItem('custom_base_url', 'https://different.example');
  localStorage.setItem('beike_workspace_secret', 'different-workspace-secret');
  for (const usage of [{ inputTokens: 5, outputTokens: 7 }, { inputTokens: 2, outputTokens: 1 }]) {
    Object.assign(current, { status: 'IN_PROGRESS', submissionRecoveryRequired: true });
    mocks.fetch.mockResolvedValueOnce({ ok: true, json: async () => ({ success: true, snapshot: {
      id: 'accounted-turn', threadId: task.sessionId, status: 'completed', modelUsed: task.model, usage,
      items: [{ id: 'answer', kind: 'agentMessage', content: '完整回答', createdAt: 1 }],
    } }) });
    await restoreStoredAgentTask(current, update, new AbortController().signal);
  }
  expect(getUsageLogs()).toHaveLength(1);
  expect(getUsageLogs()[0]).toMatchObject({ scope, promptTokens: 5, completionTokens: 7, totalTokens: 12 });
  expect(getUsageSummary('today')).toMatchObject({ totalRequests: 1, totalTokens: 12 });
  expect(mocks.fetch.mock.calls.filter(([url]) => url === '/api/assistant/turn/start')).toHaveLength(1);
});

it.each(['stream-snapshot', 'disconnected-snapshot'])('accounts usage supplied only by %s', async mode => {
  const values = new Map<string, string>();
  vi.stubGlobal('localStorage', {
    get length() { return values.size; }, key: (i: number) => [...values.keys()][i] ?? null,
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => { values.set(key, value); }, removeItem: (key: string) => { values.delete(key); },
  });
  vi.stubGlobal('window', { dispatchEvent: vi.fn() });
  const snapshot = { id: 'snapshot-only', threadId: task.sessionId, status: 'completed', modelUsed: task.model,
    usage: { inputTokens: 11, outputTokens: 22 }, items: [{ id: 'answer', kind: 'agentMessage', content: '完整回答', createdAt: 1 }] };
  mocks.events = mode === 'stream-snapshot' ? [{ type: 'turn/snapshot', snapshot }] : [];
  mocks.fetch.mockResolvedValueOnce({ ok: true, body: {} });
  if (mode === 'disconnected-snapshot') mocks.fetch.mockResolvedValueOnce({ ok: true, json: async () => ({ success: true, snapshot }) });
  await submitAgentTask({ ...task, usageScope: { workspaceId: 'original', channelId: 'original', mediaType: 'chat' }, agentTurn: { turnId: snapshot.id } }, vi.fn());
  expect(getUsageLogs()).toHaveLength(1);
  expect(getUsageLogs()[0]).toMatchObject({ taskId: 'text:agent:snapshot-only', promptTokens: 11, completionTokens: 22, totalTokens: 33 });
});


describe('direct product collection', () => {
  it('uses collection API without an agent model and saves the product card', async () => {
    mocks.fetch.mockResolvedValueOnce({ ok: true, json: async () => ({ success: true, product: { itemId: '10231557417974', platform: 'jd', title: '商品', images: ['https://example.com/p.jpg'] } }) });
    const update = vi.fn();
    await submitAgentTask({ ...task, model: 'direct-collection', prompt: '10231557417974' }, update);
    expect(mocks.fetch).toHaveBeenCalledOnce();
    expect(mocks.fetch.mock.calls[0][0]).toBe('/api/catalog/collect');
    expect(JSON.parse(mocks.fetch.mock.calls[0][1].body)).toEqual({ url: '10231557417974', platform: 'auto' });
    expect(update).toHaveBeenLastCalledWith(task.id, expect.objectContaining({ status: 'SUCCESS', agentTurn: expect.objectContaining({ productWidget: expect.objectContaining({ itemId: '10231557417974', allImages: ['https://example.com/p.jpg'] }) }) }));
  });
  it('finishes with a clear error instead of entering agent recovery', async () => {
    mocks.fetch.mockResolvedValueOnce({ ok: false, json: async () => ({ success: false, error: '未配置采集凭证' }) });
    const update = vi.fn();
    await submitAgentTask({ ...task, model: 'direct-collection' }, update);
    expect(update).toHaveBeenLastCalledWith(task.id, expect.objectContaining({ status: 'FAILURE', submissionRecoveryRequired: false, failReason: '未配置采集凭证' }));
    expect(mocks.fetch).toHaveBeenCalledOnce();
  });
});
