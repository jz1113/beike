/**
 * 贝壳云图批准模型清单——生图 / 生视频 / 多模态的唯一真相源。
 * 网关拉取、提交校验、设置页预设、展示名均从此派生，禁止再各自硬编码一份。
 */
import { approvedDeepSeekModel, isDeepSeekRoute } from './deepseek';
import { APPROVED_CHAT_MODELS } from './model-catalog/approvedChat';
import { APPROVED_IMAGE_MODELS } from './model-catalog/approvedImage';
import { APPROVED_VIDEO_MODELS } from './model-catalog/approvedVideo';
import type { ApprovedModel, ModelCapability, ModelVendorId } from './model-catalog/defs';

export type { ApprovedModel, ModelCapability, ModelVendorId, VideoAudioSupportType } from './model-catalog/defs';

export const DEFAULT_IMAGE_MODEL_ID = 'gpt-image-2';
export const DEFAULT_VIDEO_MODEL_ID = 'doubao-seedance-2.0-mini';
export const DEFAULT_MULTIMODAL_MODEL_ID = 'gpt-5.6-luna';
export const DEFAULT_ASSISTANT_MODEL_ID = 'gemini-3.7-flash';

export const APPROVED_MODELS: readonly ApprovedModel[] = [
  ...APPROVED_IMAGE_MODELS,
  ...APPROVED_VIDEO_MODELS,
  ...APPROVED_CHAT_MODELS,
];

const BY_ID = new Map(APPROVED_MODELS.map((m) => [m.id.toLowerCase(), m]));

const MODEL_ALIASES: Record<string, string> = {
  'qwen-image-3': 'qwen-image-max',
  'qwen-image-edit-2509': 'qwen-image-edit',
  mjv7: 'midjourney',
  'mjv8.1': 'midjourney',
  'mjv8.2': 'midjourney',
};

export function canonicalModelId(id: string): string {
  const trimmed = String(id || '').trim();
  if (!trimmed) return '';
  const slash = trimmed.lastIndexOf('/');
  const stripped = slash >= 0 ? trimmed.slice(slash + 1) : trimmed;
  return MODEL_ALIASES[stripped] || MODEL_ALIASES[stripped.toLowerCase()] || stripped;
}

/**
 * 多模态上游异常时的统一降级顺序。
 *
 * 调用从当前模型在本列表中的位置开始，失败后向后尝试，抵达末尾后回绕。
 * `deepseek-v4.1-flash` 仍可作为用户显式主模型，但不进入自动降级序列，因为
 * 它不在本次确认的优先级名单中。
 */
export const MULTIMODAL_UPSTREAM_FALLBACK_ORDER = [
  'gpt-5.6-luna',
  'grok-4.6',
  'gemini-3.7-flash',
  'gemini-3.8-flash',
  'deepseek-v4-flash',
  'gpt-5.4-mini',
  'claude-haiku-4-5-20251001-thinking',
  'claude-sonnet-5',
  'gpt-5.6-terra',
  'gemini-3.1-pro-preview',
  'claude-opus-5',
  'claude-opus-4-7',
  'gpt-5.6-sol',
  'qwen3.8-max',
  'kimi-k3',
  'claude-fable-5',
] as const;

/** Builds a circular, de-duplicated fallback chain beginning with the requested model. */
export function normalizeMultimodalFallbackOrder(value: unknown): string[] | undefined {
  if (!Array.isArray(value) || value.length > 256) return undefined;
  if (value.some(id => typeof id !== 'string' || !isApprovedModel(id, 'multimodal') || id.includes(':'))) return undefined;
  return Array.from(new Set(value.map(id => canonicalModelId(id))));
}

export function buildMultimodalUpstreamFallbackChain(requestedModel?: string, customOrder?: unknown): string[] {
  if (isDeepSeekRoute(requestedModel || '')) return approvedDeepSeekModel(requestedModel!) ? [requestedModel!] : [];
  const requested = canonicalModelId(requestedModel || '');
  const custom = normalizeMultimodalFallbackOrder(customOrder);
  if (custom) return Array.from(new Set([requested, ...custom].filter(Boolean)));
  const start = MULTIMODAL_UPSTREAM_FALLBACK_ORDER.findIndex(
    (model) => model.toLowerCase() === requested.toLowerCase(),
  );
  const ordered = start >= 0
    ? [
        ...MULTIMODAL_UPSTREAM_FALLBACK_ORDER.slice(start),
        ...MULTIMODAL_UPSTREAM_FALLBACK_ORDER.slice(0, start),
      ]
    : [...MULTIMODAL_UPSTREAM_FALLBACK_ORDER];

  return Array.from(new Set([requested, ...ordered].filter(Boolean)));
}

export function getApprovedModel(id: string): ApprovedModel | undefined {
  if (isDeepSeekRoute(id)) return approvedDeepSeekModel(id);
  const canonical = canonicalModelId(id);
  if (!canonical) return undefined;
  return BY_ID.get(id.trim().toLowerCase()) || BY_ID.get(canonical.toLowerCase());
}

export function isApprovedModel(id: string, cap?: ModelCapability): boolean {
  const found = getApprovedModel(id);
  if (!found) return false;
  return cap ? found.capability === cap : true;
}

export function filterApprovedModels<T extends { id: string }>(list: T[]): T[] {
  const seen = new Set<string>();
  const out: T[] = [];
  for (const item of list) {
    const approved = getApprovedModel(item.id);
    if (!approved) continue;
    const key = approved.id.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ ...item, id: approved.id });
  }
  return out;
}

export function listApprovedModels(cap?: ModelCapability): ApprovedModel[] {
  return APPROVED_MODELS.filter((m) => (cap ? m.capability === cap : true));
}

export function approvedModelDisplayName(id: string): string | undefined {
  return getApprovedModel(id)?.name;
}

export function vendorLabel(vendor: ModelVendorId): string {
  const labels: Record<ModelVendorId, string> = {
    openai: 'OpenAI',
    google: 'Google',
    bytedance: 'Bytedance',
    alibaba: 'Alibaba',
    midjourney: 'Midjourney',
    bfl: 'Black Forest Labs',
    kuaishou: 'Kuaishou',
    xai: 'xAI',
    minimax: 'MiniMax',
    anthropic: 'Anthropic',
    deepseek: 'DeepSeek',
    moonshot: 'Moonshot',
    vidu: 'Shengshu',
  };
  return labels[vendor];
}
