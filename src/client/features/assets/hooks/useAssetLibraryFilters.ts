import type { FilterableAsset } from '../utils/assetFilterTags';
import { buildAssetTagList } from '../utils/assetFilterTags';
import { isMacroOrCloseUp, isHalfBody, isFullBody } from '../utils/assetShotScale';
import { appearanceAudience, type AppearanceAudience } from '@shared/domain/assets/appearanceAudience';
import { useEffect, useMemo, useState } from 'react';
import {
  extractActionCategories,
  extractActionFocusAnchors,
  ACTION_FOCUS_ANCHORS,
  DEFAULT_SUBCATEGORIES_MAP,
  type ActionCategoryId,
  type SubCategoryDef,
  getSubCategoriesForCategory,
  matchItemSubCategory,
} from '@shared/domain/products/productCategory';
import {
  type AssetSubTab,
} from '../utils/assetPromptConstants';
import { compareAssetGalleryOrder } from '../utils/assetGalleryLabels';
import { compareFullPromptGroupOrder } from '@shared/domain/assets/fullPromptGroupLabel';
import { recognizedPromptGroupSubcategory, type PromptGroupSubcategoryFilter } from '../utils/promptGroupSubcategory';
import { promptGroupCategoryIds, promptGroupCategoryKey } from '../utils/promptGroupCategory';
import type { AssetProductCategory, PromptAlbum } from '@shared/domain/assets/assetOrganization';

function readCategoryLists() {
  return new Map((Object.keys(DEFAULT_SUBCATEGORIES_MAP) as ActionCategoryId[])
    .map((id) => [id, getSubCategoriesForCategory(id)] as const));
}

export type ActionShotScale = 'all' | 'macro_closeup' | 'half_body' | 'full_body';

