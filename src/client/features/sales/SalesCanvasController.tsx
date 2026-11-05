import { SalesMediaJobsPanel } from './components/SalesMediaJobsPanel';
import { SalesWorkspaceNavigation } from './components/SalesWorkspaceNavigation';
import { SalesProductSelectionSummary } from './components/SalesProductSelectionSummary';
import { ResizableWorkbench } from '@client/shared/ui/studio/ResizableWorkbench';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { salesCanvasStages, type SalesCanvasProjection, type SalesCanvasStage } from '@shared/domain/sales/salesCanvas';
import { eligibleSalesImages } from '@shared/domain/sales';
import { useViewVisibility } from '@client/shared/hooks/useViewVisibility';
import { useModalDialog } from '@client/shared/hooks/useModalDialog';
import { CanvasBusinessNodePanel, focusCanvasBusinessNode } from '@client/shared/ui/studio/CanvasBusinessNodePanel';
import { useSalesCollection } from './hooks/useSalesCollection';
import { useSalesPrompts } from './hooks/useSalesPrompts';
import type { SalesLibraryChoice, OpenSalesLibrary } from './model/salesWorkspace';
import type { ProductFaceEdits } from './model/salesProductFaces';
import { ProductSetupPanel } from './components/salesProductSetup';
import { SalesOCRWorkspace } from './components/SalesOCRWorkspace';
import { SalesProductionWorkspace, type SalesProductionHandle } from './components/SalesProductionWorkspace';
import { SalesProductFaceDialog } from './components/SalesProductFaceDialog';
import { SalesPromptWorkspace } from './components/SalesPromptWorkspace';
import { SalesWorkflowStatus } from './components/SalesWorkflowStatus';
import './salesProduct.css';
import './salesOCR.css';
import './salesWorkflow.css';
import './salesWorkspace.css';
import './salesSummary.css';
import './salesScript.css';
import './salesStoryboard.css';
import './salesProduction.css';
import './salesLibrary.css';
import './salesTaxonomy.css';
import './salesStudio.css';
import './salesPrompts.css';
import './salesEditor.css';
import './salesCanvas.css';

export interface SalesCanvasControllerProps {
  projectId: string; initialDraft?: unknown;
  nodes: Array<{ id: string; stage: SalesCanvasStage }>;
  blockReasons: Partial<Record<SalesCanvasStage, string>>;
  onProjection: (value: SalesCanvasProjection) => void;
  onOpenLibrary: OpenSalesLibrary;
  libraryChoice?: SalesLibraryChoice | null; onChoiceHandled?: () => void;
}

