import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AppState } from '@client/store/types';
import type { AssistantMessage, GenerationTask } from '@client/store/appStoreTypes';
import { buildGenerationPromptBatch, type BatchGenerationSettings } from './buildGenerationPromptBatch';
import { assistantPromptSource, generationPromptSources } from './generationBatchSources';
import { readGenerationBatchReceipts } from './generationBatchReceipts';
import { saveGenerationBatchDraft } from './generationBatchDrafts';
import { currentBatchSettings, dispatchGenerationBatch, executeGenerationBatchAction, type GenerationBatchRequest } from './dispatchGenerationBatch';

const mocks = vi.hoisted(() => ({ getState: vi.fn(), setState: vi.fn(), persist: vi.fn() }));
vi.mock('@client/store', () => ({ useAppStore: { getState: mocks.getState, setState: mocks.setState } }));
vi.mock('@client/store/persist/generation', () => ({ persistDrawingStateToStorage: mocks.persist }));
vi.mock('./buildGenerationPromptBatch', async importOriginal => {
  const actual = await importOriginal<typeof import('./buildGenerationPromptBatch')>();
  return { ...actual, buildGenerationPromptBatch: vi.fn(actual.buildGenerationPromptBatch) };
});
vi.mock('@shared/domain/models/modalityStorage', () => ({
  upstreamModalityModelId: (_kind: string, id: string) => id === 'image-channel' ? 'gpt-image-2' : id,
  modalityPickerSelections: (kind: string) => kind === 'image'
    ? [{ id: 'image-channel', name: '图片渠道', modelId: 'gpt-image-2' }]
    : [{ id: 'doubao-seedance-2.0-mini', name: '视频渠道', modelId: 'doubao-seedance-2.0-mini' }],
}));

type DispatchState = Pick<AppState, 'generationHistoryReady' | 'currentSessionId' | 'currentAssistantSessionId' | 'sessions'
  | 'assistantSessions' | 'generationTasks' | 'quickModel' | 'quickAspectId' | 'quickQuality' | 'quickVideoModel'
  | 'quickVideoAspectId' | 'quickVideoResolution' | 'quickVideoDuration' | 'quickVideoRefMode'>;
const RECEIPTS = 'beike_agent_generation_receipts_v1';
const DRAFTS = 'beike_agent_generation_drafts_v1';
const settings: BatchGenerationSettings = { imageModel: 'image-channel', imageAspect: '3:4', imageQuality: 'high',
  videoModel: 'doubao-seedance-2.0-mini', videoAspect: '9:16', videoResolution: '480P', videoDuration: 5, videoRefMode: 'text' };
const content = '## 封面\n```image-prompt\n自然光影，商品居中\n```\n## 内页\n```image-prompt\n柔和背景，商品侧面\n```';
const reply: AssistantMessage = { id: 'reply', role: 'assistant', content, timestamp: 1 };
let state: DispatchState;
let values: Map<string, string>;

function request(overrides: Partial<GenerationBatchRequest> = {}): GenerationBatchRequest {
  const source = assistantPromptSource(state.assistantSessions[0].messages, state.assistantSessions[0].messages[0], 'assistant-session');
  return { sourceId: source.sourceId, entryIds: source.entries.map(entry => entry.id), kind: 'assistant', sessionId: 'assistant-session', ...overrides };
}
function agentTask(): GenerationTask {
  return { id: 'agent-reply', title: '原回复', prompt: '', model: '', size: '', quality: '', useReferenceImage: false,
    status: 'SUCCESS', mediaType: 'agent', progress: '100%', createdAt: 1, sessionId: 'generation-session', agentTurn: { reply: content } };
}
function expectNoPublication() {
  expect(mocks.setState).not.toHaveBeenCalled();
  expect(mocks.persist).not.toHaveBeenCalled();
  expect(state.generationTasks).toEqual([]);
}

