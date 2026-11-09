import { z } from 'zod';
import { useAppStore } from '@client/store';
import { persistDrawingStateToStorage } from '@client/store/persist/generation';
import { GENERATION_BATCH_LIMIT } from '@shared/domain/assistant/generationPrompts';
import { generationPromptSources, type GenerationPromptSource } from './generationBatchSources';
import { buildGenerationPromptBatch, type BatchGenerationSettings, type BatchPromptDraft } from './buildGenerationPromptBatch';
import { explicitBatchGenerationRequest } from '@shared/domain/assistant/mediaAnalysis';
import { getCanvasWorkspaceSnapshot } from '@client/shared/workspace/canvasWorkspace';

const concurrencyListeners = new Set<() => void>();
const normalizeConcurrency = (value: number) => Number.isFinite(value)
  ? Math.min(GENERATION_BATCH_LIMIT, Math.max(1, Math.trunc(value)))
  : GENERATION_BATCH_LIMIT;
let concurrency = GENERATION_BATCH_LIMIT;

export function getGenerationMediaConcurrency(): number { return concurrency; }
export function setGenerationMediaConcurrency(value: number): number {
  const next = normalizeConcurrency(value);
  if (next !== concurrency) {
    concurrency = next;
    for (const listener of concurrencyListeners) listener();
  }
  return next;
}
export function subscribeGenerationMediaConcurrency(listener: () => void): () => void {
  concurrencyListeners.add(listener);
  return () => { concurrencyListeners.delete(listener); };
}

const DRAFT_KEY = 'beike_agent_generation_drafts_v1';
const draftSchema = z.object({
  entries: z.array(z.object({
    id: z.string().min(1).max(128), title: z.string().max(160), prompt: z.string().min(1).max(100_000),
    mediaType: z.enum(['image', 'video']), aspect: z.string().max(32).optional(), duration: z.number().finite().optional(),
    issue: z.string().optional(), referenceIndexes: z.array(z.number().int().min(0).max(49)).max(50).optional(),
  })).max(30),
  settings: z.object({
    imageModel: z.string().max(200), imageAspect: z.string().max(32), imageQuality: z.enum(['high', 'medium', 'low']),
    imageQualityTier: z.enum(['low', 'medium', 'high', 'xhigh', 'max']).optional(),
    imageInferenceStrength: z.enum(['low', 'medium', 'high', 'xhigh', 'max']).optional(),
    videoModel: z.string().max(200), videoAspect: z.string().max(32), videoResolution: z.enum(['480P', '540P', '720P', '768P', '1080P', '2K', '4K']),
    videoDuration: z.number().finite(), videoRefMode: z.string().max(40), videoGenerateAudio: z.boolean().optional(),
    videoContextIrEnabled: z.boolean().optional(),
  }),
});

function readDrafts(): Record<string, unknown> {
  const raw = localStorage.getItem(DRAFT_KEY);
  if (!raw) return {};
  const value: unknown = JSON.parse(raw);
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('提示词草稿记录无效，请重新保存清单');
  return value as Record<string, unknown>;
}

export function readGenerationBatchDraft(source: GenerationPromptSource) {
  const record = readDrafts()[source.sourceId];
  if (!record) return undefined;
  const result = draftSchema.safeParse(record);
  if (!result.success || result.data.entries.some(entry => !source.entries.some(original => original.id === entry.id))) throw new Error('提示词草稿已失效，请重新保存原回复清单');
  return result.data;
}

export function saveGenerationBatchDraft(sourceId: string, entries: BatchPromptDraft[], settings: BatchGenerationSettings) {
  const data = draftSchema.parse({ entries, settings });
  const drafts = readDrafts(); drafts[sourceId] = data;
  try { localStorage.setItem(DRAFT_KEY, JSON.stringify(drafts)); }
  catch { throw new Error('草稿保存失败，请检查浏览器存储空间；不会启动生成'); }
}

