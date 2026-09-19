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
} from 'lucide-react';
import '@beike/domain/drawing';
import { apiFetch } from '@/lib/apiClient';
import type { CategoryItem } from '@beike/domain/vision';
import { useSafeTimeout } from '@/lib/useSafeTimeout';

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
          <div className="space-y-4">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-slate-700">
                  已沉淀的类目拍摄大架构 (8段式规范) ({recipes.length})
                </span>
                <div className="flex items-center gap-2">
                  <button
                    onClick={handleSeedDefaults}
                    disabled={isSeeding}
                    className="text-xs text-amber-600 hover:text-amber-700 font-bold flex items-center gap-1 hover:underline cursor-pointer disabled:opacity-50"
                  >
                    <Sparkles className="w-3.5 h-3.5" />
                    <span>{isSeeding ? '同步中...' : '⚡ 重新同步官方 8 段式类目架构'}</span>
                  </button>
                  <button
                    onClick={() => setIsExtractModalOpen(true)}
                    className="text-xs text-pink-600 hover:text-pink-700 font-bold flex items-center gap-1 hover:underline cursor-pointer"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>+ 进行品类架构推理</span>
                  </button>
                </div>
              </div>

              {recipes.length === 0 ? (
                <div className="py-24 text-center text-slate-400 flex flex-col items-center gap-3 bg-white rounded-3xl border border-slate-200/80">
                  <Sparkles className="w-10 h-10 text-pink-400 opacity-40" />
                  <span className="font-bold text-slate-700 text-sm">暂无品类架构</span>
                  <span className="text-xs text-slate-500">上传品类样张或输入社媒链接，AI 将自动解构空间光影并沉淀为专属架构</span>
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
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {recipes.map(recipe => (
                    <div
                      key={recipe.id}
                      className="p-4 rounded-2xl bg-white border border-slate-200/90 hover:border-purple-300 hover:shadow-md transition-all flex flex-col justify-between space-y-3"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <h4 className="text-xs font-bold text-slate-900 truncate">{recipe.name}</h4>
                            {(recipe.name?.includes('V6.0') || recipe.tag?.includes('V6.0')) && (
                              <span className="text-[9px] bg-emerald-50 text-emerald-700 px-1.5 py-0.5 rounded-full font-bold border border-emerald-200 flex-shrink-0">
                                资产库联动 V6.0
                              </span>
                            )}
                          </div>
                          <span className="text-[10px] text-purple-600 font-medium truncate block mt-0.5">
                            {recipe.tag || '8段式高保真拍摄大架构'}
                          </span>
                        </div>

                        <span className="text-[9px] bg-purple-50 text-purple-700 px-2 py-0.5 rounded-full font-bold border border-purple-100 flex-shrink-0">
                          {recipe.category || '自定'}
                        </span>
                      </div>

                      <p className="text-xs text-slate-700 leading-relaxed font-mono bg-slate-50 p-2.5 rounded-xl border border-slate-100 max-h-28 overflow-y-auto whitespace-pre-wrap">
                        {recipe.promptSnippet}
                      </p>

                      <div className="flex items-center justify-between pt-2 border-t border-slate-100 text-[10px] text-slate-400">
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
                            className="px-2.5 py-1 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-medium flex items-center gap-1 transition-colors cursor-pointer"
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
          <div className="w-full max-w-2xl bg-white rounded-3xl p-6 shadow-2xl space-y-4 border border-slate-200 max-h-[90vh] flex flex-col">
            <div className="flex items-center justify-between pb-2 border-b border-slate-100 shrink-0">
              <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                <Sliders className="w-4 h-4 text-indigo-600" />
                <span>{editingRecipe.isNew ? '新建自定义品类架构' : '品类拍摄大架构与提示词规则'}</span>
              </h3>
              <button 
                onClick={() => setEditingRecipe(null)}
                className="p-1 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-3 text-xs overflow-y-auto pr-1 flex-1">
              <div className="space-y-1">
                <label className="font-bold text-slate-700">架构名称：</label>
                <input
                  type="text"
                  value={editingRecipe.name}
                  onChange={e => setEditingRecipe({ ...editingRecipe, name: e.target.value })}
                  placeholder="例如：💎 珠宝首饰全品类 · 8段式装配骨架与物理守卫 (V6.0 资产库联动版)"
                  className="w-full px-3 py-2 rounded-xl bg-slate-50 border border-slate-200 font-bold outline-none focus:bg-white focus:border-indigo-500 text-slate-900"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <div className="flex items-center justify-between">
                    <label className="font-bold text-slate-700">归属行业品类：</label>
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
                        className="text-[10px] text-slate-500 hover:text-red-600 font-bold hover:underline cursor-pointer flex items-center gap-0.5"
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
                        className="flex-1 px-3 py-1.5 rounded-xl bg-slate-50 border border-slate-200 text-xs font-bold text-slate-900 outline-none"
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
                      className="w-full px-3 py-2 rounded-xl bg-slate-50 border border-slate-200 outline-none focus:bg-white focus:border-indigo-500 font-medium text-slate-900 cursor-pointer"
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
                  <label className="font-bold text-slate-700">场景特色标签：</label>
                  <input
                    type="text"
                    value={editingRecipe.tag || ''}
                    onChange={e => setEditingRecipe({ ...editingRecipe, tag: e.target.value })}
                    placeholder="如：珠宝全品类 · 8段式骨架 · 三锁一致性"
                    className="w-full px-3 py-2 rounded-xl bg-slate-50 border border-slate-200 outline-none focus:bg-white focus:border-indigo-500 text-slate-900"
                  />
                </div>
              </div>

              <div className="space-y-1">
                <label className="font-bold text-slate-700">提示词大架构与光影工程规则 (Prompt Architecture)：</label>
                <textarea
                  rows={14}
                  value={editingRecipe.promptSnippet}
                  onChange={e => setEditingRecipe({ ...editingRecipe, promptSnippet: e.target.value })}
                  placeholder="输入完整提示词大架构规范..."
                  className="w-full p-3 rounded-xl bg-slate-50 border border-slate-200 font-mono text-xs leading-relaxed outline-none focus:bg-white focus:border-indigo-500 text-slate-900 select-text"
                />
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100 shrink-0">
              <button
                onClick={() => setEditingRecipe(null)}
                className="px-4 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold cursor-pointer"
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
