import { salesMediaResult } from './salesMediaJobs';
import { apiFetch, readClientStorageConfig, storageConfigHeaders } from '@client/shared/api/apiClient';
import { apiRequest } from '@client/shared/api/apiRequest';
import { getGatewayClientHeaders, getMultimodalClientOverrides } from '@client/shared/api/gatewayClient';
import { pollSalesVideoTask, type SalesVideoTaskReceipt } from './salesVideoPolling';
import { uploadStudioFile } from '@client/shared/api/uploadStudioFile';
import { isPlaceholderIdentity } from '@shared/domain/workshop/workshop-pipeline/assetEligibility';
import { getVideoModelById } from '@shared/domain/media/video';
import { isMetasoH3 } from '@shared/domain/media/videoChannels';
import { resolveVideoMode, videoInputError } from '@shared/domain/media/videoCapabilities';
import { selectedTextModel } from '@shared/domain/models/textModelRoute';
import { upstreamModalityModelId } from '@shared/domain/models/modalityStorage';
import type {
  SalesAdaptedBeat, SalesImitationMode, SalesMaterialCatalog, SalesPresentationMode, SalesVisualSpec,
} from '@shared/domain/sales';
import type { SalesPersonaVisualProfile } from '@shared/domain/sales/personaVisualProfile';
import {
  salesAudioMixBodySchema, salesAudioMixResponseSchema,
  salesPlanAdaptBodySchema, salesPlanAdaptResponseSchema,
  salesStudioAssetsResponseSchema, salesVideoReviewResponseSchema,
} from '@shared/contracts/salesProduction';

export type SalesStudioAssetCatalog = SalesMaterialCatalog;

export interface SalesPlanAdaptInput {
  productName: string;
  brand?: string;
  category: string;
  summary?: string;
  facts?: string;
  buyingPoints?: string[];
  unresolved?: string[];
  allowProductReframe?: boolean;
  narration?: { sourceCopy: string; duration: number; targetCps: number };
  cautions?: string[];
  scriptTitle: string;
  oneTake: boolean;
  visualSpec?: SalesVisualSpec;
  voiceMode: 'speech' | 'voiceover' | 'none';
  presentationMode?: SalesPresentationMode;
  imitationMode?: SalesImitationMode;
  personaSummary: string;
  personaReferenceImageUrl?: string;
  personaPresence?: 'full_presenter' | 'silent_model' | 'hands_only' | 'none';
  sceneSummary: string;
  sourceExclusions?: Array<string | { term: string; type: string }>;
  beats: Array<{
    index: number;
    shotIndex: number;
    preservePerformance?: boolean;
    start: number;
    end: number;
    purpose: string;
    shotSize: string;
    camera: string;
    refAction: string;
    productVisible?: boolean;
    subject?: string;
    scene?: string;
    transition?: string;
    expression?: string;
    requiredView: string;
    assignedView: string;
    imageLabel: string;
    buyingPoint: string;
    actionReference?: string;
    sourceVoiceText?: string;
    sourceLinePattern?: string;
    sourceSubtitle?: string;
  }>;
}

type Json = Record<string, unknown>;
const record = (v: unknown): Json => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Json) : {});
const text = (v: unknown): string => (typeof v === 'string' ? v : '');

async function readJSON(response: Response, fallback: string): Promise<Json> {
  const data = record(await response.json().catch(() => null));
  if (response.status === 404 && !data.error) throw new Error('当前服务尚未启用电商视频资产与合成接口，请重启贝壳服务后重试。');
  if (!response.ok || data.success !== true) throw new Error(text(data.error) || `${fallback}（HTTP ${response.status}）`);
  return data;
}

export async function reviewSalesVideo(videoUrl: string, signal: AbortSignal) {
  const response = await apiRequest('POST', '/api/sales/video-review', {
    signal,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ videoUrl }),
  });
  const parsed = salesVideoReviewResponseSchema.safeParse(await readJSON(response, '音频视频核查失败'));
  if (!parsed.success) throw new Error('音频视频核查结果不完整');
  return parsed.data;
}

