'use client';
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
import { normalizeImageUrlToStandardJpg } from '@/lib/drawing';
import { proxyMediaUrl } from '@/lib/apiClient';
import type { CategoryItem } from '@/lib/vision';

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
  section = 'both',
}: Props) {
  return (
    <>
      {(section === 'list' || section === 'both') && (
          <div className="space-y-4">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-slate-700">
                  已沉淀的品类拍摄架构与视觉提示词配方 ({recipes.length})
                </span>
                <button
                  onClick={() => setIsExtractModalOpen(true)}
                  className="text-xs text-pink-600 hover:text-pink-700 font-bold flex items-center gap-1 hover:underline cursor-pointer"
                >
                  <Sparkles className="w-3.5 h-3.5" />
                  <span>+ 进行品类架构推理</span>
                </button>
              </div>

              {recipes.length === 0 ? (
                <div className="py-24 text-center text-slate-400 flex flex-col items-center gap-3 bg-white rounded-3xl border border-slate-200/80">
                  <Sparkles className="w-10 h-10 text-pink-400 opacity-40" />
                  <span className="font-bold text-slate-700 text-sm">暂无品类架构</span>
                  <span className="text-xs text-slate-500">上传品类样张或输入社媒链接，AI 将自动解构空间光影并沉淀为专属架构</span>
                  <button
                    onClick={() => setIsExtractModalOpen(true)}
                    className="mt-2 px-4 py-2 rounded-xl bg-pink-600 text-white text-xs font-bold hover:bg-pink-700 transition-all cursor-pointer"
                  >
                    ✨ 立即推理第一条架构
                  </button>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {recipes.map(recipe => (
                    <div
                      key={recipe.id}
                      className="p-4 rounded-2xl bg-white border border-slate-200/90 hover:border-purple-300 hover:shadow-md transition-all flex flex-col justify-between space-y-3"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex items-center gap-2 min-w-0">
                          {recipe.coverUrl ? (
                            <img 
                              src={normalizeImageUrlToStandardJpg(recipe.coverUrl)} 
                              alt="" 
                              referrerPolicy="no-referrer"
                              onError={(e) => {
                                const target = e.currentTarget;
                                if (!target.dataset.hasRetried && recipe.coverUrl) {
                                  target.dataset.hasRetried = 'true';
                                  target.src = proxyMediaUrl(recipe.coverUrl);
                                }
                              }}
                              className="w-10 h-10 rounded-xl object-cover border border-slate-200 flex-shrink-0" 
                            />
                          ) : (
                            <div className="w-10 h-10 rounded-xl bg-purple-50 flex items-center justify-center text-purple-600 font-bold flex-shrink-0">
                              🎨
                            </div>
                          )}
                          <div className="min-w-0">
                            <h4 className="text-xs font-bold text-slate-900 truncate">{recipe.name}</h4>
                            <span className="text-[10px] text-purple-600 font-medium truncate block">
                              {recipe.tag || '自定义专属配方'}
                            </span>
                          </div>
                        </div>

                        <span className="text-[9px] bg-purple-50 text-purple-700 px-2 py-0.5 rounded-full font-bold border border-purple-100 flex-shrink-0">
                          {recipe.category || '自定'}
                        </span>
                      </div>

                      <p className="text-xs text-slate-700 leading-relaxed font-mono bg-slate-50 p-2.5 rounded-xl border border-slate-100 max-h-20 overflow-y-auto">
                        {recipe.promptSnippet}
                      </p>

                      <div className="flex items-center justify-between pt-2 border-t border-slate-100 text-[10px] text-slate-400">
                        <span>{new Date(recipe.createdAt).toLocaleDateString()}</span>

                        <div className="flex items-center gap-1.5">
                          {/* ✏️ 编辑 */}
                          <button
                            onClick={() => setEditingRecipe({ ...recipe })}
                            className="p-1.5 rounded-lg text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 transition-colors cursor-pointer"
                            title="修改配方名称与提示词"
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
                              setTimeout(() => setCopiedId(null), 2000);
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
          <div className="w-full max-w-lg bg-white rounded-3xl p-6 shadow-2xl space-y-4 border border-slate-200">
            <div className="flex items-center justify-between pb-2 border-b border-slate-100">
              <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                <Sliders className="w-4 h-4 text-indigo-600" />
                <span>{editingRecipe.isNew ? '新建自定义配方' : '编辑与修改品类配方'}</span>
              </h3>
              <button 
                onClick={() => setEditingRecipe(null)}
                className="p-1 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <div className="space-y-1">
                <label className="font-bold text-slate-700">配方名称：</label>
                <input
                  type="text"
                  value={editingRecipe.name}
                  onChange={e => setEditingRecipe({ ...editingRecipe, name: e.target.value })}
                  placeholder="例如：小红书爆款复古暖光桌搭"
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
                        title="管理与删除品类（包括系统内置与自定义分类）"
                      >
                        <Trash2 className="w-3 h-3" />
                        <span>管理/删除</span>
                      </button>
                    </div>
                  </div>

                  {isCreatingCategory ? (
                    <div className="flex items-center gap-1">
                      <input
                        type="text"
                        value={newCategoryName}
                        onChange={e => setNewCategoryName(e.target.value)}
                        placeholder="如：⛺ 户外露营"
                        className="flex-1 px-2.5 py-1.5 rounded-xl bg-white border border-indigo-300 text-xs font-bold outline-none"
                        autoFocus
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
                      <option value="__NEW__">➕ 自定义新建品类...</option>
                      <option value="__MANAGE__">⚙️ 管理 / 删除已有品类 (包括系统内置)...</option>
                    </select>
                  )}
                </div>

                <div className="space-y-1">
                  <label className="font-bold text-slate-700">场景特色标签：</label>
                  <input
                    type="text"
                    value={editingRecipe.tag || ''}
                    onChange={e => setEditingRecipe({ ...editingRecipe, tag: e.target.value })}
                    placeholder="如：极简原木 · 自然窗光"
                    className="w-full px-3 py-2 rounded-xl bg-slate-50 border border-slate-200 outline-none focus:bg-white focus:border-indigo-500 text-slate-900"
                  />
                </div>
              </div>

              <div className="space-y-1">
                <label className="font-bold text-slate-700">提示词框架与光影规则 (Prompt Recipe)：</label>
                <textarea
                  rows={4}
                  value={editingRecipe.promptSnippet}
                  onChange={e => setEditingRecipe({ ...editingRecipe, promptSnippet: e.target.value })}
                  placeholder="描述镜头景别、光线类型、真实生活质感、背景要求等..."
                  className="w-full p-3 rounded-xl bg-slate-50 border border-slate-200 font-mono leading-relaxed outline-none focus:bg-white focus:border-indigo-500 text-slate-900"
                />
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
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
                {isUpdatingRecipe ? '保存中...' : '确认保存配方'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
