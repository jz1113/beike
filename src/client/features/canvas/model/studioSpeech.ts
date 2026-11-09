import { apiFetch } from '@client/shared/api/apiClient';
import { getGatewayClientHeaders } from '@client/shared/api/gatewayClient';
import { generationRecoveryError } from '@client/shared/api/generation/generationRecovery';
import { getWorkspaceSecret } from '@client/shared/api/workspaceClient';
import { readReportedUsage, recordChatTokens, type ReportedUsage } from '@client/shared/utils/modelUsage';
import { createUsageScope, usageDigest, type UsageScope } from '@client/shared/utils/usageScope';
import { currentUsageEpoch } from '@client/shared/utils/usageStorage';
import { studioChannels } from './studioGeneration';
import type { StudioScene } from './types';

interface SpeechUsage {
  modelId: string;
  scope: UsageScope;
  epoch: string;
  tokens?: ReportedUsage;
  success?: boolean;
}

function prepareSpeechUsage(modelId: string, selection: string, headers: Record<string, string>): SpeechUsage {
  return { modelId, scope: createUsageScope('audio', selection, headers), epoch: currentUsageEpoch() };
}

function mergeSpeechUsage(saved: SpeechUsage, usage: unknown, success: boolean): SpeechUsage {
  const tokens = readReportedUsage(usage);
  if (!tokens) return { ...saved, success: saved.success || success };
  const promptTokens = Math.max(saved.tokens?.promptTokens || 0, tokens.promptTokens);
  const completionTokens = Math.max(saved.tokens?.completionTokens || 0, tokens.completionTokens);
  return { ...saved, success: saved.success || success, tokens: { promptTokens, completionTokens,
    totalTokens: Math.max(saved.tokens?.totalTokens || 0, tokens.totalTokens, promptTokens + completionTokens) } };
}

function replaySpeechUsage(id: string, saved?: SpeechUsage) {
  if (!saved?.tokens || saved.epoch !== currentUsageEpoch()) return;
  recordChatTokens({ operationId: id, modelId: saved.modelId, type: 'audio', scope: saved.scope,
    usage: saved.tokens, success: !!saved.success, mediaCount: saved.success ? 1 : 0 });
}

interface SpeechOperation {
  id: string;
  status: 'pending' | 'completed' | 'rejected';
  audioUrl?: string;
  error?: string;
  usage?: SpeechUsage;
}

export interface SpeechOperationContext {
  projectId: string;
  nodeId: string;
  previousOperationId?: string;
  recoveryOnly?: boolean;
  onOperation?: (id: string) => void | Promise<void>;
  signal?: AbortSignal;
  speed?: number;
  onResult?: (data: Record<string, unknown>, operationId: string) => void;
}

const recovery = () => generationRecoveryError('原配音结果待核对，请查询原操作；不会重新提交');
const validId = (id: unknown): id is string => typeof id === 'string' && /^[\w-]{1,256}$/.test(id);

function slot(context: Pick<SpeechOperationContext, 'projectId' | 'nodeId'>): string {
  if (!context.projectId || !context.nodeId || typeof localStorage === 'undefined') throw recovery();
  return 'beike.canvas.speech-operation.v1:' + usageDigest(JSON.stringify([getWorkspaceSecret(), context.projectId, context.nodeId]));
}

function read(key: string): SpeechOperation | undefined {
  const raw = localStorage.getItem(key);
  if (!raw) return;
  const value = JSON.parse(raw) as SpeechOperation;
  if (!value || !validId(value.id) || !['pending', 'completed', 'rejected'].includes(value.status)
    || value.status === 'completed' && (typeof value.audioUrl !== 'string' || !value.audioUrl)) throw recovery();
  if (value.usage && (!value.usage.modelId || typeof value.usage.epoch !== 'string'
    || value.usage.scope?.workspaceId !== usageDigest(getWorkspaceSecret() || 'local')
    || value.usage.scope?.mediaType !== 'audio' || !/^[a-f0-9]{64}$/.test(value.usage.scope?.channelId))) throw recovery();
  return value;
}

