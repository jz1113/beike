import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { GenerationTask } from '@client/store/appStoreTypes';

const mocks = vi.hoisted(() => ({
  state: { generationTasks: [] as unknown[], sessions: [], assistantSessions: [], getActiveAssistantSkill: () => undefined, getAllAssistantSkills: () => [] },
  events: [] as Record<string, unknown>[], fetch: vi.fn(), execute: vi.fn(),
}));
vi.mock('@client/store', () => ({ useAppStore: { getState: () => mocks.state } }));
vi.mock('@client/shared/api/apiClient', () => ({ apiFetch: mocks.fetch }));
vi.mock('@client/shared/api/gatewayClient', () => ({ getGatewayClientOverrides: () => ({}), getModelCredentials: () => ({}), getMultimodalClientOverrides: () => ({}) }));
vi.mock('@client/shared/api/sseStream', () => ({ readSseEvents: async function* () { yield* mocks.events; } }));
vi.mock('@client/shared/agent/dispatchGenerationBatch', () => ({ executeGenerationBatchAction: mocks.execute }));
vi.mock('@client/shared/prompt-bar/agentDefinitions', () => ({ resolveAgentSystemPrompt: () => 'system' }));
vi.mock('@shared/domain/assistant/skills', () => ({ composeSkillCatalog: () => [], composeSkillRuntime: () => undefined }));
vi.mock('@client/shared/prompt-bar/promptBarPreferencesTypes', () => ({ loadPromptPreferences: () => ({ reasoning: {} }) }));

import { submitAgentTask } from './submitAgentTask';

const task: GenerationTask = { id: 'agent-task-current', batchId: 'agent-batch', sessionId: 'session-a', mediaType: 'agent', title: '生成', prompt: '把上面这些全部生成', model: 'chat-model', size: '-', quality: 'high', status: 'IN_PROGRESS', progress: '0%', useReferenceImage: false, createdAt: 2 };
const action = { action: 'generate_batch', sourceId: 'source-a', entryIds: ['entry-1'], operationId: 'operation-a' };
const completed = { type: 'item/toolCall/completed', itemId: 'tool-a', name: 'trigger_generate_batch', status: 'done', action };
const reply = [{ type: 'item/started', kind: 'agentMessage', itemId: 'reply' }, { type: 'item/agentMessage/completed', itemId: 'reply', content: '已请求提交，请在清单查看进度。' }];

beforeEach(() => {
  vi.clearAllMocks();
  mocks.events = [];
  mocks.state.generationTasks = [];
  mocks.fetch.mockResolvedValue({ ok: true, body: {} });
  mocks.execute.mockReturnValue([{ taskIds: ['generated-task'] }]);
});

describe('Agent batch action stream integration', () => {
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
});
