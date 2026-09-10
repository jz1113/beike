import { useEffect, useMemo, useState } from 'react';
import {
  extractActionCategories,
  extractActionFocusAnchors,
  ACTION_FOCUS_ANCHORS,
  type ActionCategoryId,
  type SubCategoryDef,
  getSubCategoriesForCategory,
  matchItemSubCategory,
} from '@beike/domain/productCategoryHelpers';
import {
  humanizeShotType,
  normalizeTagToChinese,
  type AssetSubTab,
} from '../assetPromptConstants';

export type ActionShotScale = 'all' | 'macro_closeup' | 'half_body' | 'full_body';

export function isMacroOrCloseUp(item: any): boolean {
  const tagsStr = String(item.tags || '');
  if (tagsStr.includes('半身姿态') || tagsStr.includes('全身氛围')) return false;

  const shotTypeLower = String(item.shotType || '').toLowerCase();
  // 1. 如果明确指定了半身或全身，绝对不能归入微距/特写！
  if (
    shotTypeLower === 'half_body' ||
    shotTypeLower.includes('half') ||
    shotTypeLower.includes('profile_45') ||
    shotTypeLower.includes('interaction') ||
    shotTypeLower.includes('lifestyle_interaction') ||
    shotTypeLower === 'full_body' ||
    shotTypeLower.includes('full') ||
    shotTypeLower.includes('whole')
  ) {
    return false;
  }
  if (
    shotTypeLower === 'macro' ||
    shotTypeLower === 'close_up' ||
    shotTypeLower.includes('closeup') ||
    shotTypeLower.includes('macro')
  ) {
    return true;
  }

  // 2. 如果动作名称或标签明确提到局部特写
  const title = String(item.title || item.name || '').toLowerCase();
  const desc = String(item.description || item.action || '').toLowerCase();
  if (title.includes('特写') || title.includes('微距') || desc.includes('特写') || desc.includes('微距')) {
    return true;
  }

  return false;
}

export function isHalfBody(item: any): boolean {
  if (isMacroOrCloseUp(item)) return false;
  const tagsStr = String(item.tags || '');
  if (tagsStr.includes('半身姿态')) return true;
  if (tagsStr.includes('全身氛围')) return false;

  const shotTypeLower = String(item.shotType || '').toLowerCase();
  if (
    shotTypeLower === 'half_body' ||
    shotTypeLower.includes('half') ||
    shotTypeLower.includes('profile_45') ||
    shotTypeLower.includes('interaction') ||
    shotTypeLower.includes('lifestyle_interaction')
  ) {
    return true;
  }

  const title = String(item.title || item.name || '').toLowerCase();
  const desc = String(item.description || item.action || '').toLowerCase();
  if (title.includes('半身') || desc.includes('半身') || title.includes('坐姿') || title.includes('倚靠')) {
    return true;
  }

  return false;
}

export function isFullBody(item: any): boolean {
  if (isMacroOrCloseUp(item)) return false;
  if (isHalfBody(item)) return false;
  return true;
}

