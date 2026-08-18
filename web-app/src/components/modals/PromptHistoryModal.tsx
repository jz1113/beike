'use client';
import { useState, useEffect } from 'react';
import { useAppStore } from '@/store/useAppStore';
import { 
  X, 
  Search, 
  Trash2, 
  Copy, 
  Check, 
  Sparkles, 
  History, 
  ArrowRight, 
  Sliders,
  BookmarkPlus,
  Layers,
  FileText,
  Plus,
  Edit3,
  Flame
} from 'lucide-react';
import { STYLE_PRESETS, getMergedCategories, DEFAULT_CATEGORIES, CategoryItem } from '@/lib/vision';
import { PromptVaultIcon } from '@/components/common/BrandIcons';
import StyleExtractModal from '@/components/modals/StyleExtractModal';

interface Props {
  isOpen: boolean;
  onClose: () => void;
}

const CATEGORY_NAMES: Record<string, string> = {
  digital_3c: '💻 数码 3C',
  beauty_care: '💄 美妆个护',
  fashion_apparel: '👗 服饰穿搭',
  home_living: '🏠 家居家电',
  food_beverage: '☕ 美食生鲜',
  mother_pets: '🍼 母婴宠物',
  jewelry_luxury: '💎 珠宝首饰',
  buyer_show_classic: '🌐 通用买家秀',
  general: '🌐 通用买家秀'
};

