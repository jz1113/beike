import { Suspense, useEffect, useState, type ComponentType } from 'react';
import { useAppStore } from '@client/store';
import { normalizeWorkshopTab } from '@client/store/workshopTab';
import BatchWorkshopView from './components/BatchWorkshopView';
import { WorkshopTopBar } from './components/layout/WorkshopTopBar';
import { WorkshopDockActionsProvider } from './components/layout/WorkshopDockActionsContext';
interface Props {
  AssetTools: ComponentType<{ skillsOpen: boolean; onCloseSkills: () => void; onBrowseReferences: () => void; navigationTarget: HTMLElement | null }>;
}

export default function WorkshopStudio({ AssetTools }: Props) {
  const [skillsOpen, setSkillsOpen] = useState(false);
  const [stageNavigationTarget, setStageNavigationTarget] = useState<HTMLDivElement | null>(null);
  const [assetNavigationTarget, setAssetNavigationTarget] = useState<HTMLDivElement | null>(null);
  const storedWorkshopTab = useAppStore((s) => s.activeWorkshopTab);
  const activeWorkshopTab = normalizeWorkshopTab(storedWorkshopTab);
  const setActiveWorkshopTab = useAppStore((s) => s.setActiveWorkshopTab);

  useEffect(() => {
    if (storedWorkshopTab !== activeWorkshopTab) setActiveWorkshopTab(activeWorkshopTab);
  }, [storedWorkshopTab, activeWorkshopTab, setActiveWorkshopTab]);

  return (
    <WorkshopDockActionsProvider>
      <div className="workshop-studio flex-1 flex flex-col min-w-0 h-full overflow-hidden relative">
        <WorkshopTopBar activeTab={activeWorkshopTab} onSelectTab={setActiveWorkshopTab} stageNavigationRef={setStageNavigationTarget} assetNavigationRef={setAssetNavigationTarget} />

        {/* 核心工作区内容渲染 */}
        <div className="relative z-10 flex min-h-0 flex-1 flex-col overflow-hidden">
          <div className={activeWorkshopTab === 'studio' ? 'flex-1 flex flex-col min-h-0' : 'hidden'}>
            <BatchWorkshopView stageNavigationTarget={stageNavigationTarget} onOpenSkills={() => setSkillsOpen(true)} />
          </div>

          {(skillsOpen || activeWorkshopTab === 'prompt_assets') && (
            <Suspense fallback={<p role="status" className="p-4 text-sm">正在加载…</p>}>
              <AssetTools skillsOpen={skillsOpen} onCloseSkills={() => setSkillsOpen(false)} navigationTarget={assetNavigationTarget}
                onBrowseReferences={() => { setSkillsOpen(false); setActiveWorkshopTab('prompt_assets'); }} />
            </Suspense>
          )}
        </div>
      </div>
    </WorkshopDockActionsProvider>
  );
}
