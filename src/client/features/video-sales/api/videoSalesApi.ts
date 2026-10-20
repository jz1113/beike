import { apiFetch } from '@client/shared/api/apiClient';
import { recordChatTokens } from '@client/shared/utils/modelUsage';
import type {
  VideoSalesAnalyzeBody,
  VideoSalesCategory,
  VideoSalesComposeBody,
  VideoSalesMode,
  VideoSalesProductAnalysis,
  VideoSalesScript,
  SalesActualReference,
} from '@shared/domain/video-sales';
import type { SalesImageRef } from '@shared/domain/video-sales';

export interface SalesRouteHeaders {
  model?: string;
  textProtocol?: import('@shared/domain/models/textProtocol').TextProtocol;
  customBaseUrl?: string;
  customApiKey?: string;
  signal?: AbortSignal;
}

export interface SalesWorkflowContext {
  workflowVersion?: 3;
  eligibleImageIndexes?: number[];
  selectedColor?: string;
  aspectRatio?: string;
}

async function postSales<T>(path: string, body: unknown, extraHeaders?: Record<string, string>, signal?: AbortSignal): Promise<T> {
  const res = await apiFetch(path, {
    method: 'POST',
    signal,
    headers: { 'Content-Type': 'application/json', ...extraHeaders },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || data?.success === false) {
    throw new Error(typeof data?.error === 'string' ? data.error : '请求失败');
  }
  return data as T;
}

function routeHeaders(input: SalesRouteHeaders): Record<string, string> {
  return {
    ...(input.customBaseUrl ? { 'x-custom-base-url': input.customBaseUrl } : {}),
    ...(input.customApiKey ? { 'x-custom-api-key': input.customApiKey } : {}),
  };
}

export async function analyzeProductMedia(input: {
  imageCatalog: SalesImageRef[];
  productName?: string;
  brand?: string;
  priceRange?: string;
  productDescription?: string;
  category?: VideoSalesCategory;
} & SalesRouteHeaders & SalesWorkflowContext): Promise<VideoSalesProductAnalysis> {
  const data = await postSales<{ analysis: VideoSalesProductAnalysis; model?: string; usage?: unknown; degraded?: boolean }>('/api/generate/video-sales/analyze', {
    imageCatalog: input.imageCatalog.map((image) => ({ index: image.index, url: image.url, role: image.role })),
    imageUrls: input.imageCatalog.map((image) => image.url),
    productName: input.productName,
    brand: input.brand,
    priceRange: input.priceRange,
    productDescription: input.productDescription,
    category: input.category,
    workflowVersion: input.workflowVersion,
    eligibleImageIndexes: input.eligibleImageIndexes,
    selectedColor: input.selectedColor,
    model: input.model,
    textProtocol: input.textProtocol,
    customBaseUrl: input.customBaseUrl,
    customApiKey: input.customApiKey,
  } as VideoSalesAnalyzeBody, routeHeaders(input), input.signal);
  if (data.degraded || data.analysis?.degraded) throw new Error('商品分析没有返回真实结果');
  recordChatTokens({ modelId: data.model || input.model || 'video-sales-analyze', type: 'vision', usage: data.usage });
  return data.analysis;
}

export async function generateSalesScripts(input: {
  productName: string;
  category: VideoSalesCategory;
  brand?: string;
  productDescription?: string;
  productImages?: string[];
  imageCatalog?: SalesImageRef[];
  productAnalysis?: string;
  videoMode: VideoSalesMode;
  targetDuration: number;
  priceRange?: string;
  targetAudience?: string;
  platforms?: string[];
  templateId?: string;
  fashionReferences?: { person: boolean; face: boolean; scene: boolean };
} & SalesRouteHeaders & SalesWorkflowContext): Promise<VideoSalesScript[]> {
  const data = await postSales<{ scripts?: VideoSalesScript[]; model?: string; usage?: unknown }>('/api/generate/video-sales/script', input, routeHeaders(input), input.signal);
  recordChatTokens({ modelId: data.model || input.model || 'video-sales-script', type: 'chat', usage: data.usage });
  return data.scripts || [];
}

export async function selectSalesImages(input: {
  shots: VideoSalesScript['shots'];
  imageCatalog: SalesImageRef[];
} & SalesRouteHeaders & SalesWorkflowContext): Promise<Array<{ shotId: number; imageIndex: number; reason?: string }>> {
  const data = await postSales<{ assignments?: Array<{ shotId: number; imageIndex: number; reason?: string }>; degraded?: boolean; model?: string; usage?: unknown }>('/api/generate/video-sales/select-images', {
    shots: input.shots.map((shot) => ({
      shotId: shot.shotId,
      type: shot.type,
      description: shot.description,
      voiceover: shot.voiceover,
    })),
    imageCatalog: input.imageCatalog.map((image) => ({ index: image.index, url: image.url, role: image.role })),
    workflowVersion: input.workflowVersion,
    eligibleImageIndexes: input.eligibleImageIndexes,
    selectedColor: input.selectedColor,
    model: input.model,
    textProtocol: input.textProtocol,
    customBaseUrl: input.customBaseUrl,
    customApiKey: input.customApiKey,
  }, routeHeaders(input), input.signal);
  if (data.degraded) throw new Error('选图结果不可用');
  recordChatTokens({ modelId: data.model || input.model || 'video-sales-select', type: 'vision', usage: data.usage });
  return data.assignments || [];
}

export async function finalizeSalesPrompts(input: {
  shots: VideoSalesScript['shots'];
  imageCatalog: SalesImageRef[];
  productAnalysis?: string;
  category?: VideoSalesCategory;
  operation?: 'finalize';
  actualReferences?: SalesActualReference[];
  assets?: VideoSalesScript['assets'];
  targetDuration?: number;
  videoModel?: string;
  videoRefMode?: string;
  videoResolution?: string;
  referenceOrder?: Array<{ slot: string; label: string; url: string; imageIndex?: number }>;
} & SalesRouteHeaders & SalesWorkflowContext): Promise<{ prompts: Array<{ shotId: number; prompt: string; imagePrompt?: string }>; fullPrompt?: string; personImagePrompt?: string; sceneImagePrompt?: string }> {
  const data = await postSales<{ prompts?: Array<{ shotId: number; prompt: string; imagePrompt?: string }>; fullPrompt?: string; personImagePrompt?: string; sceneImagePrompt?: string; model?: string; usage?: unknown }>('/api/generate/video-sales/finalize-prompts', {
    shots: input.shots.map((shot) => ({
      shotId: shot.shotId,
      imageIndex: shot.imageIndex,
      duration: shot.duration,
      description: shot.description,
      camera: shot.camera,
      voiceover: shot.voiceover,
      prompt: shot.prompt,
      visualSource: shot.visualSource,
    })),
    imageCatalog: input.imageCatalog.map((image) => ({ index: image.index, url: image.url, role: image.role })),
    productAnalysis: input.productAnalysis,
    category: input.category,
    referenceOrder: input.referenceOrder,
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
  }, routeHeaders(input), input.signal);
  recordChatTokens({ modelId: data.model || input.model || 'video-sales-finalize', type: 'vision', usage: data.usage });
  return { prompts: data.prompts || [], fullPrompt: data.fullPrompt, personImagePrompt: data.personImagePrompt, sceneImagePrompt: data.sceneImagePrompt };
}

export async function validateSalesAssets(input: {
  shots: VideoSalesScript['shots'];
  imageCatalog: SalesImageRef[];
  actualReferences: SalesActualReference[];
  assets?: VideoSalesScript['assets'];
  productAnalysis?: string;
} & SalesRouteHeaders & SalesWorkflowContext): Promise<Array<{ id: string; status: 'passed' | 'conflict' | 'uncertain'; reason: string }>> {
  const data = await postSales<{ validations?: Array<{ id: string; status: 'passed' | 'conflict' | 'uncertain'; reason: string }>; model?: string; usage?: unknown }>(
    '/api/generate/video-sales/finalize-prompts', { ...input, signal: undefined, operation: 'validate-assets' }, routeHeaders(input), input.signal,
  );
  recordChatTokens({ modelId: data.model || input.model || 'video-sales-validate', type: 'vision', usage: data.usage });
  const found = data.validations || [];
  if (found.length !== input.actualReferences.length || new Set(found.map((item) => item.id)).size !== found.length
    || input.actualReferences.some((ref) => !found.some((item) => item.id === ref.id))
    || found.some((item) => !['passed', 'conflict', 'uncertain'].includes(item.status) || !item.reason?.trim())) {
    throw new Error('素材校验结果不完整，请重试校验');
  }
  return found;
}

export async function composeSalesVideo(body: VideoSalesComposeBody): Promise<string> {
  const data = await postSales<{ resultUrl?: string; executed?: boolean }>('/api/generate/video-sales/compose', body);
  if (!data.executed || !data.resultUrl) throw new Error('合成没有返回成片地址');
  return data.resultUrl;
}
