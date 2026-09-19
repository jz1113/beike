import { useState } from 'react';
import { useAppStore } from '@/store/useAppStore';
import BatchWorkshopView from './batch/BatchWorkshopView';
import { WorkshopTopBar } from './components/WorkshopTopBar';
import { WorkshopSideCapsuleBar } from './components/WorkshopSideCapsuleBar';
import WorkshopRecipeView from './views/WorkshopRecipeView';
import WorkshopProductView from './views/WorkshopProductView';
import AssetPromptLibrary from '@/features/assets/AssetPromptLibrary';

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
      {/* 🌟 侧边悬浮深色胶囊导航栏（对标图4垂直药丸工具栏） */}
      <WorkshopSideCapsuleBar
        activeTab={activeWorkshopTab}
        onSelectTab={setActiveWorkshopTab}
      />

      {/* 仅在非 studio 工作台（资产库/架构/商品库）时在顶级呈现顶栏；studio 工作台由 BatchWorkshopView 统一承载带步骤导轨的单层顶栏 */}
      {activeWorkshopTab !== 'studio' && (
        <WorkshopTopBar
          assetToolbarRef={setAssetToolbarTarget}
          activeTab={activeWorkshopTab}
          onSelectTab={setActiveWorkshopTab}
        />
      )}

      {/* 核心工作区内容渲染 */}
      <div className={`flex-1 flex flex-col min-h-0 overflow-hidden relative z-10 ${activeWorkshopTab !== 'studio' ? 'pl-[72px] sm:pl-20' : ''}`}>
        <div className={activeWorkshopTab === 'studio' ? 'flex-1 flex flex-col min-h-0' : 'hidden'}>
          <BatchWorkshopView fixedBatchMode="original" />
        </div>

        {activeWorkshopTab === 'prompt_assets' && (
          <AssetPromptLibrary toolbarTarget={assetToolbarTarget} onEnterWorkshop={() => setActiveWorkshopTab('studio')} />
        )}

        {activeWorkshopTab === 'recipes' && (
          <WorkshopRecipeView onEnterStudio={() => setActiveWorkshopTab('studio')} />
        )}

        {activeWorkshopTab === 'products' && (
          <WorkshopProductView onEnterStudio={() => setActiveWorkshopTab('studio')} />
        )}
      </div>
    </div>
  );
}
