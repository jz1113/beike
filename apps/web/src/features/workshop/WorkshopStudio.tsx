import { useState } from 'react';
import { useAppStore } from '@/store';
import BatchWorkshopView from './components/BatchWorkshopView';
import { WorkshopTopBar } from './components/WorkshopTopBar';
import { WorkshopSideCapsuleBar } from './components/WorkshopSideCapsuleBar';
import WorkshopRecipeView from './views/WorkshopRecipeView';
import WorkshopProductCategoryView from './views/WorkshopProductCategoryView';
import AssetPromptLibrary from '@/features/assets/components/AssetPromptLibrary';

interface Props {
  onOpenSettings?: () => void;
}

export default function WorkshopStudio({
  onOpenSettings,
}: Props) {
  void onOpenSettings;
  const [assetToolbarTarget, setAssetToolbarTarget] = useState<HTMLDivElement | null>(null);
  const activeWorkshopTab = useAppStore((s) => s.activeWorkshopTab);
  const setActiveWorkshopTab = useAppStore((s) => s.setActiveWorkshopTab);

  return (
    <div className="flex-1 flex flex-col min-w-0 h-full overflow-hidden bg-transparent relative select-none">
      {/* 顶部右侧模块导航；内容区域不再为旧版侧边栏预留空白 */}
      <WorkshopSideCapsuleBar
        activeTab={activeWorkshopTab}
        onSelectTab={setActiveWorkshopTab}
      />

      {/* 仅在非 studio 工作台（资产库/拍摄架构/商品类目）时在顶级呈现顶栏；studio 工作台由 BatchWorkshopView 统一承载带步骤导轨的单层顶栏 */}
      {activeWorkshopTab !== 'studio' && (
        <WorkshopTopBar
          assetToolbarRef={setAssetToolbarTarget}
          activeTab={activeWorkshopTab}
          onSelectTab={setActiveWorkshopTab}
        />
      )}

      {activeWorkshopTab !== 'studio' && <section aria-label="资源管理导航" className="mx-4 mb-2 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-slate-200 bg-white/80 px-4 py-3 text-xs sm:mx-6">
        <div><strong className="text-slate-800">资源管理 · {activeWorkshopTab === 'prompt_assets' ? '图组与替换资产' : activeWorkshopTab === 'recipes' ? '拍摄架构' : '商品类目'}</strong>
          <p className="mt-1 text-slate-500">这是创作的准备区，不是生产步骤；返回后继续当前批次，不会新建或覆盖任务。</p></div>
        <button type="button" onClick={() => setActiveWorkshopTab('studio')} className="rounded-lg bg-indigo-600 px-3 py-2 font-semibold text-white">返回当前创作</button>
      </section>}

      {/* 核心工作区内容渲染 */}
      <div className="flex-1 flex flex-col min-h-0 overflow-hidden relative z-10">
        <div className={activeWorkshopTab === 'studio' ? 'flex-1 flex flex-col min-h-0' : 'hidden'}>
          <BatchWorkshopView />
        </div>

        {activeWorkshopTab === 'prompt_assets' && (
          <AssetPromptLibrary toolbarTarget={assetToolbarTarget} onEnterWorkshop={() => setActiveWorkshopTab('studio')} />
        )}

        {activeWorkshopTab === 'recipes' && (
          <WorkshopRecipeView onEnterStudio={() => setActiveWorkshopTab('studio')} />
        )}

        {activeWorkshopTab === 'categories' && (
          <WorkshopProductCategoryView onEnterStudio={() => setActiveWorkshopTab('studio')} />
        )}
      </div>
    </div>
  );
}
