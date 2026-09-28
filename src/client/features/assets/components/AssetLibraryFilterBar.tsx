import { useState, type ReactNode } from 'react';
import {
  Filter,
  X,
  Settings2,
  ChevronDown,
  Check,
} from 'lucide-react';
import type { ActionCategoryId, SubCategoryDef } from '@shared/domain/products/productCategory';
import type { ActionShotScale } from '../hooks/useAssetLibraryFilters';
import type { AssetSubTab } from '../utils/assetPromptConstants';
import DynamicTagDropdown from './DynamicTagDropdown';

export interface AssetLibraryFilterBarProps {
  /** 与筛选维度同级的资产类型导航，由父级提供以保持筛选栏的单行布局。 */
  navigation?: ReactNode;
  statusFilters?: ReactNode;
  activeSubTab: AssetSubTab;
  dynamicTagList: Array<{ tag: string; count: number }>;
  selectedTag: string | null;
  setSelectedTag: (tag: string | null) => void;
  actionCategory?: ActionCategoryId | 'all';
  setActionCategory?: (cat: ActionCategoryId | 'all') => void;
  actionSubCategory?: string;
  setActionSubCategory?: (id: string) => void;
  currentSubCategories?: Array<SubCategoryDef>;
  actionSubCategoryCounts?: Record<string, number>;
  onOpenSubCategoryManager?: () => void;
  actionShotScale?: ActionShotScale;
  setActionShotScale?: (scale: ActionShotScale) => void;
  actionShotScaleCounts?: { all: number; macro_closeup: number; half_body: number; full_body: number };
  actionAnchor?: string | null;
  setActionAnchor?: (anchor: string | null) => void;
  actionCategoryCounts?: Partial<Record<ActionCategoryId | 'all', number>>;
  availableAnchors?: Array<{ id: string; label: string; count: number }>;
  isAnyFilterActive: boolean;
  onResetAllFilters: () => void;
  displayedItemsCount: number;
  sortBy: 'default' | 'usage' | 'favorite';
  setSortBy: (v: 'default' | 'usage' | 'favorite') => void;
}