function write(key: string, value: SpeechOperation) {
  const raw = JSON.stringify(value);
  localStorage.setItem(key, raw);
  if (localStorage.getItem(key) !== raw) throw recovery();
}

export function readStudioSpeechOperation(context: Pick<SpeechOperationContext, 'projectId' | 'nodeId'>): SpeechOperation | undefined {
  try { return read(slot(context)); } catch { throw recovery(); }
}

/** A node owns one uncertain operation, even when another tab changes its input or proposed key. */
async function reserveStudioSpeechOperation(context: SpeechOperationContext, proposedId: string) {
  try {
    const key = slot(context);
    if (!validId(proposedId)) throw recovery();
    const locks = typeof navigator !== 'undefined' ? navigator.locks : undefined;
    if (!locks?.request) throw generationRecoveryError('浏览器无法安全获取跨页面配音锁，未提交；请恢复跨页面锁后查询原任务');
    const withLock = <T>(callback: () => T) => locks.request(key, { mode: 'exclusive' }, callback);
    const reserved = await withLock(() => {
      const saved = read(key);
      if (!saved && context.recoveryOnly && !validId(context.previousOperationId)) throw recovery();
      // A stale tab may recover the result, but cannot turn its old scene into a fresh paid operation.
      const fresh = !context.recoveryOnly && (!saved || saved.status !== 'pending'
        && context.previousOperationId === saved.id && proposedId !== saved.id);
      if (saved && !fresh) return { receipt: saved, fresh: false };
      const id = !fresh && validId(context.previousOperationId) ? context.previousOperationId : proposedId;
      const receipt: SpeechOperation = { id, status: 'pending' };
      write(key, receipt);
      return { receipt, fresh };
    });
    return { ...reserved, assertWorkspace: () => { if (slot(context) !== key) throw recovery(); }, settle: (result: Omit<SpeechOperation, 'id'>) => withLock(() => {
      const current = read(key);
      if (current?.id !== reserved.receipt.id) throw recovery();
      const usage = current.usage && result.usage ? mergeSpeechUsage(current.usage, result.usage.tokens, !!result.usage.success) : current.usage || result.usage;
      const next = { ...current, ...result, usage };
      if (current.status === 'completed' && result.status !== 'completed') { next.status = current.status; next.audioUrl = current.audioUrl; }
      write(key, next);
      return next;
    }) };
  } catch (error) {
    if (error instanceof Error && 'recoveryRequired' in error) throw error;
    throw recovery();
  }
}

const unknownResult = (message?: string) => generationRecoveryError((message ? message + '；' : '') + '配音结果待核对，请查询原操作，不会重新合成');
const rejected = (message: string) => Object.assign(new Error(message), { submissionRejected: true });