export function useAssetLibraryFilters(
  activeSubTab: AssetSubTab,
  items: any[]
) {
  const [searchKeyword, setSearchKeyword] = useState('');
  const [debouncedKeyword, setDebouncedKeyword] = useState('');
  const [onlyFavorite, setOnlyFavorite] = useState(false);
  const [selectedTag, setSelectedTag] = useState<string | null>(null);
  const [actionCategory, setActionCategory] = useState<ActionCategoryId | 'all'>('all');
  const [actionSubCategory, setActionSubCategory] = useState<string>('all');
  const [actionShotScale, setActionShotScale] = useState<ActionShotScale>('all');
  const [actionAnchor, setActionAnchor] = useState<string | null>(null);
  const [sortBy, setSortBy] = useState<'default' | 'usage' | 'favorite'>('default');
  const [subCategoriesVersion, setSubCategoriesVersion] = useState(0);

  useEffect(() => {
    const handleSubCategoryChange = () => {
      setSubCategoriesVersion((v) => v + 1);
    };
    window.addEventListener('antigravity_subcategory_changed', handleSubCategoryChange);
    window.addEventListener('storage', handleSubCategoryChange);
    return () => {
      window.removeEventListener('antigravity_subcategory_changed', handleSubCategoryChange);
      window.removeEventListener('storage', handleSubCategoryChange);
    };
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedKeyword(searchKeyword.trim());
    }, 200);
    return () => clearTimeout(timer);
  }, [searchKeyword]);

  useEffect(() => {
    setSelectedTag(null);
    setActionCategory('all');
    setActionSubCategory('all');
    setActionShotScale('all');
    setActionAnchor(null);
  }, [activeSubTab]);

  const setActionCategoryWithReset = (cat: ActionCategoryId | 'all') => {
    setActionCategory(cat);
    setActionSubCategory('all');
  };

  // 计算动作资产在各大类目下的资产数量
  const actionCategoryCounts = useMemo(() => {
    if (activeSubTab !== 'action') {
      return { all: 0, universal: 0, jewelry: 0, digital_3c: 0, apparel: 0 };
    }
    const baseItems: any[] = items;
    const counts = { all: baseItems.length, universal: 0, jewelry: 0, digital_3c: 0, apparel: 0 };
    for (const it of baseItems) {
      const cats = extractActionCategories(it);
      for (const c of cats) {
        if (c.id === 'universal') counts.universal++;
        if (c.id === 'jewelry') counts.jewelry++;
        if (c.id === 'digital_3c') counts.digital_3c++;
        if (c.id === 'apparel') counts.apparel++;
      }
    }
    return counts;
  }, [activeSubTab, items]);

  // 当前一级品类下的二级细分类目列表（支持响应式更新）
  const currentSubCategories = useMemo<SubCategoryDef[]>(() => {
    if (activeSubTab !== 'action' || actionCategory === 'all' || actionCategory === 'universal') {
      return [];
    }
    return getSubCategoriesForCategory(actionCategory);
  }, [activeSubTab, actionCategory, subCategoriesVersion]);

  // 计算当前品类下各个二级细分类目的匹配资产数量
  const actionSubCategoryCounts = useMemo<Record<string, number>>(() => {
    if (activeSubTab !== 'action' || actionCategory === 'all' || currentSubCategories.length === 0) {
      return { all: 0 };
    }
    const baseItems: any[] = items;
    const filteredByCategory = baseItems.filter((it) =>
      extractActionCategories(it).some((c) => c.id === actionCategory)
    );

    const counts: Record<string, number> = { all: filteredByCategory.length };
    for (const sub of currentSubCategories) {
      counts[sub.id] = 0;
    }

    for (const it of filteredByCategory) {
      const matched = matchItemSubCategory(it, actionCategory, currentSubCategories);
      if (matched) {
        counts[matched.id] = (counts[matched.id] || 0) + 1;
      }
    }
    return counts;
  }, [activeSubTab, items, actionCategory, currentSubCategories]);

  // 计算动作在当前品类筛选下的景别分布数量
  const actionShotScaleCounts = useMemo(() => {
    if (activeSubTab !== 'action') {
      return { all: 0, macro_closeup: 0, half_body: 0, full_body: 0 };
    }
    const baseItems: any[] = items;
    let filtered = baseItems;
    if (actionCategory !== 'all') {
      filtered = baseItems.filter((it) =>
        extractActionCategories(it).some((c) => c.id === actionCategory)
      );
    }
    const counts = { all: filtered.length, macro_closeup: 0, half_body: 0, full_body: 0 };
    for (const it of filtered) {
      if (isMacroOrCloseUp(it)) counts.macro_closeup++;
      else if (isHalfBody(it)) counts.half_body++;
      else counts.full_body++;
    }
    return counts;
  }, [activeSubTab, items, actionCategory]);

  // 计算动作在当前类目与景别下可用的特写部位锚点列表及其数量
  const availableAnchors = useMemo<{ id: string; label: string; count: number }[]>(() => {
    if (activeSubTab !== 'action') return [];
    // 当显式切换到全身或半身时，特写部位不适用，不展示部位胶囊
    if (actionShotScale === 'half_body' || actionShotScale === 'full_body') return [];

    const baseItems: any[] = items;
    const anchorMap = new Map<string, number>();

    for (const it of baseItems) {
      if (actionCategory !== 'all') {
        const cats = extractActionCategories(it);
        if (!cats.some((c) => c.id === actionCategory)) continue;
      }
      const anchors = extractActionFocusAnchors(it);
      for (const a of anchors) {
        anchorMap.set(a.id, (anchorMap.get(a.id) || 0) + 1);
      }
    }

    return Array.from(anchorMap.entries())
      .map(([id, count]) => ({
        id,
        label: ACTION_FOCUS_ANCHORS[id]?.label || id,
        count,
      }))
      .filter((a) => a.count > 0)
      .sort((a, b) => b.count - a.count);
  }, [activeSubTab, items, actionCategory, actionShotScale]);

  const dynamicTagList = useMemo<{ tag: string; count: number }[]>(() => {
    const baseItems: any[] = items;
    if (!baseItems || baseItems.length === 0) return [];

    const tagCountMap = new Map<string, number>();

    const extractTagsSafe = (raw: unknown): string[] => {
      if (!raw) return [];
      if (Array.isArray(raw)) {
        return raw.map(String).map((s) => s.replace(/["'\[\]{}]/g, '').trim()).filter(Boolean);
      }
      if (typeof raw === 'string') {
        const str = raw.trim();
        if (str.startsWith('[') && str.endsWith(']')) {
          try {
            const parsed = JSON.parse(str);
            if (Array.isArray(parsed)) {
              return parsed.map(String).map((s) => s.replace(/["'\[\]{}]/g, '').trim()).filter(Boolean);
            }
          } catch {
            /* ignore */
          }
        }
        return str
          .split(/[,，、/| ;]+/)
          .map((s) => s.replace(/["'\[\]{}]/g, '').trim())
          .filter(Boolean);
      }
      return [];
    };

    for (const item of baseItems) {
      const candidates: string[] = [];

      if (activeSubTab === 'action') {
        // 动作库已在第二行提供结构化的品类与景别筛选，避免注入重复的“服饰/首饰/特写/半身”标签
        if (item.posture && item.posture !== 'general') candidates.push(item.posture);
      } else {
        candidates.push(...extractTagsSafe(item.tags));
        candidates.push(...extractTagsSafe(item.suitableAnatomy));
        if (item.category && item.category !== 'general') candidates.push(item.category);
        if (item.spatialType) candidates.push(item.spatialType);
        if (item.hairStyle && item.hairStyle.length <= 8) candidates.push(item.hairStyle);
        if (item.hairColor && item.hairColor.length <= 8) candidates.push(item.hairColor);
        if (item.vibe && item.vibe.length <= 8) candidates.push(item.vibe);
        if (item.style && item.style.length <= 8) candidates.push(item.style);
        if (item.shotType) {
          const st = humanizeShotType(item.shotType);
          if (st) candidates.push(st);
        }
      }

      const seenInItem = new Set<string>();
      for (const raw of candidates) {
        const clean = normalizeTagToChinese(raw.trim());
        if (clean && clean.length >= 2 && clean.length <= 8 && !seenInItem.has(clean)) {
          seenInItem.add(clean);
          tagCountMap.set(clean, (tagCountMap.get(clean) || 0) + 1);
        }
      }
    }

    return Array.from(tagCountMap.entries())
      .filter(([, count]) => count > 0)
      .map(([tag, count]) => ({ tag, count }))
      .sort((a, b) => b.count - a.count);
  }, [activeSubTab, items]);

  const isAnyFilterActive = useMemo(
    () =>
      Boolean(
        onlyFavorite ||
          searchKeyword.trim() ||
          selectedTag ||
          (activeSubTab === 'action' &&
            (actionCategory !== 'all' ||
              actionSubCategory !== 'all' ||
              actionShotScale !== 'all' ||
              actionAnchor !== null))
      ),
    [onlyFavorite, searchKeyword, selectedTag, activeSubTab, actionCategory, actionSubCategory, actionShotScale, actionAnchor]
  );

  const displayedItems = useMemo<any[]>(() => {
    const baseList: any[] = items;
    if (!baseList || baseList.length === 0) return items;

    let filtered = baseList.filter((item) => {
      if (onlyFavorite && !item.isFavorite) return false;

      // 动作 Tab 下的品类过滤
      if (activeSubTab === 'action' && actionCategory !== 'all') {
        const cats = extractActionCategories(item);
        if (!cats.some((c) => c.id === actionCategory)) {
          return false;
        }
      }

      // 动作 Tab 下的二级细分类目过滤
      if (activeSubTab === 'action' && actionCategory !== 'all' && actionSubCategory !== 'all') {
        const matched = matchItemSubCategory(item, actionCategory, currentSubCategories);
        if (!matched || matched.id !== actionSubCategory) {
          return false;
        }
      }

      // 动作 Tab 下的构图景别过滤
      if (activeSubTab === 'action' && actionShotScale !== 'all') {
        if (actionShotScale === 'macro_closeup' && !isMacroOrCloseUp(item)) return false;
        if (actionShotScale === 'half_body' && !isHalfBody(item)) return false;
        if (actionShotScale === 'full_body' && !isFullBody(item)) return false;
      }

      // 动作 Tab 下的特写聚焦部位过滤
      if (activeSubTab === 'action' && actionAnchor) {
        const anchors = extractActionFocusAnchors(item);
        if (!anchors.some((a) => a.id === actionAnchor)) {
          return false;
        }
      }

      if (debouncedKeyword.trim()) {
        const kw = debouncedKeyword.trim().toLowerCase();
        const text = `${item.title || ''} ${item.name || ''} ${item.tags || ''} ${item.description || ''} ${item.reversePrompt || ''} ${item.reversePromptZh || ''} ${item.action || ''} ${item.suitableAnatomy || ''}`.toLowerCase();
        if (!text.includes(kw)) return false;
      }

      if (selectedTag) {
        if (activeSubTab === 'action') {
          const text = `${item.title || ''} ${item.action || ''} ${item.camera || ''} ${item.shotType || ''} ${item.posture || ''} ${item.tags || ''} ${item.reversePrompt || ''} ${item.reversePromptZh || ''}`.toLowerCase();
          if (text.includes(selectedTag.toLowerCase())) return true;
          return false;
        }

        const tagLower = selectedTag.toLowerCase();
        const text = `${item.title || ''} ${item.name || ''} ${item.tags || ''} ${item.description || ''} ${item.reversePrompt || ''} ${item.reversePromptZh || ''} ${item.action || ''} ${item.suitableAnatomy || ''} ${item.category || ''} ${item.spatialType || ''} ${item.lighting || ''} ${item.hairStyle || ''} ${item.hairColor || ''} ${item.vibe || ''} ${item.style || ''} ${item.top || ''} ${item.bottom || ''} ${item.colorPalette || ''}`.toLowerCase();
        if (!text.includes(tagLower)) return false;
      }

      return true;
    });

    if (sortBy === 'usage') {
      filtered = [...filtered].sort((a, b) => (b.usageCount || 0) - (a.usageCount || 0));
    } else if (sortBy === 'favorite') {
      filtered = [...filtered].sort((a, b) => (b.isFavorite ? 1 : 0) - (a.isFavorite ? 1 : 0));
    }

    return filtered;
  }, [
    activeSubTab,
    actionCategory,
    actionSubCategory,
    currentSubCategories,
    actionShotScale,
    actionAnchor,
    debouncedKeyword,
    onlyFavorite,
    selectedTag,
    sortBy,
    items,
  ]);

  const handleResetAllFilters = () => {
    setSearchKeyword('');
    setOnlyFavorite(false);
    setSelectedTag(null);
    setActionCategory('all');
    setActionSubCategory('all');
    setActionShotScale('all');
    setActionAnchor(null);
  };

  return {
    searchKeyword,
    setSearchKeyword,
    onlyFavorite,
    setOnlyFavorite,
    selectedTag,
    setSelectedTag,
    actionCategory,
    setActionCategory: setActionCategoryWithReset,
    actionSubCategory,
    setActionSubCategory,
    currentSubCategories,
    actionSubCategoryCounts,
    actionShotScale,
    setActionShotScale,
    actionShotScaleCounts,
    actionAnchor,
    setActionAnchor,
    actionCategoryCounts,
    availableAnchors,
    sortBy,
    setSortBy,
    dynamicTagList,
    isAnyFilterActive,
    displayedItems,
    handleResetAllFilters,
  };
}
