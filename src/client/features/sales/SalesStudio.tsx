import { useViewVisibility } from '@client/shared/hooks/useViewVisibility';
import { eligibleSalesImages } from '@shared/domain/sales';
import { SalesMediaJobsPanel } from './components/SalesMediaJobsPanel';
import { useEffect, useId, useRef, useState } from 'react';
import { ArrowLeft, FileText, ShoppingBag, X } from 'lucide-react';
import { StudioBrandChip } from '@client/shared/ui/studio/StudioBrandChip';
import { useResizablePane, WorkbenchResizeHandle } from '@client/shared/ui/studio/ResizableWorkbench';
import { confirmAction } from '@client/shared/utils/confirmAction';
import { ProductSetupPanel } from './components/salesProductSetup';
import { SalesProductFaceDialog } from './components/SalesProductFaceDialog';
import type { ProductFaceEdits } from './model/salesProductFaces';
import { SalesProductSelectionSummary } from './components/SalesProductSelectionSummary';
import { salesFocusClass, salesGhostButtonClass } from './components/salesChrome';
import { useSalesCollection } from './hooks/useSalesCollection';
import { useSalesPrompts } from './hooks/useSalesPrompts';
import { SalesPromptWorkspace } from './components/SalesPromptWorkspace';
import { hasSalesCollection } from './model/salesCollectionDraft';
import { SalesWorkflowStatus } from './components/SalesWorkflowStatus';
import { SalesOCRWorkspace } from './components/SalesOCRWorkspace';
import { SalesProductionWorkspace, type SalesProductionHandle } from './components/SalesProductionWorkspace';
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
import { SalesWorkspaceNavigation } from './components/SalesWorkspaceNavigation';
import type { OpenSalesLibrary, SalesAssetSection, SalesLibraryChoice } from './model/salesWorkspace';
import './salesStudio.css';
import './salesNavigation.css';
import '@client/shared/ui/studio/studioToolbar.css';
import './salesPrompts.css';
import { SalesEditorNavigation, type SalesEditorView } from './components/SalesEditorNavigation';
import './salesEditor.css';

interface Props {
  onOpenLibrary: OpenSalesLibrary;
  libraryChoice?: SalesLibraryChoice | null;
  onChoiceHandled?:()=>void;
  onBack: () => void;
}

function isMockedWindowConfirm(): boolean {
  return typeof window !== 'undefined' && typeof window.confirm === 'function' && 'mock' in window.confirm;
}

function confirmDiscardDraft(message: string, onConfirmed: () => void) {
  if (isMockedWindowConfirm()) {
    if (window.confirm(message)) onConfirmed();
    return;
  }
  void confirmAction({
    title: '未保存修改提醒',
    description: message,
    confirmText: '丢弃并离开',
    cancelText: '继续编辑',
    danger: true,
  }).then((ok) => {
    if (ok) onConfirmed();
  });
}