export default function PromptHistoryModal({ isOpen, onClose }: Props) {
  const [activeTab, setActiveTab] = useState<'recipes' | 'history'>('recipes');
  const [records, setRecords] = useState<any[]>([]);
  const [customRecipes, setCustomRecipes] = useState<any[]>([]);
  const [categories, setCategories] = useState<CategoryItem[]>(DEFAULT_CATEGORIES);
  const [isCreatingCategory, setIsCreatingCategory] = useState(false);
  const [newCategoryName, setNewCategoryName] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [isExtractModalOpen, setIsExtractModalOpen] = useState(false);
  
  // 编辑/新建配方弹窗状态
  const [editingRecipe, setEditingRecipe] = useState<any | null>(null);
  const [isUpdatingRecipe, setIsUpdatingRecipe] = useState(false);
  const [toastMsg, setToastMsg] = useState<string | null>(null);
  const [confirmDeleteRecordId, setConfirmDeleteRecordId] = useState<string | null>(null);
  const [confirmDeleteRecipeId, setConfirmDeleteRecipeId] = useState<string | null>(null);
  const [confirmClearAll, setConfirmClearAll] = useState(false);

  const showToast = (msg: string) => {
    setToastMsg(msg);
    setTimeout(() => setToastMsg(null), 2500);
  };

  const { setGeneratedPrompts, setStep, setSelectedStyleId } = useAppStore();

  const fetchRecords = async () => {
    setIsLoading(true);
    try {
      const [pRes, sRes] = await Promise.all([
        fetch('/api/prompts'),
        fetch('/api/styles')
      ]);
      const pData = await pRes.json();
      const sData = await sRes.json();

      if (pData.success) setRecords(pData.records || []);
      if (sData.success) setCustomRecipes(sData.recipes || []);
    } catch (e) {
      console.error(e);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      fetchRecords();
      setCategories(getMergedCategories());
    }
  }, [isOpen]);

  const handleCreateCategoryInModal = () => {
    if (!newCategoryName.trim()) {
      showToast('请输入新商品类目名称');
      return;
    }
    const name = newCategoryName.trim();
    const id = `cat_${Date.now()}`;
    const newCat: CategoryItem = {
      id,
      name: name.startsWith('🏷️') || name.startsWith('📦') || name.startsWith('⛺') || name.startsWith('🚗') ? name : `🏷️ ${name}`,
      isCustom: true
    };
    const updated = [...categories, newCat];
    setCategories(updated);
    localStorage.setItem('custom_categories', JSON.stringify(updated));
    if (editingRecipe) {
      setEditingRecipe({ ...editingRecipe, category: id });
    }
    setIsCreatingCategory(false);
    setNewCategoryName('');
    showToast('新商品类目已添加');
  };

  const getCategoryName = (catId?: string) => {
    if (!catId) return '🌐 通用买家秀';
    const found = categories.find(c => c.id === catId);
    return found ? found.name : (CATEGORY_NAMES[catId] || '🏷️ 自定义品类');
  };

  if (!isOpen) return null;

  // 删除历史分镜记录
  const handleDeletePromptRecord = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (confirmDeleteRecordId !== id) {
      setConfirmDeleteRecordId(id);
      setTimeout(() => setConfirmDeleteRecordId(prev => prev === id ? null : prev), 3500);
      return;
    }
    setConfirmDeleteRecordId(null);
    try {
      await fetch(`/api/prompts?id=${id}`, { method: 'DELETE' });
      setRecords(prev => prev.filter(r => r.id !== id));
      showToast('历史分镜记录已删除');
    } catch (err) {
      showToast('删除分镜记录失败');
    }
  };

  // 清空全部历史记录
  const handleClearAllHistory = async () => {
    if (records.length === 0) return;
    if (!confirmClearAll) {
      setConfirmClearAll(true);
      setTimeout(() => setConfirmClearAll(false), 3500);
      return;
    }
    setConfirmClearAll(false);
    try {
      for (const r of records) {
        await fetch(`/api/prompts?id=${r.id}`, { method: 'DELETE' });
      }
      setRecords([]);
      showToast('所有历史分镜生成记录已清空');
    } catch (err) {
      showToast('清空历史记录失败');
    }
  };

  // 删除自定义配方
  const handleDeleteRecipe = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (confirmDeleteRecipeId !== id) {
      setConfirmDeleteRecipeId(id);
      setTimeout(() => setConfirmDeleteRecipeId(prev => prev === id ? null : prev), 3500);
      return;
    }
    setConfirmDeleteRecipeId(null);
    try {
      await fetch(`/api/styles?id=${id}`, { method: 'DELETE' });
      setCustomRecipes(prev => prev.filter(r => r.id !== id));
      showToast('自定义配方已删除');
    } catch (err) {
      showToast('删除配方失败');
    }
  };

  // 复制全部分镜文字
  const handleCopyAllShots = (record: any, e: React.MouseEvent) => {
    e.stopPropagation();
    const text = (record.prompts || [])
      .map((p: any, idx: number) => `【分镜 ${p.shot_no || idx + 1} - ${p.title}】\n${p.prompt}`)
      .join('\n\n');
    navigator.clipboard.writeText(text);
    setCopiedId(record.id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  // 载入分镜到工坊
  const handleLoadToStudio = (record: any) => {
    setGeneratedPrompts(record.prompts, record.productFingerprint);
    setStep(2);
    onClose();
  };

  // 将历史分镜一键固化为「我的专属配方」
  const handleSavePromptAsRecipe = async (record: any, e: React.MouseEvent) => {
    e.stopPropagation();
    const firstPrompt = record.prompts?.[0]?.prompt || '';
    const snippet = firstPrompt || `${record.styleName || '经典买家秀'}: 真实手机后置实拍，自然生活光线与真实环境接触阴影。`;
    
    try {
      const res = await fetch('/api/styles', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: `${record.productTitle || '精选分镜'} · 专属配方`,
          category: 'general',
          tag: record.styleName || '历史分镜沉淀',
          desc: `由 ${new Date(record.createdAt).toLocaleDateString()} 策划的历史优质分镜固化生成`,
          promptSnippet: snippet
        })
      });
      const data = await res.json();
      if (data.success && data.recipe) {
        setCustomRecipes(prev => [data.recipe, ...prev]);
        setActiveTab('recipes');
        alert('🎉 已成功将该分镜沉淀为「我的专属配方」！');
      }
    } catch (err) {
      console.error('另存为配方失败:', err);
    }
  };


  // 保存新建或编辑后的配方
  const handleSaveEditedRecipe = async () => {
    if (!editingRecipe) return;
    if (!editingRecipe.name?.trim() || !editingRecipe.promptSnippet?.trim()) {
      alert('请填写配方名称和提示词内容');
      return;
    }

    setIsUpdatingRecipe(true);
    try {
      if (editingRecipe.id && !editingRecipe.isNew) {
        // 更新已有配方 (PUT)
        const res = await fetch('/api/styles', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            id: editingRecipe.id,
            name: editingRecipe.name,
            category: editingRecipe.category,
            tag: editingRecipe.tag,
            desc: editingRecipe.desc,
            promptSnippet: editingRecipe.promptSnippet
          })
        });
        const data = await res.json();
        if (data.success) {
          setCustomRecipes(prev => prev.map(r => r.id === editingRecipe.id ? data.recipe : r));
          setEditingRecipe(null);
        }
      } else {
        // 新建全新配方 (POST)
        const res = await fetch('/api/styles', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name: editingRecipe.name,
            category: editingRecipe.category || 'general',
            tag: editingRecipe.tag || '专属配方',
            desc: editingRecipe.desc || '',
            promptSnippet: editingRecipe.promptSnippet
          })
        });
        const data = await res.json();
        if (data.success) {
          setCustomRecipes(prev => [data.recipe, ...prev]);
          setEditingRecipe(null);
        }
      }
    } catch (err) {
      console.error('保存配方失败:', err);
    } finally {
      setIsUpdatingRecipe(false);
    }
  };

  // 应用配方到工坊
  const handleApplyRecipe = (recipe: any) => {
    setSelectedStyleId(recipe.id);
    setStep(2);
    onClose();
  };

  const cleanStyleTitle = (styleStr?: string) => {
    if (!styleStr) return '自由创作风格';
    // 提取第一句或标题部分（按冒号或换行截断）
    const colonIdx = styleStr.indexOf(':');
    const chineseColonIdx = styleStr.indexOf('：');
    let idx = -1;
    if (colonIdx !== -1 && chineseColonIdx !== -1) idx = Math.min(colonIdx, chineseColonIdx);
    else if (colonIdx !== -1) idx = colonIdx;
    else if (chineseColonIdx !== -1) idx = chineseColonIdx;

    if (idx !== -1) {
      return styleStr.slice(0, idx).trim();
    }
    return styleStr.length > 35 ? styleStr.slice(0, 35) + '...' : styleStr;
  };

  const hasStyleDetails = (styleStr?: string) => {
    if (!styleStr) return false;
    return styleStr.includes(':') || styleStr.includes('：') || styleStr.length > 35;
  };

  const cleanStyleDetails = (styleStr?: string) => {
    if (!styleStr) return '';
    const colonIdx = styleStr.indexOf(':');
    const chineseColonIdx = styleStr.indexOf('：');
    let idx = -1;
    if (colonIdx !== -1 && chineseColonIdx !== -1) idx = Math.min(colonIdx, chineseColonIdx);
    else if (colonIdx !== -1) idx = colonIdx;
    else if (chineseColonIdx !== -1) idx = chineseColonIdx;

    if (idx !== -1) {
      return styleStr.slice(idx + 1).trim();
    }
    return styleStr;
  };

  const filteredRecords = records.filter(r => 
    (r.productTitle || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
    (r.styleName || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
    (r.productFingerprint || '').toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-md p-4 sm:p-6 animate-fade-in select-none">
      {/* 悬浮 Toast */}
      {toastMsg && (
        <div className="fixed top-8 left-1/2 -translate-x-1/2 z-60 animate-bounce-in">
          <div className="px-4 py-2 rounded-2xl bg-slate-950/90 backdrop-blur-md border border-slate-700 text-white text-xs font-bold shadow-2xl flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-amber-400" />
            <span>{toastMsg}</span>
          </div>
        </div>
      )}

      <div 
        className="w-full max-w-5xl rounded-3xl bg-white border border-slate-200/90 shadow-2xl overflow-hidden flex flex-col max-h-[90vh]"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="p-5 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-2xl bg-indigo-50 border border-indigo-100 flex items-center justify-center text-indigo-600">
              <Sparkles className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-sm font-bold text-slate-900 tracking-wide">视觉提示词架构与历史库</h3>
                <span className="px-2 py-0.5 rounded-full bg-indigo-50 border border-indigo-100 text-indigo-700 text-[10px] font-mono font-bold">
                  品类专属架构
                </span>
              </div>
              <p className="text-xs text-slate-500 font-normal">
                管理、修改与复用品类专属提示词架构，支持一键调入工坊继续生图
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => setIsExtractModalOpen(true)}
              className="px-3 py-1.5 rounded-xl bg-gradient-to-r from-pink-600 to-indigo-600 hover:from-pink-500 hover:to-indigo-500 text-white text-xs font-bold flex items-center gap-1.5 transition-all shadow-sm cursor-pointer"
            >
              <Sparkles className="w-3.5 h-3.5" />
              <span>+ 架构推理</span>
            </button>
            <button
              onClick={onClose}
              className="p-2 rounded-xl text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Tab Navigation */}
        <div className="px-5 pt-3 border-b border-slate-200/80 bg-slate-50/50 flex items-center justify-between">
          <div className="flex gap-2">
            {/* TAB 1: 我的专属配方 */}
            <button
              onClick={() => setActiveTab('recipes')}
              className={`pb-3 px-3 text-xs font-semibold flex items-center gap-1.5 border-b-2 transition-all cursor-pointer ${
                activeTab === 'recipes'
                  ? 'border-indigo-600 text-indigo-600 font-bold'
                  : 'border-transparent text-slate-500 hover:text-slate-800'
              }`}
            >
              <Sparkles className="w-3.5 h-3.5" />
              <span>我的专属架构库 ({customRecipes.length})</span>
            </button>

            {/* TAB 2: 历史生成分镜 */}
            <button
              onClick={() => setActiveTab('history')}
              className={`pb-3 px-3 text-xs font-semibold flex items-center gap-1.5 border-b-2 transition-all cursor-pointer ${
                activeTab === 'history'
                  ? 'border-indigo-600 text-indigo-600 font-bold'
                  : 'border-transparent text-slate-500 hover:text-slate-800'
              }`}
            >
              <History className="w-3.5 h-3.5" />
              <span>历史生成分镜 ({records.length})</span>
            </button>
          </div>

          {activeTab === 'history' ? (
            <div className="flex items-center gap-2 mb-2">
              <div className="relative">
                <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  type="text"
                  value={searchTerm}
                  onChange={e => setSearchTerm(e.target.value)}
                  placeholder="搜索商品名或风格..."
                  className="pl-8 pr-3 py-1 rounded-xl bg-white border border-slate-200 text-slate-900 text-xs outline-none focus:border-indigo-500 transition-colors shadow-sm"
                />
              </div>
              {records.length > 0 && (
                <button
                  onClick={handleClearAllHistory}
                  className={`px-2.5 py-1 rounded-xl text-[11px] font-bold transition-all cursor-pointer border ${
                    confirmClearAll
                      ? 'bg-red-600 text-white border-red-600 animate-pulse'
                      : 'text-slate-400 hover:text-red-600 hover:bg-red-50 border-transparent'
                  }`}
                  title={confirmClearAll ? "再次点击确认清空所有历史" : "清空历史记录"}
                >
                  {confirmClearAll ? '确认清空所有?' : '清空'}
                </button>
              )}
            </div>
          ) : activeTab === 'recipes' ? (
            <button
              onClick={() => setEditingRecipe({
                name: '新建品类摄影架构',
                category: 'general',
                tag: '自定义标签',
                desc: '适用生活化拍摄与买家秀质感模拟',
                promptSnippet: '真实手机后置镜头实拍，自然生活光线，真实接触阴影与生活化微瑕疵，去商业棚拍感，纯中文生动描写。',
                isNew: true
              })}
              className="mb-2 px-3 py-1 rounded-xl bg-indigo-50 hover:bg-indigo-100 text-indigo-700 text-xs font-bold flex items-center gap-1 transition-colors cursor-pointer border border-indigo-200"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>+ 手动创建架构</span>
            </button>
          ) : null}
        </div>

        {/* Body Content Area */}
        <div className="flex-1 overflow-y-auto p-6 space-y-4">
          {/* TAB 1: 我的专属爆款配方库 */}
          {activeTab === 'recipes' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
                  <Sparkles className="w-3.5 h-3.5 text-indigo-600" />
                  已沉淀的品类风格架构 ({customRecipes.length})
                </span>
                <div className="flex items-center gap-3">
                  <button
                    onClick={() => setIsExtractModalOpen(true)}
                    className="text-xs text-indigo-600 hover:text-indigo-700 font-bold flex items-center gap-1 hover:underline cursor-pointer"
                  >
                    <Sparkles className="w-3.5 h-3.5" />
                    <span>从样张/图片进行架构推理</span>
                  </button>
                </div>
              </div>

              {customRecipes.length === 0 ? (
                <div className="py-16 text-center text-slate-400 flex flex-col items-center gap-3 bg-slate-50 rounded-3xl border border-dashed border-slate-200">
                  <div className="w-12 h-12 rounded-2xl bg-indigo-50 flex items-center justify-center text-indigo-600">
                    <Sparkles className="w-6 h-6" />
                  </div>
                  <div className="space-y-1">
                    <span className="font-bold text-sm text-slate-700">暂无自定义品类架构</span>
                    <p className="text-xs text-slate-500 max-w-sm">
                      您可以上传任意爆款美图，由 AI 自动解构提炼置景光影与摄影架构
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => setIsExtractModalOpen(true)}
                      className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold transition-all shadow-sm cursor-pointer flex items-center gap-1.5"
                    >
                      <Sparkles className="w-3.5 h-3.5" />
                      <span>✨ 架构推理提炼</span>
                    </button>
                  </div>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {customRecipes.map((recipe) => (
                    <div
                      key={recipe.id}
                      className="p-4 rounded-2xl bg-white border border-slate-200 hover:border-indigo-300 hover:shadow-md transition-all space-y-3 flex flex-col justify-between"
                    >
                      <div className="space-y-2.5">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2 min-w-0">
                            {recipe.coverUrl ? (
                              <img src={recipe.coverUrl} alt="" className="w-8 h-8 rounded-xl object-cover border border-slate-200 flex-shrink-0" />
                            ) : (
                              <div className="w-8 h-8 rounded-xl bg-purple-50 flex items-center justify-center text-purple-600 flex-shrink-0 font-bold">
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
                            {CATEGORY_NAMES[recipe.category] || recipe.category}
                          </span>
                        </div>

                        <p className="text-xs text-slate-700 leading-relaxed font-mono bg-slate-50 p-2.5 rounded-xl border border-slate-100 max-h-24 overflow-y-auto">
                          {recipe.promptSnippet}
                        </p>
                      </div>

                      <div className="flex items-center justify-between pt-2 border-t border-slate-100">
                        <span className="text-[10px] text-slate-400 font-mono">
                          {new Date(recipe.createdAt).toLocaleDateString()}
                        </span>

                        <div className="flex items-center gap-1.5">
                          {/* ✏️ 编辑按钮 */}
                          <button
                            onClick={() => setEditingRecipe({ ...recipe })}
                            className="p-1.5 rounded-lg text-slate-500 hover:text-indigo-600 hover:bg-indigo-50 transition-colors cursor-pointer"
                            title="修改配方名称、分类与提示词"
                          >
                            <Edit3 className="w-3.5 h-3.5" />
                          </button>
                          
                          {/* 🗑️ 删除按钮 */}
                          <button
                            onClick={(e) => handleDeleteRecipe(recipe.id, e)}
                            className={`p-1.5 rounded-lg transition-all cursor-pointer border ${
                              confirmDeleteRecipeId === recipe.id
                                ? 'bg-red-600 text-white border-red-600 animate-pulse'
                                : 'text-slate-400 hover:text-red-600 hover:bg-red-50 border-transparent'
                            }`}
                            title={confirmDeleteRecipeId === recipe.id ? "再次点击确认删除" : "删除配方"}
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>

                          {/* 复制 */}
                          <button
                            onClick={() => {
                              navigator.clipboard.writeText(recipe.promptSnippet);
                              setCopiedId(recipe.id);
                              setTimeout(() => setCopiedId(null), 2000);
                            }}
                            className="px-2 py-1 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-medium flex items-center gap-1 transition-colors cursor-pointer"
                          >
                            {copiedId === recipe.id ? <Check className="w-3 h-3 text-emerald-600" /> : <Copy className="w-3 h-3" />}
                            <span>复制</span>
                          </button>

                          {/* 应用 */}
                          <button
                            onClick={() => handleApplyRecipe(recipe)}
                            className="px-2.5 py-1 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold flex items-center gap-1 transition-colors shadow-xs cursor-pointer"
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

          {/* TAB 2: 历史生成记录 (支持删除与另存为专属配方) */}
          {activeTab === 'history' && (
            <div className="space-y-4">
              {filteredRecords.length === 0 ? (
                <div className="py-20 text-center text-slate-400 flex flex-col items-center gap-2">
                  <History className="w-10 h-10 opacity-30" />
                  <span className="font-bold text-slate-600">暂无符合条件的提示词历史</span>
                  <span className="text-xs text-slate-500">在工坊策划过的分镜提示词将自动在此归档</span>
                </div>
              ) : (
                filteredRecords.map((r) => (
                  <div
                    key={r.id}
                    className="p-5 rounded-2xl bg-white border border-slate-200/90 hover:border-indigo-300 hover:shadow-md transition-all space-y-3.5"
                  >
                    {/* 卡片顶部：左侧商品标题与徽标，右侧操作按钮栏 */}
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-100">
                      {/* 左侧：标题与元信息徽章 */}
                      <div className="min-w-0 flex-1 space-y-1.5">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="w-6 h-6 rounded-lg bg-indigo-50 text-indigo-600 flex items-center justify-center flex-shrink-0 text-xs font-bold shadow-2xs">
                            📦
                          </span>
                          <h4 className="text-sm font-bold text-slate-900 truncate max-w-xl" title={r.productTitle}>
                            {r.productTitle || '未命名商品策划'}
                          </h4>
                        </div>

                        {/* 元信息徽章栏 */}
                        <div className="flex items-center gap-2 flex-wrap text-xs text-slate-500">
                          {/* 风格名称徽章 */}
                          <span 
                            className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-indigo-50/90 text-indigo-700 font-semibold text-[11px] border border-indigo-200/70 max-w-xs truncate" 
                            title={r.styleName}
                          >
                            <Sparkles className="w-3 h-3 text-indigo-500 flex-shrink-0" />
                            <span className="truncate">{cleanStyleTitle(r.styleName)}</span>
                          </span>

                          {/* 模型徽章 */}
                          <span className="inline-flex items-center px-2 py-0.5 rounded-md bg-slate-100 text-slate-600 font-mono text-[11px]">
                            模型: {r.modelUsed || 'AI Vision'}
                          </span>

                          {/* 分镜数量徽章 */}
                          <span className="inline-flex items-center px-2 py-0.5 rounded-md bg-purple-50 text-purple-700 font-mono text-[11px] font-semibold border border-purple-100">
                            {r.prompts?.length || 0} 组分镜
                          </span>

                          {/* 生成时间 */}
                          <span className="text-[11px] text-slate-400 font-mono">
                            {new Date(r.createdAt).toLocaleString('zh-CN', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                          </span>
                        </div>
                      </div>

                      {/* 右侧：操作按钮栏（固定防挤压） */}
                      <div className="flex items-center gap-2 flex-shrink-0">
                        {/* 📌 另存为配方 */}
                        <button
                          onClick={(e) => handleSavePromptAsRecipe(r, e)}
                          className="px-3 py-1.5 rounded-xl bg-pink-50 hover:bg-pink-100 text-pink-700 text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer border border-pink-200/70 shadow-2xs whitespace-nowrap"
                          title="将这套分镜提示词保存为我的专属配方模板"
                        >
                          <BookmarkPlus className="w-3.5 h-3.5 text-pink-600" />
                          <span>另存为配方</span>
                        </button>

                        {/* 复制全部分镜 */}
                        <button
                          onClick={(e) => handleCopyAllShots(r, e)}
                          className="px-3 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold flex items-center gap-1.5 transition-all cursor-pointer border border-slate-200/60 shadow-2xs whitespace-nowrap"
                          title="一键复制全部提示词文本"
                        >
                          {copiedId === r.id ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
                          <span>{copiedId === r.id ? '已复制' : '复制全部分镜'}</span>
                        </button>

                        {/* 载入工坊 */}
                        <button
                          onClick={() => handleLoadToStudio(r)}
                          className="px-3.5 py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold shadow-xs flex items-center gap-1.5 transition-all cursor-pointer whitespace-nowrap"
                          title="将该历史分镜调入工坊继续生图"
                        >
                          <span>载入工坊</span>
                          <ArrowRight className="w-3.5 h-3.5" />
                        </button>

                        {/* 🗑️ 删除单条历史 */}
                        <button
                          onClick={(e) => handleDeletePromptRecord(r.id, e)}
                          className={`p-1.5 rounded-xl transition-all cursor-pointer border ${
                            confirmDeleteRecordId === r.id
                              ? 'bg-red-600 text-white border-red-600 animate-pulse'
                              : 'text-slate-400 hover:text-red-600 hover:bg-red-50 border-slate-200/60'
                          }`}
                          title={confirmDeleteRecordId === r.id ? "再次点击确认删除" : "删除该条历史"}
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>

                    {/* 配方/置景设定描述（若存在较长内容） */}
                    {hasStyleDetails(r.styleName) && (
                      <div className="p-2.5 rounded-xl bg-slate-50/80 border border-slate-100 text-xs text-slate-600 leading-relaxed">
                        <span className="font-bold text-slate-700 mr-1.5">🎨 拍摄配方/置景设定:</span>
                        <span className="text-slate-600 line-clamp-2">{cleanStyleDetails(r.styleName)}</span>
                      </div>
                    )}

                    {/* 分镜网格展示 */}
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2.5 pt-1">
                      {(r.prompts || []).map((p: any, idx: number) => (
                        <div 
                          key={idx} 
                          className="p-3 rounded-xl bg-slate-50/70 border border-slate-200/70 hover:bg-slate-50 hover:border-indigo-200 transition-all flex flex-col justify-between space-y-1.5"
                        >
                          <div className="flex items-center justify-between gap-1">
                            <span className="font-bold text-indigo-700 text-xs font-mono flex items-center gap-1 truncate">
                              <span>SHOT {p.shot_no || idx + 1}:</span>
                              <span className="truncate text-slate-800 font-semibold">{p.title || `分镜 ${idx + 1}`}</span>
                            </span>
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                navigator.clipboard.writeText(p.prompt);
                                showToast(`分镜 ${p.shot_no || idx + 1} 提示词已复制`);
                              }}
                              className="p-1 rounded text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 transition-colors flex-shrink-0 cursor-pointer"
                              title="复制单镜提示词"
                            >
                              <Copy className="w-3 h-3" />
                            </button>
                          </div>
                          <p className="text-xs text-slate-600 leading-relaxed line-clamp-3 font-normal">
                            {p.prompt}
                          </p>
                        </div>
                      ))}
                    </div>
                  </div>
                ))
              )}
            </div>
          )}
        </div>
      </div>

      {/* 🌟 配方编辑/新建弹窗 (修改配方名称、品类、标签与提示词) */}
      {editingRecipe && (
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
                    <button
                      type="button"
                      onClick={() => setIsCreatingCategory(!isCreatingCategory)}
                      className="text-[10px] text-indigo-600 hover:text-indigo-700 font-bold hover:underline cursor-pointer flex items-center gap-0.5"
                    >
                      <Plus className="w-3 h-3" />
                      <span>{isCreatingCategory ? '选择已有' : '+ 新建品类'}</span>
                    </button>
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
                        onClick={handleCreateCategoryInModal}
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
                onClick={handleSaveEditedRecipe}
                disabled={isUpdatingRecipe}
                className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold transition-all shadow-sm cursor-pointer disabled:opacity-50"
              >
                {isUpdatingRecipe ? '保存中...' : '确认保存配方'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Style Reverse-Engineering Modal */}
      <StyleExtractModal
        isOpen={isExtractModalOpen}
        onClose={() => setIsExtractModalOpen(false)}
        onRecipeCreated={(newRecipe) => {
          setCustomRecipes(prev => [newRecipe, ...prev]);
        }}
      />
    </div>
  );
}
