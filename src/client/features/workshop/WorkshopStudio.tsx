import { useState, type ComponentType } from 'react';
import { useAppStore } from '@client/store';
import BatchWorkshopView from './components/BatchWorkshopView';
import { WorkshopTopBar } from './components/WorkshopTopBar';
import { WorkshopSideCapsuleBar } from './components/WorkshopSideCapsuleBar';
import WorkshopRecipeView from './views/WorkshopRecipeView';
import WorkshopProductCategoryView from './views/WorkshopProductCategoryView';

interface Props {
  onOpenSettings?: () => void;
  AssetPromptLibraryComponent: ComponentType<{ toolbarTarget?: HTMLElement | null; onEnterWorkshop?: () => void }>;
}

export default function WorkshopStudio({
  onOpenSettings,
  AssetPromptLibraryComponent,
}: Props) {
  void onOpenSettings;
  const [assetToolbarTarget, setAssetToolbarTarget] = useState<HTMLDivElement | null>(null);
  const activeWorkshopTab = useAppStore((s) => s.activeWorkshopTab);
  const setActiveWorkshopTab = useAppStore((s) => s.setActiveWorkshopTab);

  return (
    <div className="flex-1 flex flex-col min-w-0 h-full overflow-hidden bg-transparent relative select-none">
      <WorkshopSideCapsuleBar activeTab={activeWorkshopTab} onSelectTab={setActiveWorkshopTab} />
      {activeWorkshopTab !== 'studio' && <WorkshopTopBar assetToolbarRef={setAssetToolbarTarget} activeTab={activeWorkshopTab} onSelectTab={setActiveWorkshopTab} />}

      {/* 核心工作区内容渲染 */}
      <div className="flex-1 flex flex-col min-h-0 overflow-hidden relative z-10">
        <div className={activeWorkshopTab === 'studio' ? 'flex-1 flex flex-col min-h-0' : 'hidden'}>
          <BatchWorkshopView />
        </div>

        {activeWorkshopTab === 'prompt_assets' && (
          <AssetPromptLibraryComponent toolbarTarget={assetToolbarTarget} onEnterWorkshop={() => setActiveWorkshopTab('studio')} />
        )}

        {activeWorkshopTab === 'recipes' && (
          <WorkshopRecipeView onEnterStudio={() => setActiveWorkshopTab('studio')} />
        )}

        {activeWorkshopTab === 'categories' && (
          <WorkshopProductCategoryView />
        )}
      </div>
    </div>
  );
}