export default function SalesStudio({ onBack, onOpenLibrary, libraryChoice, onChoiceHandled }: Props) {
  const studio = useSalesCollection();
  const active = useViewVisibility();
  const [libraryVersion,setLibraryVersion] = useState(0);
  const previouslyActive = useRef(active);
  useEffect(()=>{
    if (active && !previouslyActive.current) setLibraryVersion(n=>n+1);
    previouslyActive.current = active;
  },[active]);
  const [storyboardPreview, setStoryboardPreview] = useState('');
  const [promptsOpen, setPromptsOpen] = useState(false);
  const prompts = useSalesPrompts(active && promptsOpen);

  const leaveStudio = (navigate: () => void) => {
    if (productionBusy || prompts.saving || !studio.flushDraft()) return;
    if (prompts.hasUnsaved) {
      confirmDiscardDraft('提示词还有未保存的修改。离开后将丢弃这些修改，确定离开吗？', navigate);
    } else navigate();
  };

  const workspaceId = useId();
  const [draggedImage, setDraggedImage] = useState<string | null>(null);
  const galleryRef = useRef<HTMLElement>(null);
  const expandGalleryRef = useRef<HTMLButtonElement>(null);
  const [editorView, setEditorView] = useState<SalesEditorView>('summary');
  const [productionWorking, setProductionBusy] = useState(false);
  const [showGallery, setShowGallery] = useState(true);
  const galleryPane = useResizablePane({ storageKey: 'beike:sales:gallery-width', defaultWidth: 560, minWidth: 288, maxWidth: 800 });

  const productionRef = useRef<SalesProductionHandle>(null);
  const editorNavigation = useRef({ version: 0, preparingDelivery: false });
  const [deliveryStep, setDeliveryStep] = useState<'storyboard' | 'script' | null>(null);
  const productionBusy = productionWorking || deliveryStep !== null;
  const { imageCatalog, colorSelection, variantMetadata } = studio.state;
  const selectedImages = eligibleSalesImages(imageCatalog, colorSelection, variantMetadata);
  const hasProductImages = selectedImages.length > 0;
  const faceScope = JSON.stringify([studio.state.activeProductId, studio.state.collectedProductUrl]);
  const [faceEditor, setFaceEditor] = useState<{ scope: string; urls: string[]; edits: ProductFaceEdits } | null>(null);
  const openFaceEditor = (urls: string[]) => setFaceEditor({ scope: faceScope, urls, edits: studio.state.productionPlan.productFaceEdits });
  const faceSources = faceEditor?.scope === faceScope ? selectedImages.filter((image) => faceEditor.urls.includes(image.url))
    .map((image) => ({ url: image.url, label: `商品图 #${image.index + 1}` })) : [];

  const showProductArea = editorView === 'summary' || (editorView === 'storyboard' && (showGallery || !hasProductImages));

  // Check the rendered script after the rewritten beats have reached the workspace.
  useEffect(() => {
    if (deliveryStep !== 'script' || !editorNavigation.current.preparingDelivery) return;
    if (productionRef.current?.checkDeliveryScript()) {
      setEditorView('delivery');
      if (hasProductImages) setShowGallery(false);
    }
    editorNavigation.current.preparingDelivery = false;
    setDeliveryStep(null);
  }, [deliveryStep, hasProductImages]);

  const changeEditorView = async (next: SalesEditorView) => {
    if (next === 'delivery' && editorNavigation.current.preparingDelivery) return;
    const request = ++editorNavigation.current.version;
    if (next === 'delivery' && next !== editorView && productionRef.current) {
      editorNavigation.current.preparingDelivery = true;
      setDeliveryStep('storyboard');
      let storyboardReady = false;
      try {
        storyboardReady = await productionRef.current.prepareDelivery();
      } finally {
        if (request === editorNavigation.current.version) {
          editorNavigation.current.preparingDelivery = storyboardReady;
          setDeliveryStep(storyboardReady ? 'script' : null);
        }
      }
      return;
    }
    editorNavigation.current.preparingDelivery = false;
    setDeliveryStep(null);
    setEditorView(next);
    if (next !== editorView) setShowGallery(next === 'summary' || !hasProductImages);
  };
  const galleryProductKey = studio.state.collectedProductUrl || studio.state.imageCatalog[0]?.url || (hasSalesCollection(studio.state) ? 'draft' : '');
  useEffect(() => { setShowGallery(true); }, [galleryProductKey]);

  const openLibrary = (section?:SalesAssetSection) => {
    if (productionBusy || prompts.saving || !studio.flushDraft()) return;
    setPromptsOpen(false);
    onOpenLibrary(section);
  };
  const openAssetLibrary = (target: 'scripts' | 'materials', section: 'persona' | 'scene' | 'sound' = 'persona') =>
    openLibrary(target === 'scripts' ? 'script' : section);
  const openPrompt = (id?: string) => {
    if (productionBusy || !studio.flushDraft()) return;
    if (id) prompts.select(id);
    setPromptsOpen(true);
  };
  const closePrompts = () => {
    if (prompts.saving) return;
    setPromptsOpen(false);
    setLibraryVersion((n) => n + 1);
  };
  const addOCRImages = (urls: string[]) => { studio.addOCRImages(urls); void changeEditorView('summary'); };
  const focusGallery = () => {
    setShowGallery(true);
    requestAnimationFrame(() => galleryRef.current?.focus());
  };
  const collapseGallery = () => {
    setShowGallery(false);
    requestAnimationFrame(() => expandGalleryRef.current?.focus());
  };
  const busy = studio.isCollecting || studio.isUploading || Boolean(studio.ocrProgress);
  const activeTaskLabel = studio.isCollecting
    ? '正在采集商品资料'
    : studio.isUploading
      ? '正在上传商品图片'
      : studio.ocrProgress
        ? `正在识别文字 (${studio.ocrProgress.completed}/${studio.ocrProgress.total})`
        : studio.isSummarizing
          ? '正在提炼卖点'
          : productionBusy
            ? '分镜合成任务运行中'
            : undefined;

  return (
    <div className="sales-studio flex h-full w-full min-w-0 flex-col overflow-hidden">
      <header className="sales-studio-topbar studio-toolbar">
        <div className="sales-topbar-left studio-toolbar-start">
          <h1><StudioBrandChip title="电商视频" icon={<ShoppingBag size={16} />} onBack={() => leaveStudio(onBack)} disabled={productionBusy || prompts.saving} inline /></h1>
          <SalesWorkspaceNavigation disabled={productionBusy || prompts.saving} onOpen={()=>openLibrary()} />
          <button type="button" className={`${salesGhostButtonClass} ${salesFocusClass}`} disabled={productionBusy || prompts.saving}
            onClick={promptsOpen ? closePrompts : () => openPrompt()}>
            {promptsOpen ? <ArrowLeft size={15} /> : <FileText size={15} />}
            {promptsOpen ? '返回视频制作' : '提示词管理'}
            {prompts.hasUnsaved && <span className="sales-unsaved-dot" title="提示词有未保存的修改" />}
          </button>
        </div>
        <div className="sales-topbar-center studio-toolbar-steps">
          {!promptsOpen && <SalesEditorNavigation view={editorView} onChange={changeEditorView} id={workspaceId} />}
        </div>
        <div className="sales-topbar-right studio-toolbar-end">
          <SalesWorkflowStatus saveStatus={studio.saveStatus} onRetry={studio.flushDraft} taskLabel={activeTaskLabel} />
          <SalesMediaJobsPanel />
        </div>
      </header>

      {studio.autoFaces.pending > 0 && <div className="sales-studio-alert text-xs px-4 py-2" role="status">
        {studio.autoFaces.failed > 0
          ? <>{studio.autoFaces.failed} 张商品图自动打码失败。 <button type="button" className={salesGhostButtonClass} onClick={studio.autoFaces.retry}>重试打码</button></>
          : `正在自动检测商品图人脸，剩余 ${studio.autoFaces.pending} 张…`}
      </div>}
      {active && faceEditor && faceSources.length > 0 && <SalesProductFaceDialog key={JSON.stringify(faceSources.map((source) => source.url))}
        sources={faceSources} edits={faceEditor.edits} onClose={() => setFaceEditor(null)}
        onApply={(url, edit) => { studio.applyFaceEdit(url, edit); setFaceEditor(null); }} />}
      {studio.error && (
        <div role="alert" className="sales-studio-alert flex shrink-0 items-start gap-3 bg-rose-50 px-4 py-2.5 text-xs leading-5 text-rose-700 dark:bg-rose-500/12 dark:text-rose-200">
          <p className="min-w-0 flex-1">{studio.error}</p>
          <button type="button" aria-label="关闭错误提示" onClick={studio.clearError} className={`rounded ${salesFocusClass}`}><X className="h-4 w-4" /></button>
        </div>
      )}

      <div
        className="sales-workspace-host"
        role="region"
        id={`${workspaceId}-panel`}
        aria-label="视频制作"
        tabIndex={0}
      >
        <div className="sales-editing-surface" hidden={promptsOpen}>
          <div className={`sales-editor-layout ${editorView === 'storyboard' ? 'is-storyboard' : ''} ${showGallery ? '' : 'is-gallery-collapsed'} ${galleryPane.dragging ? 'select-none' : ''}`}>
            {showProductArea && !showGallery && (
              <SalesProductSelectionSummary
                horizontal={editorView === 'storyboard'}
                state={studio.state}
                galleryId={`${workspaceId}-gallery`}
                onExpand={focusGallery}
                expandButtonRef={expandGalleryRef}
                onImageDragging={(url) => { setDraggedImage(url); if (url) void changeEditorView('summary'); }}
              />
            )}
            <aside
              ref={galleryRef}
              id={`${workspaceId}-gallery`}
              hidden={!showProductArea || !showGallery}
              tabIndex={-1}
              aria-label="商品图片选择区"
              style={galleryPane.style}
              className="sales-editor-gallery sales-workspace-layout"
            >
              <ProductSetupPanel
                state={studio.state}
                updateState={studio.updateState}
                isBusy={busy || productionBusy}
                onCollapse={collapseGallery}
                onConfirmSelection={() => {
                  const saved = studio.flushDraft();
                  if (saved && editorView === 'storyboard') setShowGallery(false);
                  return saved;
                }}
                galleryId={`${workspaceId}-gallery`}
                isCollecting={studio.isCollecting}
                isUploading={studio.isUploading}
                selectionLocked={productionBusy}
                onEditFaces={openFaceEditor}
                onCollect={studio.runProductCollect}
                onUpload={studio.addProductImages}
                onImageError={studio.markImageUnavailable}
                onRetryUnavailable={studio.retryUnavailableImages}
                onAddOCRImages={addOCRImages}
                onRecognizeImages={(urls) => { addOCRImages(urls); void studio.recognizeImages(undefined, false, false, urls); }}
                onImageDragging={(url) => { setDraggedImage(url); if (url) void changeEditorView('summary'); }}
                onResetProduct={() => { void studio.resetProduct(); }}
              />
            </aside>
            <WorkbenchResizeHandle {...galleryPane.handleProps} hidden={!showGallery || editorView !== 'summary'} />
            <main className="sales-editor-main flex-1" aria-label="视频内容编辑区">
              <div id={`${workspaceId}-editor-panel`} role="tabpanel" aria-labelledby={`${workspaceId}-editor-${editorView}`} className="sales-editor-content">
                <div className="sales-editor-copy" hidden={editorView !== 'summary'}>
                  <SalesOCRWorkspace
                    state={studio.state}
                    disabled={busy || productionBusy}
                    onChange={studio.updateState}
                    onRecognize={(url, force) => { void studio.recognizeImages(url, force); }}
                    progress={studio.ocrProgress}
                    report={studio.ocrReport}
                    onRetryFailed={() => { void studio.retryFailedImages(); }}
                    onCancel={studio.cancelOCR}
                    imageDragging={Boolean(draggedImage)}
                    onAddOCRImages={addOCRImages}
                    onUploadOCRImages={(files) => studio.addProductImages(files, true)}
                    onDropFinished={() => setDraggedImage(null)}
                    summaryActions={{
                      pending: studio.isSummarizing,
                      error: studio.summaryError,
                      onRun: (model) => { void studio.summarize(model); },
                      onCancel: () => studio.cancelSummary(),
                      onScrollToProduction: () => changeEditorView('storyboard'),
                    }}
                  />
                </div>
                <SalesProductionWorkspace
                  ref={productionRef}
                  libraryChoice={active ? libraryChoice : null}
                  onChoiceHandled={accepted=>{
                    if (accepted) { setPromptsOpen(false); setEditorView('storyboard'); }
                    onChoiceHandled?.();
                  }}
                  active={active && !promptsOpen}
                  refreshVersion={libraryVersion}
                  onStoryboardPreview={setStoryboardPreview}
                  onBusyChange={setProductionBusy}
                  view={editorView}
                  deliveryStep={deliveryStep}
                  onViewChange={changeEditorView}
                  sourceBusy={busy || studio.isSummarizing}
                  state={studio.state}
                  onChange={studio.updateState}
                  onOpenStage={openAssetLibrary}
                  onEditFaces={openFaceEditor}
                  onOpenPrompt={openPrompt}
                />
              </div>
            </main>
          </div>
        </div>
        {promptsOpen && <SalesPromptWorkspace manager={prompts} storyboard={storyboardPreview} />}
      </div>
    </div>
  );
}
