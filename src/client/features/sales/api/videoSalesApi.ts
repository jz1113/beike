import { z } from 'zod';
import { apiFetch } from '@client/shared/api/apiClient';
import { recordChatTokens } from '@client/shared/utils/modelUsage';
import {
  videoSalesAnalyzeBodySchema,
  videoSalesFinalizeBodySchema,
  videoSalesFinalizeResponseSchema,
  videoSalesScriptGenerateBodySchema,
  videoSalesSelectBodySchema,
} from '@shared/contracts/videoSales';
import type {
  VideoSalesCategory,
  VideoSalesMode,
  VideoSalesProductAnalysis,
  VideoSalesScript,
  SalesActualReference,
  SalesImageRef,
} from '@shared/domain/sales';
import type { SalesRouteHeaders } from '../model/salesRoute';
import { salesSkillBinding } from '@shared/domain/sales/skill';

export type { SalesRouteHeaders };

export interface SalesWorkflowContext {
  workflowVersion: 3;
  eligibleImageIndexes: number[];
  selectedColor?: string;
  aspectRatio?: string;
}

function parseSales<T>(schema: z.ZodType<T>, value: unknown, fallback: string): T {
  const parsed = schema.safeParse(value);
  if (!parsed.success) throw new Error(parsed.error.issues[0]?.message || fallback);
  return parsed.data;
}