export default function SalesCanvasController({ projectId, initialDraft, nodes, blockReasons, onProjection, onOpenLibrary, libraryChoice, onChoiceHandled }: SalesCanvasControllerProps) {
  const studio = useSalesCollection({ projectId, initialDraft });
  const visible = useViewVisibility();
  const [promptsOpen, setPromptsOpen] = useState(false);
  const prompts = useSalesPrompts(visible && promptsOpen);
  const [storyboard, setStoryboard] = useState('');
  const [working, setWorking] = useState(false);
  const [refreshVersion, refresh] = useState(0);
  const [preparing, setPreparing] = useState<'storyboard' | 'script' | null>(null);
  const production = useRef<SalesProductionHandle>(null);
  const prepareLock = useRef(false);
  const [faces, setFaces] = useState<{ urls: string[]; edits: ProductFaceEdits } | null>(null);
  const promptDialog = useModalDialog(visible && promptsOpen, () => { if (!prompts.saving && !prompts.hasUnsaved) setPromptsOpen(false); });
  const focusStage = (stage: SalesCanvasStage) => focusCanvasBusinessNode(nodes.find(node => node.stage === stage)?.id);
  useEffect(() => {
    if (preparing !== 'script') return;
    if (production.current?.checkDeliveryScript()) focusCanvasBusinessNode(nodes.find(node => node.stage === 'sales-video')?.id);
    setPreparing(null); prepareLock.current = false;
  }, [preparing, studio.state, nodes]);
  const prepareVideo = async () => {
    if (prepareLock.current || working || preparing || !studio.flushDraft()) return;
    prepareLock.current = true; setPreparing('storyboard');
    try { const ready = await production.current?.prepareDelivery(); setPreparing(ready ? 'script' : null); if (!ready) prepareLock.current = false; }
    catch { setPreparing(null); prepareLock.current = false; }
  };
  const busy = working || !!preparing || studio.isCollecting || studio.isUploading || !!studio.ocrProgress || studio.isSummarizing;
  const openLibrary: OpenSalesLibrary = section => { if (!busy && studio.flushDraft()) onOpenLibrary(section); };
  const openPrompt = (id?: string) => { if (!busy && studio.flushDraft()) { if (id) prompts.select(id); setPromptsOpen(true); } };
  const selected = eligibleSalesImages(studio.state.imageCatalog, studio.state.colorSelection, studio.state.variantMetadata);
  const faceSources = faces ? selected.filter(image => faces.urls.includes(image.url)).map(image => ({ url: image.url, label: `商品图 #${image.index + 1}` })) : [];
  const renderNode = (stage: SalesCanvasStage, content: ReactNode) => {
    const node = nodes.find(row => row.stage === stage);
    if (!node) return null;
    return <CanvasBusinessNodePanel key={node.id} nodeId={node.id} maxHeight={stage === 'sales-voice' ? 300 : stage === 'sales-video' ? 520 : 680} label={`${salesCanvasStages[stage]}节点操作`}>
      <div className="sales-studio sales-canvas-panel space-y-3">
        {stage === 'sales-collect' && <div className="beike-node-tools"><details><summary>素材与任务</summary><div><SalesWorkspaceNavigation disabled={busy} onOpen={() => openLibrary()} /><SalesMediaJobsPanel /></div></details></div>}
        <SalesWorkflowStatus saveStatus={studio.saveStatus} onRetry={studio.flushDraft} taskLabel={working ? '视频或声音任务处理中' : undefined} />
        {studio.error && <p role="alert" className="text-sm text-rose-400">{studio.error}</p>}
        {blockReasons[stage] && <p role="alert" className="text-sm text-rose-400">{blockReasons[stage]}</p>}
        <fieldset disabled={!!blockReasons[stage]} className="min-w-0">{content}</fieldset>
      </div>
    </CanvasBusinessNodePanel>;
  };
  return <>
    {renderNode('sales-collect', <ResizableWorkbench stacked storageKey={`beike:sales:canvas:${projectId}`} defaultWidth={360} minWidth={288} maxWidth={520} sidebar={<div className="sales-workspace-layout">
      <ProductSetupPanel state={studio.state} updateState={studio.updateState} isBusy={busy} galleryId={`${projectId}-images`}
        onConfirmSelection={studio.flushDraft} isCollecting={studio.isCollecting} isUploading={studio.isUploading} selectionLocked={working}
        onEditFaces={urls => setFaces({ urls, edits: studio.state.productionPlan.productFaceEdits })}
        onCollect={studio.runProductCollect} onUpload={studio.addProductImages} onImageError={studio.markImageUnavailable} onRetryUnavailable={studio.retryUnavailableImages}
        onAddOCRImages={urls => { studio.addOCRImages(urls); focusStage('sales-summary'); }} onRecognizeImages={urls => { studio.addOCRImages(urls); focusStage('sales-summary'); void studio.recognizeImages(undefined, false, false, urls); }}
        onImageDragging={() => {}} onResetProduct={() => { void studio.resetProduct(); }} />
    </div>}><div className="p-3 text-sm text-slate-400"><button type="button" className="mt-3 rounded border px-3 py-2" onClick={() => focusStage('sales-summary')}>定位识别与卖点节点</button></div></ResizableWorkbench>)}
    {renderNode('sales-summary', <><SalesProductSelectionSummary horizontal state={studio.state} galleryId={`${projectId}-images`} expandButtonRef={null} onExpand={() => focusStage('sales-collect')} /><SalesOCRWorkspace state={studio.state} disabled={busy} onChange={studio.updateState} onRecognize={(url, force) => { void studio.recognizeImages(url, force); }} progress={studio.ocrProgress} report={studio.ocrReport} onRetryFailed={() => { void studio.retryFailedImages(); }} onCancel={studio.cancelOCR} imageDragging={false} onAddOCRImages={studio.addOCRImages} onDropFinished={() => {}} onUploadOCRImages={files => studio.addProductImages(files, true)} summaryActions={{ pending: studio.isSummarizing, error: studio.summaryError, onRun: model => { void studio.summarize(model); }, onCancel: studio.cancelSummary, onScrollToProduction: () => focusStage('sales-storyboard') }} /></>)}
    <SalesProductionWorkspace ref={production} state={studio.state} onChange={studio.updateState} active={visible} sourceBusy={studio.isCollecting || studio.isUploading || !!studio.ocrProgress || studio.isSummarizing || studio.saveStatus === 'error' || !!blockReasons['sales-storyboard']}
      view="storyboard" refreshVersion={refreshVersion} onBusyChange={setWorking} deliveryStep={preparing} renderCanvasNode={renderNode}
      onViewChange={view => { if (view === 'delivery') void prepareVideo(); else focusStage('sales-storyboard'); }}
      onOpenStage={(target, section) => openLibrary(target === 'scripts' ? 'script' : section)} onEditFaces={urls => setFaces({ urls, edits: studio.state.productionPlan.productFaceEdits })}
      onOpenPrompt={openPrompt} onProjection={onProjection} onStoryboardPreview={setStoryboard} libraryChoice={visible ? libraryChoice : null} onChoiceHandled={() => onChoiceHandled?.()} />
    {visible && promptsOpen && createPortal(<div className="fixed inset-0 z-[60] bg-white p-4 dark:bg-[#18191c]" ref={promptDialog} role="dialog" aria-modal="true" aria-label="视频提示词管理" tabIndex={-1}>
      <button className="mb-3 rounded-lg border px-4 py-2" disabled={prompts.saving || prompts.hasUnsaved} onClick={() => { setPromptsOpen(false); refresh(value => value + 1); }}>返回画布</button>
      <SalesPromptWorkspace manager={prompts} storyboard={storyboard} />
    </div>, document.body)}
    {faces && <SalesProductFaceDialog sources={faceSources} edits={faces.edits} onClose={() => setFaces(null)} onApply={(url, edit) => { const edits = { ...studio.state.productionPlan.productFaceEdits, [url]: edit }; studio.updateState({ productionPlan: { ...studio.state.productionPlan, productFaceEdits: edits } }); setFaces(current => current ? { ...current, edits } : null); }} />}
  </>;
}
