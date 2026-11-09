import { isDeepSeekRoute, deepSeekModel } from '../models/deepseek';
import {
  listApprovedModels,
  vendorLabel,
  getApprovedModel,
} from '@shared/domain/models/modelCatalog';
import { domainStorage } from '../core/runtime';

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