beforeEach(() => {
  vi.clearAllMocks();
  values = new Map();
  vi.stubGlobal('localStorage', {
    getItem: vi.fn((key: string) => values.get(key) ?? null),
    setItem: vi.fn((key: string, value: string) => { values.set(key, value); }),
    removeItem: vi.fn((key: string) => { values.delete(key); }),
  });
  state = { generationHistoryReady: true, currentSessionId: 'generation-session', currentAssistantSessionId: 'assistant-session',
    sessions: [{ id: 'generation-session', title: '原生成会话', createdAt: 1, tasks: [] }],
    assistantSessions: [{ id: 'assistant-session', title: '原助手会话', createdAt: 1, updatedAt: 1, messages: [structuredClone(reply)] }],
    generationTasks: [], quickModel: settings.imageModel, quickAspectId: settings.imageAspect, quickQuality: settings.imageQuality,
    quickVideoModel: settings.videoModel, quickVideoAspectId: settings.videoAspect, quickVideoResolution: settings.videoResolution,
    quickVideoDuration: settings.videoDuration, quickVideoRefMode: settings.videoRefMode };
  mocks.getState.mockImplementation(() => state);
  mocks.setState.mockImplementation((update: Partial<DispatchState>) => { Object.assign(state, update); });
  mocks.persist.mockImplementation(() => undefined);
});
afterEach(() => vi.unstubAllGlobals());

describe('generation batch dispatch safety gates', () => {
  it('blocks while generation history is restoring, before preparation or storage writes', () => {
    state.generationHistoryReady = false;
    expect(() => dispatchGenerationBatch(request())).toThrow('历史正在恢复');
    expect(buildGenerationPromptBatch).not.toHaveBeenCalled();
    expect(localStorage.setItem).not.toHaveBeenCalled();
    expectNoPublication();
  });

  it.each(['assistant', 'agent'] as const)('isolates the originating %s conversation after switching', kind => {
    const original = agentTask(); state.sessions[0].tasks = [original];
    const source = generationPromptSources(state, kind, kind === 'agent' ? 'generation-session' : 'assistant-session')[0];
    if (kind === 'agent') state.currentSessionId = 'other-generation-session';
    else state.currentAssistantSessionId = 'other-assistant-session';
    expect(() => dispatchGenerationBatch({ sourceId: source.sourceId, entryIds: source.entries.map(entry => entry.id), kind, sessionId: source.sessionId })).toThrow('已切换会话');
    expect(buildGenerationPromptBatch).not.toHaveBeenCalled();
    expectNoPublication();
  });

  it('rejects a source identifier from another session even when its prompt text is identical', () => {
    const foreign = assistantPromptSource([reply], reply, 'other-assistant-session');
    state.assistantSessions.push({ id: 'other-assistant-session', title: '其他会话', createdAt: 1, updatedAt: 1, messages: [reply] });
    expect(() => dispatchGenerationBatch({ ...request(), sourceId: foreign.sourceId })).toThrow('来源已变更');
    expectNoPublication();
  });

  it.each(['streaming', 'failed', 'changed', 'deleted', 'legacy'] as const)('rejects a %s source without publishing', condition => {
    const input = request(); const message = state.assistantSessions[0].messages[0];
    if (condition === 'streaming') message.streamingStatus = '回复中';
    if (condition === 'failed') message.error = true;
    if (condition === 'changed') message.content += '\n修改过的文字';
    if (condition === 'deleted') state.assistantSessions[0].messages = [];
    if (condition === 'legacy') message.imageBatchSessionId = 'old-batch';
    expect(() => dispatchGenerationBatch(input)).toThrow(condition === 'legacy' ? '已有生成记录' : '来源已变更');
    expectNoPublication();
  });

  it.each(['empty', 'duplicate', 'foreign', 'too-many'] as const)('rejects %s selection atomically', selection => {
    const input = request();
    input.entryIds = selection === 'empty' ? [] : selection === 'duplicate' ? [input.entryIds[0], input.entryIds[0]]
      : selection === 'foreign' ? [input.entryIds[0], 'another-reply-entry'] : Array.from({ length: 31 }, (_, i) => `entry-${i}`);
    expect(() => dispatchGenerationBatch(input)).toThrow();
    expect(buildGenerationPromptBatch).not.toHaveBeenCalled();
    expectNoPublication();
  });

  it('prepares all items before reservation so invalid references cannot publish a partial batch', () => {
    const input = request(); const source = assistantPromptSource([reply], reply, 'assistant-session');
    expect(() => dispatchGenerationBatch({ ...input, drafts: source.entries.map((entry, index) => ({ ...entry, prompt: index ? '@图片3' : entry.prompt })) })).toThrow('@图片3');
    expect(values.has(RECEIPTS)).toBe(false);
    expectNoPublication();
  });

  it.each([RECEIPTS, DRAFTS])('blocks corrupt storage at %s before publishing', key => {
    values.set(key, '{');
    expect(() => dispatchGenerationBatch(request())).toThrow();
    expectNoPublication();
    expect(localStorage.setItem).not.toHaveBeenCalled();
  });

  it('fails closed when browser storage cannot be read', () => {
    vi.mocked(localStorage.getItem).mockImplementation(() => { throw new Error('SecurityError'); });
    expect(() => dispatchGenerationBatch(request())).toThrow('SecurityError');
    expectNoPublication();
  });

  it('does not publish or persist tasks when receipt storage refuses the reservation', () => {
    vi.mocked(localStorage.setItem).mockImplementation(() => { throw new Error('QuotaExceededError'); });
    expect(() => dispatchGenerationBatch(request())).toThrow('已阻止提交');
    expectNoPublication();
    expect(values.has(RECEIPTS)).toBe(false);
  });

  it('retains reservation after a task snapshot write fails and never replays it on retry', () => {
    mocks.persist.mockImplementationOnce(() => { throw new Error('snapshot refused'); });
    const input = request();
    expect(() => dispatchGenerationBatch(input)).toThrow('snapshot refused');
    expect(mocks.setState).not.toHaveBeenCalled();
    const reserved = readGenerationBatchReceipts(input.sourceId);
    expect(reserved).toHaveLength(1);
    expect(dispatchGenerationBatch(input)).toEqual(reserved);
    expect(mocks.persist).toHaveBeenCalledOnce();
    expect(buildGenerationPromptBatch).toHaveBeenCalledOnce();
    expect(state.generationTasks).toEqual([]);
  });
});

