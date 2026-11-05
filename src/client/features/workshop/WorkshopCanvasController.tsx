import { StudioTaskRecordsButton } from '@client/shared/ui/studio/StudioTaskRecords';
import { useEffect, useRef, useState } from 'react';
import { workshopCanvasStages, type WorkshopCanvasProjection, type WorkshopCanvasStage } from '@shared/domain/workshop/workshopCanvas';
import { CanvasBusinessNodePanel, focusCanvasBusinessNode } from '@client/shared/ui/studio/CanvasBusinessNodePanel';
import { BatchPreviewLightbox } from '@client/shared/modals/lightbox/BatchPreviewLightbox';
import { useBatchWorkshopRunner } from './hooks/useBatchWorkshopRunner';
import { workshopCanvasProjection } from './model/workshopCanvasProjection';
import { WorkspaceSaveNotice } from './components/layout/WorkspaceSaveNotice';
import { BatchWorkshopSettings } from './components/settings/BatchWorkshopSettings';
import { WorkshopCanvasStages } from './components/canvas/WorkshopCanvasStages';

export interface WorkshopCanvasControllerProps {
  projectId: string; sourceBatchId?: string;
  nodes: Array<{ id: string; stage: WorkshopCanvasStage }>;
  blockReasons: Partial<Record<WorkshopCanvasStage, string>>;
  onProjection: (value: WorkshopCanvasProjection) => void; onSkills: () => void;
}

export default function WorkshopCanvasController({ projectId, sourceBatchId, nodes, blockReasons, onProjection, onSkills }: WorkshopCanvasControllerProps) {
  const runner = useBatchWorkshopRunner({ canvasProjectId: projectId, sourceBatchId });
  const [settings, setSettings] = useState(false);
  const latest = useRef(onProjection); latest.current = onProjection;
  const projection = runner.workspaceReady && runner.activeBatch ? JSON.stringify(workshopCanvasProjection(runner.activeBatch.id, runner.items, {
    collecting: runner.isCollecting, analyzing: runner.isAnalyzingAll, generating: runner.isGeneratingBatch, exporting: runner.isExportingZip,
  })) : '';
  useEffect(() => { if (projection) latest.current(JSON.parse(projection)); }, [projection]);
  const focusStage = (stage: WorkshopCanvasStage) => focusCanvasBusinessNode(nodes.find(node => node.stage === stage)?.id);
  return <>
    {nodes.map(node => <CanvasBusinessNodePanel key={node.id} nodeId={node.id} maxHeight={node.stage === 'generate' ? 580 : 680} label={`${workshopCanvasStages[node.stage]}节点操作`}>
      {node.stage === 'export' && <StudioTaskRecordsButton domain="workshop" />}
      <WorkspaceSaveNotice error={runner.workspaceError} status={runner.workspaceStatus} onRetry={runner.workspaceSaveActions.retry} onDownload={runner.workspaceSaveActions.download} onReload={runner.reloadWorkspace} />
      {!runner.workspaceReady ? <div className="p-4" role="status">{runner.workspaceError || '正在读取本项目的商品与任务…'}{runner.workspaceError && <button type="button" onClick={() => void runner.reloadWorkspace()}>重新加载</button>}</div>
        : blockReasons[node.stage] ? <p role="alert" className="p-4 text-rose-400">{blockReasons[node.stage]}</p>
          : <WorkshopCanvasStages runner={runner} stage={node.stage} onStage={focusStage} onSettings={() => setSettings(true)} onSkills={onSkills} />}
    </CanvasBusinessNodePanel>)}
    <BatchPreviewLightbox previewImageUrl={runner.previewImageUrl} previewGallery={runner.previewGallery} closeGalleryPreview={runner.closeGalleryPreview} setGalleryIndex={runner.setGalleryIndex} handleDownloadSingleTaskImage={runner.handleDownloadSingleTaskImage} />
    <BatchWorkshopSettings runner={runner} isOpen={settings} onClose={() => setSettings(false)} onOpenSkills={onSkills} />
    {runner.toastMsg && <p role="status" className="fixed bottom-8 left-1/2 z-[70] -translate-x-1/2 rounded-xl bg-slate-900 px-5 py-3 text-sm text-white shadow-xl">{runner.toastMsg}</p>}
  </>;
}
