import {
  ActionCategoryId,
  SubCategoryDef,
  DEFAULT_SUBCATEGORIES_MAP,
  SUBCATEGORY_STORAGE_KEY_PREFIX,
} from './defs';
import { domainEmitEvent, domainStorage } from '../../core/runtime';
import { getHydratedSubCategories } from './serverCache';

/**
 * 获取指定一级品类的二级类目表。服务端 hydration 优先，本地存储仅作缓存。
 */
export function getSubCategoriesForCategory(categoryId: ActionCategoryId): SubCategoryDef[] {
  const hydrated = getHydratedSubCategories(categoryId);
  if (hydrated && hydrated.length > 0) return hydrated;
  const storage = domainStorage();
  if (storage) {
    try {
      const stored = storage.getItem(`${SUBCATEGORY_STORAGE_KEY_PREFIX}${categoryId}`);
      if (stored) {
        const parsed = JSON.parse(stored);
        if (Array.isArray(parsed) && parsed.length > 0) {
          return parsed;
        }
      }
    } catch {
      // ignore
    }
  }
  return DEFAULT_SUBCATEGORIES_MAP[categoryId] || [];
}

/**
 * 保存指定一级品类的二级类目表到本地存储
 */
export function saveSubCategoriesForCategory(categoryId: ActionCategoryId, list: SubCategoryDef[]): void {
  const storage = domainStorage();
  if (storage) {
    try {
      storage.setItem(`${SUBCATEGORY_STORAGE_KEY_PREFIX}${categoryId}`, JSON.stringify(list));
      domainEmitEvent('antigravity_subcategory_changed', { categoryId, list });
    } catch {
      // ignore
    }
  }
}

/**
 * 重置指定一级品类的二级类目表为默认黄金预设
 */
export function resetSubCategoriesForCategory(categoryId: ActionCategoryId): SubCategoryDef[] {
  const defaults = DEFAULT_SUBCATEGORIES_MAP[categoryId] || [];
  const storage = domainStorage();
  if (storage) {
    try {
      storage.removeItem(`${SUBCATEGORY_STORAGE_KEY_PREFIX}${categoryId}`);
      domainEmitEvent('antigravity_subcategory_changed', { categoryId, list: defaults });
    } catch {
      // ignore
    }
  }
  return defaults;
}

/**
 * 批量导入二级类目：支持按行或以逗号/分号/冒号分隔的文本输入
 */
export function importSubCategoriesFromText(
  categoryId: ActionCategoryId,
  rawText: string,
  mode: 'append' | 'replace' = 'append'
): SubCategoryDef[] {
  const lines = rawText
    .split(/[\r\n]+/)
    .map((l) => l.trim())
    .filter(Boolean);

  const newItems: SubCategoryDef[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    let label = '';
    let keywordPart = '';

    if (line.includes(':') || line.includes('：')) {
      const parts = line.split(/[:：]/);
      label = (parts[0] || '').trim();
      keywordPart = parts.slice(1).join(' ');
    } else if (line.includes('(') && line.includes(')')) {
      const match = line.match(/^([^()]+)\(([^()]+)\)/);
      if (match) {
        label = match[1].trim();
        keywordPart = match[2].trim();
      }
    } else if (line.includes('（') && line.includes('）')) {
      const match = line.match(/^([^（）]+)（([^（）]+)）/);
      if (match) {
        label = match[1].trim();
        keywordPart = match[2].trim();
      }
    } else {
      const parts = line.split(/[,，、/| \t]+/);
      label = (parts[0] || '').trim();
      keywordPart = parts.slice(1).join(' ');
    }

    if (!label) continue;

    const shortLabel = label.split(/[/、|\\]/)[0].trim().slice(0, 4) || label.slice(0, 4);
    const idSafe = `sub_${Date.now().toString(36)}_${i}`;

    const rawKeywords = [
      label,
      shortLabel,
      ...keywordPart.split(/[,，、/| \t;；]+/).map((k) => k.trim()),
    ].filter(Boolean);
    const uniqueKeywords = Array.from(new Set(rawKeywords));

    let anatomy = 'general';
    let anchorId = 'collarbone';
    const kwStr = uniqueKeywords.join(' ').toLowerCase();

    if (kwStr.includes('手镯') || kwStr.includes('手链') || kwStr.includes('手串') || kwStr.includes('腕') || kwStr.includes('袖')) {
      anatomy = 'wrist';
      anchorId = 'wrist';
    } else if (kwStr.includes('戒') || kwStr.includes('指') || kwStr.includes('手掌')) {
      anatomy = 'fingers';
      anchorId = 'fingers';
    } else if (kwStr.includes('耳') || kwStr.includes('听')) {
      anatomy = 'ear';
      anchorId = 'ear';
    } else if (kwStr.includes('发') || kwStr.includes('簪') || kwStr.includes('头') || kwStr.includes('髻')) {
      anatomy = 'hair';
      anchorId = 'hair';
    } else if (kwStr.includes('胸') || kwStr.includes('别针') || kwStr.includes('领针')) {
      anatomy = 'brooch';
      anchorId = 'brooch';
    } else if (kwStr.includes('脚') || kwStr.includes('踝')) {
      anatomy = 'ankle';
      anchorId = 'legs';
    } else if (kwStr.includes('项') || kwStr.includes('锁骨') || kwStr.includes('颈') || kwStr.includes('坠')) {
      anatomy = 'necklace';
      anchorId = 'collarbone';
    }

    newItems.push({
      id: idSafe,
      parentId: categoryId,
      label,
      shortLabel,
      anatomy,
      anchorId,
      keywords: uniqueKeywords,
      isCustom: true,
    });
  }

  const existing = mode === 'replace' ? [] : getSubCategoriesForCategory(categoryId);
  const resultMap = new Map<string, SubCategoryDef>();
  for (const it of existing) {
    resultMap.set(it.label, it);
  }
  for (const it of newItems) {
    resultMap.set(it.label, it);
  }

  const merged = Array.from(resultMap.values());
  saveSubCategoriesForCategory(categoryId, merged);
  return merged;
}

export {
  consolidateSubCategoriesLocally,
  type SubCategoryConsolidationGroup,
  type SubCategoryConsolidationResult,
} from './subcategoryConsolidation';
