import { apiFetch, readClientStorageConfig, storageConfigHeaders } from '@client/shared/api/apiClient';
import { apiRequest } from '@client/shared/api/apiRequest';
import { getGatewayClientHeaders, getMultimodalClientOverrides } from '@client/shared/api/gatewayClient';
import { pollGenerationTask } from '@client/shared/api/generation/generationApi';
import { sleepWhilePolling } from '@client/shared/api/generation/generationAbort';
import { classifyGenerationPollResult, isTransientPollError } from '@client/shared/api/generation/generationErrors';
import { uploadStudioFile } from '@client/shared/api/uploadStudioFile';
import { isPlaceholderIdentity } from '@shared/domain/workshop/workshop-pipeline/assetEligibility';
import { getVideoModelById } from '@shared/domain/media/video';
import { resolveVideoMode, videoInputError } from '@shared/domain/media/videoCapabilities';
import { selectedTextModel } from '@shared/domain/models/textModelRoute';
import { upstreamModalityModelId } from '@shared/domain/models/modalityStorage';
import type {
  SalesAdaptedBeat, SalesImitationMode, SalesMaterialCatalog, SalesPresentationMode, SalesVisualSpec,
} from '@shared/domain/sales';
import {
  salesAudioMixBodySchema, salesAudioMixResponseSchema,
  salesPlanAdaptBodySchema, salesPlanAdaptResponseSchema,
  salesStudioAssetsResponseSchema,
} from '@shared/contracts/salesProduction';

export type SalesStudioAssetCatalog = SalesMaterialCatalog;

export interface SalesPlanAdaptInput {
  productName: string;
  brand?: string;
  category: string;
  summary?: string;
  facts?: string;
  buyingPoints?: string[];
  cautions?: string[];
  scriptTitle: string;
  oneTake: boolean;
  visualSpec?: SalesVisualSpec;
  voiceMode: 'speech' | 'voiceover' | 'none';
  presentationMode?: SalesPresentationMode;
  imitationMode?: SalesImitationMode;
  personaSummary: string;
  sceneSummary: string;
  sourceExclusions?: string[];
  beats: Array<{
    index: number;
    shotIndex: number;
    start: number;
    end: number;
    purpose: string;
    shotSize: string;
    camera: string;
    refAction: string;
    subject?: string;
    scene?: string;
    transition?: string;
    expression?: string;
    requiredView: string;
    assignedView: string;
    imageLabel: string;
    buyingPoint: string;
    actionReference?: string;
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
): Promise<{ beats: SalesAdaptedBeat[]; model: string; promptVersion: string }> {
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
    prompt: string;
    model: string;
    durationSec: number;
    aspectRatio: string;
    refMode?: string;
    resolution?: string;
    images: string[];
    videos?: string[];
    generateAudio: boolean;
  },
  onProgress: (label: string) => void,
  signal: AbortSignal,
): Promise<{ videoUrl: string; taskId: string }> {
  const selection = (input.model || 'doubao-seedance-2.5').trim();
  const model = upstreamModalityModelId('video', selection);
  const spec = getVideoModelById(model);
  signal.throwIfAborted();
  // Include the complete script timeline; never silently squeeze a long script into a short clip.
  const duration = Math.ceil(input.durationSec);
  const resolution = input.resolution || (spec?.supportedResolutions?.includes('720P')
    ? '720P'
    : spec?.supportedResolutions?.[0] || '720P');
  const clientTaskId = `sales_vid_${crypto.randomUUID()}`;
  // Slots represent identities/products/scenes, rather than the start and end frames of a clip.
  const refMode = resolveVideoMode(model, input.refMode || 'omni', input.images.length, input.videos?.length || 0);
  const message = videoInputError({ model, refMode, images: input.images, videos: input.videos, duration, resolution, aspectRatio: input.aspectRatio });
  if (message) throw new Error(`${message}。当前设置 ${input.durationSec} 秒、${input.aspectRatio} 画幅；请调整视频参数或选用支持这些参考素材的模型。`);
  const gatewayHeaders = getGatewayClientHeaders(selection);

  onProgress(`正在提交 ${spec?.name || model} 视频生成任务…`);
  const response = await apiFetch('/api/generate/video', {
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
      prompt: input.prompt,
      model,
      duration,
      aspect_ratio: input.aspectRatio || '9:16',
      resolution,
      ref_mode: refMode,
      images: input.images,
      ...(input.videos?.length ? { videos: input.videos } : {}),
      audio: input.generateAudio,
      watermark: false,
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
  const taskId = text(data.taskId);
  if (!taskId) throw new Error('视频生成网关未返回有效任务编号');

  const deadline = Date.now() + 8 * 60_000;
  let tick = 0;
  let queryFailures = 0;
  while (Date.now() < deadline) {
    await sleepWhilePolling(3000, () => signal.aborted);
    tick += 1;
    onProgress(`视频生成中（任务 ${taskId.slice(-8)} · 已等待 ${tick * 3}s）…`);
    let polled: Json;
    try {
      polled = record(await pollGenerationTask(taskId, 'video', model, { modelSelection: selection, signal }));
      signal.throwIfAborted();
      queryFailures = 0;
    } catch (error) {
      signal.throwIfAborted();
      queryFailures += 1;
      const message = error instanceof Error ? error.message : '查询失败';
      const transient = isTransientPollError(error) || /轮询失败 \((?:408|429|5\d\d)\)/.test(message);
      if (!transient || queryFailures >= 3) {
        throw new Error(`视频任务查询中断：${message}（任务 ${taskId}）。原任务可能仍在生成，请到历史记录核对，避免重复提交。`);
      }
      onProgress(`视频状态暂时无法查询，正在重试（${queryFailures}/3；任务 ${taskId.slice(-8)}）…`);
      continue;
    }
    const outcome = classifyGenerationPollResult(polled, { httpOk: true });
    if (outcome === 'success' && text(polled.resultUrl)) {
      return { videoUrl: text(polled.resultUrl), taskId };
    }
    if (outcome === 'failure') {
      throw new Error(text(polled.failReason) || text(polled.error) || '视频生成任务失败');
    }
  }
  throw new Error(`视频生成等待超时（任务 ${taskId}），可在历史记录中继续核对`);
}

export async function mixSalesFinalVideo(
  input: {
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
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const parsed = salesAudioMixResponseSchema.safeParse(await readJSON(response, '成片配乐合成失败'));
  if (!parsed.success) throw new Error('成片混音返回结果不完整');
  return parsed.data;
}

export async function uploadSalesCustomAsset(file: File, category: 'assets' | 'videos', signal?: AbortSignal): Promise<string> {
  return uploadStudioFile(file, category, signal);
}
