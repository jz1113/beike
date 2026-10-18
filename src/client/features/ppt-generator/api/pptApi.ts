import { apiFetch } from '@client/shared/api/apiClient';
import { recordChatTokens } from '@client/shared/utils/modelUsage';
import type {
  PptAspectRatio,
  PptDetailLevel,
  PptLanguage,
  PptOutlinePage,
} from '@shared/contracts/pptGeneration';

async function postPpt<T>(path: string, body: unknown, extraHeaders?: Record<string, string>): Promise<T> {
  const res = await apiFetch(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...extraHeaders },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || data?.success === false) {
    throw new Error(typeof data?.error === 'string' ? data.error : `请求失败 (${res.status})`);
  }
  return data as T;
}

export interface GenerateOutlineParams {
  ideaPrompt?: string;
  outlineText?: string;
  userRequirement?: string;
  language?: PptLanguage;
  currentOutline?: PptOutlinePage[];
  model?: string;
  customBaseUrl?: string;
  customApiKey?: string;
  allowFallback?: boolean;
}

export interface GenerateDetailParams {
  outlinePages: PptOutlinePage[];
  detailLevel?: PptDetailLevel;
  language?: PptLanguage;
  model?: string;
  customBaseUrl?: string;
  customApiKey?: string;
  renderMode?: 'layout' | 'visual';
}

export interface GenerateSlideParams {
  pageIndex: number;
  outlineTitle: string;
  pageDesc: string;
  aspectRatio?: PptAspectRatio;
  pageStyleText?: string;
  templateImageUrl?: string;
  editInstruction?: string;
  originalImageUrl?: string;
  modelId?: string;
  customBaseUrl?: string;
  customApiKey?: string;
  renderMode?: 'layout' | 'visual';
}

export interface GenerateNarrationParams {
  pages: Array<{
    pageIndex: number;
    title: string;
    contentText: string;
  }>;
  speakerPersona?: string;
  tone?: string;
  model?: string;
  customBaseUrl?: string;
  customApiKey?: string;
}

export async function fetchPptOutline(params: GenerateOutlineParams) {
  const data = await postPpt<{
    success: boolean;
    markdown: string;
    pages: PptOutlinePage[];
    fromFallback: boolean;
    model?: string;
    usage?: unknown;
  }>('/api/generate/ppt-outline', params, {
    ...(params.customBaseUrl ? { 'x-custom-base-url': params.customBaseUrl } : {}),
    ...(params.customApiKey ? { 'x-custom-api-key': params.customApiKey } : {}),
  });
  if (!data.fromFallback) recordChatTokens({ modelId: data.model || params.model || 'ppt-outline', type: 'chat', usage: data.usage });
  return data;
}

export async function fetchPptDetail(params: GenerateDetailParams) {
  const data = await postPpt<{
    success: boolean;
    details: Array<{
      pageIndex: number;
      title: string;
      contentText: string;
      visualAssets: string;
      layoutEmphasis: string;
      speakerNotes: string;
    }>;
    fromFallback: boolean;
    model?: string;
    usage?: unknown;
  }>('/api/generate/ppt-detail', params, {
    ...(params.customBaseUrl ? { 'x-custom-base-url': params.customBaseUrl } : {}),
    ...(params.customApiKey ? { 'x-custom-api-key': params.customApiKey } : {}),
  });
  if (!data.fromFallback) recordChatTokens({ modelId: data.model || params.model || 'ppt-detail', type: 'chat', usage: data.usage });
  return data;
}

export async function fetchPptSlide(params: GenerateSlideParams) {
  return postPpt<{
    success: boolean;
    versionId: string;
    url: string;
    prompt: string;
    isMock: boolean;
  }>('/api/generate/ppt-slide', params, {
    ...(params.customBaseUrl ? { 'x-custom-base-url': params.customBaseUrl } : {}),
    ...(params.customApiKey ? { 'x-custom-api-key': params.customApiKey } : {}),
  });
}

export async function fetchPptNarration(params: GenerateNarrationParams) {
  const data = await postPpt<{
    success: boolean;
    narrations: Record<string, string>;
    fromFallback: boolean;
    model?: string;
    usage?: unknown;
  }>('/api/generate/ppt-narration', params, {
    ...(params.customBaseUrl ? { 'x-custom-base-url': params.customBaseUrl } : {}),
    ...(params.customApiKey ? { 'x-custom-api-key': params.customApiKey } : {}),
  });
  if (!data.fromFallback) recordChatTokens({ modelId: data.model || params.model || 'ppt-narration', type: 'chat', usage: data.usage });
  return data;
}
