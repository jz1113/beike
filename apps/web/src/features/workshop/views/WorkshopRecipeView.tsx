import React, { useState, useEffect, useCallback } from 'react';
import { Sparkles, ArrowLeft } from 'lucide-react';
import { apiFetch } from '@/shared/api/apiClient';
import { getCachedRecipes, setCachedRecipes } from '@/shared/api/catalogCache';
import { formatUserError } from '@beike/domain/upstreamErrors';
import { confirmAction } from '@/shared/utils/confirmAction';
import { useAppStore } from '@/store';
import { DEFAULT_CATEGORIES, getMergedCategories, type CategoryItem } from '@beike/domain/vision';
import AssetRecipeLibrary from '@/features/assets/components/AssetRecipeLibrary';
import StyleExtractModal from '@/shared/modals/StyleExtractModal';
import { useSafeTimeout } from '@/shared/hooks/useSafeTimeout';

interface Props {
  onEnterStudio: () => void;
}

let globalRecipesCache: any[] | null = getCachedRecipes() as any[] | null;

export default function WorkshopRecipeView({ onEnterStudio }: Props) {
  const setSelectedArchId = useAppStore((s) => s.setSelectedArchId);
  const setPendingBatchStage = useAppStore((s) => s.setPendingBatchStage);

  const [recipes, setRecipes] = useState<any[]>(() => globalRecipesCache || []);
  const [isLoading, setIsLoading] = useState(() => !globalRecipesCache);
  const [isExtractModalOpen, setIsExtractModalOpen] = useState(false);
  const [editingRecipe, setEditingRecipe] = useState<any | null>(null);
  const [isUpdatingRecipe, setIsUpdatingRecipe] = useState(false);
  const [categories, setCategories] = useState<CategoryItem[]>(DEFAULT_CATEGORIES);
  const [isCreatingCategory, setIsCreatingCategory] = useState(false);
  const [isCategoryManagerOpen, setIsCategoryManagerOpen] = useState(false);
  const [newCategoryName, setNewCategoryName] = useState('');
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const { setSafeTimeout } = useSafeTimeout();
  const [toastMsg, setToastMsg] = useState<string | null>(null);

  const showToast = (msg: string) => {
    setToastMsg(msg);
    setSafeTimeout(() => setToastMsg(null), 2500);
  };

  useEffect(() => {
    setCategories(getMergedCategories());
  }, []);

  const fetchRecipes = useCallback(async (force = false) => {
    if (!globalRecipesCache || force) {
      setIsLoading(true);
    }
    try {
      const res = await apiFetch('/api/catalog/styles').catch(() => null);
      if (res && res.ok) {
        const data = await res.json().catch(() => null);
        if (data?.success) {
          globalRecipesCache = data.recipes || [];
          setCachedRecipes(globalRecipesCache || []);
          setRecipes(globalRecipesCache || []);
        }
      }
    } catch (err) {
      console.warn('加载风格架构轻微异常:', err);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchRecipes();
  }, [fetchRecipes]);

  const handleApplyRecipe = (recipe: any) => {
    setSelectedArchId(recipe.id);
    setPendingBatchStage(2);
    showToast(`✨ 已锁定【${recipe.name || '拍摄架构'}】并载入工作台！`);
    onEnterStudio();
  };

  const handleDeleteRecipe = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!(await confirmAction('确定删除该自定义拍摄架构吗？'))) return;
    try {
      await apiFetch(`/api/catalog/styles?id=${id}`, { method: 'DELETE' });
      setRecipes((prev) => prev.filter((r) => r.id !== id));
      showToast('🗑️ 已删除该架构配方');
    } catch (err) {
      showToast(`❌ 删除失败: ${formatUserError(err, '请稍后重试')}`);
    }
  };

  const handleSaveEditedRecipe = async () => {
    if (!editingRecipe) return;
    setIsUpdatingRecipe(true);
    try {
      if (editingRecipe.id && !editingRecipe.isNew) {
        const res = await apiFetch('/api/catalog/styles', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            id: editingRecipe.id,
            name: editingRecipe.name,
            category: editingRecipe.category,
            tag: editingRecipe.tag,
            desc: editingRecipe.desc,
            promptSnippet: editingRecipe.promptSnippet,
          }),
        });
        const data = await res.json();
        if (data.success) {
          setRecipes((prev) => prev.map((r) => (r.id === editingRecipe.id ? data.recipe : r)));
          setEditingRecipe(null);
          showToast('✅ 架构配方更新成功');
        } else {
          showToast(`❌ 保存失败: ${data.error || '未知错误'}`);
        }
      } else {
        const res = await apiFetch('/api/catalog/styles', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name: editingRecipe.name,
            category: editingRecipe.category || 'general',
            tag: editingRecipe.tag || '专属架构',
            desc: editingRecipe.desc || '',
            promptSnippet: editingRecipe.promptSnippet,
          }),
        });
        const data = await res.json();
        if (data.success) {
          setRecipes((prev) => [data.recipe, ...prev]);
          setEditingRecipe(null);
          showToast('✅ 新增架构配方成功');
        }
      }
    } catch (err) {
      showToast(`❌ 保存架构失败: ${formatUserError(err, '请稍后重试')}`);
    } finally {
      setIsUpdatingRecipe(false);
    }
  };

  const handleCreateCategory = () => {
    if (!newCategoryName.trim()) return;
    const name = newCategoryName.trim();
    const id = `cat_${Date.now()}`;
    const newCat: CategoryItem = {
      id,
      name: name.startsWith('🏷️') || name.startsWith('📦') ? name : `🏷️ ${name}`,
      isCustom: true,
    };
    const updated = [...categories, newCat];
    setCategories(updated);
    localStorage.setItem('custom_categories', JSON.stringify(updated));
    if (editingRecipe) {
      setEditingRecipe({ ...editingRecipe, category: id });
    }
    setIsCreatingCategory(false);
    setNewCategoryName('');
  };

  return (
    <div className="flex-1 flex flex-col min-h-0 bg-[#FAFAFC] overflow-y-auto">
      {toastMsg && (
        <div className="fixed top-16 left-1/2 -translate-x-1/2 z-50 px-4 py-2 bg-slate-900/90 text-white text-xs font-semibold rounded-2xl shadow-xl backdrop-blur-md animate-in fade-in duration-200">
          {toastMsg}
        </div>
      )}

      {/* 头部辅助栏 */}
      <div className="px-6 lg:px-8 py-3.5 bg-white border-b border-slate-200/80 flex items-center justify-between gap-3 shrink-0">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={onEnterStudio}
            className="p-1.5 rounded-lg text-slate-500 hover:text-slate-900 hover:bg-slate-100 transition-colors cursor-pointer flex items-center gap-1 text-xs font-bold"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>返回制作台</span>
          </button>
          <div className="h-4 w-px bg-slate-200" />
          <span className="text-xs text-slate-500 font-medium">
            沉淀官方与专属 8 段式摄影拍摄大架构规范，直接为种草工坊提供分镜骨架
          </span>
        </div>

        <button
          type="button"
          onClick={() => setIsExtractModalOpen(true)}
          className="px-3.5 py-1.5 rounded-xl bg-gradient-to-r from-pink-600 to-indigo-600 hover:from-pink-500 hover:to-indigo-500 text-white text-xs font-bold flex items-center gap-1.5 transition-all shadow-xs cursor-pointer"
        >
          <Sparkles className="w-3.5 h-3.5" />
          <span>+ 架构推理</span>
        </button>
      </div>

      {/* 架构列表 */}
      <div className="flex-1 px-6 lg:px-8 py-6">
        <AssetRecipeLibrary
          recipes={recipes}
          copiedId={copiedId}
          setCopiedId={setCopiedId}
          editingRecipe={editingRecipe}
          setEditingRecipe={setEditingRecipe}
          isUpdatingRecipe={isUpdatingRecipe}
          categories={categories}
          isCreatingCategory={isCreatingCategory}
          setIsCreatingCategory={setIsCreatingCategory}
          newCategoryName={newCategoryName}
          setNewCategoryName={setNewCategoryName}
          setIsExtractModalOpen={setIsExtractModalOpen}
          setIsCategoryManagerOpen={setIsCategoryManagerOpen}
          onDeleteRecipe={handleDeleteRecipe}
          onApplyRecipe={handleApplyRecipe}
          onSaveEditedRecipe={handleSaveEditedRecipe}
          onCreateCategory={handleCreateCategory}
          onRefreshRecipes={fetchRecipes}
          section="list"
        />
      </div>

      <AssetRecipeLibrary
        recipes={recipes}
        copiedId={copiedId}
        setCopiedId={setCopiedId}
        editingRecipe={editingRecipe}
        setEditingRecipe={setEditingRecipe}
        isUpdatingRecipe={isUpdatingRecipe}
        categories={categories}
        isCreatingCategory={isCreatingCategory}
        setIsCreatingCategory={setIsCreatingCategory}
        newCategoryName={newCategoryName}
        setNewCategoryName={setNewCategoryName}
        setIsExtractModalOpen={setIsExtractModalOpen}
        setIsCategoryManagerOpen={setIsCategoryManagerOpen}
        onDeleteRecipe={handleDeleteRecipe}
        onApplyRecipe={handleApplyRecipe}
        onSaveEditedRecipe={handleSaveEditedRecipe}
        onCreateCategory={handleCreateCategory}
        section="modal"
      />

      <StyleExtractModal
        isOpen={isExtractModalOpen}
        onClose={() => setIsExtractModalOpen(false)}
        onRecipeCreated={(newRecipe) => {
          setRecipes((prev) => [newRecipe, ...prev]);
        }}
      />
    </div>
  );
}