async function postSales<T>(path: string, body: object, response: z.ZodType<T>, extraHeaders?: Record<string, string>, signal?: AbortSignal): Promise<T> {
  const skill = salesSkillBinding();
  const res = await apiFetch(path, {
    method: 'POST',
    signal,
    headers: { 'Content-Type': 'application/json', ...extraHeaders },
    body: JSON.stringify({ ...body, ...skill }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || data?.success === false) {
    throw new Error(typeof data?.error === 'string' ? data.error : '请求失败');
  }
  if (data?.skillId !== skill.skillId || data?.skillRevision !== skill.skillRevision) {
    throw new Error('服务端创作技能版本与当前页面不一致，请刷新页面后重试；已有任务请查询原回执');
  }
  return parseSales(response, data, '返回格式不正确');
}

function routeHeaders(input: SalesRouteHeaders): Record<string, string> {
  return {
    ...(input.customBaseUrl ? { 'x-custom-base-url': input.customBaseUrl } : {}),
    ...(input.customApiKey ? { 'x-custom-api-key': input.customApiKey } : {}),
  };
}

export async function analyzeProductMedia(input: {
  imageCatalog: SalesImageRef[];
  productName: string;
  brand?: string;
  productDescription?: string;
  category: VideoSalesCategory;
} & SalesRouteHeaders & SalesWorkflowContext): Promise<VideoSalesProductAnalysis> {
  const data = await postSales('/api/generate/video-sales/analyze', parseSales(videoSalesAnalyzeBodySchema, {
    imageCatalog: input.imageCatalog.map((image) => ({ index: image.index, url: image.url, role: image.role })),
    productName: input.productName,
    brand: input.brand,
    productDescription: input.productDescription,
    category: input.category,
    workflowVersion: input.workflowVersion,
    eligibleImageIndexes: input.eligibleImageIndexes,
    selectedColor: input.selectedColor,
    model: input.model,
    textProtocol: input.textProtocol,
    customBaseUrl: input.customBaseUrl,
    customApiKey: input.customApiKey,
  }, '商品分析请求不正确'), z.object({
    analysis: z.custom<VideoSalesProductAnalysis>((value) => Boolean(value) && typeof value === 'object'),
    model: z.string().optional(), usage: z.unknown().optional(), degraded: z.boolean().optional(),
  }), routeHeaders(input), input.signal);
  if (data.degraded || data.analysis?.degraded) throw new Error('商品分析没有返回真实结果');
  recordChatTokens({ modelId: data.model || input.model || 'video-sales-analyze', type: 'vision', usage: data.usage });
  return data.analysis;
}

export async function generateSalesScripts(input: {
  productName: string;
  category: VideoSalesCategory;
  brand?: string;
  productDescription?: string;
  imageCatalog: SalesImageRef[];
  productAnalysis?: string;
  videoMode: VideoSalesMode;
  targetDuration: number;
  aspectRatio: string;
  targetAudience?: string;
} & SalesRouteHeaders & SalesWorkflowContext): Promise<VideoSalesScript[]> {
  const request = { ...input };
  delete request.signal;
  const data = await postSales('/api/generate/video-sales/script', parseSales(videoSalesScriptGenerateBodySchema, request, '脚本请求不正确'), z.object({
    scripts: z.array(z.custom<VideoSalesScript>()).optional(), model: z.string().optional(), usage: z.unknown().optional(),
  }), routeHeaders(input), input.signal);
  recordChatTokens({ modelId: data.model || input.model || 'video-sales-script', type: 'chat', usage: data.usage });
  return data.scripts || [];
}

export async function selectSalesImages(input: {
  shots: VideoSalesScript['shots'];
  imageCatalog: SalesImageRef[];
} & SalesRouteHeaders & SalesWorkflowContext): Promise<Array<{ shotId: number; imageIndex: number; reason?: string }>> {
  const data = await postSales('/api/generate/video-sales/select-images', parseSales(videoSalesSelectBodySchema, {
    shots: input.shots.map((shot) => ({
      shotId: shot.shotId,
      type: shot.type,
      description: shot.description,
      voiceover: shot.voiceover,
      speechMode: shot.speechMode,
    })),
    imageCatalog: input.imageCatalog.map((image) => ({ index: image.index, url: image.url, role: image.role })),
    workflowVersion: input.workflowVersion,
    eligibleImageIndexes: input.eligibleImageIndexes,
    selectedColor: input.selectedColor,
    model: input.model,
    textProtocol: input.textProtocol,
    customBaseUrl: input.customBaseUrl,
    customApiKey: input.customApiKey,
  }, '选图请求不正确'), z.object({
    assignments: z.array(z.object({ shotId: z.number(), imageIndex: z.number(), reason: z.string().optional() })).optional(),
    degraded: z.boolean().optional(), model: z.string().optional(), usage: z.unknown().optional(),
  }), routeHeaders(input), input.signal);
  if (data.degraded) throw new Error('选图结果不可用');
  recordChatTokens({ modelId: data.model || input.model || 'video-sales-select', type: 'vision', usage: data.usage });
  return data.assignments || [];
}

export async function finalizeSalesPrompts(input: {
  shots: VideoSalesScript['shots'];
  imageCatalog: SalesImageRef[];
  productAnalysis?: string;
  productDescription?: string;
  category: VideoSalesCategory;
  operation: 'finalize';
  actualReferences: SalesActualReference[];
  assets: NonNullable<VideoSalesScript['assets']>;
  targetDuration: number;
  aspectRatio: string;
  videoModel?: string;
  videoRefMode?: string;
  videoResolution?: string;
} & SalesRouteHeaders & SalesWorkflowContext): Promise<{ prompts: Array<{ shotId: number; prompt: string }>; fullPrompt: string }> {
  const data = await postSales('/api/generate/video-sales/finalize-prompts', parseSales(videoSalesFinalizeBodySchema, {
    shots: input.shots.map((shot) => ({
      shotId: shot.shotId,
      imageIndex: shot.imageIndex,
      duration: shot.duration,
      description: shot.description,
      camera: shot.camera,
      voiceover: shot.voiceover,
      speechMode: shot.speechMode,
      prompt: shot.prompt,
      visualSource: shot.visualSource,
    })),
    imageCatalog: input.imageCatalog.map((image) => ({ index: image.index, url: image.url, role: image.role })),
    productAnalysis: input.productAnalysis,
    productDescription: input.productDescription,
    category: input.category,
    operation: input.operation,
    actualReferences: input.actualReferences,
    assets: input.assets,
    targetDuration: input.targetDuration,
    aspectRatio: input.aspectRatio,
    videoModel: input.videoModel,
    videoRefMode: input.videoRefMode,
    videoResolution: input.videoResolution,
    workflowVersion: input.workflowVersion,
    eligibleImageIndexes: input.eligibleImageIndexes,
    selectedColor: input.selectedColor,
    model: input.model,
    textProtocol: input.textProtocol,
    customBaseUrl: input.customBaseUrl,
    customApiKey: input.customApiKey,
  }, '定稿请求不正确'), videoSalesFinalizeResponseSchema, routeHeaders(input), input.signal);
  recordChatTokens({ modelId: data.model || input.model || 'video-sales-finalize', type: 'vision', usage: data.usage });
  return { prompts: data.prompts, fullPrompt: data.fullPrompt };
}