describe('shared button and followup batch submission', () => {
  it.each(['button-first', 'action-first'] as const)('deduplicates both entry points with %s', order => {
    const input = request();
    const button = () => dispatchGenerationBatch(input);
    const action = () => executeGenerationBatchAction({ sourceId: input.sourceId, entryIds: input.entryIds }, 'assistant', input.sessionId, '把上面全部生成');
    const first = order === 'button-first' ? button() : action();
    expect(order === 'button-first' ? action() : button()).toEqual(first);
    expect(buildGenerationPromptBatch).toHaveBeenCalledOnce();
    expect(mocks.persist).toHaveBeenCalledOnce();
    expect(mocks.setState).toHaveBeenCalledOnce();
    expect(state.generationTasks).toHaveLength(2);
    expect(state.generationTasks.map(task => task.generationOrigin)).toEqual(input.entryIds.map(entryId => ({ sourceId: input.sourceId, entryId })));
  });

  it('reserves before persisting and only publishes after the forced snapshot call', () => {
    const input = request();
    mocks.persist.mockImplementation(() => {
      expect(readGenerationBatchReceipts(input.sourceId)).toHaveLength(1);
      expect(mocks.setState).not.toHaveBeenCalled();
    });
    const receipts = dispatchGenerationBatch(input);
    expect(mocks.persist).toHaveBeenCalledWith(state.generationTasks, state.sessions, 'generation-session', { force: true, immediate: true });
    expect(receipts[0].taskIds).toEqual(state.generationTasks.map(task => task.id));
    expect(state.currentSessionId).toBe('generation-session');
  });

  it('submits only new selected entries in a later batch and reuses the original target session', () => {
    const input = request();
    const first = dispatchGenerationBatch({ ...input, entryIds: input.entryIds.slice(0, 1) });
    const second = executeGenerationBatchAction({ sourceId: input.sourceId, entryIds: input.entryIds }, 'assistant', input.sessionId, '把这些图片全部生成');
    expect(second).toHaveLength(2);
    expect(second[0]).toEqual(first[0]);
    expect(second[1].entryIds).toEqual(input.entryIds.slice(1));
    expect(second[1].sessionId).toBe(first[0].sessionId);
    expect(state.sessions.filter(session => session.id === first[0].sessionId)).toHaveLength(1);
    expect(state.generationTasks).toHaveLength(2);
    expect(vi.mocked(buildGenerationPromptBatch).mock.calls.map(([entries]) => entries.map(entry => entry.id))).toEqual(input.entryIds.map(id => [id]));
  });

  it('does not replay reserved entries after refresh when every generated task is missing', async () => {
    const input = request(); const receipts = dispatchGenerationBatch(input);
    state.sessions = [{ id: 'generation-session', title: '恢复的会话', createdAt: 1, tasks: [] }];
    state.generationTasks = [];
    vi.clearAllMocks(); vi.resetModules();
    const reloaded = await import('./dispatchGenerationBatch');
    expect(reloaded.executeGenerationBatchAction({ sourceId: input.sourceId, entryIds: input.entryIds }, 'assistant', input.sessionId, '上面全部生成')).toEqual(receipts);
    expectNoPublication();
    expect(buildGenerationPromptBatch).not.toHaveBeenCalled();
  });

  it('uses saved prompt edits, reference selections and settings when followup omits drafts', () => {
    const message = state.assistantSessions[0].messages[0];
    const media = [{ type: 'image' as const, url: 'https://example.com/reference.jpg' }];
    state.assistantSessions[0].messages.unshift({ id: 'input', role: 'user', content: '参考', timestamp: 0, attachments: media });
    const source = assistantPromptSource(state.assistantSessions[0].messages, message, 'assistant-session');
    const edited = source.entries.map(entry => ({ ...entry, prompt: '保存后的编辑构图 @图片1', referenceIndexes: [0] }));
    const editedSettings = { ...settings, imageAspect: '1:1', imageQuality: 'low' as const };
    saveGenerationBatchDraft(source.sourceId, edited, editedSettings);
    executeGenerationBatchAction({ sourceId: source.sourceId, entryIds: source.entries.map(entry => entry.id) }, 'assistant', 'assistant-session', '这些图片全部生成');
    expect(buildGenerationPromptBatch).toHaveBeenCalledWith(edited, media, editedSettings);
    expect(state.generationTasks.every(task => task.prompt === '保存后的编辑构图 @图片1')).toBe(true);
    expect(state.generationTasks.every(task => task.referenceImages?.[0] === media[0].url)).toBe(true);
  });

  it('uses explicitly supplied drafts and settings before saved values', () => {
    const source = assistantPromptSource([reply], reply, 'assistant-session');
    saveGenerationBatchDraft(source.sourceId, source.entries.map(entry => ({ ...entry, prompt: '旧版已保存的光影' })), settings);
    const drafts = source.entries.map(entry => ({ ...entry, prompt: '当前按钮编辑的构图' }));
    const explicit = { ...settings, imageQuality: 'medium' as const };
    dispatchGenerationBatch({ ...request(), drafts, settings: explicit });
    expect(buildGenerationPromptBatch).toHaveBeenCalledWith(drafts, [], explicit);
  });

  it('adds agent batches to the original conversation without creating an assistant target', () => {
    const original = agentTask(); state.sessions[0].tasks = [original];
    const source = generationPromptSources(state, 'agent', 'generation-session')[0];
    const receipts = dispatchGenerationBatch({ sourceId: source.sourceId, entryIds: source.entries.map(entry => entry.id), kind: 'agent', sessionId: 'generation-session' });
    expect(receipts[0].sessionId).toBe('generation-session');
    expect(state.sessions).toHaveLength(1);
    expect(state.sessions[0].tasks.at(-1)).toEqual(original);
    expect(state.generationTasks.every(task => task.sessionId === 'generation-session')).toBe(true);
  });

  it.each(['只写提示词', '不要生成全部图片', '继续'])('requires explicit authorization for followup: %s', text => {
    const input = request();
    expect(() => executeGenerationBatchAction({ sourceId: input.sourceId, entryIds: input.entryIds }, 'assistant', input.sessionId, text)).toThrow('明确要求生成成品');
    expectNoPublication();
  });

  it.each([{ sourceId: 1, entryIds: [] }, { sourceId: 'source', entryIds: 'entry' }, { sourceId: 'source', entryIds: [1] }])('rejects malformed tool actions before dispatch', action => {
    expect(() => executeGenerationBatchAction(action, 'assistant', 'assistant-session', '上面全部生成')).toThrow('参数无效');
    expectNoPublication();
  });

  it('reads current live controls only as a fallback', () => {
    expect(currentBatchSettings()).toEqual(settings);
    state.quickQuality = 'medium';
    expect(currentBatchSettings().imageQuality).toBe('medium');
  });
});
