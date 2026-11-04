import { ShoppingBag, Plus, History, Settings2, Ellipsis, Pencil, Images, ArrowLeft } from 'lucide-react';
import type { WorkshopTab } from '@client/store/types';
import { useAppStore } from '@client/store';
import { StudioTaskRecordsButton } from '@client/shared/ui/studio/StudioTaskRecords';
import '@client/shared/ui/studio/studioToolbar.css';
import { StudioBrandChip } from '@client/shared/ui/studio/StudioBrandChip';
import { WorkshopActionMenu, workshopMenuItemClass } from './WorkshopActionMenu';
import { useWorkshopDockActions } from './WorkshopDockActionsContext';
import type { Ref } from 'react';
import './workshopTopBar.css';

export interface WorkshopTopBarProps {
  activeTab: WorkshopTab;
  onSelectTab: (tab: WorkshopTab) => void;
  stageNavigationRef: Ref<HTMLDivElement>;
  assetNavigationRef?: Ref<HTMLDivElement>;
}

export function WorkshopTopBar({ activeTab, onSelectTab, stageNavigationRef, assetNavigationRef }: WorkshopTopBarProps) {
  const setCurrentView = useAppStore((s) => s.setCurrentView);
  const setIsWorkshopConfigOpen = useAppStore((s) => s.setIsWorkshopConfigOpen);
  const { actions } = useWorkshopDockActions();
  const batchTools = [
    { label: '新建批次', Icon: Plus, run: () => actions?.onCreate(), disabled: !actions || actions.createDisabled },
    { label: '重命名当前批次', Icon: Pencil, run: () => actions?.onRename(), disabled: !actions || actions.disabled },
    { label: '历史批次', Icon: History, run: () => actions?.onHistory(), disabled: !actions || actions.disabled },
    { label: '参考图库', Icon: Images, run: () => onSelectTab('prompt_assets'), disabled: false },
    { label: '生产设置', Icon: Settings2, run: () => setIsWorkshopConfigOpen(true), disabled: false },
  ];
  return (
    <header className="studio-toolbar workshop-topbar relative z-30 flex shrink-0 flex-wrap items-center gap-2 border-b border-slate-200 bg-white px-4 py-2 dark:border-white/10 dark:bg-[#18191c]">
      <div className="studio-toolbar-start"><StudioBrandChip inline title="电商图文" icon={<ShoppingBag size={16} />} onBack={() => setCurrentView('home')} />
      {activeTab === 'prompt_assets' && <button type="button" className="workshop-module-link" onClick={() => onSelectTab('studio')}><ArrowLeft size={15} />返回生产工作台</button>}</div>
      {activeTab === 'studio' && <div ref={stageNavigationRef} className="workshop-step-slot studio-toolbar-steps" />}
      {activeTab === 'prompt_assets' && <div ref={assetNavigationRef} className="workshop-assets-navigation" />}
      <div className="studio-toolbar-end">
        {activeTab === 'studio' && <WorkshopActionMenu label="批次工具" icon={<Ellipsis size={16} />}>
          {batchTools.map(({ label, Icon, run, disabled }) => <button key={label} type="button" disabled={disabled} onClick={run} className={workshopMenuItemClass}><Icon size={15} />{label}</button>)}
        </WorkshopActionMenu>}
        <StudioTaskRecordsButton domain="workshop" />
      </div>
    </header>
  );
}
