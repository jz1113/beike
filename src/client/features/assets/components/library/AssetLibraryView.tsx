import { useState, useEffect, useMemo, useCallback } from 'react';
import { ChevronDown, Plus, Search, Trash2, User, Package, Mic, FileText } from 'lucide-react';
import { useI18n } from '@client/shared/i18n';
import {
  loadCustomAssets,
  deleteCustomAsset,
  type CustomAssetCategory,
  type CustomAssetItem,
} from '../../model/customAssetStore';
import CreateAssetModal from '../dialogs/CreateAssetModal';

interface CategoryConfig {
  id: CustomAssetCategory;
  name: string;
  emptyTitle: string;
  emptyDesc: string;
  addButton: string;
}

export default function AssetLibraryView() {
  const { t, locale } = useI18n();
  const [activeCategory, setActiveCategory] = useState<CustomAssetCategory>('character');
  const [items, setItems] = useState<CustomAssetItem[]>([]);
  const [searchInput, setSearchInput] = useState('');
  const [sortOrder, setSortOrder] = useState<'newest' | 'oldest' | 'name'>('newest');
  const [isModalOpen, setIsModalOpen] = useState(false);

  const categories: CategoryConfig[] = useMemo(() => [
    {
      id: 'character',
      name: t('assets.categories.character'),
      emptyTitle: t('assets.noAssets'),
      emptyDesc: locale === 'zh-CN' ? '把常用的人物图片定义为你的角色资产' : locale === 'en-US' ? 'Define reusable character images for your creations' : locale === 'ja-JP' ? 'よく使うキャラクター画像をアセットとして登録できます' : '자주 사용하는 캐릭터 이미지를 에셋으로 등록하세요',
      addButton: t('assets.categories.addCharacter'),
    },
    {
      id: 'product',
      name: t('assets.categories.product'),
      emptyTitle: t('assets.noAssets'),
      emptyDesc: locale === 'zh-CN' ? '把常用的商品图片定义为你的商品资产' : locale === 'en-US' ? 'Define reusable product images for your creations' : locale === 'ja-JP' ? 'よく使う商品画像をアセットとして登録できます' : '자주 사용하는 상품 이미지를 에셋으로 등록하세요',
      addButton: t('assets.categories.addProduct'),
    },
    {
      id: 'voice',
      name: t('assets.categories.voice'),
      emptyTitle: t('assets.noAssets'),
      emptyDesc: locale === 'zh-CN' ? '把常用的声音音色定义为你的音色资产' : locale === 'en-US' ? 'Define reusable voice assets for your creations' : locale === 'ja-JP' ? 'よく使う音声をアセットとして登録できます' : '자주 사용하는 음성을 에셋으로 등록하세요',
      addButton: t('assets.categories.addVoice'),
    },
    {
      id: 'file',
      name: t('assets.categories.file'),
      emptyTitle: t('assets.noAssets'),
      emptyDesc: locale === 'zh-CN' ? '把常用的参考文件或文档沉淀为你的文件资产' : locale === 'en-US' ? 'Store reference files and documents as reusable assets' : locale === 'ja-JP' ? '参考ファイルやドキュメントをアセットとして管理できます' : '참고 파일이나 문서를 에셋으로 관리하세요',
      addButton: t('assets.categories.addFile'),
    },
  ], [t, locale]);

  const refreshItems = useCallback(() => {
    setItems(loadCustomAssets());
  }, []);

  useEffect(() => {
    refreshItems();
    const handleUpdate = () => refreshItems();
    window.addEventListener('beike:custom_assets_updated', handleUpdate);
    return () => window.removeEventListener('beike:custom_assets_updated', handleUpdate);
  }, [refreshItems]);

  const currentCategoryConfig = useMemo(() => {
    return categories.find((c) => c.id === activeCategory) || categories[0];
  }, [categories, activeCategory]);

  const filteredItems = useMemo(() => {
    const list = items.filter((item) => item.category === activeCategory);
    const kw = searchInput.trim().toLowerCase();
    const searched = kw
      ? list.filter(
          (item) =>
            item.name.toLowerCase().includes(kw) ||
            item.description?.toLowerCase().includes(kw) ||
            item.tags?.some((t) => t.toLowerCase().includes(kw))
        )
      : list;

    return searched.sort((a, b) => {
      if (sortOrder === 'name') return a.name.localeCompare(b.name, 'zh-CN');
      if (sortOrder === 'oldest') return a.createdAt - b.createdAt;
      return b.createdAt - a.createdAt;
    });
  }, [items, activeCategory, searchInput, sortOrder]);

  const handleDelete = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    deleteCustomAsset(id);
    refreshItems();
  };

  return (
    <div className="flex flex-col min-h-0 flex-1">
      {/* 顶部控制栏 (对应图3) */}
      <div className="flex flex-wrap items-center justify-between gap-3 pt-2 pb-4">
        {/* 左侧：分类胶囊 (角色 | 商品 | 音色 | 文件) */}
        <div className="inline-flex items-center gap-1.5 p-1 rounded-xl bg-slate-100 dark:bg-white/5 border border-slate-200/60 dark:border-white/10 shadow-2xs">
          {categories.map((c) => {
            const isActive = activeCategory === c.id;
            return (
              <button
                key={c.id}
                type="button"
                onClick={() => setActiveCategory(c.id)}
                className={`px-3.5 py-1 rounded-lg text-xs transition-all ${
                  isActive
                    ? 'bg-white dark:bg-[#20252F] text-slate-900 dark:text-white font-bold shadow-2xs'
                    : 'text-slate-500 dark:text-[#8E8E93] hover:text-slate-800 dark:hover:text-white font-medium'
                }`}
              >
                {c.name}
              </button>
            );
          })}
        </div>

        {/* 右侧：搜索 + 排序 */}
        <div className="flex items-center gap-2.5 shrink-0">
          <div className="relative flex items-center">
            <Search className="w-3.5 h-3.5 absolute left-3 pointer-events-none text-slate-400 dark:text-slate-500" />
            <input
              type="text"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              placeholder={t('assets.searchPlaceholder')}
              className="w-40 pl-8 pr-3 py-1 rounded-full bg-slate-100 dark:bg-white/5 hover:bg-slate-200/60 dark:hover:bg-white/10 text-xs text-slate-800 dark:text-slate-200 placeholder-slate-400 dark:placeholder-slate-500 border border-transparent dark:border-white/10 outline-none transition-all h-8"
            />
          </div>

          <div className="relative flex items-center">
            <select
              value={sortOrder}
              onChange={(e) => setSortOrder(e.target.value as typeof sortOrder)}
              className="appearance-none pl-3 pr-7 py-1 rounded-xl bg-slate-100 dark:bg-white/5 hover:bg-slate-200/60 dark:hover:bg-white/10 text-slate-700 dark:text-slate-200 border border-transparent dark:border-white/10 text-xs font-medium outline-none cursor-pointer h-8"
            >
              <option value="newest">{t('assets.sort')}: {t('assets.sortNewest')}</option>
              <option value="oldest">{t('assets.sort')}: {t('assets.sortOldest')}</option>
              <option value="name">{t('assets.sort')}: {t('assets.sortName')}</option>
            </select>
            <ChevronDown className="w-3 h-3 text-slate-400 dark:text-slate-500 absolute right-2 pointer-events-none" />
          </div>

          {filteredItems.length > 0 && (
            <button
              type="button"
              onClick={() => setIsModalOpen(true)}
              className="flex items-center gap-1 rounded-full bg-slate-900 dark:bg-white px-3.5 py-1 text-xs font-semibold text-white dark:text-slate-900 hover:bg-slate-800 dark:hover:bg-slate-200 transition-colors h-8"
            >
              <Plus className="h-3.5 w-3.5" />
              <span>{currentCategoryConfig.addButton}</span>
            </button>
          )}
        </div>
      </div>

      {/* 主展示区：空态 (对应图3) 或 卡片列表 */}
      {filteredItems.length === 0 ? (
        <div className="flex min-h-[460px] flex-1 flex-col items-center justify-center text-center px-4 animate-in fade-in duration-200">
          {/* 精美卡片叠放插图 (对应图3效果) */}
          <div className="relative flex h-24 w-32 items-center justify-center mb-4">
            {/* 底层斜卡片 */}
            <div className="absolute h-16 w-20 rounded-lg bg-amber-800/40 dark:bg-amber-700/30 rotate-12 shadow-sm transform -translate-x-1 translate-y-1" />
            {/* 中层斜卡片 */}
            <div className="absolute h-16 w-20 rounded-lg bg-slate-400/50 dark:bg-slate-600/30 -rotate-6 shadow-sm transform translate-x-1" />
            {/* 顶层主卡片 */}
            <div className="relative h-16 w-20 rounded-lg bg-white dark:bg-[#1E1E22] border border-slate-200 dark:border-white/10 shadow-md flex items-center justify-center overflow-hidden">
              {activeCategory === 'character' ? (
                <User className="h-7 w-7 text-slate-400" />
              ) : activeCategory === 'product' ? (
                <Package className="h-7 w-7 text-slate-400" />
              ) : activeCategory === 'voice' ? (
                <Mic className="h-7 w-7 text-slate-400" />
              ) : (
                <FileText className="h-7 w-7 text-slate-400" />
              )}
            </div>
          </div>

          {/* 标题 */}
          <h3 className="text-sm font-bold text-slate-800 dark:text-slate-100">
            {currentCategoryConfig.emptyTitle}
          </h3>

          {/* 引导文案 */}
          <p className="mt-1 text-xs text-slate-400 dark:text-slate-400 max-w-sm">
            {currentCategoryConfig.emptyDesc}
          </p>

          {/* 黑色胶囊新增按钮 (对应图3) */}
          <button
            type="button"
            onClick={() => setIsModalOpen(true)}
            className="mt-5 flex items-center gap-1.5 rounded-full bg-slate-950 dark:bg-white px-5 py-2 text-xs font-semibold text-white dark:text-slate-900 shadow-sm hover:bg-slate-800 dark:hover:bg-slate-200 active:scale-95 transition-all cursor-pointer"
          >
            <Plus className="h-3.5 w-3.5" />
            <span>{currentCategoryConfig.addButton}</span>
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-4 pt-2 pb-12">
          {filteredItems.map((item) => (
            <div
              key={item.id}
              className="group relative flex flex-col rounded-2xl border border-slate-200/80 dark:border-white/10 bg-white dark:bg-[#1B1B1E] p-2.5 shadow-2xs hover:shadow-md transition-all"
            >
              {/* 删除按钮 */}
              <button
                type="button"
                onClick={(e) => handleDelete(item.id, e)}
                title={t('common.delete')}
                className="absolute right-2 top-2 z-20 flex h-6 w-6 items-center justify-center rounded-lg bg-white/90 dark:bg-[#141416]/90 text-slate-400 dark:text-slate-400 opacity-0 group-hover:opacity-100 hover:bg-red-50 dark:hover:bg-red-950/40 hover:text-red-600 dark:hover:text-red-400 transition-all shadow-xs"
              >
                <Trash2 className="h-3 w-3" />
              </button>

              {/* 封面或媒体缩略图 */}
              <div className="aspect-square w-full overflow-hidden rounded-xl bg-slate-100 dark:bg-white/5 flex items-center justify-center">
                {item.coverUrl ? (
                  <img src={item.coverUrl} alt="" className="h-full w-full object-cover" />
                ) : activeCategory === 'voice' ? (
                  <Mic className="h-8 w-8 text-indigo-400" />
                ) : activeCategory === 'file' ? (
                  <FileText className="h-8 w-8 text-sky-400" />
                ) : activeCategory === 'product' ? (
                  <Package className="h-8 w-8 text-emerald-400" />
                ) : (
                  <User className="h-8 w-8 text-indigo-400" />
                )}
              </div>

              {/* 信息 */}
              <div className="mt-2 w-full px-0.5">
                <p className="truncate text-xs font-semibold text-slate-800 dark:text-slate-200" title={item.name}>
                  {item.name}
                </p>
                {item.description && (
                  <p className="mt-0.5 truncate text-[11px] text-slate-400" title={item.description}>
                    {item.description}
                  </p>
                )}
                {item.tags && item.tags.length > 0 && (
                  <div className="mt-1.5 flex flex-wrap gap-1">
                    {item.tags.slice(0, 2).map((t, idx) => (
                      <span
                        key={idx}
                        className="rounded-md bg-slate-100 dark:bg-white/10 px-1.5 py-0.5 text-[10px] text-slate-500 dark:text-slate-400"
                      >
                        {t}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* 新增资产弹窗 */}
      <CreateAssetModal
        category={activeCategory}
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        onSuccess={() => refreshItems()}
      />
    </div>
  );
}
