'use client';
import { apiFetch } from '@/lib/apiClient';
import { useState, useEffect } from 'react';
import { 
  X, 
  Sparkles, 
  Sliders, 
  Check, 
  Trash2, 
  Layers, 
  SunMedium, 
  Camera, 
  Search,
  ExternalLink,
  Plus,
  Star,
  RotateCcw,
  Eye,
  Edit3,
  Copy,
  FileText
} from 'lucide-react';
import { 
  STYLE_PRESETS, 
  getMergedStylePresets,
  deletePresetItem,
  resetPresetsToDefault,
  StylePresetItem, 
  DEFAULT_CATEGORIES, 
  getMergedCategories, 
  CategoryItem 
} from '@/lib/vision';
import ManualArchitecturePanel, { ManualArchitectureResult } from '@/shared/modals/ManualArchitecturePanel';

function stripRecipeNamePrefix(name: string) {
  return (name || '').replace(/^[✨\s]+/, '').trim();
}

interface Props {
  isOpen: boolean;
  onClose: () => void;
  selectedStyleId: string;
  onSelectStyle: (styleId: string) => void;
  onOpenExtractModal: () => void;
  /** 粘贴/导入架构后回传给工坊立即使用 */
  onUseManualArchitecture?: (result: ManualArchitectureResult) => void;
  /** 自定义配方改名/保存后同步工坊列表 */
  onRecipesChanged?: () => void;
}

