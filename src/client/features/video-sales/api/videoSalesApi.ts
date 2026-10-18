import { apiFetch } from '@client/shared/api/apiClient';
import { recordChatTokens } from '@client/shared/utils/modelUsage';
import type {
  VideoSalesAnalyzeBody,
  VideoSalesCategory,
  VideoSalesComposeBody,
  VideoSalesMode,
  VideoSalesProductAnalysis,
  VideoSalesScript,
  VideoSalesStyleType,
} from '@shared/domain/video-sales';

async function postSales<T>(path: string, body: unknown, extraHeaders?: Record<string, string>): Promise<T> {
  const res = await apiFetch(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...extraHeaders },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || data?.success === false) {
    throw new Error(typeof data?.error === 'string' ? data.error : '请求失败');
  }
  return data as T;
}

export async function analyzeProductMedia(input: {
  imageUrls: string[];
  productName?: string;
  category?: VideoSalesCategory;
  model?: string;
  customBaseUrl?: string;
  customApiKey?: string;
}): Promise<VideoSalesProductAnalysis> {
  const data = await postSales<{ analysis: VideoSalesProductAnalysis; model?: string; usage?: unknown }>('/api/generate/video-sales/analyze', {
    imageUrls: input.imageUrls,
    productName: input.productName,
    category: input.category,
    model: input.model,
  } as VideoSalesAnalyzeBody, {
    ...(input.customBaseUrl ? { 'x-custom-base-url': input.customBaseUrl } : {}),
    ...(input.customApiKey ? { 'x-custom-api-key': input.customApiKey } : {}),
  });
  recordChatTokens({ modelId: data.model || input.model || 'video-sales-analyze', type: 'vision', usage: data.usage });
  return data.analysis;
}

export async function generateSalesScripts(input: {
  productName: string;
  category: VideoSalesCategory;
  productDescription?: string;
  productImages?: string[];
  productAnalysis?: string;
  videoMode: VideoSalesMode;
  styleType: VideoSalesStyleType;
  targetDuration: number;
  priceRange?: string;
  targetAudience?: string;
  platforms?: string[];
  templateId?: string;
  model?: string;
  customBaseUrl?: string;
  customApiKey?: string;
}): Promise<VideoSalesScript[]> {
  const data = await postSales<{ scripts?: VideoSalesScript[]; model?: string; usage?: unknown }>('/api/generate/video-sales/script', input, {
    ...(input.customBaseUrl ? { 'x-custom-base-url': input.customBaseUrl } : {}),
    ...(input.customApiKey ? { 'x-custom-api-key': input.customApiKey } : {}),
  });
  recordChatTokens({ modelId: data.model || input.model || 'video-sales-script', type: 'chat', usage: data.usage });
  return data.scripts || [];
}

export async function synthesizeSalesVoice(input: {
  text: string;
  model?: string;
  voice?: string;
  customBaseUrl?: string;
  customApiKey?: string;
}): Promise<string> {
  const data = await postSales<{ audioUrl: string; model?: string; usage?: unknown }>('/api/generate/audio', {
    text: input.text,
    prompt: input.text,
    model: input.model,
    voice: input.voice,
    customBaseUrl: input.customBaseUrl,
    customApiKey: input.customApiKey,
  }, {
    ...(input.customBaseUrl ? { 'x-custom-base-url': input.customBaseUrl } : {}),
    ...(input.customApiKey ? { 'x-custom-api-key': input.customApiKey } : {}),
  });
  recordChatTokens({ modelId: data.model || input.model || 'speech', type: 'audio', usage: data.usage });
  return data.audioUrl;
}

export async function composeSalesVideo(body: VideoSalesComposeBody): Promise<{
  command: string;
  outputPath: string;
  resultUrl: string;
  executed: boolean;
}> {
  return postSales('/api/generate/video-sales/compose', body);
}
