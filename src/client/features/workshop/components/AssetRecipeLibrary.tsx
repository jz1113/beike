import { useState } from 'react';
import {
  Sparkles,
  Trash2,
  ArrowRight,
  Edit3,
  Copy,
  Check,
  Sliders,
  X,
  Plus,
  RotateCcw,
} from 'lucide-react';
import '@shared/domain/media/drawing';
import { apiFetch } from '@client/shared/api/apiClient';
import type { CategoryItem } from '@shared/domain/prompts/vision';
import { useSafeTimeout } from '@client/shared/hooks/useSafeTimeout';

interface Props {
  recipes: any[];
  copiedId: string | null;
  setCopiedId: (id: string | null) => void;
  editingRecipe: any | null;
  setEditingRecipe: (recipe: any | null) => void;
  isUpdatingRecipe: boolean;
  categories: CategoryItem[];
  isCreatingCategory: boolean;
  setIsCreatingCategory: (v: boolean) => void;
  newCategoryName: string;
  setNewCategoryName: (v: string) => void;
  setIsExtractModalOpen: (v: boolean) => void;
  setIsCategoryManagerOpen: (v: boolean) => void;
  onDeleteRecipe: (id: string, e: React.MouseEvent) => void;
  onApplyRecipe: (recipe: any) => void;
  onSaveEditedRecipe: () => void;
  onCreateCategory: () => void;
  onRefreshRecipes?: () => void;
  hiddenOfficialRecipes?: Array<{ id: string; name: string }>;
  onRestoreOfficialRecipe?: (id: string) => void;
  isRestoringOfficial?: boolean;
  section?: 'list' | 'modal' | 'both';
}

