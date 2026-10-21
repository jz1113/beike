import React, { useState, useEffect, useCallback } from 'react';
import { apiFetch } from '@client/shared/api/apiClient';
import { getCachedRecipes, setCachedRecipes } from '@client/shared/api/catalogCache';
import { formatUserError } from '@shared/domain/models/upstreamErrors';
import { confirmAction } from '@client/shared/utils/confirmAction';
import { useAppStore } from '@client/store';
import { DEFAULT_CATEGORIES, getMergedCategories, type CategoryItem } from '@shared/domain/prompts/vision';
import AssetRecipeLibrary from '../components/AssetRecipeLibrary';
import StyleExtractModal from '@client/shared/modals/StyleExtractModal';
import type { BaseStyleSkill } from '@client/shared/modals/style-extract/types';
import { useSafeTimeout } from '@client/shared/hooks/useSafeTimeout';

interface Props {
  onEnterStudio: () => void;
}


export default function WorkshopRecipeView({ onEnterStudio }: Props) {
  const setSelectedArchId = useAppStore((s) => s.setSelectedArchId);
  const setPendingBatchStage = useAppStore((s) => s.setPendingBatchStage);

  const [recipes, setRecipes] = useState<any[]>(() => getCachedRecipes() || []);
  const [hiddenOfficialRecipes, setHiddenOfficialRecipes] = useState<Array<{ id: string; name: string }>>([]);
  const [isRestoringOfficial, setIsRestoringOfficial] = useState(false);
  const [, setIsLoading] = useState(() => !getCachedRecipes());
  const [feedSkill, setFeedSkill] = useState<BaseStyleSkill | undefined>();
  const [isExtractModalOpen, setIsExtractModalOpen] = useState(false);
  const [editingRecipe, setEditingRecipe] = useState<any | null>(null);
  const [isUpdatingRecipe, setIsUpdatingRecipe] = useState(false);
  const [categories, setCategories] = useState<CategoryItem[]>(DEFAULT_CATEGORIES);
  const [isCreatingCategory, setIsCreatingCategory] = useState(false);
  const [, setIsCategoryManagerOpen] = useState(false);
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
    if (!getCachedRecipes() || force) {
      setIsLoading(true);
    }
    try {
      const res = await apiFetch('/api/catalog/styles').catch(() => null);
      if (res && res.ok) {
        const data = await res.json().catch(() => null);
        if (data?.success) {
          setCachedRecipes(data.recipes || []);
          setRecipes(data.recipes || []);
          setHiddenOfficialRecipes(Array.isArray(data.hiddenOfficialRecipes) ? data.hiddenOfficialRecipes : []);
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

  useEffect(() => { setCachedRecipes(recipes); window.dispatchEvent(new Event('workshop-recipes-changed')); }, [recipes]);

  const handleApplyRecipe = (recipe: any) => {
    setSelectedArchId(recipe.id);
    window.dispatchEvent(new Event('workshop-skill-applied'));
    setPendingBatchStage(2);
    showToast(`✨ 已锁定【${recipe.name || '拍摄架构'}】并载入工作台！`);
    onEnterStudio();
  };

  const handleDeleteRecipe = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const isOfficial = recipes.find(recipe => recipe.id === id)?.isOfficial;
    if (!(await confirmAction(isOfficial
      ? '隐藏这条官方拍摄架构吗？之后可在“恢复已隐藏官方架构”中重新显示。'
      : '确定删除该自定义拍摄架构吗？'))) return;
    try {
      const res = await apiFetch(`/api/catalog/styles?id=${encodeURIComponent(id)}`, { method: 'DELETE' });
      if (!res.ok) { showToast('删除失败，请稍后重试'); return; }
      setRecipes((prev) => prev.filter((r) => r.id !== id));
      if (useAppStore.getState().selectedArchId === id) setSelectedArchId('');
      showToast(isOfficial ? '已隐藏官方架构，可随时恢复' : '🗑️ 已删除该架构配方');
      void fetchRecipes(true);
    } catch (err) {
      showToast(`❌ 删除失败: ${formatUserError(err, '请稍后重试')}`);
    }
  };

  const handleRestoreOfficialRecipe = async (id: string) => {
    if (isRestoringOfficial) return;
    setIsRestoringOfficial(true);
    try {
      const res = await apiFetch('/api/catalog/styles?action=restore', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id }),
      });
      if (!res.ok) throw new Error('恢复失败，请稍后重试');
      await fetchRecipes(true);
      showToast('官方拍摄架构已恢复');
    } catch (err) {
      showToast(`恢复架构失败：${formatUserError(err, '请稍后重试')}`);
    } finally {
      setIsRestoringOfficial(false);
    }
  };

  const handleSaveEditedRecipe = async () => {
    if (!editingRecipe || isUpdatingRecipe) return;
    if (!editingRecipe.name?.trim() || !editingRecipe.promptSnippet?.trim()) { showToast('请填写架构名称和提示词内容'); return; }
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
        if (res.ok && data.success) {
          setRecipes((prev) => prev.map((r) => (r.id === editingRecipe.id ? data.recipe : r)));
          if (useAppStore.getState().selectedArchId === editingRecipe.id) setSelectedArchId(data.recipe.id);
          setEditingRecipe(null);
          showToast('架构配方更新成功');
        } else {
          if (res.status === 404 && data.code === 'recipe_not_found') {
            setEditingRecipe({ ...editingRecipe, isNew: true });
            void fetchRecipes(true);
            showToast('原架构已不存在，内容已保留；再次保存将创建新架构');
          } else showToast('保存失败，请稍后重试。编辑内容已保留。');
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
        if (res.ok && data.success) {
          setRecipes((prev) => [data.recipe, ...prev]);
          setEditingRecipe(null);
          showToast('✅ 新增架构配方成功');
        } else showToast('新增失败，请稍后重试。编辑内容已保留。');
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
    <div className="flex-1 flex flex-col min-h-0 bg-transparent overflow-y-auto">
      {toastMsg && (
        <div className="fixed top-16 left-1/2 -translate-x-1/2 z-[100] max-w-[min(90vw,480px)] break-words px-4 py-2 bg-slate-900/90 text-white text-xs font-semibold rounded-2xl shadow-xl backdrop-blur-md animate-in fade-in duration-200">
          {toastMsg}
        </div>
      )}

      {/* 架构列表 */}
      <div className="flex-1 px-5 sm:px-7 xl:px-8 py-6">
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
          setIsExtractModalOpen={open => { setFeedSkill(undefined); setIsExtractModalOpen(open); }}
          onFeedSkill={recipe => { setFeedSkill(recipe); setIsExtractModalOpen(true); }}
          setIsCategoryManagerOpen={setIsCategoryManagerOpen}
          onDeleteRecipe={handleDeleteRecipe}
          onApplyRecipe={handleApplyRecipe}
          onSaveEditedRecipe={handleSaveEditedRecipe}
          onCreateCategory={handleCreateCategory}
          onRefreshRecipes={fetchRecipes}
          hiddenOfficialRecipes={hiddenOfficialRecipes}
          onRestoreOfficialRecipe={handleRestoreOfficialRecipe}
          isRestoringOfficial={isRestoringOfficial}
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
        setIsExtractModalOpen={open => { setFeedSkill(undefined); setIsExtractModalOpen(open); }}
          onFeedSkill={recipe => { setFeedSkill(recipe); setIsExtractModalOpen(true); }}
        setIsCategoryManagerOpen={setIsCategoryManagerOpen}
        onDeleteRecipe={handleDeleteRecipe}
        onApplyRecipe={handleApplyRecipe}
        onSaveEditedRecipe={handleSaveEditedRecipe}
        onCreateCategory={handleCreateCategory}
        section="modal"
      />

      <StyleExtractModal
        key={feedSkill?.id || 'new'}
        baseSkill={feedSkill}
        initialImages={[]}
        isOpen={isExtractModalOpen}
        onClose={() => setIsExtractModalOpen(false)}
        onRecipeCreated={(newRecipe) => {
          setRecipes((prev) => [newRecipe, ...prev]);
        }}
      />
    </div>
  );
}
