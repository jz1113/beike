import React, { useState, useEffect, useMemo } from 'react';
import { X, Tag, Check, Sparkles, AlertCircle } from 'lucide-react';
import type { AssetSubTab } from '../model/assetPromptConstants';
import { resolveActionCardDisplayBadges } from '@shared/domain/products/productCategory';

export interface TagEditModalProps {
  item: any;
  activeSubTab: AssetSubTab;
  onClose: () => void;
  onSave: (updatedFields: {
    shotType?: string;
    suitableAnatomy?: string;
    tags?: string;
    category?: string;
  }) => Promise<void>;
  isUpdating?: boolean;
}

// 预定义常见构图景别 / 姿态细分选项（统一专业视觉设计，杜绝大彩框杂乱）
const ACTION_SHOT_OPTIONS = [
  {
    id: 'half_body',
    label: '半身姿态',
    desc: '50mm中景/胸像/日常互动',
    shotType: 'half_body',
    anatomyHint: null,
    tagLabel: '半身姿态',
    categoryGroup: 'general',
  },
  {
    id: 'detail_macro',
    label: '细节特写',
    desc: '大光圈浅景深超清局部微距',
    shotType: 'macro_detail',
    anatomyHint: null,
    tagLabel: '细节特写',
    categoryGroup: 'general',
  },
  {
    id: 'full_body',
    label: '全身氛围',
    desc: '全身站立/漫步随拍/穿搭全景',
    shotType: 'full_body',
    anatomyHint: null,
    tagLabel: '全身氛围',
    categoryGroup: 'general',
  },
  {
    id: 'face_closeup',
    label: '面部特写',
    desc: '面部五官/神态表情/大特写',
    shotType: 'close_up',
    anatomyHint: 'face',
    tagLabel: '面部特写',
    categoryGroup: 'general',
  },
  {
    id: 'hands_closeup',
    label: '手部特写',
    desc: '手腕/手指/握持操作微距',
    shotType: 'macro_detail',
    anatomyHint: 'hands',
    tagLabel: '手部特写',
    categoryGroup: 'general',
  },
  {
    id: 'necklace_closeup',
    label: '项链特写',
    desc: '颈肩锁骨/吊坠锁骨链聚焦',
    shotType: 'macro_detail',
    anatomyHint: 'necklace',
    tagLabel: '项链特写',
    categoryGroup: 'jewelry',
  },
  {
    id: 'wrist_closeup',
    label: '手镯特写',
    desc: '手腕翡翠玉镯/手串手链微距',
    shotType: 'macro_detail',
    anatomyHint: 'wrist',
    tagLabel: '手镯特写',
    categoryGroup: 'jewelry',
  },
  {
    id: 'ring_closeup',
    label: '戒指特写',
    desc: '指间戒圈/钻石婚戒微距',
    shotType: 'macro_detail',
    anatomyHint: 'fingers',
    tagLabel: '戒指特写',
    categoryGroup: 'jewelry',
  },
  {
    id: 'earring_closeup',
    label: '耳饰特写',
    desc: '耳垂耳钉/流苏耳环微距',
    shotType: 'macro_detail',
    anatomyHint: 'earring',
    tagLabel: '耳饰特写',
    categoryGroup: 'jewelry',
  },
];

// 预定义适用品类选项（统一整齐设计）
const ACTION_CATEGORY_OPTIONS = [
  { id: 'universal', label: '通用日常' },
  { id: 'jewelry', label: '珠宝首饰' },
  { id: 'digital_3c', label: '手机数码' },
  { id: 'apparel', label: '服饰穿搭' },
  { id: 'bag', label: '箱包配饰' },
  { id: 'shoes', label: '鞋靴鞋履' },
  { id: 'beauty', label: '美妆彩妆' },
];

