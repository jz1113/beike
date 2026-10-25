import React, { useState } from 'react';
import { FileType, History, LayoutTemplate, Plus, Presentation, Settings2, Sparkles, ListTree } from 'lucide-react';
import { StudioBrandChip } from '@client/shared/ui/studio/StudioBrandChip';
import { StudioDockBar, studioDockClass } from '@client/shared/ui/studio/StudioDockBar';
import { StudioHistoryDrawer } from '@client/shared/ui/studio/StudioHistoryDrawer';
import { usePptStore } from './store/usePptStore';
import { PptInputStage } from './components/PptInputStage';
import { PptOutlineStage } from './components/PptOutlineStage';
import { PptDetailStage } from './components/PptDetailStage';
import { PptSlideStudioStage } from './components/PptSlideStudioStage';
import { PptLayoutStage } from './components/PptLayoutStage';
import { PptPresentationModal } from './components/PptPresentationModal';
import { PptExportModal } from './components/PptExportModal';
import type { PptStage } from '@shared/contracts/pptGeneration';

interface Props {
  onBack: () => void;
  onOpenSettings?: () => void;
}

export const PptStudio: React.FC<Props> = ({ onBack, onOpenSettings }) => {
  const { stage, setStage, pages, currentPageIndex, title, resetProject, renderMode } = usePptStore();
  const [isExportOpen, setIsExportOpen] = useState(false);
  const [isPresentationOpen, setIsPresentationOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const go = (next: PptStage) => setStage(next);
  const dock = [
    { id: 'new', icon: <Plus className="h-4 w-4" />, label: '新建', onClick: () => resetProject(), className: studioDockClass(false) },
    { id: 'input', icon: <Sparkles className="h-4 w-4" />, label: '创作', onClick: () => go('input'), active: stage === 'input', className: studioDockClass(stage === 'input') },
    { id: 'outline', icon: <ListTree className="h-4 w-4" />, label: '大纲', onClick: () => go('outline'), active: stage === 'outline', className: studioDockClass(stage === 'outline') },
    { id: 'detail', icon: <LayoutTemplate className="h-4 w-4" />, label: '页面编排', onClick: () => go('detail'), active: stage === 'detail', className: studioDockClass(stage === 'detail') },
    { id: 'studio', icon: <Presentation className="h-4 w-4" />, label: '演播室', onClick: () => go('studio'), active: stage === 'studio', className: studioDockClass(stage === 'studio') },
    { id: 'history', icon: <History className="h-4 w-4" />, label: '历史', onClick: () => setHistoryOpen(true), className: studioDockClass(false) },
    { id: 'settings', icon: <Settings2 className="h-4 w-4" />, label: '设置', onClick: () => onOpenSettings?.(), className: studioDockClass(false) },
  ];

  return (
    <div className="relative flex h-full w-full flex-col overflow-hidden bg-transparent text-slate-800 dark:text-slate-200">
      <StudioBrandChip title="PPT" icon={<FileType className="h-4 w-4" />} onBack={onBack} />
      <StudioDockBar items={dock} label="PPT 导航" />
      <main className="relative flex min-h-0 flex-1 flex-col overflow-hidden">
        {stage === 'input' && <PptInputStage onOpenSettings={onOpenSettings} />}
        {stage === 'outline' && <PptOutlineStage />}
        {stage === 'detail' && <PptDetailStage />}
        {stage === 'studio' && renderMode === 'layout' && <PptLayoutStage />}
        {stage === 'studio' && renderMode === 'visual' && (
          <PptSlideStudioStage onStartPresentation={() => setIsPresentationOpen(true)} />
        )}
      </main>
      {isExportOpen && <PptExportModal onClose={() => setIsExportOpen(false)} />}
      {isPresentationOpen && (
        <PptPresentationModal pages={pages} initialPageIndex={currentPageIndex} onClose={() => setIsPresentationOpen(false)} />
      )}
      <StudioHistoryDrawer
        open={historyOpen}
        title="当前文稿"
        onClose={() => setHistoryOpen(false)}
        items={pages.map((page) => ({
          id: page.id,
          title: page.title,
          subtitle: `第 ${page.pageIndex} 页`,
          onOpen: () => { setStage('studio'); setHistoryOpen(false); },
        }))}
        />
      <span className="sr-only">{title}</span>
    </div>
  );
};

export default PptStudio;
