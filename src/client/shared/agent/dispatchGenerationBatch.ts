import { useAppStore } from '@client/store';
import { persistDrawingStateToStorage } from '@client/store/persist/generation';
import { generationPromptSources, type GenerationPromptSource } from './generationBatchSources';
import { buildGenerationPromptBatch, type BatchGenerationSettings, type BatchPromptDraft } from './buildGenerationPromptBatch';
import { readGenerationBatchReceipts, reserveGenerationBatch, type GenerationBatchReceipt } from './generationBatchReceipts';
import { explicitBatchGenerationRequest } from '@shared/domain/assistant/generationAuthorization';
import { readGenerationBatchDraft } from './generationBatchDrafts';
import { setGenerationMediaConcurrency } from './generationConcurrency';

export function currentBatchSettings(): BatchGenerationSettings {
  const state = useAppStore.getState();
  return { imageModel: state.quickModel, imageAspect: state.quickAspectId, imageQuality: state.quickQuality,
    videoModel: state.quickVideoModel, videoAspect: state.quickVideoAspectId, videoResolution: state.quickVideoResolution,
    videoDuration: state.quickVideoDuration, videoRefMode: state.quickVideoRefMode };
}

export interface GenerationBatchRequest {
  sourceId: string; entryIds: string[]; kind: GenerationPromptSource['kind']; sessionId: string;
  drafts?: BatchPromptDraft[]; settings?: BatchGenerationSettings;
}

/** Both UI and tool actions enter here; selection always resolves against the original session. */
export function dispatchGenerationBatch(request: GenerationBatchRequest): GenerationBatchReceipt[] {
  const state = useAppStore.getState();
  if (!state.generationHistoryReady) throw new Error('生成历史正在恢复，请稍后再提交');
  if ((request.kind === 'agent' ? state.currentSessionId : state.currentAssistantSessionId) !== request.sessionId) throw new Error('已切换会话，请返回原会话提交');
  const source = generationPromptSources(state, request.kind, request.sessionId).find(item => item.sourceId === request.sourceId);
  if (!source) throw new Error('提示词来源已变更或尚未完成，请使用原会话中已完成的最新清单');
  if (source.legacySessionId) throw new Error('这组提示词已有生成记录，请查看原批次');
  if (!request.entryIds.length || request.entryIds.length > 30 || new Set(request.entryIds).size !== request.entryIds.length) throw new Error('请选择 1–30 个不重复的任务');
  const originals = request.entryIds.map(id => {
    const entry = source.entries.find(item => item.id === id);
    if (!entry) throw new Error('选中项不属于这条回复，请重新选择');
    return entry;
  });
  const prior = readGenerationBatchReceipts(source.sourceId);
  const submitted = new Set(prior.flatMap(receipt => receipt.entryIds));
  const pending = originals.filter(entry => !submitted.has(entry.id));
  if (!pending.length) return prior;
  const savedDraft = readGenerationBatchDraft(source);
  const entries = pending.map(entry => request.drafts?.find(draft => draft.id === entry.id) || savedDraft?.entries.find(draft => draft.id === entry.id) || entry);
  const tasks = buildGenerationPromptBatch(entries, source.media, request.settings || savedDraft?.settings || currentBatchSettings());
  const targetSessionId = source.kind === 'agent' ? source.sessionId : prior[0]?.sessionId || `session-${crypto.randomUUID()}`;
  const target = state.sessions.find(session => session.id === targetSessionId);
  if (source.kind === 'agent' && !target) throw new Error('原生成会话已删除');
  const title = target?.title || `${entries[0].title} · 批量生成`;
  const linkedTasks = tasks.map((task, index) => ({ ...task, sessionId: targetSessionId, sessionTitle: title,
    generationOrigin: { sourceId: source.sourceId, entryId: entries[index].id } }));
  const receipt: GenerationBatchReceipt = { sourceId: source.sourceId, batchId: tasks[0].batchId!, sessionId: targetSessionId,
    taskIds: linkedTasks.map(task => task.id), entryIds: entries.map(entry => entry.id), createdAt: Date.now() };
  const session = { ...(target || { id: targetSessionId, title, createdAt: Date.now() }), tasks: [...linkedTasks, ...(target?.tasks || [])] };
  const sessions = target ? state.sessions.map(item => item.id === targetSessionId ? session : item) : [session, ...state.sessions];
  const generationTasks = [...linkedTasks, ...state.generationTasks];
  const unsubmittedMediaCount = generationTasks.filter(task => task.mediaType !== 'agent' && !task.taskId && !task.resultUrl && task.status === 'IN_PROGRESS').length;
  setGenerationMediaConcurrency(Math.max(entries.length, unsubmittedMediaCount));
  // Reserve before publishing; even a browser crash between these writes must not cause a paid replay.
  reserveGenerationBatch(receipt);
  persistDrawingStateToStorage(generationTasks, sessions, state.currentSessionId, { force: true, immediate: true });
  useAppStore.setState({ sessions, generationTasks });
  return [...prior, receipt];
}

export function executeGenerationBatchAction(action: Record<string, unknown>, kind: GenerationPromptSource['kind'], sessionId: string, userText: string) {
  if (!explicitBatchGenerationRequest(userText)) throw new Error('请明确要求生成成品；仅编写提示词不会启动计费生成。');
  if (typeof action.sourceId !== 'string' || !Array.isArray(action.entryIds) || !action.entryIds.every((id): id is string => typeof id === 'string')) throw new Error('批量生成请求参数无效');
  return dispatchGenerationBatch({ sourceId: action.sourceId, entryIds: action.entryIds, kind, sessionId });
}
