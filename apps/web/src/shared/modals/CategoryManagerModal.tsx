import { useState, useEffect } from 'react';
import { confirmAction } from '@/shared/utils/confirmAction';
import {
  X, 
  Trash2, 
  Plus, 
  RotateCcw, 
  Check, 
  Tag, 
  FolderOpen
} from 'lucide-react';
import { 
  CategoryItem, 
  getMergedCategories, 
  saveCategoriesList, 
  deleteCategoryItem, 
  resetCategoriesToDefault 
} from '@beike/domain/vision';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  onCategoriesChanged?: (categories: CategoryItem[]) => void;
}

export default function CategoryManagerModal({
  isOpen,
  onClose,
  onCategoriesChanged
}: Props) {
  const [categories, setCategories] = useState<CategoryItem[]>([]);
  const [newCatName, setNewCatName] = useState('');
  const [toastMsg, setToastMsg] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      setCategories(getMergedCategories());
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const showToast = (msg: string) => {
    setToastMsg(msg);
    setTimeout(() => setToastMsg(null), 2500);
  };

  const handleAddCategory = () => {
    if (!newCatName.trim()) {
      showToast('请输入品类名称');
      return;
    }
    const name = newCatName.trim();
    const id = `cat_${Date.now()}`;
    const newCat: CategoryItem = {
      id,
      name: name.startsWith('🏷️') || name.startsWith('📦') || name.startsWith('⛺') || name.startsWith('🚗') || name.startsWith('🎮') || name.startsWith('💻') ? name : `🏷️ ${name}`,
      isCustom: true
    };
    const updated = [...categories, newCat];
    setCategories(updated);
    saveCategoriesList(updated);
    if (onCategoriesChanged) onCategoriesChanged(updated);
    setNewCatName('');
    showToast(`✨ 成功创建新分类【${newCat.name}】！`);
  };

  const handleDelete = async (id: string, name: string) => {
    if (categories.length <= 1) {
      alert('请至少保留一个品类');
      return;
    }
    if (!(await confirmAction(`确定删除品类【${name}】吗？`))) return;
    const updated = deleteCategoryItem(id);
    setCategories(updated);
    if (onCategoriesChanged) onCategoriesChanged(updated);
    showToast(`🗑️ 已删除品类【${name}】`);
  };

  const handleReset = async () => {
    if (!(await confirmAction('确定将品类列表恢复为系统初始默认的 8 个基础分类吗？'))) return;
    const updated = resetCategoriesToDefault();
    setCategories(updated);
    if (onCategoriesChanged) onCategoriesChanged(updated);
    showToast('↺ 已成功恢复系统默认分类！');
  };

  return (
    <div className="fixed inset-0 z-[90] flex items-center justify-center bg-slate-950/15 p-4 backdrop-blur-[2px] animate-fade-in select-none">
      <div 
        className="w-full max-w-[680px] max-h-[90vh] overflow-hidden rounded-[20px] border border-slate-200/80 bg-white text-slate-900 shadow-[0_20px_48px_-28px_rgba(15,23,42,0.3)] flex flex-col animate-scale-up"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between gap-5 px-5 pb-3 pt-4 sm:px-6">
          <div className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-rose-50 ring-1 ring-rose-100">
              <FolderOpen className="h-3.5 w-3.5 text-rose-500" />
            </div>
            <div>
              <h3 className="flex items-center gap-2 text-sm font-black tracking-tight">
                <span>行业品类与分类管理</span>
                <span className="px-2 py-0.5 rounded-full bg-indigo-100 text-indigo-700 text-[11px] font-bold">
                  {categories.length} 个分类
                </span>
              </h3>
              <p className="mt-0.5 text-[11px] text-slate-400">
                可自由删除内置或自定义分类，或根据需求创建新分类
              </p>
            </div>
          </div>
          <button 
            onClick={onClose}
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700 cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Toast Alert */}
        {toastMsg && (
          <div className="bg-indigo-600 text-white text-xs font-bold py-2 px-4 text-center animate-fade-in flex items-center justify-center gap-2 shadow-inner">
            <Check className="w-4 h-4" />
            <span>{toastMsg}</span>
          </div>
        )}

        {/* Add Category Section */}
        <div className="border-y border-slate-100 px-5 py-3 sm:px-6">
          <div className="flex items-center gap-2">
            <div className="relative flex-1">
              <Tag className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                value={newCatName}
                onChange={e => setNewCatName(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleAddCategory()}
                placeholder="输入新分类名称 (如：⛺ 户外露营 / 运动装备)"
                className="w-full pl-9 pr-3 py-2 rounded-xl bg-white border border-slate-200 text-xs font-bold text-slate-900 outline-none focus:border-indigo-500 shadow-xs"
              />
            </div>
            <button
              onClick={handleAddCategory}
              className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold flex items-center gap-1 transition-all shadow-xs cursor-pointer flex-shrink-0"
            >
              <Plus className="w-4 h-4" />
              <span>新建品类</span>
            </button>
          </div>
        </div>

        {/* Category List */}
        <div className="flex-1 space-y-2 overflow-y-auto px-5 py-4 max-h-[420px] scrollbar-thin sm:px-6">
          {categories.map(cat => (
            <div 
              key={cat.id}
              className="flex items-center justify-between p-3 rounded-2xl bg-white border border-slate-200/80 hover:border-indigo-200 hover:shadow-xs transition-all group"
            >
              <div className="flex items-center gap-3">
                <span className="text-sm font-bold text-slate-800">{cat.name}</span>
                {cat.isCustom && (
                  <span className="px-1.5 py-0.5 rounded-md bg-amber-50 text-amber-600 text-[10px] font-bold border border-amber-200">
                    自定义
                  </span>
                )}
              </div>
              <button
                type="button"
                onClick={() => handleDelete(cat.id, cat.name)}
                className="p-1.5 rounded-xl bg-slate-100 hover:bg-red-50 text-slate-400 hover:text-red-600 transition-all cursor-pointer border border-transparent hover:border-red-200"
                title={`删除分类【${cat.name}】`}
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          ))}
        </div>

        {/* Footer Actions */}
        <div className="flex items-center justify-between border-t border-slate-100 bg-slate-50/50 px-5 py-3 sm:px-6">
          <button
            type="button"
            onClick={handleReset}
            className="text-xs text-slate-500 hover:text-slate-800 font-bold flex items-center gap-1.5 cursor-pointer hover:underline transition-colors"
            title="将分类重置为系统出厂默认值"
          >
            <RotateCcw className="w-3.5 h-3.5 text-slate-400" />
            <span>恢复内置默认分类</span>
          </button>
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl bg-slate-950 px-3.5 py-2 text-xs font-bold text-white shadow-sm cursor-pointer transition-colors hover:bg-slate-800"
          >
            完成
          </button>
        </div>
      </div>
    </div>
  );
}
