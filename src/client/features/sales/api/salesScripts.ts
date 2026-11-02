import { apiRequest } from '@client/shared/api/apiRequest';
import { getMultimodalClientOverrides } from '@client/shared/api/gatewayClient';
import { readAssistantReasoningEffort } from '@client/shared/hooks/useAssistantReasoning';
import { selectedTextModel } from '@shared/domain/models/textModelRoute';
import { normalizeScriptTemplate, type SalesScriptDomain, type SalesScriptStatus } from '@shared/domain/sales';
import {
  salesScriptAnalysisBodySchema, salesScriptNormalizeBodySchema, salesScriptPromptResponseSchema,
  salesScriptVideoUploadResponseSchema, salesScriptTemplateSchema, saveSalesScriptBodySchema, patchSalesScriptBodySchema,
} from '@shared/contracts/salesScripts';

export interface StoredSalesScript {
  id: string;
  title: string;
  videoUrl: string;
  videoHash: string;
  depthVideoUrl?: string;
  depthTaskId?: string;
  depthOperationId?: string;
  status: SalesScriptStatus;
  script: SalesScriptDomain;
  model: string;
  promptVersion: string;
  version: number;
  useCount: number;
  updatedAt: string;
  /** Local eligibility from the raw response, before legacy normalization can discard malformed fields. */
  analysisCacheEligible?: boolean;
}

export interface SalesScriptDraftResult {
  saveWarning?: string;
  script: SalesScriptDomain;
  model: string;
  promptVersion: string;
  videoHash: string;
  existingId?: string;
  cached?: boolean;
}

type Json = Record<string, unknown>;
const record = (value: unknown): Json => value && typeof value === 'object' && !Array.isArray(value) ? value as Json : {};
const text = (value: unknown) => typeof value === 'string' ? value : '';

async function readJSON(response: Response, fallback: string): Promise<Json> {
  const data = record(await response.json().catch(() => null));
  if (response.status === 404 && !data.error) throw new Error('当前服务尚未启用参考脚本接口，请重新启动贝壳服务后重试。');
  if (!response.ok || data.success !== true) throw new Error(text(data.error) || `${fallback}（HTTP ${response.status}）`);
  return data;
}

function modelFields(selection: string) {
  const reasoningEffort = readAssistantReasoningEffort(selection);
  return {
    model: selection.startsWith('deepseek-official:') ? selection : selectedTextModel(selection).modelId,
    ...getMultimodalClientOverrides(selection),
    ...(reasoningEffort && reasoningEffort !== 'auto' ? { reasoningEffort } : {}),
  };
}

function draftFrom(data: Json): SalesScriptDraftResult {
  const script = normalizeScriptTemplate(data.script);
  if (!script) throw new Error('返回的脚本缺少镜头时间轴，请重新分析或手动整理后粘贴。');
  return { script, ...(text(data.saveWarning) ? { saveWarning: text(data.saveWarning) } : {}), model: text(data.model), promptVersion: text(data.promptVersion), videoHash: text(data.videoHash),
    ...(text(data.existingId) ? { existingId: text(data.existingId) } : {}), ...(typeof data.cached === 'boolean' ? { cached: data.cached } : {}) };
}

/** Legacy rows stay readable: the shared normalizer upgrades missing template fields. */
export function storedScriptFrom(value: unknown): StoredSalesScript | null {
  const item = record(value);
  const script = normalizeScriptTemplate(item.script);
  if (!script || !text(item.id)) return null;
  const status = ['draft', 'verified', 'archived'].includes(text(item.status)) ? item.status as SalesScriptStatus : 'draft';
  return { id: text(item.id), title: text(item.title) || script.title, videoUrl: text(item.videoUrl), videoHash: text(item.videoHash), status, script,
    analysisCacheEligible: salesScriptTemplateSchema.safeParse(item.script).success,
    depthVideoUrl: text(item.depthVideoUrl), depthTaskId: text(item.depthTaskId), depthOperationId: text(item.depthOperationId),
    model: text(item.model), promptVersion: text(item.promptVersion), version: Number(item.version) || 1, useCount: Number(item.useCount) || 0, updatedAt: text(item.updatedAt) };
}

export async function uploadScriptVideo(file: File, signal?: AbortSignal) {
  const form = new FormData();
  form.append('file', file);
  const response = await apiRequest('POST', '/api/sales/script-video', { method: 'POST', body: form, signal });
  const parsed = salesScriptVideoUploadResponseSchema.safeParse(await readJSON(response, '参考视频上传失败'));
  if (!parsed.success) throw new Error('参考视频上传结果不完整，请重试');
  return parsed.data;
}

export async function fetchScriptAnalysisPrompt(signal?: AbortSignal) {
  const response = await apiRequest('GET', '/api/sales/script-analysis/prompt', { signal, cache: 'no-store' });
  const parsed = salesScriptPromptResponseSchema.safeParse(await readJSON(response, '读取分析提示词失败'));
  if (!parsed.success) throw new Error('分析提示词为空');
  return parsed.data;
}

export async function analyzeReferenceVideo(videoUrl: string, selection: string, signal: AbortSignal, force = false) {
  const body = salesScriptAnalysisBodySchema.parse({ videoUrl, force, ...modelFields(selection) });
  const response = await apiRequest('POST', '/api/sales/script-analysis', { signal, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  return draftFrom(await readJSON(response, '参考视频拆解失败'));
}

export async function normalizePastedScript(rawText: string, options: { videoUrl?: string; selection?: string }, signal: AbortSignal) {
  const body = salesScriptNormalizeBodySchema.parse({ rawText, ...(options.videoUrl ? { videoUrl: options.videoUrl } : {}), ...(options.selection ? modelFields(options.selection) : {}) });
  const response = await apiRequest('POST', '/api/sales/script-normalize', { signal, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  return draftFrom(await readJSON(response, '粘贴内容规整失败'));
}

export async function listSalesScripts(signal?: AbortSignal): Promise<StoredSalesScript[]> {
  const response = await apiRequest('GET', '/api/sales/scripts', { signal });
  const data = await readJSON(response, '读取参考脚本库失败');
  return (Array.isArray(data.items) ? data.items : []).map(storedScriptFrom).filter((item): item is StoredSalesScript => Boolean(item));
}

function itemFrom(data: Json): StoredSalesScript {
  const item = storedScriptFrom(data.item);
  if (!item) throw new Error('脚本已保存，但返回内容不完整，请刷新脚本库');
  return item;
}

export async function saveSalesScript(input: { id?: string; videoUrl: string; videoHash: string; status: SalesScriptStatus; model: string; promptVersion: string; script: SalesScriptDomain }) {
  const body = saveSalesScriptBodySchema.parse({ ...input, title: input.script.title });
  const response = await apiRequest('POST', '/api/sales/scripts', { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  return itemFrom(await readJSON(response, '保存参考脚本失败'));
}

export async function patchSalesScript(id: string, patch: { status?: SalesScriptStatus; script?: SalesScriptDomain; recordUse?: boolean; videoUrl?: string; depthVideoUrl?: string; depthTaskId?: string; depthOperationId?: string }) {
  const body = patchSalesScriptBodySchema.parse({ ...patch, ...(patch.script ? { title: patch.script.title } : {}) });
  const response = await apiRequest('PATCH', '/api/sales/scripts/{id}', { pathParams: { id }, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  return itemFrom(await readJSON(response, '更新参考脚本失败'));
}

export async function deleteSalesScript(id: string) {
  await readJSON(await apiRequest('DELETE', '/api/sales/scripts/{id}', { pathParams: { id } }), '删除参考脚本失败');
}
