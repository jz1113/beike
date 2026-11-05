import { isDeepSeekRoute, deepSeekModel } from '../models/deepseek';
import {
  buildMultimodalUpstreamFallbackChain,
  listApprovedModels,
  vendorLabel,
  DEFAULT_MULTIMODAL_MODEL_ID,
  getApprovedModel,
  MULTIMODAL_UPSTREAM_FALLBACK_ORDER,
} from '@shared/domain/models/modelCatalog';
import { domainStorage } from '../core/runtime';
export type { PreviousGroupSignature, AssetLibrarySlotData, LockedAssetSlots, VisionAnalyzeParams, ShotPrompt } from './visionTypes';

export function buildActionDigestFromShots(
  shots: Array<{ expression?: string; action?: string }>
): string {
  return shots
    .map((s) => [s.expression, s.action].filter(Boolean).join('/'))
    .filter(Boolean)
    .slice(0, 6)
    .join(' | ');
}

export interface CategoryItem {
  id: string;
  name: string;
  isCustom?: boolean;
}

export const DEFAULT_CATEGORIES: CategoryItem[] = [
  { id: 'digital_3c', name: '📱 手机数码 / 电脑办公' },
  { id: 'jewelry_luxury', name: '💎 珠宝首饰' },
  { id: 'general', name: '🌐 通用生活买家秀' }
];

export function getMergedCategories(): CategoryItem[] {
  const storage = domainStorage();
  if (!storage) return DEFAULT_CATEGORIES;
  const saved = storage.getItem('custom_categories');
  if (!saved) return DEFAULT_CATEGORIES;
  try {
    const custom: unknown = JSON.parse(saved);
    if (Array.isArray(custom)) {
      const merged = [...DEFAULT_CATEGORIES];
      const knownIds = new Set(merged.map(category => category.id));
      for (const category of custom) {
        if (!category || typeof category !== 'object') continue;
        const candidate = category as Partial<CategoryItem>;
        if (typeof candidate.id !== 'string' || !candidate.id.trim()
          || typeof candidate.name !== 'string' || !candidate.name.trim()
          || knownIds.has(candidate.id)) continue;
        merged.push(candidate as CategoryItem);
        knownIds.add(candidate.id);
      }
      return merged;
    }
  } catch {}
  return DEFAULT_CATEGORIES;
}

export function saveCategoriesList(list: CategoryItem[]): CategoryItem[] {
  const storage = domainStorage();
  if (!storage) return list;
  try {
    storage.setItem('custom_categories', JSON.stringify(list));
  } catch {}
  return list;
}

export function deleteCategoryItem(catId: string): CategoryItem[] {
  const current = getMergedCategories();
  const updated = current.filter(c => c.id !== catId);
  return saveCategoriesList(updated);
}

export function resetCategoriesToDefault(): CategoryItem[] {
  return saveCategoriesList(DEFAULT_CATEGORIES);
}

export interface VisionModel {
  id: string;
  name: string;
  shortName: string;
  provider: string;
  badge?: string;
  description?: string;
}

export const VISION_MODELS: VisionModel[] = listApprovedModels('multimodal').map((m) => ({
  id: m.id,
  name: m.name,
  shortName: m.shortName,
  provider: vendorLabel(m.vendor),
  badge: m.badge,
  description: m.description,
}));

/** 模型是否支持 image_url 多模态输入（反推管线专用，排除纯文本 deepseek 等） */
export function isVisionCapableModel(modelId?: string): boolean {
  if (isDeepSeekRoute(modelId || '')) return !!deepSeekModel(modelId!)?.vision;
  const raw = (modelId || '').trim();
  if (!raw) return false;
  const approved = getApprovedModel(raw);
  if (approved) return approved.capability === 'multimodal';
  const lower = raw.toLowerCase();

  if (
    lower.includes('embedding') ||
    lower.includes('embed') ||
    lower.includes('whisper') ||
    lower.includes('tts') ||
    lower.includes('suno') ||
    lower.includes('rerank')
  ) {
    return false;
  }

  if (lower.includes('deepseek') && !lower.includes('vl')) {
    return false;
  }

  if (
    lower.includes('vision') ||
    lower.includes('gemini') ||
    lower.includes('claude') ||
    lower.includes('grok') ||
    lower.includes('4o') ||
    /gpt-[456]/.test(lower) ||
    lower.includes('qwen-vl') ||
    lower.includes('luna')
  ) {
    return true;
  }

  return false;
}

/** 过滤模型链，仅保留支持 image_url 的视觉模型 */
export function filterVisionCapableModels(models: string[]): string[] {
  return models.filter((m) => isVisionCapableModel(m));
}

/** 根据当前模型构建统一的多模态上游降级链。 */
export function buildVisionModelsToTry(
  requestedModel: string | undefined,
  fallbackModels: string[] | undefined = undefined,
  maxTotal = Math.max(MULTIMODAL_UPSTREAM_FALLBACK_ORDER.length, fallbackModels?.length ?? 0) + 1,
): string[] {
  const raw = (requestedModel || '').trim();
  const primary = raw ? normalizeVisionModelId(raw) : DEFAULT_MULTIMODAL_MODEL_ID;
  const chain = buildMultimodalUpstreamFallbackChain(primary, fallbackModels);
  return chain.slice(0, Math.max(1, maxTotal));
}

/** Pass1 逐图反推与其他视觉入口使用完全相同的上游降级顺序。 */
export function buildPass1VisionModelsToTry(
  requestedModel: string | undefined,
  fallbackModels: string[] | undefined = undefined,
  maxTotal = Math.max(MULTIMODAL_UPSTREAM_FALLBACK_ORDER.length, fallbackModels?.length ?? 0) + 1,
): string[] {
  return buildVisionModelsToTry(requestedModel, fallbackModels, maxTotal);
}

export function pickVisionAnalyzeFallbacks(selectedId: string): string[] {
  return buildMultimodalUpstreamFallbackChain(normalizeVisionModelId(selectedId)).slice(1);
}

export function normalizeVisionModelId(modelId?: string): string {
  if (!modelId) return DEFAULT_MULTIMODAL_MODEL_ID;
  const clean = modelId.trim().toLowerCase();
  const aliases: Record<string, string> = {
    'gpt-4-vision-preview': 'gpt-5.6-luna',
    'gpt-4-turbo-vision': 'gpt-5.6-luna',
    'gpt-4o': 'gpt-5.6-luna',
    'gpt-5.5-pro': 'gpt-5.6-luna',
    'gemini-1.5-flash': 'gemini-3.7-flash',
    'gemini-2.0-flash': 'gemini-3.7-flash',
    'gemini-2.5-flash': 'gemini-3.7-flash',
    'gemini-1.5-pro': 'gemini-3.1-pro-preview',
    'gemini-2.5-pro': 'gemini-3.1-pro-preview',
    'gemini-3.1-pro-preview-thinking-high': 'gemini-3.1-pro-preview',
    'claude-3-5-sonnet': 'claude-sonnet-5',
    'claude-3-5-sonnet-20241022': 'claude-sonnet-5',
    'claude-3-7-sonnet': 'claude-sonnet-5',
    'claude-3-7-sonnet-thinking': 'claude-opus-5',
    'claude-3-7-sonnet-20250219': 'claude-sonnet-5',
  };
  return aliases[clean] || modelId;
}