export default function RecipeBrowserModal({
  isOpen,
  onClose,
  selectedStyleId,
  onSelectStyle,
  onOpenExtractModal,
  onUseManualArchitecture,
  onRecipesChanged,
}: Props) {
  const [activeCategory, setActiveCategory] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [systemPresets, setSystemPresets] = useState<StylePresetItem[]>(STYLE_PRESETS);
  const [customRecipes, setCustomRecipes] = useState<any[]>([]);
  const [categories, setCategories] = useState<CategoryItem[]>([]);
  const [toastMsg, setToastMsg] = useState<string | null>(null);
  const [pinnedRecipeIds, setPinnedRecipeIds] = useState<string[]>([]);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [viewingRecipe, setViewingRecipe] = useState<any | null>(null);
  const [editingRecipe, setEditingRecipe] = useState<any | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [isSavingEdit, setIsSavingEdit] = useState(false);
  const [isManualArchOpen, setIsManualArchOpen] = useState(false);

  const fetchCustomRecipes = async () => {
    try {
      const res = await apiFetch('/api/catalog/styles');
      const data = await res.json();
      if (data.success && Array.isArray(data.recipes)) {
        setCustomRecipes(data.recipes);
      }
    } catch (e) {
      console.warn('获取自定义配方失败:', e);
    }
  };

  useEffect(() => {
    if (isOpen) {
      setCategories(getMergedCategories());
      setSystemPresets(getMergedStylePresets());
      fetchCustomRecipes();
      try {
        const saved = localStorage.getItem('pinned_recipe_ids');
        if (saved) setPinnedRecipeIds(JSON.parse(saved));
      } catch {}
    }
  }, [isOpen]);

  const showToast = (msg: string) => {
    setToastMsg(msg);
    setTimeout(() => setToastMsg(null), 2500);
  };

  const togglePinRecipe = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const isPinned = pinnedRecipeIds.includes(id);
    const updated = isPinned ? pinnedRecipeIds.filter(pId => pId !== id) : [id, ...pinnedRecipeIds];
    setPinnedRecipeIds(updated);
    try {
      localStorage.setItem('pinned_recipe_ids', JSON.stringify(updated));
    } catch {}
    showToast(isPinned ? '已取消置顶' : '⭐ 已置顶常用配方');
  };

  const handleDeleteRecipe = async (recipe: any, e: React.MouseEvent) => {
    e.stopPropagation();
    if (confirmDeleteId !== recipe.id) {
      setConfirmDeleteId(recipe.id);
      setTimeout(() => {
        setConfirmDeleteId(prev => (prev === recipe.id ? null : prev));
      }, 3500);
      return;
    }
    setConfirmDeleteId(null);

    if (recipe.isCustom) {
      try {
        const res = await apiFetch(`/api/catalog/styles?id=${recipe.id}`, { method: 'DELETE' });
        const data = await res.json();
        if (data.success) {
          setCustomRecipes(prev => prev.filter(r => r.id !== recipe.id));
          if (selectedStyleId === recipe.id) {
            onSelectStyle('auto');
          }
          showToast(`已删除自定义配方「${recipe.name}」`);
        }
      } catch (err) {
        showToast('删除失败，请重试');
      }
    } else {
      // 删除/隐藏内置系统预设
      deletePresetItem(recipe.id);
      setSystemPresets(getMergedStylePresets());
      if (selectedStyleId === recipe.id) {
        onSelectStyle('auto');
      }
      showToast(`已删除内置预设「${recipe.name}」`);
    }
  };

  const handleResetPresets = () => {
    resetPresetsToDefault();
    setSystemPresets(getMergedStylePresets());
    showToast('✨ 已恢复全部系统内置风格预设！');
  };

  // 聚合所有配方（系统预设 + 用户架构自定义）
  const allRecipes = [
    ...systemPresets,
    ...customRecipes.map(r => ({
      id: r.id,
      name: `✨ ${r.name}`,
      category: r.category || 'custom',
      tag: r.tags ? (Array.isArray(r.tags) ? r.tags.join(' · ') : r.tags) : '品类专属定制 · 爆款架构',
      desc: r.description || r.lighting || '架构推理生成的专属买家秀提示词架构',
      promptSnippet: r.prompt_snippet || r.promptSnippet || '',
      isCustom: true
    }))
  ];

  // 排序：置顶项优先
  allRecipes.sort((a, b) => {
    const aPinned = pinnedRecipeIds.includes(a.id);
    const bPinned = pinnedRecipeIds.includes(b.id);
    if (aPinned && !bPinned) return -1;
    if (!aPinned && bPinned) return 1;
    return 0;
  });

  // 过滤
  const filteredRecipes = allRecipes.filter(recipe => {
    if (activeCategory === 'pinned') {
      if (!pinnedRecipeIds.includes(recipe.id)) return false;
    } else if (activeCategory === 'custom') {
      if (!recipe.isCustom) return false;
    } else if (activeCategory !== 'all') {
      if (recipe.id === 'auto') return true; // 自适应始终展示在所有分类
      if (recipe.category !== activeCategory) return false;
    }

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      const matchName = recipe.name.toLowerCase().includes(q);
      const matchTag = recipe.tag.toLowerCase().includes(q);
      const matchDesc = recipe.desc.toLowerCase().includes(q);
      return matchName || matchTag || matchDesc;
    }
    return true;
  });

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-white rounded-3xl w-full max-w-5xl h-[88vh] shadow-2xl flex flex-col overflow-hidden border border-slate-200">
        
        {/* 顶部 Header */}
        <div className="px-6 py-4.5 border-b border-slate-100 flex items-center justify-between bg-gradient-to-r from-slate-50/80 via-white to-indigo-50/30 flex-shrink-0">
          <div className="flex items-center gap-3.5">
            <div className="w-11 h-11 rounded-2xl bg-gradient-to-br from-indigo-500 to-purple-600 text-white flex items-center justify-center shadow-md font-bold">
              <Sliders className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2.5">
                <h3 className="text-base font-bold text-slate-900 tracking-tight">视觉拍摄架构与风格配方库</h3>
                <span className="text-xs font-mono font-bold px-2.5 py-0.5 rounded-full bg-indigo-50 text-indigo-700 border border-indigo-200">
                  {allRecipes.length} 款拍摄架构
                </span>
              </div>
              <p className="text-xs text-slate-500 mt-0.5">
                指导 AI 视觉大模型在指定的品类空间、采光物理、道具生态与摄影光学下生成买家秀分镜
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2.5">
            <button
              type="button"
              onClick={() => setIsManualArchOpen(true)}
              className="px-4 py-2 rounded-2xl bg-indigo-50 hover:bg-indigo-100 text-indigo-700 text-xs font-bold flex items-center gap-1.5 border border-indigo-200 shadow-sm transition-all cursor-pointer active:scale-95"
            >
              <FileText className="w-4 h-4" />
              <span>粘贴/导入架构</span>
            </button>
            <button
              type="button"
              onClick={() => {
                onClose();
                onOpenExtractModal();
              }}
              className="px-4 py-2 rounded-2xl bg-gradient-to-r from-pink-500 to-rose-600 hover:from-pink-600 hover:to-rose-700 text-white text-xs font-bold flex items-center gap-1.5 shadow-sm transition-all cursor-pointer active:scale-95"
            >
              <Sparkles className="w-4 h-4" />
              <span>+ 架构推理</span>
            </button>
            <button 
              onClick={onClose}
              className="w-9 h-9 rounded-2xl text-slate-400 hover:text-slate-700 hover:bg-slate-100 flex items-center justify-center transition-colors cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* 搜索与分类导航 Bar */}
        <div className="px-6 py-3 border-b border-slate-100 bg-white flex items-center justify-between gap-4 flex-shrink-0">
          <div className="flex items-center gap-2 overflow-x-auto scrollbar-none py-0.5">
            <button
              onClick={() => setActiveCategory('all')}
              className={`px-3.5 py-1.5 rounded-2xl text-xs font-bold whitespace-nowrap transition-all cursor-pointer ${
                activeCategory === 'all'
                  ? 'bg-slate-900 text-white shadow-xs'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              全部架构 ({allRecipes.length})
            </button>

            {pinnedRecipeIds.length > 0 && (
              <button
                onClick={() => setActiveCategory('pinned')}
                className={`px-3.5 py-1.5 rounded-2xl text-xs font-bold whitespace-nowrap transition-all cursor-pointer flex items-center gap-1 ${
                  activeCategory === 'pinned'
                    ? 'bg-amber-500 text-white shadow-xs'
                    : 'bg-amber-50 text-amber-700 hover:bg-amber-100 border border-amber-200/60'
                }`}
              >
                <Star className="w-3.5 h-3.5 fill-current" />
                <span>⭐ 常用置顶 ({pinnedRecipeIds.length})</span>
              </button>
            )}

            {customRecipes.length > 0 && (
              <button
                onClick={() => setActiveCategory('custom')}
                className={`px-3.5 py-1.5 rounded-2xl text-xs font-bold whitespace-nowrap transition-all cursor-pointer flex items-center gap-1 ${
                  activeCategory === 'custom'
                    ? 'bg-pink-600 text-white shadow-xs'
                    : 'bg-pink-50 text-pink-700 hover:bg-pink-100 border border-pink-200/60'
                }`}
              >
                <Sparkles className="w-3.5 h-3.5" />
                <span>我的架构 ({customRecipes.length})</span>
              </button>
            )}

            {categories.map(cat => {
              const count = allRecipes.filter(r => r.category === cat.id).length;
              return (
                <button
                  key={cat.id}
                  onClick={() => setActiveCategory(cat.id)}
                  className={`px-3.5 py-1.5 rounded-2xl text-xs font-bold whitespace-nowrap transition-all cursor-pointer ${
                    activeCategory === cat.id
                      ? 'bg-indigo-600 text-white shadow-xs'
                      : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                  }`}
                >
                  {cat.name} ({count})
                </button>
              );
            })}

            {systemPresets.length < STYLE_PRESETS.length && (
              <button
                type="button"
                onClick={handleResetPresets}
                className="px-3 py-1.5 rounded-2xl text-xs font-bold text-indigo-700 bg-indigo-50 hover:bg-indigo-100 border border-indigo-200 flex items-center gap-1 cursor-pointer whitespace-nowrap shadow-2xs"
                title="一键恢复所有系统默认风格预设"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>恢复默认预设</span>
              </button>
            )}
          </div>

          <div className="relative w-64 flex-shrink-0">
            <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              placeholder="搜索光影、材质、风格..."
              className="w-full pl-9 pr-3.5 py-1.5 rounded-2xl bg-slate-100/90 text-xs text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:bg-white border border-transparent focus:border-indigo-300 transition-all font-medium"
            />
          </div>
        </div>

        {/* 提示消息 */}
        {toastMsg && (
          <div className="bg-emerald-50 text-emerald-800 text-xs font-bold px-6 py-2 border-b border-emerald-200/60 flex items-center justify-between animate-in slide-in-from-top duration-150">
            <span className="flex items-center gap-1.5">
              <Check className="w-4 h-4 text-emerald-600" />
              {toastMsg}
            </span>
          </div>
        )}

        {/* 配方卡片网格列表 */}
        <div className="flex-1 overflow-y-auto p-6 scrollbar-thin bg-slate-50/50">
          {filteredRecipes.length === 0 ? (
            <div className="h-full min-h-[360px] flex flex-col items-center justify-center text-center p-8 space-y-4">
              <div className="w-16 h-16 rounded-3xl bg-gradient-to-br from-pink-100 to-indigo-100 text-pink-600 flex items-center justify-center shadow-inner">
                <Sparkles className="w-8 h-8" />
              </div>
              <div className="space-y-1.5 max-w-md">
                <h4 className="text-base font-bold text-slate-800">暂无已保存的风格配方</h4>
                <p className="text-xs text-slate-500 leading-relaxed">
                  可直接粘贴/导入你自己的提示词架构，或上传社媒样张由 AI 推理生成拍摄配方。
                </p>
              </div>
              <div className="flex flex-wrap items-center justify-center gap-2">
                <button
                  type="button"
                  onClick={() => setIsManualArchOpen(true)}
                  className="px-6 py-2.5 rounded-2xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold flex items-center gap-2 shadow-md hover:shadow-lg transition-all cursor-pointer active:scale-95"
                >
                  <FileText className="w-4 h-4" />
                  <span>粘贴/导入架构</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    onClose();
                    onOpenExtractModal();
                  }}
                  className="px-6 py-2.5 rounded-2xl bg-gradient-to-r from-pink-500 to-rose-600 hover:from-pink-600 hover:to-rose-700 text-white text-xs font-bold flex items-center gap-2 shadow-md hover:shadow-lg transition-all cursor-pointer active:scale-95"
                >
                  <Sparkles className="w-4 h-4" />
                  <span>+ 立即推理新架构</span>
                </button>
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
              {filteredRecipes.map(recipe => {
                const isSelected = selectedStyleId === recipe.id;
                return (
                  <div
                    key={recipe.id}
                    className={`group relative rounded-3xl p-5 transition-all duration-200 flex flex-col justify-between border ${
                      isSelected
                        ? 'bg-white border-indigo-600 ring-2 ring-indigo-600/20 shadow-md'
                        : 'bg-white hover:bg-white border-slate-200/90 hover:border-indigo-300 shadow-2xs hover:shadow-md'
                    }`}
                  >
                    {/* 卡片主体头部与描述 */}
                    <div className="space-y-3">
                      <div className="flex items-start justify-between gap-2.5">
                        <div className="flex items-center gap-3 min-w-0">
                          <div className={`w-10 h-10 rounded-2xl flex items-center justify-center flex-shrink-0 font-bold text-base shadow-xs ${
                            isSelected
                              ? 'bg-indigo-600 text-white'
                              : recipe.isCustom
                              ? 'bg-pink-100 text-pink-700'
                              : 'bg-indigo-50 text-indigo-700 group-hover:bg-indigo-600 group-hover:text-white transition-colors'
                          }`}>
                            {recipe.name.replace(/^[✨\s]+/, '').slice(0, 2)}
                          </div>
                          <div className="min-w-0">
                            <h4 className="text-xs font-bold text-slate-900 line-clamp-1 flex items-center gap-1.5">
                              <span>{recipe.name}</span>
                            </h4>
                            <div className="text-[11px] text-indigo-600 font-medium truncate mt-0.5">
                              {recipe.tag}
                            </div>
                          </div>
                        </div>

                        {/* 顶部操作按钮（置顶、删除） */}
                        <div className="flex items-center gap-1.5 flex-shrink-0">
                          <button
                            type="button"
                            onClick={(e) => togglePinRecipe(recipe.id, e)}
                            className={`p-1.5 rounded-xl border transition-all cursor-pointer shadow-2xs ${
                              pinnedRecipeIds.includes(recipe.id)
                                ? 'bg-amber-50 text-amber-500 border-amber-300'
                                : 'bg-slate-50 text-slate-400 hover:text-amber-500 hover:bg-amber-50 border-slate-200'
                            }`}
                            title={pinnedRecipeIds.includes(recipe.id) ? "取消置顶" : "置顶常用配方"}
                          >
                            <Star className={`w-3.5 h-3.5 ${pinnedRecipeIds.includes(recipe.id) ? 'fill-current' : ''}`} />
                          </button>

                          <button
                            type="button"
                            onClick={(e) => handleDeleteRecipe(recipe, e)}
                            className={`p-1.5 rounded-xl border transition-all cursor-pointer shadow-2xs ${
                              confirmDeleteId === recipe.id
                                ? 'bg-red-600 text-white border-red-600 animate-pulse'
                                : 'text-slate-400 hover:text-red-600 hover:bg-red-50 hover:border-red-200 border-slate-200/80'
                            }`}
                            title={confirmDeleteId === recipe.id ? "再次点击确认删除" : "删除此自定义配方"}
                          >
                            <Trash2 className={`w-3.5 h-3.5 ${confirmDeleteId === recipe.id ? 'text-white' : 'text-slate-400'}`} />
                          </button>
                        </div>
                      </div>

                      {/* 架构描述 */}
                      <p className="text-xs text-slate-600 line-clamp-3 leading-relaxed bg-slate-50/80 p-3 rounded-2xl border border-slate-100 font-sans">
                        {recipe.desc}
                      </p>

                      {/* 提示词代码片段预览 */}
                      {recipe.promptSnippet && (
                        <div className="p-2.5 rounded-xl bg-slate-900/95 text-slate-300 font-mono text-[11px] leading-relaxed line-clamp-2 border border-slate-800 select-none">
                          <span className="text-indigo-400 font-bold mr-1">[Prompt]</span>
                          {recipe.promptSnippet}
                        </div>
                      )}
                    </div>

                    {/* 底部 50/50 均衡排版操作按钮区 */}
                    <div className="pt-3.5 mt-3.5 border-t border-slate-100 flex items-center gap-2.5">
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setViewingRecipe({ ...recipe, name: stripRecipeNamePrefix(recipe.name) });
                        }}
                        className="flex-1 py-2 px-3 rounded-2xl text-xs font-bold text-indigo-700 bg-indigo-50 hover:bg-indigo-100 border border-indigo-200/80 transition-all flex items-center justify-center gap-1.5 cursor-pointer active:scale-95 shadow-2xs"
                        title="查看或修改此配方的完整提示词内容"
                      >
                        <Eye className="w-3.5 h-3.5" />
                        <span>查看/修改</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => {
                          onSelectStyle(recipe.id);
                          onClose();
                        }}
                        className={`flex-1 py-2 px-3 rounded-2xl text-xs font-bold transition-all cursor-pointer flex items-center justify-center gap-1.5 active:scale-95 ${
                          isSelected
                            ? 'bg-emerald-600 text-white shadow-xs hover:bg-emerald-700'
                            : 'bg-indigo-600 hover:bg-indigo-700 text-white shadow-xs'
                        }`}
                      >
                        {isSelected ? (
                          <>
                            <Check className="w-3.5 h-3.5 stroke-[3]" />
                            <span>当前使用中</span>
                          </>
                        ) : (
                          <span>选择此架构</span>
                        )}
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* 🌟 提示词查看与编辑详情模态框 */}
        {viewingRecipe && (
          <div 
            className="fixed inset-0 z-60 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4 animate-fade-in"
            onClick={() => setViewingRecipe(null)}
          >
            <div 
              className="w-full max-w-2xl rounded-3xl bg-white border border-slate-200/90 shadow-2xl p-6 space-y-4 max-h-[85vh] flex flex-col"
              onClick={e => e.stopPropagation()}
            >
              <div className="flex items-center justify-between pb-3 border-b border-slate-100">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-xl bg-indigo-600 text-white flex items-center justify-center font-bold text-sm">
                    👁️
                  </div>
                  <div>
                    {viewingRecipe.isCustom ? (
                      <input
                        type="text"
                        value={viewingRecipe.name || ''}
                        onChange={e => setViewingRecipe({ ...viewingRecipe, name: e.target.value })}
                        className="text-sm font-bold text-slate-900 bg-slate-50 border border-slate-200 rounded-xl px-2.5 py-1 outline-none focus:bg-white focus:border-indigo-400 w-full max-w-xs"
                        placeholder="架构名称"
                      />
                    ) : (
                      <h3 className="text-sm font-bold text-slate-900">{viewingRecipe.name}</h3>
                    )}
                    <p className="text-[11px] text-slate-400 font-mono">{viewingRecipe.tag || '提示词配方详情'}</p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setViewingRecipe(null)}
                  className="p-1.5 rounded-xl text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors cursor-pointer"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="space-y-2 flex-1 overflow-y-auto">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
                    <Edit3 className="w-3.5 h-3.5 text-indigo-600" />
                    <span>提示词内容 (Prompt Snippet)</span>
                  </label>
                  <span className="text-[10px] text-slate-400 font-mono">
                    {viewingRecipe.promptSnippet?.length || 0} 字符
                  </span>
                </div>
                <textarea
                  value={viewingRecipe.promptSnippet || ''}
                  onChange={e => setViewingRecipe({ ...viewingRecipe, promptSnippet: e.target.value })}
                  rows={8}
                  className="w-full p-3 rounded-2xl bg-slate-50 border border-indigo-200 text-xs text-slate-800 font-mono leading-relaxed focus:bg-white focus:ring-2 focus:ring-indigo-500/20 outline-none resize-y"
                  placeholder="在此编辑修改提示词..."
                />
                <p className="text-[11px] text-slate-400 leading-relaxed">
                  说明：保存修改后将更新到配方库并自动选中应用到当前的视觉提炼中。
                </p>
              </div>

              <div className="flex items-center justify-between pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => {
                    navigator.clipboard.writeText(viewingRecipe.promptSnippet || '');
                    setCopiedId(viewingRecipe.id);
                    setTimeout(() => setCopiedId(null), 2000);
                  }}
                  className="px-3 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold flex items-center gap-1 transition-all cursor-pointer"
                >
                  {copiedId === viewingRecipe.id ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
                  <span>{copiedId === viewingRecipe.id ? '已复制' : '复制提示词'}</span>
                </button>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setViewingRecipe(null)}
                    className="px-3.5 py-1.5 rounded-xl text-slate-500 hover:bg-slate-100 text-xs font-bold transition-all cursor-pointer"
                  >
                    关闭
                  </button>
                  <button
                    type="button"
                    disabled={isSavingEdit}
                    onClick={async () => {
                      setIsSavingEdit(true);
                      try {
                        if (viewingRecipe.isCustom && viewingRecipe.id) {
                          const nextName = stripRecipeNamePrefix(viewingRecipe.name || '');
                          if (!nextName) {
                            showToast('请填写架构名称');
                            return;
                          }
                          await apiFetch('/api/catalog/styles', {
                            method: 'PUT',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({
                              id: viewingRecipe.id,
                              name: nextName,
                              promptSnippet: viewingRecipe.promptSnippet
                            })
                          });
                          setCustomRecipes(prev => prev.map(r =>
                            r.id === viewingRecipe.id
                              ? { ...r, name: nextName, promptSnippet: viewingRecipe.promptSnippet }
                              : r
                          ));
                          onRecipesChanged?.();
                        } else {
                          // 将预设的修改另存为专属配方
                          const res = await apiFetch('/api/catalog/styles', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({
                              name: `${viewingRecipe.name} (已微调)`,
                              category: viewingRecipe.category || 'digital_3c',
                              tag: viewingRecipe.tag || '自定义微调',
                              desc: viewingRecipe.desc || '用户自定义微调后的提示词架构',
                              promptSnippet: viewingRecipe.promptSnippet
                            })
                          });
                          const data = await res.json();
                          if (data.success && data.recipe) {
                            onRecipesChanged?.();
                            onSelectStyle(data.recipe.id);
                            setViewingRecipe(null);
                            onClose();
                            return;
                          }
                        }
                        onSelectStyle(viewingRecipe.id);
                        setViewingRecipe(null);
                        onClose();
                      } catch (err) {
                        console.error('保存配方失败:', err);
                      } finally {
                        setIsSavingEdit(false);
                      }
                    }}
                    className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold transition-all shadow-sm cursor-pointer flex items-center gap-1.5"
                  >
                    <Check className="w-3.5 h-3.5" />
                    <span>{isSavingEdit ? '保存中...' : '保存并立即应用'}</span>
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* 底部 Footer */}
        <div className="px-6 py-3.5 border-t border-slate-100 bg-white flex items-center justify-between text-xs text-slate-500 flex-shrink-0">
          <div className="flex items-center gap-2">
            <span className="font-bold text-slate-700">💡 提示：</span>
            <span>选定拍摄架构后，大模型将自动结合商品本身的材质特征，为您规划全套多机位生活化买家秀分镜。</span>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold transition-all cursor-pointer"
          >
            关闭
          </button>
        </div>

      </div>

      <ManualArchitecturePanel
        isOpen={isManualArchOpen}
        onClose={() => setIsManualArchOpen(false)}
        onUse={(result) => {
          if (result.recipe?.id) {
            setCustomRecipes((prev) => {
              if (prev.some((r) => r.id === result.recipe.id)) return prev;
              return [result.recipe, ...prev];
            });
            onSelectStyle(result.recipe.id);
            showToast('已保存并选中自定义架构');
          } else {
            showToast('已应用粘贴架构（未入库）');
          }
          onUseManualArchitecture?.(result);
          if (result.recipe?.id) {
            onClose();
          }
        }}
        onSaved={(recipe) => {
          setCustomRecipes((prev) => {
            if (prev.some((r) => r.id === recipe.id)) return prev;
            return [recipe, ...prev];
          });
        }}
      />
    </div>
  );
}