/** Persist before dispatch; every uncertain retry is GET-only and independent of today's channel. */
export async function canvasSpeechRequest(model: string, prompt: string, voice: string | undefined, clientTaskId: string, context: SpeechOperationContext): Promise<string> {
  context.signal?.throwIfAborted();
  const operation = await reserveStudioSpeechOperation(context, clientTaskId);
  const { receipt, fresh } = operation;
  let dispatched = false;
  try {
    await context.onOperation?.(receipt.id);
    replaySpeechUsage(receipt.id, receipt.usage);
    if (receipt.status === 'completed') return receipt.audioUrl!;
    if (receipt.status === 'rejected') throw rejected(receipt.error || '原配音已明确拒绝，可重新生成');
    context.signal?.throwIfAborted();
    operation.assertWorkspace();
    let response: Response;
    if (fresh) {
      const channel = studioChannels().find(ch => ch.kind === 'voice' && ch.id === model);
      if (!channel || !prompt.trim()) throw rejected(!channel ? '贝壳云图暂无可用的语音模型' : '请填写朗读文字或连接文字节点');
      const headers = getGatewayClientHeaders(channel.route);
      const prepared = await operation.settle({ status: 'pending', usage: prepareSpeechUsage(channel.modelId, channel.route, headers) });
      receipt.usage = prepared.usage;
      operation.assertWorkspace();
      dispatched = true;
      response = await apiFetch('/api/generate/audio', { method: 'POST', signal: context.signal, headers: { 'Content-Type': 'application/json', ...headers, 'x-idempotency-key': receipt.id },
        body: JSON.stringify({ model: channel.modelId, prompt, voice, speed: context.speed, clientTaskId: receipt.id }) });
    } else {
      dispatched = true;
      response = await apiFetch('/api/generate/audio?taskKey=' + encodeURIComponent(receipt.id), { cache: 'no-store', signal: context.signal });
    }
    const data = await response.json().catch(() => null);
    const complete = response.ok && data?.success === true && data.submissionUnknown !== true && typeof data.audioUrl === 'string' && !!data.audioUrl;
    if (receipt.usage) {
      const usage = mergeSpeechUsage(receipt.usage, data?.usage, complete);
      replaySpeechUsage(receipt.id, usage);
      await operation.settle({ status: 'pending', usage });
    }
    if (complete) {
      await operation.settle({ status: 'completed', audioUrl: data.audioUrl });
      context.onResult?.(data, receipt.id);
      return data.audioUrl;
    }
    if (data?.submissionRejected === true && data.submissionUnknown !== true) {
      const message = typeof data.error === 'string' ? data.error : '原配音已明确拒绝，可重新生成';
      await operation.settle({ status: 'rejected', error: message });
      throw rejected(message);
    }
    throw unknownResult(typeof data?.error === 'string' ? data.error : undefined);
  } catch (error) {
    if (fresh && !dispatched) {
      const message = error instanceof Error ? error.message : '配音提交前准备失败';
      await operation.settle({ status: 'rejected', error: message });
      throw rejected(message);
    }
    if (error instanceof Error && ('recoveryRequired' in error || 'submissionRejected' in error)) throw error;
    throw unknownResult(error instanceof Error ? error.message : undefined);
  }
}

/** Reloads keep unknown speech recoverable; they never become fresh generation intents. */
export function recoverStudioSpeechNode(projectId: string, node: StudioScene['nodes'][number]): StudioScene['nodes'][number] {
  if (node.type !== 'gen-speech') return node;
  const previous = node.beikeSpeechOperationId || node.beikeTaskId || node.beikeLastTaskId;
  try {
    const saved = readStudioSpeechOperation({ projectId, nodeId: node.id });
    if (saved) replaySpeechUsage(saved.id, saved.usage);
    if (saved?.status === 'completed') return { ...node, content: saved.audioUrl, beikeSpeechOperationId: saved.id, beikeLastTaskId: saved.id,
      beikeSpeechRecoveryRequired: false, beikeTaskId: undefined, isGenerating: false, errorMsg: undefined,
      settings: { ...(node.settings as object || {}), audioUrl: saved.audioUrl, isGenerating: false, error: undefined } };
    if (saved?.status === 'rejected') return { ...node, beikeSpeechOperationId: saved.id, beikeSpeechRecoveryRequired: false,
      beikeTaskId: undefined, isGenerating: false, errorMsg: saved.error };
    const legacyUnknown = typeof previous === 'string' && !!previous && !!node.errorMsg;
    if (!saved && !node.isGenerating && !node.beikeSpeechRecoveryRequired && !legacyUnknown) return node;
    return { ...node, beikeSpeechOperationId: saved?.id || previous, beikeSpeechRecoveryRequired: true, beikeTaskId: undefined, isGenerating: false,
      errorMsg: '原配音结果待核对，点击生成将查询原操作，不会重新合成', settings: { ...(node.settings as object || {}), isGenerating: false } };
  } catch {
    return { ...node, beikeSpeechOperationId: previous, beikeSpeechRecoveryRequired: true, beikeTaskId: undefined, isGenerating: false,
      errorMsg: '原配音操作记录暂时无法读取，请恢复浏览器存储后查询；不会重新合成' };
  }
}
