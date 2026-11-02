import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { GenerationTask } from '@client/store/appStoreTypes';
import { clearRefMediaRegistry, registerRefMedia } from '@client/shared/media/refMediaRegistry';

const mocks = vi.hoisted(() => ({
  state: { generationTasks: [] as GenerationTask[], sessions: [] as Array<{ id: string; tasks: GenerationTask[] }>, assistantSessions: [], getActiveAssistantSkill: () => undefined, getAllAssistantSkills: () => [] },
  events: [] as Record<string, unknown>[], fetch: vi.fn(), execute: vi.fn(), route: vi.fn(() => ({})),
  streamError: null as Error | null,
}));
vi.mock('@client/store', () => ({ useAppStore: { getState: () => mocks.state } }));
vi.mock('@client/shared/api/apiClient', () => ({ apiFetch: mocks.fetch }));
vi.mock('@client/shared/api/gatewayClient', () => ({ getGatewayClientOverrides: () => ({}), getModelCredentials: () => ({}), getMultimodalClientOverrides: mocks.route }));
vi.mock('@client/shared/api/sseStream', () => ({ readSseEvents: async function* () { yield* mocks.events; if (mocks.streamError) throw mocks.streamError; } }));
vi.mock('@client/shared/agent/dispatchGenerationBatch', () => ({ executeGenerationBatchAction: mocks.execute }));
vi.mock('@client/shared/prompt-bar/agentDefinitions', () => ({ resolveAgentSystemPrompt: () => 'system' }));
vi.mock('@shared/domain/assistant/skills', () => ({ composeSkillCatalog: () => [], composeSkillRuntime: () => undefined }));
vi.mock('@client/shared/prompt-bar/promptBarPreferencesTypes', () => ({ loadPromptPreferences: () => ({ reasoning: {} }) }));

import { submitAgentTask } from './submitAgentTask';

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
  clearRefMediaRegistry();
  mocks.fetch.mockResolvedValue({ ok: true, body: {} });
  mocks.execute.mockReturnValue([{ taskIds: ['generated-task'] }]);
});

describe('Agent batch action stream integration', () => {
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
  it('resolves credentials and protocol using the selected route', async () => {
    mocks.events = reply;
    await submitAgentTask({ ...task, modelRouteKey: 'chat-selected-channel' }, vi.fn());
    expect(mocks.route).toHaveBeenCalledWith('chat-selected-channel');
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