export function useAssetLibraryFilters<T extends FilterableAsset>(
  activeSubTab: AssetSubTab,
  items: T[],
  categories: AssetProductCategory[] = [],
  albums: PromptAlbum[] = [],
) {
  const [audienceFilter, setAudienceFilter] = useState<AppearanceAudience | 'all'>('all');
  useEffect(() => { setAudienceFilter('all'); }, [activeSubTab]);
  const [selectedTag, setSelectedTag] = useState<string | null>(null);
  const [actionCategory, setActionCategory] = useState<ActionCategoryId | 'all'>('all');
  const [actionSubCategory, setActionSubCategory] = useState<string>('all');
  const [actionShotScale, setActionShotScale] = useState<ActionShotScale>('all');
  const [actionAnchor, setActionAnchor] = useState<string | null>(null);
  const [sortBy, setSortBy] = useState<'default' | 'usage' | 'favorite'>('default');
  const [lifecycleFilter, setLifecycleFilter] = useState<'all' | 'pending_review' | 'needs_fix' | 'published'>('all');
  const [promptGroupCategoryFilter, setPromptGroupCategoryFilterState] = useState<string>('all');
  const [promptGroupSubcategoryFilter, setPromptGroupSubcategoryFilter] = useState<PromptGroupSubcategoryFilter>('all');
  const [categoryLists, setCategoryLists] = useState(readCategoryLists);

  useEffect(() => {
    const handleSubCategoryChange = () => {
      setCategoryLists(readCategoryLists());
    };
    window.addEventListener('antigravity_subcategory_changed', handleSubCategoryChange);
    window.addEventListener('storage', handleSubCategoryChange);
    return () => {
      window.removeEventListener('antigravity_subcategory_changed', handleSubCategoryChange);
      window.removeEventListener('storage', handleSubCategoryChange);
    };
  }, []);

  useEffect(() => {
    setSelectedTag(null);
    setActionCategory('all');
    setActionSubCategory('all');
    setActionShotScale('all');
    setActionAnchor(null);
    setLifecycleFilter('all');
    setPromptGroupCategoryFilterState('all');
    setPromptGroupSubcategoryFilter('all');
  }, [activeSubTab]);

  const setPromptGroupCategoryFilter = (value: string) => {
    setPromptGroupCategoryFilterState(value);
    setPromptGroupSubcategoryFilter('all');
  };

  // 空库不保留上次浏览时的动作筛选，否则会出现「0 条资产」却挂着珠宝/景别等条件的假象。
  useEffect(() => {
    if (activeSubTab !== 'action' || items.length > 0) return;
    setActionCategory('all');
    setActionSubCategory('all');
    setActionShotScale('all');
    setActionAnchor(null);
  }, [activeSubTab, items.length]);

  const setActionCategoryWithReset = (cat: ActionCategoryId | 'all') => {
    setActionCategory(cat);
    setActionSubCategory('all');
  };

  // 计算动作资产在各大类目下的资产数量
  const actionCategoryCounts = useMemo(() => {
    if (activeSubTab !== 'action') {
      return { all: 0, universal: 0, jewelry: 0, digital_3c: 0, apparel: 0, bag: 0, shoes: 0, beauty: 0, eyewear: 0 };
    }
    const baseItems: T[] = items;
    const counts = { all: baseItems.length, universal: 0, jewelry: 0, digital_3c: 0, apparel: 0, bag: 0, shoes: 0, beauty: 0, eyewear: 0 };
    for (const it of baseItems) {
      const cats = extractActionCategories(it);
      for (const c of cats) {
        if (c.id === 'universal') counts.universal++;
        if (c.id === 'jewelry') counts.jewelry++;
        if (c.id === 'digital_3c') counts.digital_3c++;
        if (c.id === 'apparel') counts.apparel++;
        if (c.id === 'bag') counts.bag++;
        if (c.id === 'shoes') counts.shoes++;
        if (c.id === 'beauty') counts.beauty++;
        if (c.id === 'eyewear') counts.eyewear++;
      }
    }
    return counts;
  }, [activeSubTab, items]);

  // 当前一级品类下的二级细分类目列表（支持响应式更新）
  const currentSubCategories = useMemo<SubCategoryDef[]>(() => {
    if (activeSubTab !== 'action' || actionCategory === 'all' || actionCategory === 'universal') return [];
    return categoryLists.get(actionCategory) ?? getSubCategoriesForCategory(actionCategory);
  }, [activeSubTab, actionCategory, categoryLists]);

  // 计算当前品类下各个二级细分类目的匹配资产数量
  const actionSubCategoryCounts = useMemo<Record<string, number>>(() => {
    if (activeSubTab !== 'action' || actionCategory === 'all' || currentSubCategories.length === 0) {
      return { all: 0 };
    }
    const baseItems: T[] = items;
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
    const baseItems: T[] = items;
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

    const baseItems: T[] = items;
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

  const dynamicTagList = useMemo(() => buildAssetTagList(items, activeSubTab), [activeSubTab, items]);

  const isAnyFilterActive = useMemo(
    () =>
      Boolean(
        ((activeSubTab === 'persona' || activeSubTab === 'outfit') && audienceFilter !== 'all') ||
          lifecycleFilter !== 'all' ||
          (activeSubTab === 'full_prompt' && promptGroupCategoryFilter !== 'all') ||
          selectedTag ||
          (activeSubTab === 'action' &&
            (actionCategory !== 'all' ||
              actionSubCategory !== 'all' ||
              actionShotScale !== 'all' ||
              actionAnchor !== null))
      ),
    [audienceFilter, lifecycleFilter, promptGroupCategoryFilter, promptGroupSubcategoryFilter, selectedTag, activeSubTab, actionCategory, actionSubCategory, actionShotScale, actionAnchor]
  );

  const displayedItems = useMemo<T[]>(() => {
    const baseList: T[] = items;
    if (!baseList || baseList.length === 0) return items;

    let filtered = baseList.filter((item) => {
      if ((activeSubTab === 'persona' || activeSubTab === 'outfit') && audienceFilter !== 'all' && appearanceAudience({ ...item }, activeSubTab === 'outfit') !== audienceFilter) return false;
      if (lifecycleFilter !== 'all') {
        const status = String(item.registry?.status || item.lifecycleStatus || '');
        if (status !== lifecycleFilter) return false;
      }
      if (activeSubTab === 'full_prompt' && promptGroupCategoryFilter !== 'all') {
        const key = promptGroupCategoryKey(item, categories, albums);
        if (promptGroupCategoryFilter !== key && !promptGroupCategoryIds(item, categories, albums).includes(promptGroupCategoryFilter)) return false;
      }
      if (activeSubTab === 'full_prompt' && promptGroupCategoryFilter !== 'all' && promptGroupSubcategoryFilter !== 'all') {
        const kind = recognizedPromptGroupSubcategory(item.productSubcategory, categories, promptGroupCategoryFilter);
        if (promptGroupSubcategoryFilter === 'unclassified' ? kind !== null : kind !== promptGroupSubcategoryFilter) return false;
      }

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
      filtered = [...filtered].sort((a, b) => (b.usageCount || 0) - (a.usageCount || 0)
        || (activeSubTab === 'full_prompt' ? compareFullPromptGroupOrder(a, b) : 0));
    } else if (sortBy === 'favorite') {
      filtered = [...filtered].sort((a, b) => (b.isFavorite ? 1 : 0) - (a.isFavorite ? 1 : 0)
        || (activeSubTab === 'full_prompt' ? compareFullPromptGroupOrder(a, b) : 0));
    } else if (activeSubTab === 'full_prompt') {
      filtered = [...filtered].sort(compareFullPromptGroupOrder);
    } else if (activeSubTab === 'scene' || activeSubTab === 'persona' || activeSubTab === 'outfit') {
      filtered = [...filtered].sort(compareAssetGalleryOrder);
    }

    return filtered;
  }, [audienceFilter, activeSubTab, lifecycleFilter, promptGroupCategoryFilter, promptGroupSubcategoryFilter, categories, albums, actionCategory, actionSubCategory,
    currentSubCategories, actionShotScale, actionAnchor,
    selectedTag, sortBy, items]);

  const handleResetAllFilters = () => {
    setAudienceFilter('all');
    setSelectedTag(null);
    setActionCategory('all');
    setActionSubCategory('all');
    setActionShotScale('all');
    setActionAnchor(null);
    setLifecycleFilter('all');
    setPromptGroupCategoryFilterState('all');
    setPromptGroupSubcategoryFilter('all');
  };

  return {
    audienceFilter, setAudienceFilter,
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
    lifecycleFilter,
    setLifecycleFilter,
    promptGroupCategoryFilter,
    setPromptGroupCategoryFilter,
    promptGroupSubcategoryFilter,
    setPromptGroupSubcategoryFilter,
    dynamicTagList,
    isAnyFilterActive,
    displayedItems,
    handleResetAllFilters,
  };
}