export default function AssetRecipeLibrary({
  recipes,
  copiedId,
  setCopiedId,
  editingRecipe,
  setEditingRecipe,
  isUpdatingRecipe,
  categories,
  isCreatingCategory,
  setIsCreatingCategory,
  newCategoryName,
  setNewCategoryName,
  setIsExtractModalOpen,
  setIsCategoryManagerOpen,
  onDeleteRecipe,
  onApplyRecipe,
  onSaveEditedRecipe,
  onCreateCategory,
  onRefreshRecipes,
  hiddenOfficialRecipes = [],
  onRestoreOfficialRecipe,
  isRestoringOfficial = false,
  section = 'both',
}: Props) {
  const { setSafeTimeout } = useSafeTimeout();
  const [isSeeding, setIsSeeding] = useState(false);

  const handleSeedDefaults = async () => {
    setIsSeeding(true);
    try {
      const res = await apiFetch('/api/catalog/styles?action=seed', { method: 'POST' });
      if (res.ok) {
        onRefreshRecipes?.();
      }
    } catch (err) {
      console.warn('导入官方品类架构失败:', err);
    } finally {
      setIsSeeding(false);
    }
  };

  return (
    <>
      {(section === 'list' || section === 'both') && (
          <div className="space-y-6">
              <div className="flex flex-wrap items-end justify-between gap-4">
                <div>
                  <div className="flex items-center gap-2.5"><h2 className="text-lg font-semibold tracking-tight text-slate-800 dark:text-slate-100">拍摄架构</h2><span className="rounded-full bg-white/60 px-2 py-0.5 text-xs font-medium text-slate-500 dark:text-slate-400 dark:bg-[#18191c]/95">{recipes.length}</span></div>
                  <p className="mt-1.5 text-xs leading-5 text-slate-500 dark:text-slate-400">收藏品类的光影与构图规则，为每次创作提供 8 段式分镜骨架。</p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  {hiddenOfficialRecipes.length > 0 && onRestoreOfficialRecipe && (
                    <details className="relative">
                      <summary className="flex cursor-pointer list-none items-center gap-1.5 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-medium text-amber-800 hover:bg-amber-100 [&::-webkit-details-marker]:hidden">
                        <RotateCcw className="h-3.5 w-3.5" />
                        恢复已隐藏官方架构（{hiddenOfficialRecipes.length}）
                      </summary>
                      <div className="absolute right-0 top-full z-30 mt-1 min-w-52 rounded-xl border border-slate-200 bg-white p-1 shadow-lg dark:border-white/10 dark:bg-[#18191c]">
                        {hiddenOfficialRecipes.map(recipe => (
                          <button
                            key={recipe.id}
                            type="button"
                            disabled={isRestoringOfficial}
                            onClick={() => onRestoreOfficialRecipe(recipe.id)}
                            className="w-full rounded-lg px-3 py-2 text-left text-xs text-slate-700 hover:bg-slate-50 disabled:opacity-50 dark:text-slate-200 dark:hover:bg-white/5"
                          >
                            {recipe.name}
                          </button>
                        ))}
                      </div>
                    </details>
                  )}
                  <button
                    onClick={handleSeedDefaults}
                    disabled={isSeeding}
                    className="rounded-xl border border-slate-200/60 bg-white/40 px-3 py-2 text-xs text-slate-600 hover:bg-white/80 font-medium flex items-center gap-1.5 transition-colors cursor-pointer disabled:opacity-50 dark:text-slate-300 dark:hover:bg-white/10 dark:border-white/10 dark:bg-[#18191c]/95"
                  >
                    <Sparkles className="w-3.5 h-3.5" />
                    <span>{isSeeding ? '同步中...' : '同步官方架构'}</span>
                  </button>
                  <button
                    onClick={() => setIsExtractModalOpen(true)}
                    className="rounded-xl bg-indigo-600 px-3 py-2 text-xs text-white hover:bg-indigo-500 font-semibold flex items-center gap-1.5 transition-colors cursor-pointer"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>新建架构推理</span>
                  </button>
                </div>
              </div>

              {recipes.length === 0 ? (
                <div className="py-24 text-center text-slate-400 flex flex-col items-center gap-3 bg-white/30 rounded-3xl border border-white/70 dark:bg-[#18191c]/95">
                  <Sparkles className="w-10 h-10 text-pink-400 opacity-40" />
                  <span className="font-bold text-slate-700 text-sm dark:text-slate-200">暂无品类架构</span>
                  <span className="text-xs text-slate-500 dark:text-slate-400">上传品类样张或输入社媒链接，AI 将自动解构空间光影并沉淀为专属架构</span>
                  <div className="flex items-center gap-3 mt-2">
                    <button
                      onClick={handleSeedDefaults}
                      disabled={isSeeding}
                      className="px-4 py-2 rounded-xl bg-gradient-to-r from-amber-500 to-orange-500 text-white text-xs font-bold shadow-sm hover:opacity-90 transition-all cursor-pointer disabled:opacity-50"
                    >
                      {isSeeding ? '导入中...' : '一键导入官方精品品类架构'}
                    </button>
                    <button
                      onClick={() => setIsExtractModalOpen(true)}
                      className="px-4 py-2 rounded-xl bg-pink-600 text-white text-xs font-bold hover:bg-pink-700 transition-all cursor-pointer"
                    >
                      立即推理第一条架构
                    </button>
                  </div>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 2xl:grid-cols-3 gap-5">
                  {recipes.map(recipe => (
                    <div
                      key={recipe.id}
                      className="group min-w-0 p-5 rounded-2xl bg-transparent border border-slate-200/60 hover:border-indigo-200/80 transition-colors flex flex-col justify-between space-y-4 dark:border-white/10"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <h4 className="text-sm font-semibold text-slate-800 break-words dark:text-slate-100">{recipe.name}</h4>
                            {(recipe.name?.includes('V6.0') || recipe.tag?.includes('V6.0')) && (
                              <span className="text-[9px] bg-emerald-50 text-emerald-700 px-1.5 py-0.5 rounded-full font-bold border border-emerald-200 flex-shrink-0">
                                资产库联动 V6.0
                              </span>
                            )}
                          </div>
                          <span className="text-xs text-slate-500 font-medium line-clamp-2 block mt-1.5 dark:text-slate-400">
                            {recipe.tag || '8段式高保真拍摄大架构'}
                          </span>
                        </div>

                        <span className="max-w-[40%] text-[10px] bg-transparent text-slate-500 px-2 py-1 rounded-full font-medium border border-slate-200/60 break-words dark:text-slate-400 dark:border-white/10">
                          {categories.find(category => category.id === recipe.category)?.name || '自定义品类'}
                        </span>
                      </div>

                      <p className="text-xs text-slate-600 leading-6 px-0.5 py-2 h-36 overflow-y-auto whitespace-pre-wrap break-words select-text dark:text-slate-300">
                        {recipe.promptSnippet}
                      </p>

                      <div className="flex flex-wrap items-center justify-between gap-3 pt-3 border-t border-slate-200/40 text-[10px] text-slate-400">
                        <span>{new Date(recipe.createdAt).toLocaleDateString()}</span>

                        <div className="flex items-center gap-1.5">
                          {/* ✏️ 编辑与查看大架构 */}
                          <button
                            onClick={() => setEditingRecipe({ ...recipe })}
                            className="p-1.5 rounded-lg text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 transition-colors cursor-pointer"
                            title="查看与修改品类大架构"
                          >
                            <Edit3 className="w-3.5 h-3.5" />
                          </button>

                          {/* 🗑️ 删除 */}
                          <button
                            onClick={(e) => onDeleteRecipe(recipe.id, e)}
                            className="p-1.5 rounded-lg text-slate-400 hover:text-red-600 hover:bg-red-50 transition-colors cursor-pointer"
                            title="删除配方"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>

                          <button
                            onClick={() => {
                              navigator.clipboard.writeText(recipe.promptSnippet);
                              setCopiedId(recipe.id);
                              setSafeTimeout(() => setCopiedId(null), 2000);
                            }}
                            className="px-2.5 py-1 rounded-lg bg-white/50 hover:bg-white/90 text-slate-600 text-xs font-medium flex items-center gap-1 transition-colors cursor-pointer dark:text-slate-300 dark:bg-[#18191c]/95"
                          >
                            {copiedId === recipe.id ? <Check className="w-3 h-3 text-emerald-600" /> : <Copy className="w-3 h-3" />}
                            <span>复制</span>
                          </button>
                          <button
                            onClick={() => onApplyRecipe(recipe)}
                            className="px-3 py-1 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold flex items-center gap-1 transition-all shadow-xs cursor-pointer"
                          >
                            <span>应用</span>
                            <ArrowRight className="w-3 h-3" />
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
          </div>

      )}
      {(section === 'modal' || section === 'both') && editingRecipe && (
        <div className="fixed inset-0 z-60 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 animate-fade-in">
          <div className="w-full max-w-2xl bg-white rounded-3xl p-6 shadow-2xl space-y-4 border border-slate-200 max-h-[90vh] flex flex-col dark:border-white/10 dark:bg-[#18191c]">
            <div className="flex items-center justify-between pb-2 border-b border-slate-100 shrink-0 dark:border-white/10">
              <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2 dark:text-slate-100">
                <Sliders className="w-4 h-4 text-indigo-600" />
                <span>{editingRecipe.isNew ? '新建自定义品类架构' : '品类拍摄大架构与提示词规则'}</span>
              </h3>
              <button 
                onClick={() => setEditingRecipe(null)}
                className="p-1 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 cursor-pointer dark:hover:bg-white/10"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-3 text-xs overflow-y-auto pr-1 flex-1">
              <div className="space-y-1">
                <label className="font-bold text-slate-700 dark:text-slate-200">架构名称：</label>
                <input
                  type="text"
                  value={editingRecipe.name}
                  onChange={e => setEditingRecipe({ ...editingRecipe, name: e.target.value })}
                  placeholder="例如：💎 珠宝首饰全品类 · 8段式装配骨架与物理守卫 (V6.0 资产库联动版)"
                  className="w-full px-3 py-2 rounded-xl bg-slate-50 border border-slate-200 font-bold outline-none focus:bg-white focus:border-indigo-500 text-slate-900 dark:text-slate-100 dark:bg-white/5 dark:border-white/10"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <div className="flex items-center justify-between">
                    <label className="font-bold text-slate-700 dark:text-slate-200">归属行业品类：</label>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => setIsCreatingCategory(!isCreatingCategory)}
                        className="text-[10px] text-indigo-600 hover:text-indigo-700 font-bold hover:underline cursor-pointer flex items-center gap-0.5"
                      >
                        <Plus className="w-3 h-3" />
                        <span>{isCreatingCategory ? '选择已有' : '+ 新建品类'}</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => setIsCategoryManagerOpen(true)}
                        className="text-[10px] text-slate-500 hover:text-red-600 font-bold hover:underline cursor-pointer flex items-center gap-0.5 dark:text-slate-400"
                        title="管理与删除品类分类"
                      >
                        <Trash2 className="w-3 h-3" />
                        <span>管理/删除</span>
                      </button>
                    </div>
                  </div>

                  {isCreatingCategory ? (
                    <div className="flex items-center gap-1.5">
                      <input
                        type="text"
                        value={newCategoryName}
                        onChange={e => setNewCategoryName(e.target.value)}
                        placeholder="新行业分类名称"
                        className="flex-1 px-3 py-1.5 rounded-xl bg-slate-50 border border-slate-200 text-xs font-bold text-slate-900 outline-none dark:text-slate-100 dark:bg-white/5 dark:border-white/10"
                      />
                      <button
                        type="button"
                        onClick={onCreateCategory}
                        className="px-2.5 py-1.5 rounded-xl bg-indigo-600 text-white font-bold text-xs cursor-pointer shadow-xs"
                      >
                        确定
                      </button>
                    </div>
                  ) : (
                    <select
                      value={editingRecipe.category || 'general'}
                      onChange={e => {
                        if (e.target.value === '__NEW__') {
                          setIsCreatingCategory(true);
                        } else if (e.target.value === '__MANAGE__') {
                          setIsCategoryManagerOpen(true);
                        } else {
                          setEditingRecipe({ ...editingRecipe, category: e.target.value });
                        }
                      }}
                      className="w-full px-3 py-2 rounded-xl bg-slate-50 border border-slate-200 outline-none focus:bg-white focus:border-indigo-500 font-medium text-slate-900 cursor-pointer dark:text-slate-100 dark:bg-white/5 dark:border-white/10"
                    >
                      {categories.map(c => (
                        <option key={c.id} value={c.id}>{c.name}</option>
                      ))}
                      <option value="__NEW__">自定义新建品类...</option>
                      <option value="__MANAGE__">管理 / 删除已有品类...</option>
                    </select>
                  )}
                </div>

                <div className="space-y-1">
                  <label className="font-bold text-slate-700 dark:text-slate-200">场景特色标签：</label>
                  <input
                    type="text"
                    value={editingRecipe.tag || ''}
                    onChange={e => setEditingRecipe({ ...editingRecipe, tag: e.target.value })}
                    placeholder="如：珠宝全品类 · 8段式骨架 · 三锁一致性"
                    className="w-full px-3 py-2 rounded-xl bg-slate-50 border border-slate-200 outline-none focus:bg-white focus:border-indigo-500 text-slate-900 dark:text-slate-100 dark:bg-white/5 dark:border-white/10"
                  />
                </div>
              </div>

              <div className="space-y-1">
                <label className="font-bold text-slate-700 dark:text-slate-200">提示词大架构与光影工程规则 (Prompt Architecture)：</label>
                <textarea
                  rows={14}
                  value={editingRecipe.promptSnippet}
                  onChange={e => setEditingRecipe({ ...editingRecipe, promptSnippet: e.target.value })}
                  placeholder="输入完整提示词大架构规范..."
                  className="soft-textarea w-full p-3 font-mono text-xs leading-relaxed text-slate-900 select-text dark:text-slate-100"
                />
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100 shrink-0 dark:border-white/10">
              <button
                onClick={() => setEditingRecipe(null)}
                className="px-4 py-2 rounded-xl bg-white/50 hover:bg-white/90 text-slate-600 text-xs font-bold cursor-pointer dark:text-slate-300 dark:bg-[#18191c]/95"
              >
                取消
              </button>
              <button
                onClick={onSaveEditedRecipe}
                disabled={isUpdatingRecipe}
                className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold transition-all shadow-sm cursor-pointer disabled:opacity-50"
              >
                {isUpdatingRecipe ? '保存中...' : '确认保存架构'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
