'use client';
import { useState, useEffect } from 'react';
import { confirmAction } from '@/lib/confirmAction';
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
} from '@/lib/vision';

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
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4 animate-fade-in select-none">
      <div 
        className="w-full max-w-lg bg-white rounded-3xl shadow-2xl border border-slate-200 overflow-hidden flex flex-col max-h-[85vh] animate-scale-up"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between bg-gradient-to-r from-indigo-50/80 via-white to-slate-50">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-2xl bg-indigo-600 text-white flex items-center justify-center shadow-md">
              <FolderOpen className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
                <span>行业品类与分类管理</span>
                <span className="px-2 py-0.5 rounded-full bg-indigo-100 text-indigo-700 text-[11px] font-bold">
                  {categories.length} 个分类
                </span>
              </h3>
              <p className="text-xs text-slate-500 mt-0.5">
                可自由删除内置或自定义分类，或根据需求创建新分类
              </p>
            </div>
          </div>
          <button 
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-600 flex items-center justify-center transition-colors cursor-pointer"
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
        <div className="p-4 bg-slate-50/80 border-b border-slate-100">
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
        <div className="p-4 overflow-y-auto flex-1 space-y-2 max-h-[420px] scrollbar-thin">
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
        <div className="p-4 border-t border-slate-100 bg-slate-50/50 flex items-center justify-between">
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
            className="px-5 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold cursor-pointer transition-all shadow-xs"
          >
            完成
          </button>
        </div>
      </div>
    </div>
  );
}