export function AssetLibraryFilterBar({
  navigation,
  statusFilters,
  activeSubTab,
  dynamicTagList,
  selectedTag,
  setSelectedTag,
  actionCategory = 'all',
  setActionCategory,
  actionSubCategory = 'all',
  setActionSubCategory,
  currentSubCategories = [],
  actionSubCategoryCounts,
  onOpenSubCategoryManager,
  actionShotScale = 'all',
  setActionShotScale,
  actionShotScaleCounts,
  actionAnchor = null,
  setActionAnchor,
  actionCategoryCounts,
  availableAnchors,
  isAnyFilterActive,
  onResetAllFilters,
  displayedItemsCount,
  sortBy,
  setSortBy,
}: AssetLibraryFilterBarProps) {
  const [activeDropdown, setActiveDropdown] = useState<'category' | 'scale' | 'subcategory' | 'anchor' | null>(null);

  const toggleDropdown = (name: 'category' | 'scale' | 'subcategory' | 'anchor') => {
    setActiveDropdown((prev) => (prev === name ? null : name));
  };

  const closeDropdowns = () => setActiveDropdown(null);

  const actionAssetsExist = activeSubTab === 'action' && (actionCategoryCounts?.all || 0) > 0;
  // 这是「动作适用的商品」而不是资产库的主导航。零条目的类别完全不露出。
  const categoryOptions = [
    { id: 'all', label: '全部商品', count: actionCategoryCounts?.all },
    { id: 'universal', label: '通用日常', count: actionCategoryCounts?.universal },
    { id: 'jewelry', label: '珠宝首饰', count: actionCategoryCounts?.jewelry },
    { id: 'digital_3c', label: '手机数码', count: actionCategoryCounts?.digital_3c },
    { id: 'apparel', label: '服饰穿搭', count: actionCategoryCounts?.apparel },
    { id: 'bag', label: '箱包手袋', count: actionCategoryCounts?.bag },
    { id: 'shoes', label: '鞋靴配饰', count: actionCategoryCounts?.shoes },
    { id: 'beauty', label: '美妆香氛', count: actionCategoryCounts?.beauty },
    { id: 'eyewear', label: '眼镜配饰', count: actionCategoryCounts?.eyewear },
  ].filter((option) => option.id === 'all' || (option.count || 0) > 0);

  // 景别列表配置
  const scaleOptions = [
    { id: 'all', label: '全部景别', count: actionShotScaleCounts?.all },
    { id: 'macro_closeup', label: '细节特写/微距', count: actionShotScaleCounts?.macro_closeup },
    { id: 'half_body', label: '半身姿态', count: actionShotScaleCounts?.half_body },
    { id: 'full_body', label: '全身氛围', count: actionShotScaleCounts?.full_body },
  ];

  const currentCatLabel = categoryOptions.find((c) => c.id === actionCategory)?.label || '适用品类';
  const currentScaleLabel = scaleOptions.find((s) => s.id === actionShotScale)?.label || '构图景别';
  const currentSubCatObj = currentSubCategories.find((s) => s.id === actionSubCategory);
  const currentSubCatLabel = currentSubCatObj ? currentSubCatObj.label : '全部细分';
  const currentAnchorLabel = availableAnchors?.find((a) => a.id === actionAnchor)?.label || '聚焦部位';

  return (
    <>
    <div className="border-b border-slate-200/70 bg-transparent px-5 sm:px-7 py-3">{navigation}</div>
    <div className="flex items-center justify-between px-5 sm:px-7 py-3 bg-transparent border-b border-slate-200/60 gap-3 flex-wrap text-xs select-none">
      <div className="flex items-center gap-2 flex-wrap flex-1 min-w-0">
        {statusFilters}

        {actionAssetsExist && (
          <span className="h-5 w-px bg-slate-200 mx-1 shrink-0" aria-hidden="true" />
        )}
        {actionAssetsExist && (
          <span className="text-[11px] font-bold text-slate-400 flex items-center gap-1 shrink-0">
            <Filter className="w-3.5 h-3.5 text-slate-400" />
            <span>动作筛选</span>
          </span>
        )}

        {/* 1. 动作品类筛选下拉胶囊 */}
        {actionAssetsExist && setActionCategory && (
          <div className="relative">
            <button
              type="button"
              onClick={() => toggleDropdown('category')}
              className={`px-3 py-1.5 rounded-xl text-xs font-medium border flex items-center gap-1.5 transition-all cursor-pointer shadow-2xs ${
                actionCategory !== 'all'
                  ? 'bg-purple-600 text-white border-purple-600 font-bold'
                  : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-100/80'
              }`}
            >
              <span>{currentCatLabel}</span>
              <ChevronDown className={`w-3 h-3 transition-transform ${activeDropdown === 'category' ? 'rotate-180' : ''}`} />
            </button>

            {activeDropdown === 'category' && (
              <div
                className="absolute left-0 top-full mt-1.5 z-40 w-44 bg-white border border-slate-200 rounded-xl shadow-xl py-1.5 animate-in fade-in zoom-in-95 duration-100"
                onMouseLeave={closeDropdowns}
              >
                <div className="px-3 py-1 text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                  此动作适用的商品
                </div>
                {categoryOptions.map((cat) => {
                  const isSelected = actionCategory === cat.id;
                  return (
                    <button
                      key={cat.id}
                      type="button"
                      onClick={() => {
                        setActionCategory(cat.id as any);
                        if (setActionAnchor) setActionAnchor(null);
                        closeDropdowns();
                      }}
                      className={`w-full flex items-center justify-between px-3 py-1.5 text-left text-xs transition-colors cursor-pointer ${
                        isSelected ? 'bg-purple-50 text-purple-700 font-bold' : 'text-slate-700 hover:bg-slate-50'
                      }`}
                    >
                      <span>{cat.label}</span>
                      <div className="flex items-center gap-1.5">
                        {typeof cat.count === 'number' && (
                          <span className="text-[10px] text-slate-400">({cat.count})</span>
                        )}
                        {isSelected && <Check className="w-3.5 h-3.5 text-purple-600" />}
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* 2. 构图景别筛选下拉胶囊 */}
        {actionAssetsExist && setActionShotScale && (
          <div className="relative">
            <button
              type="button"
              onClick={() => toggleDropdown('scale')}
              className={`px-3 py-1.5 rounded-xl text-xs font-medium border flex items-center gap-1.5 transition-all cursor-pointer shadow-2xs ${
                actionShotScale !== 'all'
                  ? 'bg-slate-800 text-white border-slate-800 font-bold'
                  : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-100/80'
              }`}
            >
              <span>{currentScaleLabel}</span>
              <ChevronDown className={`w-3 h-3 transition-transform ${activeDropdown === 'scale' ? 'rotate-180' : ''}`} />
            </button>

            {activeDropdown === 'scale' && (
              <div
                className="absolute left-0 top-full mt-1.5 z-40 w-44 bg-white border border-slate-200 rounded-xl shadow-xl py-1.5 animate-in fade-in zoom-in-95 duration-100"
                onMouseLeave={closeDropdowns}
              >
                <div className="px-3 py-1 text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                  选择构图景别
                </div>
                {scaleOptions.map((scale) => {
                  const isSelected = actionShotScale === scale.id;
                  return (
                    <button
                      key={scale.id}
                      type="button"
                      onClick={() => {
                        setActionShotScale(scale.id as any);
                        if (scale.id !== 'macro_closeup' && scale.id !== 'all' && setActionAnchor) {
                          setActionAnchor(null);
                        }
                        closeDropdowns();
                      }}
                      className={`w-full flex items-center justify-between px-3 py-1.5 text-left text-xs transition-colors cursor-pointer ${
                        isSelected ? 'bg-slate-100 text-slate-900 font-bold' : 'text-slate-700 hover:bg-slate-50'
                      }`}
                    >
                      <span>{scale.label}</span>
                      <div className="flex items-center gap-1.5">
                        {typeof scale.count === 'number' && (
                          <span className="text-[10px] text-slate-400">({scale.count})</span>
                        )}
                        {isSelected && <Check className="w-3.5 h-3.5 text-slate-900" />}
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* 3. 二级细分类目下拉联动胶囊 */}
        {actionAssetsExist && actionCategory !== 'all' && actionCategory !== 'universal' && currentSubCategories && currentSubCategories.length > 0 && (
          <div className="relative">
            <button
              type="button"
              onClick={() => toggleDropdown('subcategory')}
              className={`px-3 py-1.5 rounded-xl text-xs font-medium border flex items-center gap-1.5 transition-all cursor-pointer shadow-2xs ${
                actionSubCategory !== 'all'
                  ? 'bg-amber-600 text-white border-amber-600 font-bold'
                  : 'bg-amber-50/70 text-amber-900 border-amber-200/80 hover:bg-amber-100/70'
              }`}
            >
              <span>细分: {currentSubCatLabel}</span>
              <ChevronDown className={`w-3 h-3 transition-transform ${activeDropdown === 'subcategory' ? 'rotate-180' : ''}`} />
            </button>

            {activeDropdown === 'subcategory' && (
              <div
                className="absolute left-0 top-full mt-1.5 z-40 w-56 bg-white border border-slate-200 rounded-xl shadow-xl py-1.5 animate-in fade-in zoom-in-95 duration-100"
                onMouseLeave={closeDropdowns}
              >
                <div className="px-3 py-1 text-[10px] font-bold text-slate-400 uppercase tracking-wider flex items-center justify-between">
                  <span>二级细分类目</span>
                  {onOpenSubCategoryManager && (
                    <button
                      type="button"
                      onClick={() => {
                        closeDropdowns();
                        onOpenSubCategoryManager();
                      }}
                      className="text-[10px] text-amber-600 hover:text-amber-800 font-bold flex items-center gap-0.5 cursor-pointer"
                    >
                      <Settings2 className="w-3 h-3" />
                      <span>管理</span>
                    </button>
                  )}
                </div>

                <button
                  type="button"
                  onClick={() => {
                    setActionSubCategory?.('all');
                    closeDropdowns();
                  }}
                  className={`w-full flex items-center justify-between px-3 py-1.5 text-left text-xs transition-colors cursor-pointer ${
                    actionSubCategory === 'all' ? 'bg-amber-50 text-amber-800 font-bold' : 'text-slate-700 hover:bg-slate-50'
                  }`}
                >
                  <span>全部细分</span>
                  <div className="flex items-center gap-1">
                    {typeof actionSubCategoryCounts?.all === 'number' && (
                      <span className="text-[10px] text-slate-400">({actionSubCategoryCounts.all})</span>
                    )}
                    {actionSubCategory === 'all' && <Check className="w-3.5 h-3.5 text-amber-600" />}
                  </div>
                </button>

                <div className="my-1 border-t border-slate-100 max-h-48 overflow-y-auto">
                  {currentSubCategories.map((sub) => {
                    const isSelected = actionSubCategory === sub.id;
                    const count = actionSubCategoryCounts?.[sub.id] ?? 0;
                    return (
                      <button
                        key={sub.id}
                        type="button"
                        onClick={() => {
                          setActionSubCategory?.(sub.id);
                          closeDropdowns();
                        }}
                        className={`w-full flex items-center justify-between px-3 py-1.5 text-left text-xs transition-colors cursor-pointer ${
                          isSelected ? 'bg-amber-50 text-amber-800 font-bold' : 'text-slate-700 hover:bg-slate-50'
                        }`}
                      >
                        <span className="truncate pr-2">{sub.label}</span>
                        <div className="flex items-center gap-1 shrink-0">
                          <span className="text-[10px] text-slate-400">({count})</span>
                          {isSelected && <Check className="w-3.5 h-3.5 text-amber-600" />}
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        )}

        {/* 4. 聚焦部位特写下拉 */}
        {actionAssetsExist && (actionShotScale === 'macro_closeup' || actionAnchor !== null) && availableAnchors && availableAnchors.length > 0 && (
          <div className="relative">
            <button
              type="button"
              onClick={() => toggleDropdown('anchor')}
              className={`px-3 py-1.5 rounded-xl text-xs font-medium border flex items-center gap-1.5 transition-all cursor-pointer shadow-2xs ${
                actionAnchor !== null
                  ? 'bg-purple-600 text-white border-purple-600 font-bold'
                  : 'bg-purple-50/70 text-purple-900 border-purple-200/80 hover:bg-purple-100/70'
              }`}
            >
              <span>部位: {currentAnchorLabel}</span>
              <ChevronDown className={`w-3 h-3 transition-transform ${activeDropdown === 'anchor' ? 'rotate-180' : ''}`} />
            </button>

            {activeDropdown === 'anchor' && (
              <div
                className="absolute left-0 top-full mt-1.5 z-40 w-44 bg-white border border-slate-200 rounded-xl shadow-xl py-1.5 animate-in fade-in zoom-in-95 duration-100"
                onMouseLeave={closeDropdowns}
              >
                <div className="px-3 py-1 text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                  聚焦身体解剖部位
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setActionAnchor?.(null);
                    closeDropdowns();
                  }}
                  className={`w-full flex items-center justify-between px-3 py-1.5 text-left text-xs transition-colors cursor-pointer ${
                    actionAnchor === null ? 'bg-purple-50 text-purple-800 font-bold' : 'text-slate-700 hover:bg-slate-50'
                  }`}
                >
                  <span>全部特写部位</span>
                  {actionAnchor === null && <Check className="w-3.5 h-3.5 text-purple-600" />}
                </button>
                {availableAnchors.map((anc) => {
                  const isSelected = actionAnchor === anc.id;
                  return (
                    <button
                      key={anc.id}
                      type="button"
                      onClick={() => {
                        setActionAnchor?.(isSelected ? null : anc.id);
                        closeDropdowns();
                      }}
                      className={`w-full flex items-center justify-between px-3 py-1.5 text-left text-xs transition-colors cursor-pointer ${
                        isSelected ? 'bg-purple-50 text-purple-800 font-bold' : 'text-slate-700 hover:bg-slate-50'
                      }`}
                    >
                      <span>{anc.label}</span>
                      <div className="flex items-center gap-1">
                        <span className="text-[10px] text-slate-400">({anc.count})</span>
                        {isSelected && <Check className="w-3.5 h-3.5 text-purple-600" />}
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* 5. 非动作 Tab 动态标签下拉选择器 */}
        {activeSubTab !== 'action' && dynamicTagList.length > 0 && (
          <DynamicTagDropdown
            selectedTag={selectedTag}
            tagList={dynamicTagList}
            activeColorClass={
              activeSubTab === 'full_prompt'
                ? 'bg-indigo-50 border-indigo-300 text-indigo-900'
                : activeSubTab === 'persona'
                ? 'bg-amber-50 border-amber-300 text-amber-900'
                : activeSubTab === 'outfit'
                ? 'bg-sky-50 border-sky-300 text-sky-900'
                : activeSubTab === 'scene'
                ? 'bg-emerald-50 border-emerald-300 text-emerald-900'
                : 'bg-purple-50 border-purple-300 text-purple-900'
            }
            onSelectTag={setSelectedTag}
          />
        )}

        {/* 下拉按钮本身已表达当前选择，不再重复生成一排同义筛选标签。 */}
        {isAnyFilterActive && (
          <button
            type="button"
            onClick={() => {
              onResetAllFilters();
              closeDropdowns();
            }}
            className="flex items-center gap-1 px-2 py-1 text-[11px] font-bold text-rose-500 hover:text-rose-700 hover:bg-rose-50 rounded-lg transition-colors cursor-pointer"
            title="清空搜索、收藏与全部筛选条件"
          >
            <X className="w-3 h-3" />
            <span>重置</span>
          </button>
        )}
      </div>

      {/* 右侧：资产统计与视图排序切换 */}
      <div className="flex items-center gap-3 shrink-0">
        <span className="text-xs text-slate-500 font-medium select-none">
          {isAnyFilterActive ? '筛选结果：' : ''}
          <strong className="text-indigo-600 font-bold">{displayedItemsCount}</strong> 条资产
        </span>

        <div className="flex items-center gap-1 bg-slate-200/70 p-0.5 rounded-xl text-xs">
          {(['default', 'usage'] as const).map((key) => (
            <button
              key={key}
              type="button"
              onClick={() => setSortBy(key)}
              className={`px-2.5 py-1 rounded-lg font-medium transition-all cursor-pointer ${
                sortBy === key
                  ? 'bg-white text-slate-900 shadow-2xs font-bold'
                  : 'text-slate-500 hover:text-slate-800'
              }`}
            >
              {key === 'default' ? '默认排序' : '使用最多'}
            </button>
          ))}
        </div>
      </div>
    </div>
    </>
  );
}