export interface GenerationBatchReceipt {
  sourceId: string; batchId: string; sessionId: string; taskIds: string[]; entryIds: string[]; createdAt: number;
}
const RECEIPT_KEY = 'beike_agent_generation_receipts_v1';
type Journal = Record<string, GenerationBatchReceipt[]>;

function readJournal(): Journal {
  const raw = localStorage.getItem(RECEIPT_KEY);
  if (!raw) return {};
  const value: unknown = JSON.parse(raw);
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('生成回执无法读取，已阻止重复提交');
  for (const [sourceId, receipts] of Object.entries(value)) {
    if (!Array.isArray(receipts) || receipts.some(item => !item || item.sourceId !== sourceId || typeof item.batchId !== 'string'
      || typeof item.sessionId !== 'string' || !Array.isArray(item.taskIds) || !item.taskIds.every((id: unknown) => typeof id === 'string')
      || !Array.isArray(item.entryIds) || !item.entryIds.every((id: unknown) => typeof id === 'string') || item.taskIds.length !== item.entryIds.length || !item.entryIds.length || !Number.isFinite(item.createdAt)
      || new Set(item.entryIds).size !== item.entryIds.length || new Set(item.taskIds).size !== item.taskIds.length)) throw new Error('生成回执已损坏，请先核实原任务，不能重新提交');
  }
  return value as Journal;
}

export function readGenerationBatchReceipts(sourceId: string): GenerationBatchReceipt[] {
  return readJournal()[sourceId] || [];
}

/** Must succeed before exposing new tasks to the global generation engine. */
export function reserveGenerationBatch(receipt: GenerationBatchReceipt): void {
  const journal = readJournal();
  const prior = journal[receipt.sourceId] || [];
  if (prior.some(item => item.entryIds.some(id => receipt.entryIds.includes(id)))) throw new Error('选中项已经提交，请查看原任务');
  journal[receipt.sourceId] = [...prior, receipt];
  try { localStorage.setItem(RECEIPT_KEY, JSON.stringify(journal)); }
  catch { throw new Error('无法保存生成回执，已阻止提交；请检查浏览器存储空间'); }
}

export function currentBatchSettings(): BatchGenerationSettings {
  const state = useAppStore.getState();
  return { imageModel: state.quickModel, imageAspect: state.quickAspectId, imageQuality: state.quickQuality,
    videoModel: state.quickVideoModel, videoAspect: state.quickVideoAspectId, videoResolution: state.quickVideoResolution,
    videoDuration: state.quickVideoDuration, videoRefMode: state.quickVideoRefMode, videoContextIrEnabled: state.quickVideoContextIrEnabled ?? true };
}

export interface GenerationBatchRequest {
  sourceId: string; entryIds: string[]; kind: GenerationPromptSource['kind']; sessionId: string;
  drafts?: BatchPromptDraft[]; settings?: BatchGenerationSettings;
}

/** Both UI and tool actions enter here; selection always resolves against the original session. */
export function dispatchGenerationBatch(request: GenerationBatchRequest): GenerationBatchReceipt[] {
  const state = useAppStore.getState();
  if (!state.generationHistoryReady) throw new Error('生成历史正在恢复，请稍后再提交');
  const canvasProjectId = request.kind === 'agent' ? state.sessions.find(session => session.id === request.sessionId)?.canvasProjectId : undefined;
  const sameWorkspace = canvasProjectId
    ? state.currentView === 'canvas' && getCanvasWorkspaceSnapshot().projectId === canvasProjectId
    : (request.kind === 'agent' ? state.currentSessionId : state.currentAssistantSessionId) === request.sessionId;
  if (!sameWorkspace) throw new Error('已切换会话，请返回原会话提交');
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
  const linkedTasks = tasks.map((task, index) => ({ ...task, canvasProjectId, sessionId: targetSessionId, sessionTitle: title,
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