export async function fetchSalesStudioAssets(signal?: AbortSignal): Promise<SalesStudioAssetCatalog> {
  const response = await apiRequest('GET', '/api/sales/studio-assets', { signal });
  const parsed = salesStudioAssetsResponseSchema.safeParse(await readJSON(response, '读取资产库失败'));
  if (!parsed.success) throw new Error('资产库数据格式不完整');
  return { ...parsed.data, personas: parsed.data.personas.filter((item) => !isPlaceholderIdentity(item, 'persona')) };
}

export async function adaptSalesScriptPlan(
  input: SalesPlanAdaptInput,
  selection: string,
  signal: AbortSignal,
): Promise<{ beats: SalesAdaptedBeat[]; model: string; promptVersion: string; spokenCopyPromptVersion?: string; personaVisualProfile?: SalesPersonaVisualProfile }> {
  const body = salesPlanAdaptBodySchema.parse({
    ...input,
    model: selection.startsWith('deepseek-official:') ? selection : selectedTextModel(selection).modelId,
    ...getMultimodalClientOverrides(selection),
  });
  const response = await apiRequest('POST', '/api/sales/plan-adapt', {
    signal,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const parsed = salesPlanAdaptResponseSchema.safeParse(await readJSON(response, '分镜与台词改编失败'));
  if (!parsed.success) throw new Error('分镜改编返回结构不完整，请重试');
  return parsed.data;
}

export async function synthesizeSalesVoiceover(
  input: { text: string; voice: string; model?: string; speed?: number },
  signal: AbortSignal,
): Promise<{ audioUrl: string; taskId: string }> {
  const selection = (input.model || 'speech-2.8-hd').trim();
  const model = upstreamModalityModelId('voice', selection);
  signal.throwIfAborted();
  const clientTaskId = `sales_vo_${crypto.randomUUID()}`;
  const gatewayHeaders = getGatewayClientHeaders(selection);
  const response = await apiFetch('/api/generate/audio', {
    method: 'POST',
    signal,
    headers: {
      'Content-Type': 'application/json',
      'x-idempotency-key': clientTaskId,
      ...gatewayHeaders,
      ...storageConfigHeaders(),
    },
    body: JSON.stringify({
      clientTaskId,
      prompt: input.text,
      text: input.text,
      model,
      voice: input.voice || 'zh-female-commercial',
      speed: input.speed ?? 1,
      format: 'mp3',
      customBaseUrl: gatewayHeaders['x-custom-base-url'],
      storageConfig: readClientStorageConfig(),
    }),
  });
  const data = await readJSON(response, '旁白语音合成失败');
  const audioUrl = text(data.audioUrl) || text(data.resultUrl);
  if (!audioUrl) throw new Error('语音合成未返回可播放地址');
  return { audioUrl, taskId: text(data.taskId) };
}

export async function submitAndPollSalesVideo(
  input: {
    jobName?: string;
    salesTrace?: { scriptId: string; scriptVersion: number; templateVersion: string; adaptVersion: string };
    prompt: string;
    model: string;
    durationSec: number;
    aspectRatio: string;
    refMode?: string;
    resolution?: string;
    images: string[];
    videos?: string[];
    audios?: string[];
    voiceIds?: string[];
    contextIrEnabled?: boolean;
    generateAudio: boolean;
  },
  onProgress: (label: string) => void,
  signal: AbortSignal,
  onTaskSubmitted?: (task: SalesVideoTaskReceipt) => void | Promise<void>,
): Promise<{ videoUrl: string; taskId: string; channelTaskId?: string }> {
  const selection = (input.model || 'wan3.0-video').trim();
  const model = upstreamModalityModelId('video', selection);
  const gatewayHeaders = getGatewayClientHeaders(selection);
  const baseUrl = gatewayHeaders['x-custom-base-url'];
  const spec = getVideoModelById(model, baseUrl);
  signal.throwIfAborted();
  // Include the complete script timeline; never silently squeeze a long script into a short clip.
  const duration = Math.ceil(input.durationSec);
  const resolution = isMetasoH3(model, baseUrl) && input.resolution?.toUpperCase() === '720P' ? '768P' : input.resolution || (spec?.supportedResolutions?.includes('720P')
    ? '720P'
    : spec?.supportedResolutions?.[0] || '720P');
  const clientTaskId = `sales_vid_${crypto.randomUUID()}`;
  // Slots represent identities/products/scenes, rather than the start and end frames of a clip.
  const refMode = resolveVideoMode(model, input.refMode || 'omni', input.images.length, input.videos?.length || 0);
  const message = videoInputError({ model, refMode, images: input.images, videos: input.videos, audios: input.audios, voiceIds: input.voiceIds, audio: input.generateAudio, duration, resolution, aspectRatio: input.aspectRatio, baseUrl });
  if (message) throw new Error(`${message}。当前设置 ${input.durationSec} 秒、${input.aspectRatio} 画幅；请调整视频参数或选用支持这些参考素材的模型。`);

  onProgress(`正在提交 ${spec?.name || model} 视频生成任务…`);
  const response = await apiFetch('/api/generate/video', {
    method: 'POST',
    signal,
    headers: {
      'Content-Type': 'application/json', Prefer: 'respond-async', 'X-Sales-Name': encodeURIComponent(input.jobName || ''), 'X-Sales-Model': encodeURIComponent(selection), 'X-Sales-Speech': input.generateAudio ? '1' : '0',
      'x-idempotency-key': clientTaskId,
      ...gatewayHeaders,
      ...storageConfigHeaders(),
    },
    body: JSON.stringify({
      clientTaskId,
      prompt: input.prompt,
      preserve_prompt: true,
      salesTrace: input.salesTrace,
      model,
      duration,
      aspect_ratio: input.aspectRatio || '9:16',
      resolution,
      ref_mode: refMode,
      images: input.images,
      ...(input.videos?.length ? { videos: input.videos } : {}),
      ...(input.audios?.length ? { audios: input.audios } : {}),
      ...(input.voiceIds?.length ? { voice_ids: input.voiceIds } : {}),
      audio: input.generateAudio,
      watermark: false,
      ...(isMetasoH3(model, baseUrl) ? { context_ir_enabled: input.contextIrEnabled ?? true } : {}),
      customBaseUrl: gatewayHeaders['x-custom-base-url'],
      storageConfig: readClientStorageConfig(),
    }),
  });
  const data = record(await response.json().catch(() => null));
  signal.throwIfAborted();
  if (!response.ok || data.success === false) {
    throw new Error(text(data.error) || `视频任务提交失败（HTTP ${response.status}）`);
  }
  if (text(data.status) === 'SUCCESS' && text(data.resultUrl)) {
    return { videoUrl: text(data.resultUrl), taskId: text(data.taskId) };
  }
  const taskId = text(record(data.job).id) || text(data.taskId);
  if (!taskId) throw new Error('视频生成网关未返回有效任务编号');

  const task = { taskId, model, modelSelection: selection };
  await onTaskSubmitted?.(task);
  signal.throwIfAborted();
  return pollSalesVideoTask(task, onProgress, signal, onTaskSubmitted);
}

export async function mixSalesFinalVideo(
  input: {
    jobName?: string;
    videoUrl: string;
    voiceMode: 'speech' | 'voiceover' | 'none';
    voiceoverUrl?: string;
    bgmId?: string;
    bgmUrl?: string;
  },
  signal: AbortSignal,
): Promise<{ videoUrl: string; durationSec: number; duckedBgm: boolean }> {
  const body = salesAudioMixBodySchema.parse(input);
  const response = await apiRequest('POST', '/api/sales/audio-mix', {
    signal,
    headers: { 'Content-Type': 'application/json', Prefer: 'respond-async', 'X-Sales-Name': encodeURIComponent(input.jobName || '') },
    body: JSON.stringify(body),
  });
  const parsed = salesAudioMixResponseSchema.safeParse(await salesMediaResult(await readJSON(response, '成片配乐合成失败'), signal));
  if (!parsed.success) throw new Error('成片混音返回结果不完整');
  return parsed.data;
}

export async function uploadSalesCustomAsset(file: File, category: 'assets' | 'videos', signal?: AbortSignal): Promise<string> {
  return uploadStudioFile(file, category, signal);
}