export function TagEditModal({
  item,
  activeSubTab,
  onClose,
  onSave,
  isUpdating = false,
}: TagEditModalProps) {
  // 当前选择的景别项 ID
  const [selectedShotOptionId, setSelectedShotOptionId] = useState<string>(() => {
    if (activeSubTab !== 'action') return '';
    const rawTags = String(item.tags || '');
    // 1. 优先从 tags 识别显式姿态
    for (const opt of ACTION_SHOT_OPTIONS) {
      if (rawTags.includes(opt.tagLabel)) return opt.id;
    }
    // 2. 从 suitableAnatomy 判断
    const anatStr = String(item.suitableAnatomy || '');
    if (anatStr.includes('face')) return 'face_closeup';
    if (anatStr.includes('hands')) return 'hands_closeup';
    if (anatStr.includes('necklace')) return 'necklace_closeup';
    if (anatStr.includes('wrist') || anatStr.includes('bracelet')) return 'wrist_closeup';
    if (anatStr.includes('fingers') || anatStr.includes('ring')) return 'ring_closeup';
    if (anatStr.includes('earring') || anatStr.includes('ear')) return 'earring_closeup';

    // 3. 从 shotType 判断
    const st = String(item.shotType || '').toLowerCase();
    if (st === 'half_body' || st.includes('half') || st.includes('profile_45')) return 'half_body';
    if (st === 'full_body' || st.includes('full')) return 'full_body';
    if (st.includes('macro') || st.includes('close')) return 'detail_macro';

    return 'half_body';
  });

  // 当前选择的品类 ID
  const [selectedCategory, setSelectedCategory] = useState<string>(() => {
    const rawAnatomy = String(item.suitableAnatomy || '');
    const rawTags = String(item.tags || '');
    if (rawAnatomy.includes('jewelry') || rawTags.includes('首饰')) return 'jewelry';
    if (rawAnatomy.includes('digital_3c') || rawTags.includes('数码') || rawTags.includes('手机')) return 'digital_3c';
    if (rawAnatomy.includes('apparel') || rawTags.includes('服饰')) return 'apparel';
    if (rawAnatomy.includes('bag') || rawTags.includes('箱包')) return 'bag';
    if (rawAnatomy.includes('shoes') || rawTags.includes('鞋')) return 'shoes';
    if (rawAnatomy.includes('beauty') || rawTags.includes('美妆')) return 'beauty';
    return 'universal';
  });

  // 自定义补充标签输入
  const [customTags, setCustomTags] = useState<string>(() => {
    const rawTags = String(item.tags || '');
    // 过滤掉已预设在单选里的景别与品类词，保留用户额外自定义词
    const filterTokens = new Set([
      '半身姿态', '面部特写', '细节特写', '全身氛围', '手部特写', '项链特写', '手镯特写', '戒指特写', '耳饰特写',
      '通用', '通用日常', '首饰', '珠宝首饰', '手机数码', '服饰', '服饰穿搭', '箱包', '鞋靴', '美妆',
    ]);
    const clean = rawTags
      .split(/[,，\s]+/)
      .map((t) => t.trim())
      .filter((t) => t && !filterTokens.has(t))
      .join(', ');
    return clean;
  });

  // ESC 键退出模态框
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  // 计算实时预览卡片徽标
  const previewBadges = useMemo(() => {
    if (activeSubTab === 'action') {
      const selectedShot = ACTION_SHOT_OPTIONS.find((opt) => opt.id === selectedShotOptionId);
      const anatomyArr: string[] = [];
      if (selectedCategory !== 'universal') anatomyArr.push(selectedCategory);
      if (selectedShot?.anatomyHint) anatomyArr.push(selectedShot.anatomyHint);

      // 组合 tags
      const tagTokens: string[] = [];
      if (selectedShot) tagTokens.push(selectedShot.tagLabel);
      if (customTags.trim()) tagTokens.push(customTags.trim());

      const mockItem = {
        ...item,
        shotType: selectedShot?.shotType || 'half_body',
        suitableAnatomy: JSON.stringify(anatomyArr),
        tags: tagTokens.join(', '),
      };
      return resolveActionCardDisplayBadges(mockItem);
    }
    return [];
  }, [activeSubTab, selectedShotOptionId, selectedCategory, customTags, item]);

  // 执行保存
  const handleConfirm = async () => {
    if (activeSubTab === 'action') {
      const selectedShot = ACTION_SHOT_OPTIONS.find((opt) => opt.id === selectedShotOptionId);
      const anatomyArr: string[] = [];
      if (selectedCategory !== 'universal') anatomyArr.push(selectedCategory);
      if (selectedShot?.anatomyHint) anatomyArr.push(selectedShot.anatomyHint);

      // 构造纯净且包含手动覆盖标签的 tags 字段
      const tagTokens: string[] = [];
      if (selectedShot) tagTokens.push(selectedShot.tagLabel);
      const catLabel = ACTION_CATEGORY_OPTIONS.find((c) => c.id === selectedCategory)?.label;
      if (catLabel && selectedCategory !== 'universal') tagTokens.push(catLabel);
      if (customTags.trim()) {
        const extra = customTags
          .split(/[,，\s]+/)
          .map((t) => t.trim())
          .filter(Boolean);
        tagTokens.push(...extra);
      }

      await onSave({
        shotType: selectedShot?.shotType || 'half_body',
        suitableAnatomy: JSON.stringify(anatomyArr),
        tags: tagTokens.join(', '),
      });
    } else {
      await onSave({
        tags: customTags.trim(),
      });
    }
  };

  const assetCode = item.code || `#A-${item.id.slice(-4)}`;
  const assetTitle = item.title || item.name || '未命名资产';

  return (
    <div
      className="fixed inset-0 z-[90] flex items-center justify-center bg-slate-950/15 p-4 backdrop-blur-[2px] animate-in fade-in duration-150"
      onClick={onClose}
    >
      <div
        className="w-full max-w-[680px] max-h-[90vh] overflow-hidden rounded-[20px] border border-slate-200/80 dark:border-white/10 bg-white dark:bg-[#1B1B1E] text-slate-900 dark:text-[#EDEDED] shadow-[0_20px_48px_-28px_rgba(15,23,42,0.3)] dark:shadow-[0_20px_50px_rgba(0,0,0,0.6)] flex flex-col animate-in zoom-in-95 duration-150"
        onClick={(e) => e.stopPropagation()}
      >
        {/* 顶栏：标题 + 资产代号 + 关闭按钮 */}
        <div className="flex shrink-0 items-center justify-between gap-5 px-5 pb-3 pt-4 sm:px-6">
          <div className="flex items-center gap-3">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-rose-50 dark:bg-rose-950/40 ring-1 ring-rose-100 dark:ring-rose-800/60">
              <Tag className="h-3.5 w-3.5 text-rose-500 dark:text-rose-400" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-sm font-black tracking-tight text-slate-900 dark:text-white">修改标签分类</h2>
                <span className="font-mono text-xs text-purple-700 dark:text-purple-300 bg-purple-50 dark:bg-purple-950/60 px-2 py-0.5 rounded-md border border-purple-200 dark:border-purple-800/60 font-semibold">
                  {assetCode}
                </span>
              </div>
              <p className="mt-0.5 max-w-sm truncate text-[11px] text-slate-400 dark:text-slate-500">{assetTitle}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-white/10 transition-colors cursor-pointer"
            title="关闭 (Esc)"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* 实时卡片徽标预览条 */}
        <div className="flex shrink-0 items-center justify-between border-y border-slate-100 dark:border-white/10 px-5 py-2.5 sm:px-6">
          <span className="text-[11px] font-semibold text-slate-500 dark:text-slate-400 flex items-center gap-1.5">
            <Sparkles className="w-3.5 h-3.5 text-purple-600 dark:text-purple-400" />
            <span>卡片徽标预览:</span>
          </span>
          <div className="flex items-center gap-1.5 flex-wrap">
            {previewBadges.length > 0 ? (
              previewBadges.map((b) => (
                <span
                  key={b.id}
                  className={`px-2 py-0.5 rounded-md text-[10px] font-bold border shrink-0 ${b.colorClass}`}
                >
                  {b.label}
                </span>
              ))
            ) : (
              <span className="text-[11px] text-slate-400 dark:text-slate-500">暂无生效徽标</span>
            )}
          </div>
        </div>

        {/* 内容主体滚动区 */}
        <div className="max-h-[68vh] flex-1 space-y-5 overflow-y-auto px-5 py-4 sm:px-6">
          {activeSubTab === 'action' ? (
            <>
              {/* 1. 构图景别与姿态细分（统一使用精致 Segmented Radio Card） */}
              <div>
                <label className="block text-xs font-bold text-slate-800 dark:text-slate-200 mb-2 flex items-center justify-between">
                  <span className="flex items-center gap-1.5">
                    <span className="w-1.5 h-3 bg-purple-600 rounded-full" />
                    <span>构图景别与姿态细分（决定卡片核心景别标签）</span>
                  </span>
                  <span className="text-[11px] font-normal text-slate-400 dark:text-slate-500">单选</span>
                </label>

                <div className="grid grid-cols-3 gap-2">
                  {ACTION_SHOT_OPTIONS.map((opt) => {
                    const isSelected = selectedShotOptionId === opt.id;
                    return (
                      <button
                        key={opt.id}
                        type="button"
                        onClick={() => setSelectedShotOptionId(opt.id)}
                        className={`p-2.5 rounded-xl text-left border text-xs transition-all cursor-pointer flex flex-col justify-between select-none ${
                          isSelected
                            ? 'bg-purple-600 text-white border-purple-600 shadow-sm font-semibold ring-2 ring-purple-400/20'
                            : 'bg-slate-50/70 dark:bg-white/5 border-slate-200/80 dark:border-white/10 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-white/10 hover:border-slate-300 dark:hover:border-white/20'
                        }`}
                      >
                        <div className="flex items-center justify-between mb-1">
                          <span className="font-bold">{opt.label}</span>
                          {isSelected && <Check className="w-3.5 h-3.5 text-white" />}
                        </div>
                        <span className={`text-[10px] leading-tight ${isSelected ? 'text-purple-100' : 'text-slate-400 dark:text-slate-500'}`}>
                          {opt.desc}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* 2. 适用品类分类（统一采用整洁的胶囊标签组） */}
              <div>
                <label className="block text-xs font-bold text-slate-800 dark:text-slate-200 mb-2 flex items-center justify-between">
                  <span className="flex items-center gap-1.5">
                    <span className="w-1.5 h-3 bg-indigo-600 rounded-full" />
                    <span>适用品类分类（决定一级品类徽标）</span>
                  </span>
                  <span className="text-[11px] font-normal text-slate-400 dark:text-slate-500">单选</span>
                </label>

                <div className="flex flex-wrap gap-2">
                  {ACTION_CATEGORY_OPTIONS.map((cat) => {
                    const isSelected = selectedCategory === cat.id;
                    return (
                      <button
                        key={cat.id}
                        type="button"
                        onClick={() => setSelectedCategory(cat.id)}
                        className={`px-3 py-1.5 rounded-xl border text-xs transition-all cursor-pointer flex items-center gap-1.5 select-none ${
                          isSelected
                            ? 'bg-indigo-600 text-white border-indigo-600 font-bold shadow-2xs'
                            : 'bg-slate-50/70 dark:bg-white/5 border-slate-200 dark:border-white/10 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-white/10 hover:text-slate-800 dark:hover:text-white'
                        }`}
                      >
                        <span>{cat.label}</span>
                        {isSelected && <Check className="w-3 h-3" />}
                      </button>
                    );
                  })}
                </div>
              </div>
            </>
          ) : (
            <div className="p-3.5 bg-amber-50 dark:bg-amber-950/40 rounded-xl border border-amber-200/70 dark:border-amber-800/60 text-xs text-amber-800 dark:text-amber-200 flex items-start gap-2.5">
              <AlertCircle className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
              <span>当前资产属于「{activeSubTab}」，您可以在下方自由调整或补充专属检索标签。</span>
            </div>
          )}

          {/* 3. 自定义扩展标签 */}
          <div>
            <label className="block text-xs font-bold text-slate-800 dark:text-slate-200 mb-1.5 flex items-center justify-between">
              <span className="flex items-center gap-1.5">
                <span className="w-1.5 h-3 bg-slate-400 rounded-full" />
                <span>自定义扩展标签（可选，逗号分隔）:</span>
              </span>
              <span className="text-[10px] text-slate-400 dark:text-slate-500 font-normal">支持全局检索与精准定位</span>
            </label>
            <input
              type="text"
              value={customTags}
              onChange={(e) => setCustomTags(e.target.value)}
              placeholder="如: 托盘, 甜美, 阳光通透"
              className="w-full bg-slate-50/80 dark:bg-[#151518] border border-slate-200 dark:border-white/10 rounded-xl px-3.5 py-2 text-xs text-slate-800 dark:text-slate-200 focus:outline-none focus:border-purple-500 dark:focus:border-purple-400 focus:bg-white dark:focus:bg-[#18181b] transition-all shadow-2xs placeholder:text-slate-400 dark:placeholder:text-slate-500"
            />
          </div>
        </div>

        {/* 底栏操作区 */}
        <footer className="flex shrink-0 items-center justify-end gap-2 border-t border-slate-100 dark:border-white/10 bg-slate-50/50 dark:bg-[#18181b] px-5 py-3 sm:px-6">
          <button
            type="button"
            onClick={onClose}
            disabled={isUpdating}
            className="rounded-xl px-3.5 py-2 text-xs font-bold text-slate-500 dark:text-slate-400 transition-colors hover:bg-white dark:hover:bg-white/10 hover:text-slate-800 dark:hover:text-white cursor-pointer"
          >
            取消
          </button>
          <button
            type="button"
            onClick={handleConfirm}
            disabled={isUpdating}
            className="flex items-center gap-1.5 rounded-xl bg-slate-950 dark:bg-white px-3.5 py-2 text-xs font-bold text-white dark:text-slate-900 shadow-sm transition-colors hover:bg-slate-800 dark:hover:bg-slate-200 cursor-pointer disabled:opacity-50"
          >
            {isUpdating ? (
              <>
                <div className="w-3.5 h-3.5 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                <span>正在保存...</span>
              </>
            ) : (
              <>
                <Check className="w-3.5 h-3.5" />
                <span>保存并即时生效</span>
              </>
            )}
          </button>
        </footer>
      </div>
    </div>
  );
}
