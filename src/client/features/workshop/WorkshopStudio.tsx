import { useEffect, useState, type ComponentType } from 'react';
import { useAppStore } from '@client/store';
import { normalizeWorkshopTab } from '@client/store/workshopTab';
import BatchWorkshopView from './components/BatchWorkshopView';
import { WorkshopTopBar } from './components/layout/WorkshopTopBar';
import { WorkshopDockActionsProvider } from './components/layout/WorkshopDockActionsContext';
import type { PromptAssetType } from '@shared/domain/prompts/prompt-asset/states';

interface Props {
  onOpenSettings?: () => void;
  AssetPromptLibraryComponent: ComponentType<{ initialSubTab?: PromptAssetType; initialSkillsOpen?: boolean; navigationTarget?: HTMLElement | null }>;
}

export default function WorkshopStudio({
  onOpenSettings,
  AssetPromptLibraryComponent,
}: Props) {
  void onOpenSettings;
  const [assetInitialSubTab, setAssetInitialSubTab] = useState<PromptAssetType>('full_prompt');
  const [assetSkillsOpen, setAssetSkillsOpen] = useState(false);
  const [assetNavigationTarget, setAssetNavigationTarget] = useState<HTMLDivElement | null>(null);
  const storedWorkshopTab = useAppStore((s) => s.activeWorkshopTab);
  const activeWorkshopTab = normalizeWorkshopTab(storedWorkshopTab);
  const setActiveWorkshopTab = useAppStore((s) => s.setActiveWorkshopTab);

  useEffect(() => {
    if (storedWorkshopTab !== activeWorkshopTab) setActiveWorkshopTab(activeWorkshopTab);
  }, [storedWorkshopTab, activeWorkshopTab, setActiveWorkshopTab]);

  return (
    <WorkshopDockActionsProvider>
      <div className={`flex-1 flex flex-col min-w-0 h-full overflow-hidden relative select-none ${activeWorkshopTab === 'studio' ? 'bg-transparent' : 'bg-slate-50/95 dark:bg-[#111214]/95'}`}>
        <WorkshopTopBar activeTab={activeWorkshopTab} onSelectTab={tab => { setAssetSkillsOpen(false); setActiveWorkshopTab(tab); }} assetNavigationRef={setAssetNavigationTarget} />

        {/* 核心工作区内容渲染 */}
        <div className="relative z-10 flex min-h-0 flex-1 flex-col overflow-hidden">
          <div className={activeWorkshopTab === 'studio' ? 'flex-1 flex flex-col min-h-0' : 'hidden'}>
            <BatchWorkshopView onOpenAssetTab={(type) => {
              setAssetInitialSubTab(type);
              setAssetSkillsOpen(true);
              setActiveWorkshopTab('prompt_assets');
            }} />
          </div>

          {activeWorkshopTab === 'prompt_assets' && (
            <AssetPromptLibraryComponent initialSubTab={assetInitialSubTab} initialSkillsOpen={assetSkillsOpen} navigationTarget={assetNavigationTarget} />
          )}



        </div>
      </div>
    </WorkshopDockActionsProvider>
  );
}
