/**
 * 贝壳云图批准模型清单——生图 / 生视频 / 多模态的唯一真相源。
 * 网关拉取、提交校验、设置页预设、展示名均从此派生，禁止再各自硬编码一份。
 */
import { approvedDeepSeekModel, isDeepSeekRoute } from './deepseek';
import selectionRules from './model-catalog/selectionRules.json';
import { APPROVED_CHAT_MODELS } from './model-catalog/approvedChat';
import { APPROVED_IMAGE_MODELS } from './model-catalog/approvedImage';
import { APPROVED_VIDEO_MODELS } from './model-catalog/approvedVideo';
import type { ApprovedModel, ModelCapability, ModelVendorId } from './model-catalog/defs';

export type { ApprovedModel, ModelCapability, ModelVendorId, VideoAudioSupportType } from './model-catalog/defs';

export const DEFAULT_IMAGE_MODEL_ID = 'gpt-image-2';
export const DEFAULT_VIDEO_MODEL_ID = 'doubao-seedance-2.0-mini';
export const DEFAULT_MULTIMODAL_MODEL_ID = 'gpt-6-luna';
export const DEFAULT_ASSISTANT_MODEL_ID = DEFAULT_MULTIMODAL_MODEL_ID;

export const APPROVED_MODELS: readonly ApprovedModel[] = [
  ...APPROVED_IMAGE_MODELS,
  ...APPROVED_VIDEO_MODELS,
  ...APPROVED_CHAT_MODELS,
];

const BY_ID = new Map(APPROVED_MODELS.map((m) => [m.id.toLowerCase(), m]));
const SELECTION_RULES = selectionRules.map(({ profile, pattern }) => ({
  voice: profile === 'voice',
  profile: BY_ID.get(profile.toLowerCase()),
  pattern: new RegExp(`^(?:${pattern})$`, 'i'),
}));

function modelSelectionLeaf(id: string) {
  const raw = id.trim().replace(/^deepseek-official:/i, '');
  return raw.slice(raw.lastIndexOf('/') + 1).replace(/^net-/i, '');
}

/** The shared selection rules are ordered by family and version. Equal ranks keep their incoming order. */
export function modelDisplayRank(id: string): number {
  const leaf = modelSelectionLeaf(id.replace(/^\s*openai-responses:/i, ''));
  const index = SELECTION_RULES.findIndex(rule => !rule.voice && rule.profile && rule.pattern.test(leaf));
  return index < 0 ? SELECTION_RULES.length : index;
}

export function compareModelDisplayOrder(a: string, b: string): number {
  return modelDisplayRank(a) - modelDisplayRank(b);
}

/** Applies to newly discovered and selectable routes, while historical model profiles stay readable. */
export function getSelectableModel(id: string, cap?: ModelCapability): ApprovedModel | undefined {
  const leaf = modelSelectionLeaf(id);
  const rule = SELECTION_RULES.find(rule => rule.profile && rule.pattern.test(leaf) && (!cap || rule.profile?.capability === cap));
  if (!rule?.profile) return undefined;
  return BY_ID.get(leaf.toLowerCase()) ?? rule.profile;
}

export function isSelectableVoiceModel(id: string): boolean {
  const leaf = id.trim().split('/').at(-1) || '';
  return SELECTION_RULES.some(rule => rule.voice && rule.pattern.test(leaf));
}

export function listSelectableModels(cap?: ModelCapability): ApprovedModel[] {
  return APPROVED_MODELS.filter(item => (!cap || item.capability === cap) && getSelectableModel(item.id, item.capability))
    .sort((a, b) => compareModelDisplayOrder(a.id, b.id));
}

const MODEL_ALIASES: Record<string, string> = {
  h3: 'MiniMax-H3',
  'doubao-seedance-2-5-260628': 'doubao-seedance-2.5',
  'veo-3.1-generate-001': 'veo3.1',
  'veo-3.1-fast-generate-001': 'veo3.1-fast',
  'veo-3.1-generate-preview': 'veo3.1',
  'veo-3.1-fast-generate-preview': 'veo3.1-fast',
  'nano-banana-2.1': 'gemini-nano-banana-2.1',
  'nano-banana-2': 'gemini-3.1-flash-image',
  'nano-banana-2-lite': 'gemini-3.1-flash-lite-image',
  'gemini-3.1-flash-image-preview': 'gemini-3.1-flash-image',
  'gemini-3.1-flash-lite-image-preview': 'gemini-3.1-flash-lite-image',
  'gemini-3-pro-image-preview': 'gemini-3-pro-image',
  'gemini-2.5-flash-image-preview': 'gemini-2.5-flash-image',
  mjv7: 'midjourney',
  'mjv8.1': 'midjourney',
  'mjv8.2': 'midjourney',
  'vidu-q4-preview': 'viduq4-preview',
  viduq4: 'viduq4-preview',
  'gemini-omni-1.1-flash': 'omni_flash-10s',
  'omni-flash-10s': 'omni_flash-10s',
};

export function canonicalModelId(id: string): string {
  const trimmed = String(id || '').trim();
  if (!trimmed) return '';
  if (/^alibaba\/qwen-image-3\/(?:edit|text-to-image)$/i.test(trimmed)) return 'qwen-image-3';
  const slash = trimmed.lastIndexOf('/');
  const stripped = (slash >= 0 ? trimmed.slice(slash + 1) : trimmed).replace(/^net-/i, '');
  return MODEL_ALIASES[stripped] || MODEL_ALIASES[stripped.toLowerCase()] || stripped;
}

/**
 * 多模态上游异常时的统一降级顺序。
 *
 * 调用从当前模型在本列表中的位置开始，失败后向后尝试，抵达末尾后回绕。
 */
export const MULTIMODAL_UPSTREAM_FALLBACK_ORDER = [
  'gpt-6-luna',
  'gpt-6.1-sol',
  'gemini-3.8-flash',
  'grok-4.7',
  'claude-sonnet-5',
  'gpt-5.6-luna',
  'gpt-5.6-terra',
  'claude-opus-5',
  'gpt-5.6-sol',
  'kimi-k3.1-pro',
  'claude-fable-5',
] as const;

/** Builds a circular, de-duplicated fallback chain beginning with the requested model. */
export function normalizeMultimodalFallbackOrder(value: unknown): string[] | undefined {
  if (!Array.isArray(value) || value.length > 256) return undefined;
  if (value.some(id => typeof id !== 'string' || !getSelectableModel(id, 'multimodal') || id.includes(':'))) return undefined;
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
  const exact = BY_ID.get(id.trim().toLowerCase()) || BY_ID.get(canonical.toLowerCase());
  if (exact) return exact;
  const profile = getSelectableModel(id);
  return profile && { ...profile, id: canonical, name: canonical, shortName: canonical };
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
    zhipu: 'Zhipu',
    xiaomi: 'Xiaomi',
  };
  return labels[vendor];
}
